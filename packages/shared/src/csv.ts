export const CSV_CANONICAL_HEADERS = [
  "entryId",
  "title",
  "photographerName",
  "photographerEmail",
  "imageFilename",
  "category",
  "division",
  "submittedAt",
  "notes"
] as const;

export type CsvCanonicalHeader = (typeof CSV_CANONICAL_HEADERS)[number];
export type CanonicalCsvRow = Partial<Record<CsvCanonicalHeader, string>>;

export const CSV_HEADER_ALIASES: Record<CsvCanonicalHeader, readonly string[]> = {
  entryId: ["entry id", "entry_id", "entry number", "entry no", "id", "photo id"],
  title: ["title", "image title", "photo title", "name"],
  photographerName: ["photographer", "photographer name", "entrant", "entrant name", "author", "artist"],
  photographerEmail: ["email", "e-mail", "photographer email", "entrant email", "contact email"],
  imageFilename: ["filename", "file name", "image", "image file", "image filename", "photo", "photo file"],
  category: ["category", "class", "competition category"],
  division: ["division", "group", "age group", "level"],
  submittedAt: ["submitted at", "submitted", "submission date", "created at", "timestamp"],
  notes: ["notes", "note", "comments", "comment", "remarks"]
};

const ALIAS_TO_CANONICAL = new Map<string, CsvCanonicalHeader>(
  CSV_CANONICAL_HEADERS.flatMap((canonical) => {
    return [canonical, ...CSV_HEADER_ALIASES[canonical]].map((alias) => [
      normalizeCsvHeader(alias),
      canonical
    ]);
  })
);

export function normalizeCsvHeader(header: string): string {
  return header
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function canonicalizeCsvHeader(header: string): CsvCanonicalHeader | undefined {
  return ALIAS_TO_CANONICAL.get(normalizeCsvHeader(header));
}

export function canonicalizeCsvRow(row: Record<string, string | undefined>): CanonicalCsvRow {
  const canonicalRow: CanonicalCsvRow = {};

  for (const [header, value] of Object.entries(row)) {
    const canonical = canonicalizeCsvHeader(header);
    if (canonical && value !== undefined) {
      canonicalRow[canonical] = value;
    }
  }

  return canonicalRow;
}

export function findMissingCsvHeaders(
  headers: readonly string[],
  required: readonly CsvCanonicalHeader[]
): CsvCanonicalHeader[] {
  const present = new Set(headers.map(canonicalizeCsvHeader).filter(Boolean));
  return required.filter((header) => !present.has(header));
}
