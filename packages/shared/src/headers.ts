import type { ImportDryRun, ImportIssue, NormalizedWorkInput } from "./types.js";

export const HEADER_ALIASES: Record<string, string[]> = {
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

const REQUIRED_KEYS = ["work1Title", "work1File", "work1Description"];

function valueFor(row: Record<string, unknown>, key: string): string {
  const aliases = HEADER_ALIASES[key] ?? [key];
  for (const alias of aliases) {
    const raw = row[alias];
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") return String(raw).trim();
  }
  return "";
}

export function validateHeaders(headers: string[]): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const headerSet = new Set(headers.map((h) => h.trim()));
  for (const key of REQUIRED_KEYS) {
    if (!HEADER_ALIASES[key].some((alias) => headerSet.has(alias))) {
      issues.push({ row: 1, field: key, message: `缺少必要欄位：${HEADER_ALIASES[key].join(" / ")}` });
    }
  }
  return issues;
}

export function normalizeRows(rows: Record<string, unknown>[]): ImportDryRun {
  const issues: ImportIssue[] = [];
  const works: NormalizedWorkInput[] = [];
  const seen = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const base = {
      author: valueFor(row, "author"),
      school: valueFor(row, "school"),
      department: valueFor(row, "department"),
      studentId: valueFor(row, "studentId"),
      email: valueFor(row, "email")
    };

    for (const [suffix, postfix] of [["1", "a"], ["2", "b"]] as const) {
      const title = valueFor(row, `work${suffix}Title`);
      const sourceUrl = valueFor(row, `work${suffix}File`);
      const description = valueFor(row, `work${suffix}Description`);
      if (!sourceUrl && suffix === "2") continue;
      if (!title || !sourceUrl) {
        issues.push({ row: rowNumber, field: `作品${suffix}`, message: "作品名稱與檔案連結皆為必要" });
        continue;
      }
      const code = `${idx + 1}-${postfix}`;
      if (seen.has(code)) issues.push({ row: rowNumber, field: "作品編號", message: `重複作品編號 ${code}` });
      seen.add(code);
      works.push({ code, title, description, sourceUrl, ...base });
    }
  });

  return { totalRows: rows.length, works, issues };
}
