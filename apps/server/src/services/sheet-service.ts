import fs from "node:fs/promises";
import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { resolveSheetSyncTarget, setSheetSyncWorksheetTitle } from "./sheet-config-service.js";
import {
  CODE_HEADER,
  LINK_HEADER,
  UPDATED_AT_HEADER,
  buildCanonicalHeaderForJudgeCount,
  computeEffectiveHeader,
  formatUpdatedAt
} from "./sheet-header.js";

export interface SheetHeaderCheckResult {
  worksheetTitle: string;
  headerOk: boolean;
  headerAction: string;
  headerMessage: string;
}

type EnsureWorksheetAction = "matched" | "created_sheet" | "initialized_header" | "extended_header";

interface EnsureWorksheetResult {
  worksheetTitle: string;
  values: string[][];
  action: EnsureWorksheetAction;
  appendedColumns: string[];
}

/**
 * Periodic reconcile sweep — repairs sync drift by:
 *
 * 1. Resetting stuck outbox entries:
 *    - PROCESSING entries older than 60s (orphaned by worker crash) → PENDING.
 *    - FAILED entries → PENDING (sweep retries them sooner; nextAttemptAt
 *      already encodes their original retry-delay but we reset it to now).
 * 2. Recreating missing outbox entries: for any Score whose sheetStatus
 *    !== "SYNCED" and has no PENDING/PROCESSING outbox row, create a fresh
 *    PENDING outbox entry. Catches cases where outbox rows were manually
 *    deleted, or older bugs left scores orphaned.
 * 3. Drains by calling processSheetSync() (no scoreIds → claims all PENDING
 *    items respecting nextAttemptAt).
 *
 * Errors are caught and logged; never propagated. The BullMQ job runs on a
 * schedule and should not stay in a failed state.
 */
export async function reconcileSheetSync(): Promise<{
  resetStuck: number;
  recreatedMissing: number;
}> {
  const startedAt = new Date();
  console.log(`[sheet-sync:sweep] started at=${startedAt.toISOString()}`);

  let resetStuck = 0;
  let recreatedMissing = 0;
  try {
    const now = new Date();
    const stuckThreshold = new Date(now.getTime() - 60_000);

    const stuckProcessing = await prisma.sheetSyncOutbox.updateMany({
      where: {
        status: "PROCESSING",
        updatedAt: { lt: stuckThreshold }
      },
      data: { status: "PENDING", nextAttemptAt: now, error: null }
    });
    const stuckFailed = await prisma.sheetSyncOutbox.updateMany({
      where: { status: "FAILED" },
      data: { status: "PENDING", nextAttemptAt: now, error: null }
    });
    resetStuck = stuckProcessing.count + stuckFailed.count;

    const orphans = await prisma.score.findMany({
      where: {
        sheetStatus: { not: "SYNCED" },
        outboxItems: { none: { status: { in: ["PENDING", "PROCESSING"] } } }
      },
      select: { id: true }
    });
    if (orphans.length > 0) {
      await prisma.sheetSyncOutbox.createMany({
        data: orphans.map((s) => ({ scoreId: s.id }))
      });
    }
    recreatedMissing = orphans.length;

    await processSheetSync();
  } catch (err) {
    console.error("[sheet-sync:sweep] error:", err);
  }

  console.log(
    `[sheet-sync:sweep] finished resetStuck=${resetStuck} recreatedMissing=${recreatedMissing}`
  );
  return { resetStuck, recreatedMissing };
}

export async function processSheetSync(scoreIds?: string[]): Promise<void> {
  const outboxItems = await claimOutboxItems(scoreIds);
  if (!outboxItems.length) return;

  if (!env.GOOGLE_SHEETS_ENABLED) {
    await releaseOutboxItems(
      outboxItems.map((item) => item.id),
      "Google Sheets sync is disabled.",
      outboxItems.map((item) => item.scoreId)
    );
    return;
  }

  const target = await resolveSheetSyncTarget();
  if (!target?.spreadsheetId) {
    await releaseOutboxItems(
      outboxItems.map((item) => item.id),
      "Google Sheets sync target is not configured.",
      outboxItems.map((item) => item.scoreId)
    );
    return;
  }

  const updatedAtStamp = formatUpdatedAt(new Date());

  try {
    const sheets = await sheetsClient();
    const canonicalHeader = await buildCanonicalHeader();
    const workspace = await ensureWritableWorksheet(sheets, target, canonicalHeader);
    const values = workspace.values;
    const effectiveHeader = values[0] ?? [];
    const headerWidth = effectiveHeader.length;

    const codeCol = effectiveHeader.indexOf(CODE_HEADER);
    const linkCol = effectiveHeader.indexOf(LINK_HEADER);
    const updatedAtCol = effectiveHeader.indexOf(UPDATED_AT_HEADER);
    const rowIndexByCode = new Map<string, number>();
    if (codeCol >= 0) {
      for (let idx = 1; idx < values.length; idx++) {
        const row = values[idx] ?? [];
        const code = String(row[codeCol] ?? "").trim();
        if (code) rowIndexByCode.set(code, idx);
      }
    }

    const touchedRows = new Set<number>();
    for (const item of outboxItems) {
      const score = item.score;
      const fieldCol = effectiveHeader.indexOf(score.field);
      if (fieldCol < 0) continue;

      let rowIdx = rowIndexByCode.get(score.work.code);
      if (rowIdx === undefined) {
        rowIdx = values.length;
        const row = Array(headerWidth).fill("");
        if (codeCol >= 0) row[codeCol] = score.work.code;
        if (linkCol >= 0) row[linkCol] = score.work.sourceUrl ?? "";
        values.push(row);
        rowIndexByCode.set(score.work.code, rowIdx);
      }

      const row = ensureRow(values, rowIdx, headerWidth);
      if (codeCol >= 0) row[codeCol] = score.work.code;
      if (linkCol >= 0) row[linkCol] = score.work.sourceUrl ?? "";
      row[fieldCol] = String(score.value);
      touchedRows.add(rowIdx);
    }

    if (updatedAtCol >= 0) {
      for (const rowIdx of touchedRows) {
        const row = ensureRow(values, rowIdx, headerWidth);
        row[updatedAtCol] = updatedAtStamp;
      }
    }

    const range = `${quoteSheetTitle(workspace.worksheetTitle)}!A1:${columnName(headerWidth - 1)}${Math.max(values.length, 1)}`;
    const verifyResult = await writeAndVerify(
      sheets,
      target.spreadsheetId,
      range,
      values,
      `${workspace.worksheetTitle} (${outboxItems.length} outbox items)`
    );
    if (!verifyResult.ok) {
      throw new Error(verifyResult.error ?? "Sheet write-then-verify failed");
    }

    await markOutboxSynced(outboxItems.map((item) => item.id), outboxItems.map((item) => item.scoreId));
  } catch (err) {
    await releaseOutboxItems(outboxItems.map((item) => item.id), String(err), outboxItems.map((item) => item.scoreId));
  }
}

/**
 * Write `values` to `range`, then read the same `range` back and compare
 * cell-for-cell to detect silent write loss (transient Sheets API hiccups
 * where the API returns 200 but the cell value is not actually persisted).
 *
 * Retries up to `maxAttempts` total (write + read = one attempt). Returns
 * `{ ok: true }` as soon as a read-back matches; `{ ok: false, error }` if
 * the last attempt still mismatches. The caller should throw on `ok: false`
 * so the existing outbox release path increments attempts/backoff.
 *
 * Read range is identical to the write range (not a full-sheet read) to keep
 * verify cheap.
 */
async function writeAndVerify(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
  values: string[][],
  label: string,
  maxAttempts = 3
): Promise<{ ok: true; attempts: number } | { ok: false; attempts: number; error: string }> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values }
    });
    const verifyResp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const actual = (verifyResp.data.values ?? []).map((row) =>
      row.map((cell) => String(cell ?? ""))
    );
    const expected = values.map((row) => row.map((cell) => String(cell ?? "")));
    const mismatches = diffCells(expected, actual);
    if (mismatches.length === 0) {
      if (attempt > 1) {
        console.log(`[sheet-sync] ${label} verified after ${attempt} attempts`);
      }
      return { ok: true, attempts: attempt };
    }
    lastError = `verify mismatch (attempt ${attempt}/${maxAttempts}): ${mismatches.slice(0, 3).join("; ")}${mismatches.length > 3 ? "; …" : ""}`;
    console.warn(`[sheet-sync] ${label} ${lastError}`);
  }
  return { ok: false, attempts: maxAttempts, error: lastError ?? "verify failed" };
}

/**
 * Compare two 2D string grids cell-for-cell, returning short human-readable
 * mismatch descriptions (1-indexed row/column for log readability), e.g.
 * `R3C5 expected '4' got ''`.
 *
 * `expected.length` is the row count of record. Trailing rows missing from
 * `actual` are treated as all-empty (Google Sheets trims trailing empty rows
 * on read, so a fully-empty appended row would otherwise look like a bug).
 * Cells beyond the expected row width on the actual side are ignored.
 *
 * Pure function — no I/O — exported so unit tests can pin the format.
 */
export function diffCells(expected: string[][], actual: string[][]): string[] {
  const mismatches: string[] = [];
  for (let r = 0; r < expected.length; r += 1) {
    const expectedRow = expected[r] ?? [];
    const actualRow = actual[r] ?? [];
    for (let c = 0; c < expectedRow.length; c += 1) {
      const exp = String(expectedRow[c] ?? "");
      const act = String(actualRow[c] ?? "");
      if (exp !== act) {
        mismatches.push(`R${r + 1}C${c + 1} expected '${exp}' got '${act}'`);
      }
    }
  }
  return mismatches;
}

export async function verifySheetSyncWorksheet(input: {
  target: { source: "db" | "env"; spreadsheetId: string; worksheetTitle: string };
  gidHint?: number | null;
}): Promise<SheetHeaderCheckResult> {
  const sheets = await sheetsClient();
  const canonicalHeader = await buildCanonicalHeader();
  const workspace = await ensureWritableWorksheet(sheets, input.target, canonicalHeader, {
    gidHint: input.gidHint
  });
  return {
    worksheetTitle: workspace.worksheetTitle,
    headerOk: true,
    headerAction: describeHeaderAction(workspace.action),
    headerMessage: describeHeaderMessage(workspace.action, workspace.worksheetTitle, workspace.appendedColumns)
  };
}

async function buildCanonicalHeader(): Promise<string[]> {
  const judgeCount = await prisma.judge.count();
  return buildCanonicalHeaderForJudgeCount(judgeCount);
}

async function ensureWritableWorksheet(
  sheets: sheets_v4.Sheets,
  target: { source: "db" | "env"; spreadsheetId: string; worksheetTitle: string },
  canonicalHeader: string[],
  options: { gidHint?: number | null } = {}
): Promise<EnsureWorksheetResult> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: target.spreadsheetId });
  const sheetsList = meta.data.sheets ?? [];
  let worksheetTitle = target.worksheetTitle;
  const gidSheet =
    options.gidHint !== undefined && options.gidHint !== null
      ? sheetsList.find((entry) => entry.properties?.sheetId === options.gidHint)
      : undefined;
  if (gidSheet?.properties?.title) {
    worksheetTitle = gidSheet.properties.title;
    if (target.source === "db" && worksheetTitle !== target.worksheetTitle) {
      await setSheetSyncWorksheetTitle(worksheetTitle);
    }
  }
  const found = sheetsList.find((entry) => entry.properties?.title === worksheetTitle);

  if (!found) {
    await addWorksheet(sheets, target.spreadsheetId, worksheetTitle);
    await writeHeaderRow(sheets, target.spreadsheetId, worksheetTitle, canonicalHeader);
    return {
      worksheetTitle,
      values: [canonicalHeader.slice()],
      action: "created_sheet",
      appendedColumns: []
    };
  }

  const currentValues = await readWorksheetValues(sheets, target.spreadsheetId, worksheetTitle);
  const isBlank = currentValues.length === 0 || currentValues.every((row) => row.every((cell) => String(cell).trim() === ""));
  if (isBlank) {
    await writeHeaderRow(sheets, target.spreadsheetId, worksheetTitle, canonicalHeader);
    return {
      worksheetTitle,
      values: [canonicalHeader.slice()],
      action: "initialized_header",
      appendedColumns: []
    };
  }

  const existingHeader = currentValues[0] ?? [];
  const { header: effectiveHeader, appended } = computeEffectiveHeader(existingHeader, canonicalHeader);

  if (appended.length > 0) {
    await writeHeaderRow(sheets, target.spreadsheetId, worksheetTitle, effectiveHeader);
  }

  const normalized: string[][] = [
    effectiveHeader.slice(),
    ...currentValues.slice(1).map((row) => trimRow(row, effectiveHeader.length))
  ];

  return {
    worksheetTitle,
    values: normalized,
    action: appended.length === 0 ? "matched" : "extended_header",
    appendedColumns: appended
  };
}

async function addWorksheet(sheets: sheets_v4.Sheets, spreadsheetId: string, worksheetTitle: string): Promise<void> {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: worksheetTitle } } }]
    }
  });
}

async function writeHeaderRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  worksheetTitle: string,
  headers: string[]
): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetTitle(worksheetTitle)}!A1:${columnName(headers.length - 1)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers] }
  });
}

async function readWorksheetValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  worksheetTitle: string
): Promise<string[][]> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteSheetTitle(worksheetTitle)}!A:ZZ`
  });
  return (response.data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
}

function trimRow(row: string[], width: number): string[] {
  const normalized = row.slice(0, width).map((value) => String(value ?? ""));
  if (normalized.length < width) normalized.push(...Array(width - normalized.length).fill(""));
  return normalized;
}

function ensureRow(values: string[][], index: number, width: number): string[] {
  const existing = values[index] ?? [];
  const row = trimRow(existing, width);
  values[index] = row;
  return row;
}

function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

function describeHeaderAction(action: EnsureWorksheetAction): string {
  if (action === "created_sheet") return "已建立工作表";
  if (action === "initialized_header") return "已建立 Header";
  if (action === "extended_header") return "已補上缺少欄位";
  return "Header 正常";
}

function describeHeaderMessage(
  action: EnsureWorksheetAction,
  worksheetTitle: string,
  appendedColumns: string[] = []
): string {
  if (action === "created_sheet") {
    return `已建立工作表「${worksheetTitle}」並寫入標準 Header。`;
  }
  if (action === "initialized_header") {
    return `工作表「${worksheetTitle}」原本空白，已寫入標準 Header。`;
  }
  if (action === "extended_header") {
    const list = appendedColumns.join("、");
    return `在原工作表「${worksheetTitle}」末尾補上 ${appendedColumns.length} 個缺少欄位（${list}）。`;
  }
  return `工作表「${worksheetTitle}」Header 檢查通過。`;
}

async function claimOutboxItems(scoreIds?: string[]) {
  const now = new Date();
  const primary = await prisma.sheetSyncOutbox.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: now },
      scoreId: scoreIds?.length ? { in: scoreIds } : undefined
    },
    include: { score: { include: { work: true } } },
    orderBy: { createdAt: "asc" },
    take: 50
  });
  if (!primary.length) return [];

  // Cross-stage sibling claim: pull every other outstanding outbox entry whose
  // score belongs to one of the same workIds. This is what makes per-work
  // consistency possible — when the user scores a 複評 we also re-write the 初評
  // cells in the same sheet update, so any drift on older-stage cells (whether
  // the outbox is stuck PENDING, the score is FAILED, or someone hand-edited
  // the Sheet) gets corrected in the same batch. We deliberately do NOT touch
  // siblings that are already PROCESSING — that means another worker is on it.
  const workIds = Array.from(new Set(primary.map((item) => item.score.workId)));
  const primaryIds = new Set(primary.map((item) => item.id));
  const siblings = await prisma.sheetSyncOutbox.findMany({
    where: {
      id: { notIn: Array.from(primaryIds) },
      status: { in: ["PENDING", "FAILED"] },
      nextAttemptAt: { lte: now },
      score: { workId: { in: workIds } }
    },
    include: { score: { include: { work: true } } },
    orderBy: { createdAt: "asc" }
  });

  const items = [...primary, ...siblings];
  const allOutboxIds = items.map((item) => item.id);
  const allScoreIds = items.map((item) => item.scoreId);

  // Mark everything PROCESSING in one shot. The `status in [PENDING, FAILED]`
  // guard on the sibling slice prevents races with another worker that already
  // claimed an entry for this work.
  await prisma.sheetSyncOutbox.updateMany({
    where: {
      id: { in: allOutboxIds },
      status: { in: ["PENDING", "FAILED"] }
    },
    data: { status: "PROCESSING", error: null }
  });
  await prisma.score.updateMany({
    where: { id: { in: allScoreIds } },
    data: { sheetStatus: "PROCESSING", sheetError: null }
  });
  return items;
}

async function markOutboxSynced(outboxIds: string[], scoreIds: string[]) {
  const now = new Date();
  await prisma.$transaction([
    prisma.sheetSyncOutbox.updateMany({
      where: { id: { in: outboxIds } },
      data: { status: "SYNCED", error: null, syncedAt: now }
    }),
    prisma.score.updateMany({
      where: { id: { in: scoreIds } },
      data: { sheetStatus: "SYNCED", sheetError: null, syncedAt: now }
    })
  ]);
}

async function releaseOutboxItems(outboxIds: string[], error: string, scoreIds: string[] = []) {
  const now = new Date();
  const items = await prisma.sheetSyncOutbox.findMany({ where: { id: { in: outboxIds } } });
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.sheetSyncOutbox.update({
        where: { id: item.id },
        data: {
          status: "PENDING",
          attempts: { increment: 1 },
          nextAttemptAt: new Date(now.getTime() + retryDelayMs(item.attempts + 1)),
          error
        }
      });
    }
    if (scoreIds.length) {
      await tx.score.updateMany({
        where: { id: { in: scoreIds } },
        data: { sheetStatus: "FAILED", sheetError: error }
      });
    }
  });
}

function retryDelayMs(attempts: number): number {
  return Math.min(300_000, 2 ** Math.min(attempts, 8) * 1000);
}

async function sheetsClient() {
  const credentials = env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
    : env.GOOGLE_SERVICE_ACCOUNT_FILE
      ? JSON.parse(await fs.readFile(env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8"))
      : null;
  if (!credentials) throw new Error("Google service account credentials are not configured.");
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

function columnName(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - mod) / 26);
  }
  return s;
}
