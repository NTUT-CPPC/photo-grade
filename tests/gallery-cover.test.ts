import { describe, expect, it } from "vitest";
import { COVER_BASE, isCover, makeCoverItem, sortItems } from "../apps/web/src/state/gallery.js";
import type { PhotoItem } from "../apps/web/src/types.js";

describe("cover item", () => {
  it("isCover identifies the synthetic cover item", () => {
    expect(isCover(makeCoverItem())).toBe(true);
    expect(isCover({ base: "1a" } as PhotoItem)).toBe(false);
    expect(isCover(undefined)).toBe(false);
    expect(isCover(null)).toBe(false);
  });

  it("uses a stable sentinel base value", () => {
    expect(makeCoverItem().base).toBe(COVER_BASE);
    expect(COVER_BASE).toBe("__cover__");
  });

  it("prepending cover to an ordered list keeps it at index 0", () => {
    const sorted = sortItems([
      { base: "2a" } as PhotoItem,
      { base: "1a" } as PhotoItem,
      { base: "10a" } as PhotoItem
    ]);
    const visible = [makeCoverItem(), ...sorted];
    expect(visible).toHaveLength(4);
    expect(isCover(visible[0])).toBe(true);
    expect(visible.slice(1).map((item) => item.base)).toEqual(["1a", "2a", "10a"]);
  });
});
