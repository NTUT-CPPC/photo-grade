import { describe, expect, it } from "vitest";
import { sortItems } from "../apps/web/src/state/gallery.js";

describe("sortItems", () => {
  it("orders numeric bases by suffix then by numeric prefix", () => {
    const result = sortItems([
      { base: "100a" } as any,
      { base: "1a" } as any,
      { base: "2a" } as any,
      { base: "10b" } as any,
      { base: "1b" } as any
    ]);
    expect(result.map((item) => item.base)).toEqual(["1a", "2a", "100a", "1b", "10b"]);
  });

  it("handles non-numeric bases without throwing and orders by suffix lexicographically", () => {
    const result = sortItems([{ base: "abc" } as any, { base: "1a" } as any]);
    expect(result.map((item) => item.base)).toEqual(["1a", "abc"]);
  });
});
