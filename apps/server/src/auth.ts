import type { NextFunction, Request, Response } from "express";
import { env } from "./env.js";

export type AuthRole = "host" | "score" | "admin";

const credentials: Record<AuthRole, { username: string; password: string }> = {
  host: { username: env.HOST_USERNAME, password: env.HOST_PASSWORD },
  score: { username: env.SCORE_USERNAME, password: env.SCORE_PASSWORD },
  admin: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }
};

export function basicAuth(...roles: AuthRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Basic ")) return unauthorized(res);
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    const username = decoded.slice(0, sep);
    const password = decoded.slice(sep + 1);
    const ok = roles.some((role) => {
      const expected = credentials[role];
      return username === expected.username && password === expected.password;
    });
    if (!ok) return unauthorized(res);
    next();
  };
}

function unauthorized(res: Response) {
  res.setHeader("WWW-Authenticate", 'Basic realm="Photo Grade"');
  return res.status(401).send("Authentication required");
}

export function isAuthorizedHeader(header: string | undefined, role: AuthRole): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  const username = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);
  const expected = credentials[role];
  return username === expected.username && password === expected.password;
}
