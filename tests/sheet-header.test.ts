import { describe, expect, it } from "vitest";
import {
  CODE_HEADER,
  LINK_HEADER,
  UPDATED_AT_HEADER,
  buildCanonicalHeaderForJudgeCount,
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
