import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";
import type { Prisma } from "@prisma/client";
import { normalizeRows, validateHeaders, type ImportDryRun } from "@photo-grade/shared";
import { prisma } from "../prisma.js";
import { assertInsideDataDir, dataDirs, safeFileName } from "../storage.js";

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

export async function processImportBatch(batchId: string, onProgress?: (message: string) => void): Promise<void> {
  const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "PROCESSING", error: null } });
  const dryRun = batch.dryRunJson as unknown as ImportDryRun;
  if (dryRun.issues.length) {
    await prisma.importBatch.update({ where: { id: batchId }, data: { status: "FAILED", error: "Dry-run still contains issues." } });
    return;
  }

  const { processMediaForWork } = await import("./media-service.js");
  let processed = 0;
  for (const work of dryRun.works) {
    onProgress?.(`Processing ${work.code}`);
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
    onProgress?.(`Processed ${processed}/${dryRun.works.length}`);
  }

  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "COMPLETED" } });
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
