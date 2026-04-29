import { describe, expect, it } from "vitest";

process.env.AUTH_MODE = "basic";

const { parseExtraAuthorizationParams } = await import("../apps/server/src/oidc.js");

describe("parseExtraAuthorizationParams", () => {
  it("returns an empty object for missing or blank values", () => {
    expect(parseExtraAuthorizationParams(undefined)).toEqual({});
    expect(parseExtraAuthorizationParams("")).toEqual({});
    expect(parseExtraAuthorizationParams("   ")).toEqual({});
  });

  it("parses query-string style provider-specific params", () => {
    expect(parseExtraAuthorizationParams("synossoJSSDK=false&prompt=login")).toEqual({
      synossoJSSDK: "false",
      prompt: "login"
    });
  });

  it("allows a leading question mark", () => {
    expect(parseExtraAuthorizationParams("?synossoJSSDK=false")).toEqual({
      synossoJSSDK: "false"
    });
  });

  it("does not let extra params override core OIDC request parameters", () => {
    expect(
      parseExtraAuthorizationParams(
        "client_id=evil&redirect_uri=https%3A%2F%2Fevil.example%2Fcallback&scope=openid&synossoJSSDK=false"
      )
    ).toEqual({ synossoJSSDK: "false" });
  });
});
