import type { RequestHandler } from "express";
import session from "express-session";
import { RedisStore } from "connect-redis";
import { Redis } from "ioredis";
import { env } from "./env.js";

export type SessionUser = {
  sub: string;
  name?: string;
  email?: string;
  idToken?: string;
};

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    oidc?: {
      state: string;
      codeVerifier: string;
      nonce?: string;
      returnTo?: string;
    };
  }
}

const noop: RequestHandler = (_req, _res, next) => next();

let cached: RequestHandler | null = null;
let redisClient: Redis | null = null;

export function sessionMiddleware(): RequestHandler {
  if (cached) return cached;
  if (env.AUTH_MODE !== "oidc") {
    cached = noop;
    return cached;
  }

  redisClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const store = new RedisStore({ client: redisClient, prefix: "pg:sess:" });
  const secure = env.COOKIE_SECURE === "true" || (env.COOKIE_SECURE === "auto" && env.NODE_ENV === "production");

  cached = session({
    store,
    secret: env.SESSION_SECRET ?? "",
    name: "pg.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  });
  return cached;
}

export async function closeSession(): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.quit();
  } catch {
    redisClient.disconnect();
  } finally {
    redisClient = null;
  }
}
