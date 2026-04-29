import type {
  ModePreviewResult,
  OrderingMode,
  OrderingStatePayload,
  PresentationStatePayload,
  RuleConfigPayload
} from "@photo-grade/shared";
import type {
  ActiveImportBatch,
  ImportDryRunResult,
  ImportProgress,
  Judge,
  Mode,
  PhotoItem,
  ScorePayload,
  SheetRecord,
  WorkScoreRow
} from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type RequestOptions = RequestInit & {
  allowEmpty?: boolean;
};

export type AuthMode = "basic" | "oidc";

type RuntimeConfigResponse = {
  entryBaseUrl?: string;
  authMode?: AuthMode;
};

export type AuthStatus = {
  authenticated: boolean;
  mode: AuthMode;
  user?: { sub: string; name?: string; email?: string };
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

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  if (options.allowEmpty) {
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as T;
    }
  }
  return JSON.parse(text) as T;
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

export async function getItems(mode?: Mode): Promise<PhotoItem[]> {
  const suffix = mode ? `?mode=${encodeURIComponent(mode)}` : "";
  const payload = await firstOk<unknown>([
    `/api/items${suffix}`,
    `/api/photos${suffix}`,
    `/items${suffix}`,
    `/photos${suffix}`
  ]);
  return normalizeItems(payload);
}

export async function getRuntimeConfig(): Promise<{ entryBaseUrl: string; authMode: AuthMode }> {
  const payload = await firstOk<RuntimeConfigResponse>(["/api/runtime-config"]);
  const entryBaseUrl = payload.entryBaseUrl?.trim() || window.location.origin;
  const authMode: AuthMode = payload.authMode === "oidc" ? "oidc" : "basic";
  return { entryBaseUrl: entryBaseUrl.replace(/\/+$/, ""), authMode };
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return request<AuthStatus>("/api/auth/me");
}

export async function logout(): Promise<{ ok: boolean; redirect?: string }> {
  return request<{ ok: boolean; redirect?: string }>("/auth/logout", { method: "POST" });
}

export async function getJudges(): Promise<Judge[]> {
  const payload = await firstOk<{ judges?: Judge[] }>(["/api/judges", "/api/admin/judges"]);
  return Array.isArray(payload.judges) ? payload.judges : [];
}

export async function createJudge(name: string): Promise<Judge> {
  const payload = await request<{ judge: Judge }>("/api/admin/judges", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  return payload.judge;
}

export async function removeJudge(judgeId: string): Promise<void> {
  await request<void>(`/api/admin/judges/${encodeURIComponent(judgeId)}`, {
    method: "DELETE",
    allowEmpty: true
  });
}

export async function saveJudges(judges: Array<{ id?: string; name: string }>): Promise<Judge[]> {
  const payload = await request<{ judges: Judge[] }>("/api/admin/judges", {
    method: "PUT",
    body: JSON.stringify({ judges })
  });
  return payload.judges;
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

export async function getPresentationState(): Promise<PresentationStatePayload> {
  return request<PresentationStatePayload>("/api/host/state");
}

export async function getModePreview(
  mode: Mode,
  options: { topN?: number; threshold?: number } = {}
): Promise<ModePreviewResult> {
  const params = new URLSearchParams({ mode });
  if (options.topN !== undefined && Number.isFinite(options.topN)) {
    params.set("topN", String(Math.trunc(options.topN)));
  }
  if (options.threshold !== undefined && Number.isFinite(options.threshold)) {
    params.set("threshold", String(Math.trunc(options.threshold)));
  }
  return request<ModePreviewResult>(`/api/host/preview-mode?${params.toString()}`);
}

export async function setFinalCutoff(topN: number): Promise<void> {
  await firstOk<void>(["/api/host/state"], {
    method: "POST",
    body: JSON.stringify({ finalCutoff: topN }),
    allowEmpty: true
  });
}

export async function setSecondaryThreshold(threshold: number | null): Promise<void> {
  await firstOk<void>(["/api/host/state"], {
    method: "POST",
    body: JSON.stringify({ secondaryThreshold: threshold }),
    allowEmpty: true
  });
}

export async function getOrdering(): Promise<OrderingStatePayload> {
  return request<OrderingStatePayload>("/api/ordering");
}

export async function getRuleConfig(): Promise<RuleConfigPayload> {
  return request<RuleConfigPayload>("/api/admin/rule-config");
}

export async function saveRuleConfig(
  patch: { defaultFinalTopN?: number; defaultSecondaryThreshold?: number | null }
): Promise<RuleConfigPayload> {
  return request<RuleConfigPayload>("/api/admin/rule-config", {
    method: "PUT",
    body: JSON.stringify(patch)
  });
}

export async function setActiveOrdering(activeMode: OrderingMode): Promise<OrderingStatePayload> {
  return request<OrderingStatePayload>("/api/sync/ordering", {
    method: "POST",
    body: JSON.stringify({ activeMode })
  });
}

export async function setDefaultOrdering(input: {
  defaultMode?: OrderingMode;
  regenerate?: boolean;
}): Promise<OrderingStatePayload> {
  return request<OrderingStatePayload>("/api/admin/ordering", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function getScore(base: string): Promise<string | null> {
  const data = await firstOk<{ score?: string | number | null }>([
    `/api/scores/${encodeURIComponent(base)}`,
    `/get_score/${encodeURIComponent(base)}`
  ]);
  return data.score == null ? null : String(data.score);
}

export async function getScoresForWork(base: string): Promise<WorkScoreRow[]> {
  const data = await firstOk<{ scores?: Array<Partial<WorkScoreRow>> }>([
    `/api/scores/${encodeURIComponent(base)}`,
    `/get_score/${encodeURIComponent(base)}`
  ]);
  if (!Array.isArray(data.scores)) return [];
  return data.scores
    .filter((row): row is WorkScoreRow => {
      return (
        typeof row?.field === "string" &&
        typeof row?.value === "number" &&
        (row?.round === "initial" || row?.round === "secondary" || row?.round === "final") &&
        typeof row?.judgeId === "string"
      );
    })
    .map((row) => ({ round: row.round, field: row.field, value: row.value, judgeId: row.judgeId }));
}

export async function submitScore(payload: ScorePayload): Promise<void> {
  await firstOk<void>(["/api/scores", "/submit_score"], {
    method: "POST",
    body: JSON.stringify(payload),
    allowEmpty: true
  });
}

export async function dryRunImport(
  file: File,
  options: { signal?: AbortSignal } = {}
): Promise<ImportDryRunResult> {
  const form = new FormData();
  form.set("dryRun", "true");
  form.append("files", file, file.name);
  return firstOk<ImportDryRunResult>([
    "/api/admin/import/dry-run",
    "/api/import/dry-run",
    "/admin/import/dry-run"
  ], {
    method: "POST",
    body: form,
    signal: options.signal
  });
}

export async function getActiveImport(): Promise<ActiveImportBatch | null> {
  return firstOk<ActiveImportBatch | null>(["/api/admin/imports/active"]);
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

export async function cancelImport(importId: string): Promise<void> {
  await firstOk<void>([
    "/api/admin/import/cancel",
    `/api/admin/imports/${encodeURIComponent(importId)}/cancel`
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
