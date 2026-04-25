import fs from "node:fs/promises";
import { google } from "googleapis";
import { prisma } from "../prisma.js";
import { env } from "../env.js";

export async function processSheetSync(scoreIds?: string[]): Promise<void> {
  const outboxItems = await claimOutboxItems(scoreIds);
  if (!outboxItems.length) return;
  if (!env.GOOGLE_SHEETS_ENABLED || !env.GOOGLE_SHEET_ID) {
    await releaseOutboxItems(outboxItems.map((item) => item.id), "Google Sheets sync is disabled or GOOGLE_SHEET_ID is not configured.");
    return;
  }

  try {
    const sheets = await sheetsClient();
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: env.GOOGLE_SHEET_ID, range: "A:ZZ" });
    const values = response.data.values ?? [];
    const headers = values[0] ?? [];
    const codeCol = ensureHeader(headers, "作品編號");
    const requests = [];

    for (const item of outboxItems) {
      const score = item.score;
      const fieldCol = ensureHeader(headers, score.field);
      let rowIdx = values.findIndex((row, idx) => idx > 0 && row[codeCol] === score.work.code);
      if (rowIdx < 0) {
        rowIdx = values.length;
        values.push([]);
        requests.push({ range: cell(rowIdx, codeCol), values: [[score.work.code]] });
      }
      requests.push({ range: cell(rowIdx, fieldCol), values: [[score.value]] });
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: env.GOOGLE_SHEET_ID,
      range: `A1:${columnName(headers.length - 1)}1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] }
    });
    for (const req of requests) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: env.GOOGLE_SHEET_ID,
        range: req.range,
        valueInputOption: "RAW",
        requestBody: { values: req.values }
      });
    }
    await markOutboxSynced(outboxItems.map((item) => item.id), outboxItems.map((item) => item.scoreId));
  } catch (err) {
    await releaseOutboxItems(outboxItems.map((item) => item.id), String(err), outboxItems.map((item) => item.scoreId));
  }
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

function ensureHeader(headers: string[], name: string): number {
  let idx = headers.indexOf(name);
  if (idx < 0) {
    headers.push(name);
    idx = headers.length - 1;
  }
  return idx;
}

function cell(rowZero: number, colZero: number): string {
  return `${columnName(colZero)}${rowZero + 1}`;
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
