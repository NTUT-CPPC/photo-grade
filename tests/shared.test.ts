import { describe, expect, it } from "vitest";
import { extractGoogleDriveFileId, fieldsForMode, normalizeRows, validateHeaders, validateScore } from "../packages/shared/src/index.js";
import { assertInsideDataDir } from "../apps/server/src/storage.js";

describe("shared rules", () => {
  it("extracts Google Drive file ids", () => {
    expect(extractGoogleDriveFileId("https://drive.google.com/open?id=abc123")).toBe("abc123");
    expect(extractGoogleDriveFileId("https://drive.google.com/file/d/xyz/view")).toBe("xyz");
  });

  it("validates score ranges", () => {
    expect(validateScore("初評", 0)).toBe(true);
    expect(validateScore("初評", 4)).toBe(false);
    expect(validateScore("複評一", 5)).toBe(true);
    expect(validateScore("複評4", 5)).toBe(true);
    expect(validateScore("決評故事5", 3)).toBe(true);
    expect(validateScore("決評美感三", 2)).toBe(false);
  });

  it("generates score fields for more than three judges", () => {
    expect(fieldsForMode("secondary", undefined, 5)).toEqual(["複評一", "複評二", "複評三", "複評4", "複評5"]);
    expect(fieldsForMode("final", "creativity", 4)).toEqual(["決評創意一", "決評創意二", "決評創意三", "決評創意4"]);
  });

  it("normalizes legacy form headers", () => {
    const dryRun = normalizeRows([{ "作品1 名稱": "A", "作品1 檔案": "https://example.com/a.jpg", "作品1 創作理念": "D", "別稱": "Author" }]);
    expect(dryRun.works[0].code).toBe("1a");
    expect(dryRun.works[0].author).toBe("Author");
  });

  it("uses optional submission numbers with a/b suffixes for legacy rows", () => {
    const dryRun = normalizeRows([
      {
        編號: "123",
        "作品1 名稱": "A",
        "作品1 檔案": "https://example.com/a.jpg",
        "作品1 創作理念": "D",
        "作品2 名稱": "B",
        "作品2 檔案": "https://example.com/b.jpg",
        "作品2 創作理念": "E"
      },
      { 編號: "", "作品1 名稱": "C", "作品1 檔案": "https://example.com/c.jpg", "作品1 創作理念": "F" }
    ]);
    expect(dryRun.works.map((work) => work.code)).toEqual(["123a", "123b", "2a"]);
  });

  it("accepts aliased direct import headers", () => {
    const issues = validateHeaders(["編號", "image_url", "title"]);
    const dryRun = normalizeRows([{ asset_id: "A 1", image_url: "https://example.com/a.jpg", title: "Direct" }]);
    expect(issues).toHaveLength(0);
    expect(dryRun.works[0].code).toBe("A-1a");
    expect(dryRun.works[0].sourceUrl).toBe("https://example.com/a.jpg");
  });

  it("reports missing required import header alternatives", () => {
    expect(validateHeaders(["author", "email"])[0].field).toBe("headers");
  });
});

describe("storage guard", () => {
  it("rejects paths outside DATA_DIR", () => {
    expect(() => assertInsideDataDir("C:\\definitely-outside-data\\x.jpg")).toThrow();
  });
});
