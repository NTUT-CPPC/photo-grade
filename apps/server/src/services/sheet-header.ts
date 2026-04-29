import { FINAL_CRITERIA, fieldsForMode } from "@photo-grade/shared";

export const CODE_HEADER = "作品編號";
export const LINK_HEADER = "作品連結";
export const UPDATED_AT_HEADER = "最後更新時間";

/**
 * Build the canonical Google Sheet header for the current judge roster.
 *
 * Order is fixed and matches the legacy compareScoreField ordering:
 *   作品編號, 作品連結, 初評,
 *   複評1..N,
 *   決評美感1..N, 決評故事1..N, 決評創意1..N,
 *   最後更新時間
 *
 * `judgeCount` is floored at 1 (same convention as mode-preview-service).
 * Pure function — no DB access — so it can be unit tested.
 */
export function buildCanonicalHeaderForJudgeCount(judgeCount: number): string[] {
  const safeCount = Math.max(1, Math.floor(judgeCount));
  const secondary = fieldsForMode("secondary", undefined, safeCount);
  const finalFields = FINAL_CRITERIA.flatMap((criterion) =>
    fieldsForMode("final", criterion.key, safeCount)
  );
  return [CODE_HEADER, LINK_HEADER, "初評", ...secondary, ...finalFields, UPDATED_AT_HEADER];
}

/**
 * Format a Date as `YYYY-MM-DD HH:mm:ss UTC` to match the timezone style
 * already used in uniqueWorksheetTitle / maintenance CSV filenames.
 */
export function formatUpdatedAt(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}
