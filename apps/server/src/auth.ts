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

export function isSessionAuthenticated(req: Pick<Request, "session">): boolean {
  return Boolean(req.session?.user);
}

function wantsHtml(req: Request): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const accept = req.headers.accept ?? "";
  return accept.includes("text/html");
}

function loginRedirect(req: Request): string {
  const returnTo = encodeURIComponent(req.originalUrl || "/host");
  return `/auth/login?returnTo=${returnTo}`;
}

export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (env.AUTH_MODE === "oidc") {
      if (isSessionAuthenticated(req)) return next();
      if (wantsHtml(req)) return res.redirect(loginRedirect(req));
      return res.status(401).json({ error: "Authentication required" });
    }
    if (isAuthorizedBasicHeader(req.headers.authorization)) return next();
    res.setHeader("WWW-Authenticate", 'Basic realm="Photo Grade"');
    return res.status(401).send("Authentication required");
  };
}
