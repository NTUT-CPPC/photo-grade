import { describe, expect, it } from "vitest";
import { diffCells } from "../apps/server/src/services/sheet-service.js";

describe("diffCells", () => {
  it("returns no mismatches when grids are identical", () => {
    expect(
      diffCells(
        [
          ["a", "b"],
          ["c", "d"]
        ],
        [
          ["a", "b"],
          ["c", "d"]
        ]
      )
    ).toEqual([]);
  });

  it("reports per-cell mismatches with 1-indexed R/C", () => {
    const out = diffCells(
      [
        ["1", "2"],
        ["3", "4"]
      ],
      [
        ["1", "X"],
        ["3", "4"]
      ]
    );
    expect(out).toEqual(["R1C2 expected '2' got 'X'"]);
  });

  it("treats trailing empty rows missing from actual as all-empty (Sheets trims them)", () => {
    // Expected has a 3rd row of empty cells; actual stops after row 2. That's
    // fine — the empty cells match the implicit empties from the trimmed read.
    expect(
      diffCells(
        [
          ["a", "b"],
          ["c", "d"],
          ["", ""]
        ],
        [
          ["a", "b"],
          ["c", "d"]
        ]
      )
    ).toEqual([]);
  });

  it("flags missing trailing rows that should have had content", () => {
    const out = diffCells(
      [
        ["a", "b"],
        ["c", "d"],
        ["e", "f"]
      ],
      [
        ["a", "b"],
        ["c", "d"]
      ]
    );
    expect(out).toEqual([
      "R3C1 expected 'e' got ''",
      "R3C2 expected 'f' got ''"
    ]);
  });

  it("flags missing trailing cells inside a row", () => {
    const out = diffCells([["a", "b", "c"]], [["a", "b"]]);
    expect(out).toEqual(["R1C3 expected 'c' got ''"]);
  });

  it("ignores extra cells on the actual side beyond expected row width", () => {
    expect(diffCells([["a"]], [["a", "extra"]])).toEqual([]);
  });

  it("coerces nullish cells to empty strings on both sides", () => {
    const expected: string[][] = [[null as unknown as string, "x"]];
    const actual: string[][] = [["", "x"]];
    expect(diffCells(expected, actual)).toEqual([]);
  });
});
