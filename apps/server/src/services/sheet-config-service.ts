import { env } from "../env.js";
import { prisma } from "../prisma.js";

export const DEFAULT_SHEET_WORKSHEET_TITLE = "Photo Grade Scores";

type SheetTargetSource = "db" | "env" | "none";

export interface SheetSyncConfigPayload {
  source: SheetTargetSource;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  worksheetTitle: string;
  updatedAt: string | null;
}

export interface SheetSyncTarget {
  source: Exclude<SheetTargetSource, "none">;
  spreadsheetId: string;
  worksheetTitle: string;
}

export async function getSheetSyncConfig(): Promise<SheetSyncConfigPayload> {
  const row = await prisma.sheetSyncConfig.findUnique({ where: { id: 1 } });
  if (row) {
    return {
      source: "db",
      spreadsheetId: row.spreadsheetId,
      spreadsheetUrl: row.spreadsheetUrl,
      worksheetTitle: normalizeWorksheetTitle(row.worksheetTitle),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  if (env.GOOGLE_SHEET_ID) {
    return {
      source: "env",
      spreadsheetId: env.GOOGLE_SHEET_ID,
      spreadsheetUrl: null,
      worksheetTitle: normalizeWorksheetTitle(env.GOOGLE_SHEET_WORKSHEET),
      updatedAt: null
    };
  }

  return {
    source: "none",
    spreadsheetId: null,
    spreadsheetUrl: null,
    worksheetTitle: normalizeWorksheetTitle(env.GOOGLE_SHEET_WORKSHEET),
    updatedAt: null
  };
}

export async function setSheetSyncConfig(input: {
  spreadsheet: string;
  worksheetTitle?: string;
}): Promise<SheetSyncConfigPayload> {
  const rawSpreadsheet = input.spreadsheet?.trim();
  if (!rawSpreadsheet) throw new Error("spreadsheet is required.");
  const spreadsheetId = parseSpreadsheetId(rawSpreadsheet);
  if (!spreadsheetId) throw new Error("Invalid Google spreadsheet link or spreadsheet ID.");
  const worksheetTitle = normalizeWorksheetTitle(input.worksheetTitle ?? env.GOOGLE_SHEET_WORKSHEET);
  await prisma.sheetSyncConfig.upsert({
    where: { id: 1 },
    update: {
      spreadsheetId,
      spreadsheetUrl: looksLikeUrl(rawSpreadsheet) ? rawSpreadsheet : null,
      worksheetTitle
    },
    create: {
      id: 1,
      spreadsheetId,
      spreadsheetUrl: looksLikeUrl(rawSpreadsheet) ? rawSpreadsheet : null,
      worksheetTitle
    }
  });
  return getSheetSyncConfig();
}

export async function resolveSheetSyncTarget(): Promise<SheetSyncTarget | null> {
  const config = await getSheetSyncConfig();
  if (!config.spreadsheetId || config.source === "none") return null;
  return {
    source: config.source,
    spreadsheetId: config.spreadsheetId,
    worksheetTitle: config.worksheetTitle
  };
}

export async function setSheetSyncWorksheetTitle(worksheetTitle: string): Promise<void> {
  const row = await prisma.sheetSyncConfig.findUnique({ where: { id: 1 } });
  if (!row) return;
  await prisma.sheetSyncConfig.update({
    where: { id: 1 },
    data: { worksheetTitle: normalizeWorksheetTitle(worksheetTitle) }
  });
}

export function parseSpreadsheetId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  if (/^[a-zA-Z0-9-_]{20,}$/.test(value)) return value;

  if (!looksLikeUrl(value)) return null;

  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("id");
    if (fromQuery && /^[a-zA-Z0-9-_]{20,}$/.test(fromQuery)) return fromQuery;

    const pathMatch = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/);
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
    return null;
  }

  return null;
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizeWorksheetTitle(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_SHEET_WORKSHEET_TITLE;
  return trimmed.slice(0, 100);
}