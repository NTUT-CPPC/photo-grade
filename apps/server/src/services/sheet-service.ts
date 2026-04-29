import fs from "node:fs/promises";
import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { resolveSheetSyncTarget, setSheetSyncWorksheetTitle } from "./sheet-config-service.js";

const CODE_HEADER = "作品編號";
const LINK_HEADER = "作品連結";

export interface SheetHeaderCheckResult {
  worksheetTitle: string;
  headerOk: boolean;
  headerAction: string;
  headerMessage: string;
}

type EnsureWorksheetAction = "matched" | "created_sheet" | "initialized_header" | "migrated_header";

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

  try {
    const sheets = await sheetsClient();
    const canonicalHeader = await buildCanonicalHeader(outboxItems);
    const workspace = await ensureWritableWorksheet(sheets, target, canonicalHeader);
    const values = workspace.values;

    const codeCol = canonicalHeader.indexOf(CODE_HEADER);
    const linkCol = canonicalHeader.indexOf(LINK_HEADER);
    const rowIndexByCode = new Map<string, number>();
    for (let idx = 1; idx < values.length; idx++) {
      const row = values[idx] ?? [];
      const code = String(row[codeCol] ?? "").trim();
      if (code) rowIndexByCode.set(code, idx);
    }

    for (const item of outboxItems) {
      const score = item.score;
      const fieldCol = canonicalHeader.indexOf(score.field);
      if (fieldCol < 0) continue;

      let rowIdx = rowIndexByCode.get(score.work.code);
      if (rowIdx === undefined) {
        rowIdx = values.length;
        const row = Array(canonicalHeader.length).fill("");
        row[codeCol] = score.work.code;
        row[linkCol] = score.work.sourceUrl ?? "";
        values.push(row);
        rowIndexByCode.set(score.work.code, rowIdx);
      }

      const row = ensureRow(values, rowIdx, canonicalHeader.length);
      row[codeCol] = score.work.code;
      row[linkCol] = score.work.sourceUrl ?? "";
      row[fieldCol] = String(score.value);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: target.spreadsheetId,
      range: `${quoteSheetTitle(workspace.worksheetTitle)}!A1:${columnName(canonicalHeader.length - 1)}${Math.max(values.length, 1)}`,
      valueInputOption: "RAW",
      requestBody: { values }
    });

    await markOutboxSynced(outboxItems.map((item) => item.id), outboxItems.map((item) => item.scoreId));
  } catch (err) {
    await releaseOutboxItems(outboxItems.map((item) => item.id), String(err), outboxItems.map((item) => item.scoreId));
  }
}

export async function verifySheetSyncWorksheet(input: {
  target: { source: "db" | "env"; spreadsheetId: string; worksheetTitle: string };
  gidHint?: number | null;
}): Promise<SheetHeaderCheckResult> {
  const sheets = await sheetsClient();
  const canonicalHeader = await buildCanonicalHeader([]);
  const workspace = await ensureWritableWorksheet(sheets, input.target, canonicalHeader, {
    gidHint: input.gidHint
  });
  return {
    worksheetTitle: workspace.worksheetTitle,
    headerOk: true,
    headerAction: describeHeaderAction(workspace.action),
    headerMessage: describeHeaderMessage(workspace.action, workspace.worksheetTitle)
  };
}

async function buildCanonicalHeader(
  outboxItems: Array<{ score: { field: string } }>
): Promise<string[]> {
  const dbFields = await prisma.score.findMany({
    select: { field: true },
    distinct: ["field"]
  });
  const fields = new Set<string>(dbFields.map((entry) => entry.field));
  for (const item of outboxItems) fields.add(item.score.field);
  const sortedFields = [...fields].sort(compareScoreField);
  return [CODE_HEADER, LINK_HEADER, ...sortedFields];
}

function compareScoreField(a: string, b: string): number {
  const rank = (field: string): [number, number, string] => {
    if (field === "初評") return [0, 0, field];

    const secondary = field.match(/^複評(\d+)$/);
    if (secondary) return [1, Number(secondary[1]), field];

    const final = field.match(/^決評(美感|故事|創意)(\d+)$/);
    if (final) {
      const criterionOrder = final[1] === "美感" ? 0 : final[1] === "故事" ? 1 : 2;
      return [2 + criterionOrder, Number(final[2]), field];
    }

    return [9, Number.MAX_SAFE_INTEGER, field];
  };

  const ar = rank(a);
  const br = rank(b);
  if (ar[0] !== br[0]) return ar[0] - br[0];
  if (ar[1] !== br[1]) return ar[1] - br[1];
  return ar[2].localeCompare(br[2], "zh-Hant");
}

async function ensureWritableWorksheet(
  sheets: sheets_v4.Sheets,
  target: { source: "db" | "env"; spreadsheetId: string; worksheetTitle: string },
  canonicalHeader: string[],
  options: { gidHint?: number | null } = {}
): Promise<{ worksheetTitle: string; values: string[][]; action: EnsureWorksheetAction }> {
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
    return { worksheetTitle, values: [canonicalHeader.slice()], action: "created_sheet" };
  }

  const currentValues = await readWorksheetValues(sheets, target.spreadsheetId, worksheetTitle);
  const isBlank = currentValues.length === 0 || currentValues.every((row) => row.every((cell) => String(cell).trim() === ""));
  if (isBlank) {
    await writeHeaderRow(sheets, target.spreadsheetId, worksheetTitle, canonicalHeader);
    return { worksheetTitle, values: [canonicalHeader.slice()], action: "initialized_header" };
  }

  const existingHeader = normalizeHeader(currentValues[0] ?? []);
  if (headersMatch(existingHeader, canonicalHeader)) {
    const normalized = [canonicalHeader.slice(), ...currentValues.slice(1).map((row) => trimRow(row, canonicalHeader.length))];
    return { worksheetTitle, values: normalized, action: "matched" };
  }

  const nextWorksheetTitle = uniqueWorksheetTitle(worksheetTitle, sheetsList.map((entry) => entry.properties?.title ?? ""));
  await addWorksheet(sheets, target.spreadsheetId, nextWorksheetTitle);
  await writeHeaderRow(sheets, target.spreadsheetId, nextWorksheetTitle, canonicalHeader);
  if (target.source === "db") {
    await setSheetSyncWorksheetTitle(nextWorksheetTitle);
  }
  return { worksheetTitle: nextWorksheetTitle, values: [canonicalHeader.slice()], action: "migrated_header" };
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

function normalizeHeader(values: string[]): string[] {
  return values.map((value) => String(value ?? "").trim());
}

function headersMatch(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if ((actual[index] ?? "") !== expected[index]) return false;
  }
  return true;
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

function uniqueWorksheetTitle(baseTitle: string, takenTitles: string[]): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  const base = `${baseTitle}-${stamp}`.slice(0, 90);
  const taken = new Set(takenTitles);
  if (!taken.has(base)) return base;
  for (let index = 1; index < 1000; index += 1) {
    const next = `${base}-${index}`.slice(0, 100);
    if (!taken.has(next)) return next;
  }
  return `${base}-${Date.now()}`.slice(0, 100);
}

function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

function describeHeaderAction(action: EnsureWorksheetAction): string {
  if (action === "created_sheet") return "已建立工作表";
  if (action === "initialized_header") return "已建立 Header";
  if (action === "migrated_header") return "Header 不符，已建立新工作表";
  return "Header 正常";
}

function describeHeaderMessage(action: EnsureWorksheetAction, worksheetTitle: string): string {
  if (action === "created_sheet") {
    return `已建立工作表「${worksheetTitle}」並寫入標準 Header。`;
  }
  if (action === "initialized_header") {
    return `工作表「${worksheetTitle}」原本空白，已寫入標準 Header。`;
  }
  if (action === "migrated_header") {
    return `原工作表 Header 不符，已建立「${worksheetTitle}」並切換後續同步目標。`;
  }
  return `工作表「${worksheetTitle}」Header 檢查通過。`;
}

async function claimOutboxItems(scoreIds?: string[]) {
  const now = new Date();
  const items = await prisma.sheetSyncOutbox.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: now },
      scoreId: scoreIds?.length ? { in: scoreIds } : undefined
    },
    include: { score: { include: { work: true } } },
    orderBy: { createdAt: "asc" },
    take: 50
  });
  if (!items.length) return [];
  await prisma.sheetSyncOutbox.updateMany({
    where: { id: { in: items.map((item) => item.id) }, status: "PENDING" },
    data: { status: "PROCESSING", error: null }
  });
  await prisma.score.updateMany({
    where: { id: { in: items.map((item) => item.scoreId) } },
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
