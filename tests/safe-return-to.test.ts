import { describe, expect, it } from "vitest";
import { safeReturnTo } from "../apps/server/src/routes/auth-routes.js";

describe("safeReturnTo", () => {
  it("falls back to /host for non-string values", () => {
    expect(safeReturnTo(undefined)).toBe("/host");
    expect(safeReturnTo(null)).toBe("/host");
    expect(safeReturnTo(123)).toBe("/host");
    expect(safeReturnTo(["/host"])).toBe("/host");
  });

  it("falls back to /host for empty or non-rooted paths", () => {
    expect(safeReturnTo("")).toBe("/host");
    expect(safeReturnTo("host")).toBe("/host");
  });

  it("rejects scheme-relative URLs that could open-redirect", () => {
    expect(safeReturnTo("//evil.com/path")).toBe("/host");
  });

  it("rejects absolute http(s) URLs", () => {
    expect(safeReturnTo("http://evil.com")).toBe("/host");
    expect(safeReturnTo("https://evil.com")).toBe("/host");
  });

  it("rejects javascript: URLs", () => {
    expect(safeReturnTo("javascript:alert(1)")).toBe("/host");
  });

  it("accepts safe internal paths", () => {
    expect(safeReturnTo("/host")).toBe("/host");
    expect(safeReturnTo("/score?x=1")).toBe("/score?x=1");
    expect(safeReturnTo("/admin#section")).toBe("/admin#section");
  });
});
