import { describe, expect, it } from "vitest";
import {
  CODE_HEADER,
  LINK_HEADER,
  UPDATED_AT_HEADER,
  buildCanonicalHeaderForJudgeCount,
  computeEffectiveHeader,
  formatUpdatedAt
} from "../apps/server/src/services/sheet-header.js";

describe("buildCanonicalHeaderForJudgeCount", () => {
  it("emits [code, link, 初評, 複評1..N, 決評美感1..N, 決評故事1..N, 決評創意1..N, 最後更新時間]", () => {
    expect(buildCanonicalHeaderForJudgeCount(3)).toEqual([
      CODE_HEADER,
      LINK_HEADER,
      "初評",
      "複評1",
      "複評2",
      "複評3",
      "決評美感1",
      "決評美感2",
      "決評美感3",
      "決評故事1",
      "決評故事2",
      "決評故事3",
      "決評創意1",
      "決評創意2",
      "決評創意3",
      UPDATED_AT_HEADER
    ]);
  });

  it("supports judge counts above the default JUDGES table", () => {
    const header = buildCanonicalHeaderForJudgeCount(5);
    expect(header).toContain("複評5");
    expect(header).toContain("決評創意5");
    // 最後更新時間 must be the very last column.
    expect(header[header.length - 1]).toBe(UPDATED_AT_HEADER);
  });

  it("floors judge count at 1 instead of producing an empty header", () => {
    expect(buildCanonicalHeaderForJudgeCount(0)).toEqual([
      CODE_HEADER,
      LINK_HEADER,
      "初評",
      "複評1",
      "決評美感1",
      "決評故事1",
      "決評創意1",
      UPDATED_AT_HEADER
    ]);
    expect(buildCanonicalHeaderForJudgeCount(-2)).toEqual(buildCanonicalHeaderForJudgeCount(0));
  });
});

describe("computeEffectiveHeader", () => {
  const canonical = buildCanonicalHeaderForJudgeCount(3);

  it("treats an empty existing header as fully missing — returns canonical order", () => {
    const result = computeEffectiveHeader([], canonical);
    expect(result.header).toEqual(canonical);
    expect(result.appended).toEqual(canonical);
  });

  it("returns the canonical header unchanged when it already matches", () => {
    const result = computeEffectiveHeader(canonical, canonical);
    expect(result.header).toEqual(canonical);
    expect(result.appended).toEqual([]);
  });

  it("preserves user reordering of canonical columns without re-adding them", () => {
    const reordered = [...canonical].reverse();
    const result = computeEffectiveHeader(reordered, canonical);
    expect(result.header).toEqual(reordered);
    expect(result.appended).toEqual([]);
  });

  it("preserves user-added extra columns and appends missing canonical columns at the end", () => {
    const existing = [CODE_HEADER, LINK_HEADER, "初評", "備註"];
    const result = computeEffectiveHeader(existing, canonical);
    const expectedAppended = canonical.filter((column) => !existing.includes(column));
    expect(result.header).toEqual([...existing, ...expectedAppended]);
    expect(result.appended).toEqual(expectedAppended);
    // 備註 (a user-added extra column) must be retained in its original spot.
    expect(result.header).toContain("備註");
    // 最後更新時間 should be appended near the end since it was missing.
    expect(result.header[result.header.length - 1]).toBe(UPDATED_AT_HEADER);
  });

  it("appends a missing 作品編號 at the end (no special-casing of code/link cols)", () => {
    const existing = canonical.filter((column) => column !== CODE_HEADER);
    const result = computeEffectiveHeader(existing, canonical);
    expect(result.appended).toEqual([CODE_HEADER]);
    expect(result.header).toEqual([...existing, CODE_HEADER]);
  });

  it("normalizes whitespace-only existing cells and treats them as non-canonical placeholders", () => {
    const existing = ["  ", CODE_HEADER, LINK_HEADER, "初評"];
    const result = computeEffectiveHeader(existing, canonical);
    // The whitespace cell becomes "" and is preserved as a placeholder column.
    expect(result.header[0]).toBe("");
    // Missing canonical columns are appended in canonical order.
    const expectedAppended = canonical.filter((column) => !["", CODE_HEADER, LINK_HEADER, "初評"].includes(column));
    expect(result.appended).toEqual(expectedAppended);
  });
});

describe("formatUpdatedAt", () => {
  it("formats a date as YYYY-MM-DD HH:mm:ss UTC", () => {
    expect(formatUpdatedAt(new Date(Date.UTC(2026, 3, 30, 7, 5, 9)))).toBe(
      "2026-04-30 07:05:09 UTC"
    );
  });

  it("zero-pads single-digit fields", () => {
    expect(formatUpdatedAt(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))).toBe("2026-01-01 00:00:00 UTC");
  });
});
