import { describe, expect, it } from "vitest";
import { judgeIndexForField } from "../apps/web/src/state/work-scores.js";

describe("judgeIndexForField (post han→arabic migration)", () => {
  it("maps 初評 to index 0", () => {
    expect(judgeIndexForField("初評")).toBe(0);
  });

  it("maps secondary fields by trailing arabic numeral", () => {
    expect(judgeIndexForField("複評1")).toBe(0);
    expect(judgeIndexForField("複評2")).toBe(1);
    expect(judgeIndexForField("複評5")).toBe(4);
  });

  it("maps final criterion fields by trailing arabic numeral", () => {
    expect(judgeIndexForField("決評美感3")).toBe(2);
    expect(judgeIndexForField("決評故事5")).toBe(4);
    expect(judgeIndexForField("決評創意1")).toBe(0);
  });

  it("no longer accepts han numerals", () => {
    expect(judgeIndexForField("複評一")).toBe(-1);
    expect(judgeIndexForField("決評美感二")).toBe(-1);
  });

  it("returns -1 for unknown fields", () => {
    expect(judgeIndexForField("foo")).toBe(-1);
    expect(judgeIndexForField("複評")).toBe(-1);
  });
});
