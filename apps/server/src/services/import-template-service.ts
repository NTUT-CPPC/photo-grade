import { utils as xlsxUtils, write as xlsxWrite } from "xlsx";

const TEMPLATE_HEADERS = [
  "電子郵件地址",
  "學校",
  "系級",
  "學號",
  "作者",
  "作品1_名稱",
  "作品1_檔案",
  "作品1_創作理念",
  "作品2_名稱",
  "作品2_檔案",
  "作品2_創作理念"
] as const;

const TEMPLATE_SAMPLE_ROW = [
  "name@example.com",
  "示範大學",
  "視覺傳達設計系",
  "A123456789",
  "王小明",
  "晨光",
  "https://drive.google.com/file/d/FILE_ID/view",
  "描述作品的創作理念",
  "",
  "",
  ""
] as const;

export function importTemplateCsvBuffer(): Buffer {
  const rows = [TEMPLATE_HEADERS, TEMPLATE_SAMPLE_ROW];
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  return Buffer.from(`\uFEFF${csv}`, "utf8");
}

export function importTemplateXlsxBuffer(): Buffer {
  const sheet = xlsxUtils.aoa_to_sheet([Array.from(TEMPLATE_HEADERS), Array.from(TEMPLATE_SAMPLE_ROW)]);
  const workbook = xlsxUtils.book_new();
  xlsxUtils.book_append_sheet(workbook, sheet, "Template");
  const out = xlsxWrite(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(out);
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll("\"", "\"\"")}"`;
  return value;
}
