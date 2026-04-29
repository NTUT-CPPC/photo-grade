import fs from "node:fs/promises";
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

export interface SetSheetSyncConfigResult {
  config: SheetSyncConfigPayload;
  gidHint: number | null;
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
}): Promise<SetSheetSyncConfigResult> {
  const rawSpreadsheet = input.spreadsheet?.trim();
  if (!rawSpreadsheet) throw new Error("spreadsheet is required.");
  const parsed = parseSpreadsheetInput(rawSpreadsheet);
  if (!parsed.spreadsheetId) throw new Error("Invalid Google spreadsheet link or spreadsheet ID.");
  const worksheetTitle = normalizeWorksheetTitle(input.worksheetTitle ?? env.GOOGLE_SHEET_WORKSHEET);
  await prisma.sheetSyncConfig.upsert({
    where: { id: 1 },
    update: {
      spreadsheetId: parsed.spreadsheetId,
      spreadsheetUrl: parsed.spreadsheetUrl,
      worksheetTitle
    },
    create: {
      id: 1,
      spreadsheetId: parsed.spreadsheetId,
      spreadsheetUrl: parsed.spreadsheetUrl,
      worksheetTitle
    }
  });
  return {
    config: await getSheetSyncConfig(),
    gidHint: parsed.gidHint
  };
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
  return parseSpreadsheetInput(input).spreadsheetId;
}

export function parseSpreadsheetInput(input: string): {
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  gidHint: number | null;
} {
  const value = input.trim();
  if (!value) {
    return { spreadsheetId: null, spreadsheetUrl: null, gidHint: null };
  }

  if (/^[a-zA-Z0-9-_]{20,}$/.test(value)) {
    return { spreadsheetId: value, spreadsheetUrl: null, gidHint: null };
  }

  if (!looksLikeUrl(value)) {
    return { spreadsheetId: null, spreadsheetUrl: null, gidHint: null };
  }

  try {
    const url = new URL(value);
    const gidHint = parseGidHint(url);
    const fromQuery = url.searchParams.get("id");
    if (fromQuery && /^[a-zA-Z0-9-_]{20,}$/.test(fromQuery)) {
      return { spreadsheetId: fromQuery, spreadsheetUrl: value, gidHint };
    }

    const pathMatch = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/);
    if (pathMatch?.[1]) {
      return { spreadsheetId: pathMatch[1], spreadsheetUrl: value, gidHint };
    }
  } catch {
    return { spreadsheetId: null, spreadsheetUrl: null, gidHint: null };
  }

  return { spreadsheetId: null, spreadsheetUrl: null, gidHint: null };
}

export async function getServiceAccountEmail(): Promise<string | null> {
  try {
    const payload = env.GOOGLE_SERVICE_ACCOUNT_JSON
      ? JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
      : env.GOOGLE_SERVICE_ACCOUNT_FILE
        ? JSON.parse(await fs.readFile(env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8"))
        : null;
    if (!payload || typeof payload !== "object") return null;
    const email = (payload as { client_email?: unknown }).client_email;
    return typeof email === "string" && email.trim() ? email.trim() : null;
  } catch {
    return null;
  }
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function parseGidHint(url: URL): number | null {
  const fromQuery = parseInteger(url.searchParams.get("gid"));
  if (fromQuery !== null) return fromQuery;
  const hash = url.hash.replace(/^#/, "");
  if (!hash) return null;
  const hashParams = new URLSearchParams(hash);
  return parseInteger(hashParams.get("gid"));
}

function parseInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeWorksheetTitle(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_SHEET_WORKSHEET_TITLE;
  return trimmed.slice(0, 100);
}
