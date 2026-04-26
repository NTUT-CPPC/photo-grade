import { describe, expect, it } from "vitest";

process.env.AUTH_MODE = "basic";
process.env.AUTH_USERNAME = "alice";
process.env.AUTH_PASSWORD = "wonderland";

const { isAuthorizedBasicHeader } = await import("../apps/server/src/auth.js");

function header(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

describe("isAuthorizedBasicHeader", () => {
  it("returns false when the header is missing or wrong scheme", () => {
    expect(isAuthorizedBasicHeader(undefined)).toBe(false);
    expect(isAuthorizedBasicHeader("")).toBe(false);
    expect(isAuthorizedBasicHeader("Bearer abc")).toBe(false);
  });

  it("returns false when decoded content has no colon", () => {
    const noColon = `Basic ${Buffer.from("alicewonderland", "utf8").toString("base64")}`;
    expect(isAuthorizedBasicHeader(noColon)).toBe(false);
  });

  it("returns false on wrong username or password", () => {
    expect(isAuthorizedBasicHeader(header("alice", "wrong"))).toBe(false);
    expect(isAuthorizedBasicHeader(header("bob", "wonderland"))).toBe(false);
    expect(isAuthorizedBasicHeader(header("", ""))).toBe(false);
  });

  it("returns true on matching credentials", () => {
    expect(isAuthorizedBasicHeader(header("alice", "wonderland"))).toBe(true);
  });

  it("treats only the first colon as the username/password split", () => {
    expect(isAuthorizedBasicHeader(header("alice:extra", "wonderland"))).toBe(false);
  });
});
