import { Router, type Request, type Response } from "express";
import { env } from "../env.js";
import { isAuthorizedBasicHeader } from "../auth.js";
import { buildAuthorizationUrl, buildEndSessionUrl, exchangeCallback, pkce } from "../oidc.js";

export const authRoutes = Router();

function safeReturnTo(value: unknown): string {
  if (typeof value !== "string") return "/host";
  if (!value.startsWith("/") || value.startsWith("//")) return "/host";
  return value;
}

function currentUrl(req: Request): URL {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const host = req.headers.host;
  return new URL(`${proto}://${host}${req.originalUrl}`);
}

authRoutes.get("/auth/login", async (req, res, next) => {
  if (env.AUTH_MODE !== "oidc") {
    res.redirect(safeReturnTo(req.query.returnTo));
    return;
  }
  try {
    const state = pkce.randomState();
    const codeVerifier = pkce.randomCodeVerifier();
    const codeChallenge = await pkce.calculateCodeChallenge(codeVerifier);
    const nonce = pkce.randomNonce();
    req.session.oidc = {
      state,
      codeVerifier,
      nonce,
      returnTo: safeReturnTo(req.query.returnTo)
    };
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
    const url = await buildAuthorizationUrl({ state, codeChallenge, nonce });
    res.redirect(url.toString());
  } catch (error) {
    next(error);
  }
});

authRoutes.get("/auth/callback", async (req, res, next) => {
  if (env.AUTH_MODE !== "oidc") {
    res.status(404).send("Not found");
    return;
  }
  try {
    const expected = req.session.oidc;
    if (!expected) {
      res.status(400).send("Login session expired. Please try again.");
      return;
    }
    const { tokens, claims } = await exchangeCallback(currentUrl(req), {
      state: expected.state,
      codeVerifier: expected.codeVerifier,
      nonce: expected.nonce
    });
    const sub = String(claims?.sub ?? "");
    if (!sub) {
      res.status(400).send("OIDC response missing subject.");
      return;
    }
    req.session.user = {
      sub,
      name: typeof claims?.name === "string" ? claims.name : undefined,
      email: typeof claims?.email === "string" ? claims.email : undefined,
      idToken: tokens.id_token
    };
    const returnTo = expected.returnTo ?? "/host";
    delete req.session.oidc;
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
    res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
});

authRoutes.post("/auth/logout", async (req, res, next) => {
  if (env.AUTH_MODE !== "oidc") {
    res.json({ ok: true, redirect: "/view" });
    return;
  }
  try {
    const idToken = req.session.user?.idToken;
    let endSessionUrl: URL | null = null;
    try {
      endSessionUrl = await buildEndSessionUrl(idToken);
    } catch {
      endSessionUrl = null;
    }
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((err) => (err ? reject(err) : resolve()))
    );
    res.clearCookie("pg.sid");
    res.json({ ok: true, redirect: endSessionUrl ? endSessionUrl.toString() : "/view" });
  } catch (error) {
    next(error);
  }
});

authRoutes.get("/api/auth/me", (req: Request, res: Response) => {
  if (env.AUTH_MODE === "oidc") {
    const user = req.session?.user;
    if (!user) {
      res.json({ authenticated: false, mode: "oidc" });
      return;
    }
    res.json({
      authenticated: true,
      mode: "oidc",
      user: { sub: user.sub, name: user.name, email: user.email }
    });
    return;
  }
  const ok = isAuthorizedBasicHeader(req.headers.authorization);
  res.json({ authenticated: ok, mode: "basic" });
});
