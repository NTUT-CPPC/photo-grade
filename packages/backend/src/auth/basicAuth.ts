import { timingSafeEqual } from "node:crypto";
import type { AuthRole, BackendConfig } from "../config/env.js";

export type HeaderBag = {
  get?(name: string): string | null;
  [name: string]: string | string[] | null | undefined | ((name: string) => string | null);
};

export type BasicAuthResult =
  | { ok: true; role: AuthRole; username: string }
  | { ok: false; status: 401; challenge: string };

export function authorizeBasicAuth(
  headers: HeaderBag,
  config: Pick<BackendConfig, "auth">,
  allowedRoles: readonly AuthRole[]
): BasicAuthResult {
  const parsed = parseBasicAuthHeader(readHeader(headers, "authorization"));
  if (!parsed) {
    return unauthorized();
  }

  for (const role of allowedRoles) {
    const credential = config.auth[role];
    if (
      constantTimeEqual(parsed.username, credential.username) &&
      constantTimeEqual(parsed.password, credential.password)
    ) {
      return { ok: true, role, username: credential.username };
    }
  }

  return unauthorized();
}

export function basicAuthChallenge(realm = "photo-grade"): string {
  return `Basic realm="${realm}", charset="UTF-8"`;
}

export function parseBasicAuthHeader(value: string | undefined): { username: string; password: string } | undefined {
  if (!value?.startsWith("Basic ")) {
    return undefined;
  }

  const encoded = value.slice("Basic ".length).trim();
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return undefined;
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) {
    return undefined;
  }

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1)
  };
}

function unauthorized(): BasicAuthResult {
  return {
    ok: false,
    status: 401,
    challenge: basicAuthChallenge()
  };
}

function readHeader(headers: HeaderBag, name: string): string | undefined {
  if (typeof headers.get === "function") {
    return headers.get(name) ?? undefined;
  }

  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) {
    return direct[0];
  }

  return typeof direct === "string" ? direct : undefined;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
