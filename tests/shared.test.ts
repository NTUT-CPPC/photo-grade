import { describe, expect, it } from "vitest";
import { extractGoogleDriveFileId, normalizeRows, validateScore } from "@photo-grade/shared";
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
    expect(validateScore("決評美感三", 2)).toBe(false);
  });

  it("normalizes legacy form headers", () => {
    const dryRun = normalizeRows([{ "作品1 名稱": "A", "作品1 檔案": "https://example.com/a.jpg", "作品1 創作理念": "D", "別稱": "Author" }]);
    expect(dryRun.works[0].code).toBe("1-a");
    expect(dryRun.works[0].author).toBe("Author");
  });
});

describe("storage guard", () => {
  it("rejects paths outside DATA_DIR", () => {
    expect(() => assertInsideDataDir("C:\\definitely-outside-data\\x.jpg")).toThrow();
  });
});
