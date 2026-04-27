import type { ImportDryRun, ImportIssue, NormalizedWorkInput } from "./types.js";

export const HEADER_ALIASES: Record<string, string[]> = {
  code: ["編號", "编号", "投稿編號", "投稿编号", "作品編號", "作品编号", "ID", "id", "asset id", "asset_id", "entry id", "entry_id", "submission id", "submission_id"],
  title: ["作品名稱", "作品名称", "Title", "title", "name"],
  sourceUrl: ["作品檔案", "作品档案", "作品檔案網址", "作品档案网址", "Source URL", "source_url", "source url", "file url", "file_url", "image url", "image_url", "photo url", "photo_url", "url"],
  description: ["創作理念", "创作理念", "Description", "description", "caption", "statement", "concept"],
  timestamp: ["時間", "Timestamp"],
  email: ["電子郵件地址", "電子郵件", "Email", "email"],
  school: ["學校"],
  department: ["系級", "科系", "年級"],
  studentId: ["學號"],
  author: ["作者", "姓名", "別稱"],
  work1Title: ["作品1_名稱", "作品1 名稱", "作品1名稱"],
  work1File: ["作品1_檔案", "作品1 檔案", "作品1檔案"],
  work1Description: ["作品1_創作理念", "作品1 創作理念", "作品1創作理念"],
  work2Title: ["作品2_名稱", "作品2 名稱", "作品2名稱"],
  work2File: ["作品2_檔案", "作品2 檔案", "作品2檔案"],
  work2Description: ["作品2_創作理念", "作品2 創作理念", "作品2創作理念"]
};

const DIRECT_REQUIRED_KEYS = ["title", "sourceUrl"];
const LEGACY_REQUIRED_KEYS = ["work1Title", "work1File"];

function valueFor(row: Record<string, unknown>, key: string): string {
  const aliases = HEADER_ALIASES[key] ?? [key];
  const normalizedRow = normalizedRecord(row);
  for (const alias of [key, ...aliases]) {
    const raw = normalizedRow.get(normalizeHeader(alias));
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") return String(raw).trim();
  }
  return "";
}

export function validateHeaders(headers: string[]): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const canonical = canonicalHeaders(headers);
  const hasDirect = DIRECT_REQUIRED_KEYS.every((key) => canonical.has(key));
  const hasLegacy = LEGACY_REQUIRED_KEYS.every((key) => canonical.has(key));

  if (!hasDirect && !hasLegacy) {
    issues.push({
      row: 1,
      field: "headers",
      message: `缺少必要欄位：需提供 ${DIRECT_REQUIRED_KEYS.map(labelForKey).join(" / ")}，或 ${LEGACY_REQUIRED_KEYS.map(labelForKey).join(" / ")}`
    });
  }
  return issues;
}

export function normalizeRows(rows: Record<string, unknown>[]): ImportDryRun {
  const issues: ImportIssue[] = [];
  const works: NormalizedWorkInput[] = [];
  const seen = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    if (isCodeOnlyRow(row)) return;
    const directSourceUrl = valueFor(row, "sourceUrl");
    const submissionCode = safeCode(valueFor(row, "code") || String(idx + 1));
    const base = {
      author: valueFor(row, "author"),
      school: valueFor(row, "school"),
      department: valueFor(row, "department"),
      studentId: valueFor(row, "studentId"),
      email: valueFor(row, "email")
    };

    if (directSourceUrl) {
      const code = workCode(submissionCode, "a");
      const title = valueFor(row, "title");
      const description = valueFor(row, "description");
      validateWork(rowNumber, code, title, directSourceUrl, seen, issues);
      if (title && directSourceUrl) works.push({ code, title, description, sourceUrl: directSourceUrl, ...base });
      return;
    }

    for (const [suffix, postfix] of [["1", "a"], ["2", "b"]] as const) {
      const title = valueFor(row, `work${suffix}Title`);
      const sourceUrl = valueFor(row, `work${suffix}File`);
      const description = valueFor(row, `work${suffix}Description`);
      if (!sourceUrl && suffix === "2") continue;
      const code = workCode(submissionCode, postfix);
      validateWork(rowNumber, code, title, sourceUrl, seen, issues);
      if (!title || !sourceUrl) continue;
      works.push({ code, title, description, sourceUrl, ...base });
    }
  });

  return { totalRows: rows.length, works, issues };
}

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function canonicalHeaders(headers: string[]): Set<string> {
  const canonical = new Set<string>();
  const aliasMap = aliasLookup();
  headers.forEach((header) => {
    const key = aliasMap.get(normalizeHeader(header));
    if (key) canonical.add(key);
  });
  return canonical;
}

function aliasLookup(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    map.set(normalizeHeader(key), key);
    aliases.forEach((alias) => map.set(normalizeHeader(alias), key));
  }
  return map;
}

function normalizedRecord(row: Record<string, unknown>): Map<string, unknown> {
  const normalized = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    normalized.set(normalizeHeader(key), value);
  }
  return normalized;
}

const ROW_CONTENT_KEYS = [
  "title",
  "sourceUrl",
  "description",
  "email",
  "school",
  "department",
  "studentId",
  "author",
  "work1Title",
  "work1File",
  "work1Description",
  "work2Title",
  "work2File",
  "work2Description"
];

function isCodeOnlyRow(row: Record<string, unknown>): boolean {
  return ROW_CONTENT_KEYS.every((key) => valueFor(row, key) === "");
}

function safeCode(input: string): string {
  return input
    .trim()
    .replace(/[^0-9A-Za-z._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function workCode(submissionCode: string, postfix: "a" | "b"): string {
  return `${submissionCode}${postfix}`;
}

function validateWork(row: number, code: string, title: string, sourceUrl: string, seen: Set<string>, issues: ImportIssue[]): void {
  if (!title || !sourceUrl) {
    issues.push({ row, field: "作品", message: "作品名稱與檔案連結皆為必要" });
    return;
  }
  if (!code) {
    issues.push({ row, field: "作品編號", message: "作品編號不可為空" });
  } else if (seen.has(code)) {
    issues.push({ row, field: "作品編號", message: `重複作品編號 ${code}` });
  }
  seen.add(code);

  try {
    const parsed = new URL(sourceUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      issues.push({ row, field: "sourceUrl", message: "檔案連結必須使用 http 或 https" });
    }
  } catch {
    issues.push({ row, field: "sourceUrl", message: `檔案連結格式錯誤：${sourceUrl}` });
  }
}

function labelForKey(key: string): string {
  return HEADER_ALIASES[key]?.[0] ?? key;
}
