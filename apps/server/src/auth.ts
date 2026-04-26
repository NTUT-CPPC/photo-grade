import type { NextFunction, Request, Response } from "express";
import { env } from "./env.js";

export function isAuthorizedBasicHeader(header: string | undefined): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  const username = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);
  return username === env.AUTH_USERNAME && password === env.AUTH_PASSWORD;
}

export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isAuthorizedBasicHeader(req.headers.authorization)) return next();
    res.setHeader("WWW-Authenticate", 'Basic realm="Photo Grade"');
    return res.status(401).send("Authentication required");
  };
}
