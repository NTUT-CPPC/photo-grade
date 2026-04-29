import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";
import type { Prisma } from "@prisma/client";
import { normalizeRows, validateHeaders, type ImportDryRun } from "@photo-grade/shared";
import { prisma } from "../prisma.js";
import { queue } from "../queue.js";
import { env } from "../env.js";
import { assertInsideDataDir, dataDirs, safeFileName, wipeDirContents } from "../storage.js";

export async function dryRunImport(filePath: string): Promise<ImportDryRun> {
  const rows = await readRows(filePath);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const headerIssues = validateHeaders(headers);
  const dryRun = normalizeRows(rows);
  return { ...dryRun, issues: [...headerIssues, ...dryRun.issues] };
}

export async function createImportBatch(originalName: string, tempPath: string): Promise<{ id: string; dryRun: ImportDryRun }> {
  const ext = path.extname(originalName) || ".csv";
  const targetName = `${Date.now()}-${safeFileName(path.basename(originalName, ext))}${ext}`;
  const targetPath = assertInsideDataDir(path.join(dataDirs.imports, targetName));
  await fs.rename(tempPath, targetPath);
  const dryRun = await dryRunImport(targetPath);
  const batch = await prisma.importBatch.create({
    data: {
      fileName: originalName,
      filePath: targetPath,
      status: "DRY_RUN",
      dryRunJson: dryRun as unknown as Prisma.InputJsonValue
    }
  });
  return { id: batch.id, dryRun };
}

export async function processImportBatch(
  batchId: string,
  onProgress?: (message: string, processedCount: number) => void | Promise<void>
): Promise<void> {
  console.log(`[import] start batchId=${batchId}`);
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  const dryRun = batch.dryRunJson as unknown as ImportDryRun;
  const total = dryRun.works.length;
  console.log(`[import] batchId=${batchId} total=${total} fileName=${batch.fileName}`);

  if (batch.status === "CANCELLED") {
    console.log(`[import] batchId=${batchId} already cancelled before start, skipping`);
    return;
  }

  await prisma.importBatch.update({
    where: { id: batchId },
    data: { status: "PROCESSING", error: null, processedCount: 0, totalCount: total }
  });

  const blockingIssues = dryRun.issues.filter((issue) => (issue.severity ?? "error") === "error");
  if (blockingIssues.length) {
    console.warn(`[import] batchId=${batchId} aborting — dry-run errors: ${blockingIssues.length}`);
    await prisma.importBatch.update({
      where: { id: batchId },
      data: { status: "FAILED", error: "Dry-run still contains errors." }
    });
    return;
  }

  const { processMediaForWork } = await import("./media-service.js");
  let processed = 0;
  let nextIndex = 0;
  let stopScheduling = false;
  const laneCount = Math.min(env.IMPORT_ITEM_CONCURRENCY, total || 1);
  console.log(`[import] batchId=${batchId} laneCount=${laneCount}`);

  const runWork = async (workIndex: number): Promise<void> => {
    const work = dryRun.works[workIndex];
    if (!work) return;

    const current = await prisma.importBatch.findUniqueOrThrow({
      where: { id: batchId },
      select: { status: true }
    });
    if (current.status === "CANCELLED") {
      stopScheduling = true;
      return;
    }

    const humanIndex = workIndex + 1;
    console.log(`[import] (${humanIndex}/${total}) work.code=${work.code} title=${work.title}`);
    await onProgress?.(`Processing ${work.code}`, processed);

    try {
      const record = await prisma.work.upsert({
        where: { code: work.code },
        update: {
          title: work.title,
          description: work.description,
          author: work.author,
          school: work.school,
          department: work.department,
          studentId: work.studentId,
          email: work.email,
          sourceUrl: work.sourceUrl
        },
        create: {
          code: work.code,
          title: work.title,
          description: work.description,
          author: work.author,
          school: work.school,
          department: work.department,
          studentId: work.studentId,
          email: work.email,
          sourceUrl: work.sourceUrl
        }
      });
      await processMediaForWork(record.id, work.code, work.sourceUrl);
      processed += 1;
      await prisma.importBatch.update({ where: { id: batchId }, data: { processedCount: processed } });
      await onProgress?.(`Processed ${processed}/${total}`, processed);
      console.log(`[import] (${processed}/${total}) ok work.code=${work.code}`);
    } catch (err) {
      stopScheduling = true;
      console.error(`[import] (${humanIndex}/${total}) failed work.code=${work.code}:`, err);
      throw err;
    }
  };

  const runLane = async (): Promise<void> => {
    while (!stopScheduling) {
      const workIndex = nextIndex;
      if (workIndex >= total) return;
      nextIndex += 1;
      await runWork(workIndex);
    }
  };

  await Promise.all(Array.from({ length: laneCount }, () => runLane()));

  const finalState = await prisma.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    select: { status: true }
  });
  if (finalState.status === "CANCELLED") {
    console.log(`[import] batchId=${batchId} cancelled at ${processed}/${total}, exiting`);
    return;
  }

  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "COMPLETED", processedCount: processed } });
  console.log(`[import] done batchId=${batchId} processed=${processed}/${total}`);
}

export async function cancelImportBatch(batchId: string): Promise<void> {
  console.log(`[import] cancel batchId=${batchId}`);
  await prisma.importBatch.updateMany({
    where: { id: batchId, status: { in: ["DRY_RUN", "QUEUED", "PROCESSING"] } },
    data: { status: "CANCELLED" }
  });
  const jobs = await queue.getJobs(["wait", "delayed", "active"], 0, 200);
  for (const job of jobs) {
    if (job.data?.batchId === batchId) {
      try {
        await job.remove();
        console.log(`[import] removed BullMQ job id=${job.id} for batchId=${batchId}`);
      } catch (err) {
        console.warn(`[import] could not remove BullMQ job id=${job.id} (active?):`, (err as Error).message);
      }
    }
  }
}

export async function cancelActiveImports(exceptBatchId?: string): Promise<void> {
  const active = await prisma.importBatch.findMany({
    where: {
      status: { in: ["QUEUED", "PROCESSING"] },
      ...(exceptBatchId ? { NOT: { id: exceptBatchId } } : {})
    },
    select: { id: true }
  });
  for (const batch of active) {
    await cancelImportBatch(batch.id);
  }
}

export async function wipeAllImportData(): Promise<void> {
  console.log(`[import] wipe — deleting works/assets/scores/outbox + media files`);
  await prisma.presentationState.updateMany({ data: { workId: null, idx: 0 } });
  await prisma.work.deleteMany({});
  await Promise.all([
    wipeDirContents(dataDirs.originals),
    wipeDirContents(dataDirs.previews),
    wipeDirContents(dataDirs.thumbnails),
    wipeDirContents(dataDirs.metadata)
  ]);
  console.log(`[import] wipe done`);
}

async function readRows(filePath: string): Promise<Record<string, unknown>[]> {
  const ext = path.extname(filePath).toLowerCase();
  const safePath = assertInsideDataDir(filePath);
  if (ext === ".xlsx") {
    const rows = await readXlsxFile(safePath, { sheet: 1 });
    return tableToRecords(rows);
  }
  if (ext !== ".csv") {
    throw new Error("Import file must be CSV or XLSX.");
  }
  const buf = await fs.readFile(safePath);
  const content = buf.toString("utf8");
  return parseCsv(content, { columns: true, skip_empty_lines: true, bom: true, trim: true }) as Record<string, unknown>[];
}

function tableToRecords(rows: unknown[][]): Record<string, unknown>[] {
  const [headerRow, ...bodyRows] = rows;
  if (!headerRow) return [];
  const headers = headerRow.map(cellToString);
  return bodyRows
    .filter((row) => row.some((cell) => cellToString(cell) !== ""))
    .map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = cellToString(row[index]);
      });
      return record;
    });
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}
