import type {
  ImportDryRunResult,
  ImportProgress,
  Mode,
  PhotoItem,
  ScorePayload,
  SheetRecord
} from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type RequestOptions = RequestInit & {
  allowEmpty?: boolean;
};

function url(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE) return `${API_BASE}${normalizedPath}`;
  return new URL(normalizedPath, window.location.origin).toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(url(path), {
    credentials: "same-origin",
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : {
            "Content-Type": "application/json",
            ...options.headers
          }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  if (response.status === 204 || options.allowEmpty) {
    return undefined as T;
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function firstOk<T>(paths: string[], options?: RequestOptions): Promise<T> {
  let last: unknown;
  for (const path of paths) {
    try {
      return await request<T>(path, options);
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("All API endpoints failed");
}

function normalizeItems(payload: unknown): PhotoItem[] {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { items?: unknown[] })?.items)
      ? (payload as { items: unknown[] }).items
      : Array.isArray((payload as { photos?: unknown[] })?.photos)
        ? (payload as { photos: unknown[] }).photos
        : [];

  return raw.filter((item): item is PhotoItem => {
    return typeof item === "object" && item !== null && typeof (item as PhotoItem).base === "string";
  });
}

export async function getItems(): Promise<PhotoItem[]> {
  const payload = await firstOk<unknown>(["/api/items", "/api/photos", "/items", "/photos"]);
  return normalizeItems(payload);
}

export async function getSheetRecords(): Promise<SheetRecord[]> {
  return firstOk<SheetRecord[]>([
    "/api/sheet-records",
    "/api/sheet_records_full",
    "/sheet_records_full"
  ]);
}

export async function getIdx(): Promise<number> {
  const data = await firstOk<{ idx?: number; index?: number }>(["/api/sync/idx", "/get_idx"]);
  return Number(data.idx ?? data.index ?? 0);
}

export async function setIdx(idx: number): Promise<void> {
  await firstOk<void>(["/api/sync/idx", "/set_idx"], {
    method: "POST",
    body: JSON.stringify({ idx, index: idx }),
    allowEmpty: true
  });
}

export async function getMode(): Promise<Mode> {
  const data = await firstOk<{ mode?: Mode }>(["/api/sync/mode", "/get_mode"]);
  return data.mode ?? "initial";
}

export async function setMode(mode: Mode): Promise<void> {
  await firstOk<void>(["/api/sync/mode", "/set_mode"], {
    method: "POST",
    body: JSON.stringify({ mode }),
    allowEmpty: true
  });
}

export async function getScore(base: string): Promise<string | null> {
  const data = await firstOk<{ score?: string | number | null }>([
    `/api/scores/${encodeURIComponent(base)}`,
    `/get_score/${encodeURIComponent(base)}`
  ]);
  return data.score == null ? null : String(data.score);
}

export async function submitScore(payload: ScorePayload): Promise<void> {
  await firstOk<void>(["/api/scores", "/submit_score"], {
    method: "POST",
    body: JSON.stringify(payload),
    allowEmpty: true
  });
}

export async function dryRunImport(form: FormData): Promise<ImportDryRunResult> {
  return firstOk<ImportDryRunResult>([
    "/api/admin/import/dry-run",
    "/api/import/dry-run",
    "/admin/import/dry-run"
  ], {
    method: "POST",
    body: form
  });
}

export async function confirmImport(importId: string): Promise<ImportProgress | void> {
  return firstOk<ImportProgress | void>([
    "/api/admin/import/confirm",
    "/api/import/confirm",
    "/admin/import/confirm"
  ], {
    method: "POST",
    body: JSON.stringify({ importId, id: importId }),
    allowEmpty: true
  });
}

export async function getImportProgress(importId: string): Promise<ImportProgress> {
  return firstOk<ImportProgress>([
    `/api/admin/import/progress/${encodeURIComponent(importId)}`,
    `/api/import/progress/${encodeURIComponent(importId)}`,
    `/admin/import/progress/${encodeURIComponent(importId)}`
  ]);
}

export function imageUrl(item: PhotoItem, quality: "high" | "mini" = "high") {
  if (quality === "mini" && item.thumbnailUrl) return item.thumbnailUrl;
  if (quality === "high" && item.imageUrl) return item.imageUrl;
  const filename = quality === "mini" ? item.mini ?? item.high : item.high ?? item.mini;
  return filename ? url(`/static/collections/${filename}`) : "";
}
