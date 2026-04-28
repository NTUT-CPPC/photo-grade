import { describe, expect, it } from "vitest";
import { mergeCameraName } from "../apps/server/src/services/media-service.js";

describe("mergeCameraName", () => {
  it("returns null when both make and model are missing", () => {
    expect(mergeCameraName(null, null)).toBeNull();
    expect(mergeCameraName(undefined, undefined)).toBeNull();
    expect(mergeCameraName("", "")).toBeNull();
    expect(mergeCameraName("   ", "   ")).toBeNull();
  });

  it("returns model alone when make is missing", () => {
    expect(mergeCameraName(null, "ILCE-6400")).toBe("ILCE-6400");
    expect(mergeCameraName("", "ILCE-6400")).toBe("ILCE-6400");
    expect(mergeCameraName("   ", "ILCE-6400  ")).toBe("ILCE-6400");
  });

  it("returns make alone when model is missing", () => {
    expect(mergeCameraName("Sony", null)).toBe("Sony");
    expect(mergeCameraName("Sony  ", "")).toBe("Sony");
  });

  it("merges disjoint make and model with a single space", () => {
    expect(mergeCameraName("Sony", "ILCE-6400")).toBe("Sony ILCE-6400");
    expect(mergeCameraName("  Sony  ", "  ILCE-6400  ")).toBe("Sony ILCE-6400");
  });

  it("does not duplicate make when model already starts with it (case-insensitive)", () => {
    expect(mergeCameraName("Canon", "Canon EOS 700D")).toBe("Canon EOS 700D");
    expect(mergeCameraName("CANON", "Canon EOS 700D")).toBe("Canon EOS 700D");
    expect(mergeCameraName("canon", "Canon EOS 700D")).toBe("Canon EOS 700D");
    expect(mergeCameraName("Canon  ", "  Canon EOS 700D  ")).toBe("Canon EOS 700D");
  });

  it("returns model when model exactly equals make (case-insensitive)", () => {
    expect(mergeCameraName("Hasselblad", "HASSELBLAD")).toBe("HASSELBLAD");
  });

  it("does not treat a make that is a non-word prefix of model as a duplicate", () => {
    // "Son" is a substring prefix of "Sony" but not a whole-word prefix; should still merge.
    expect(mergeCameraName("Son", "Sony ILCE-6400")).toBe("Son Sony ILCE-6400");
  });
});
