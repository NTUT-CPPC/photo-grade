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

type RedisExpirationOptions = {
  expiration?: { type: "EX" | "PX"; value: number };
};

type ConnectRedisCompatibleClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: RedisExpirationOptions): Promise<unknown>;
  expire(key: string, ttl: number): Promise<unknown>;
  del(keys: string | string[]): Promise<unknown>;
  mGet(keys: string[]): Promise<Array<string | null>>;
  scanIterator(options: { MATCH?: string; COUNT?: number }): AsyncIterable<string[]>;
};

export function createConnectRedisClient(client: Redis): ConnectRedisCompatibleClient {
  return {
    get: (key) => client.get(key),
    set: (key, value, options) => {
      const expiration = options?.expiration;
      if (expiration?.type === "EX") return client.set(key, value, "EX", expiration.value);
      if (expiration?.type === "PX") return client.set(key, value, "PX", expiration.value);
      return client.set(key, value);
    },
    expire: (key, ttl) => client.expire(key, ttl),
    del: (keys) => (Array.isArray(keys) ? client.del(...keys) : client.del(keys)),
    mGet: (keys) => client.mget(...keys),
    scanIterator: (options) => scanIterator(client, options)
  };
}

export function sessionMiddleware(): RequestHandler {
  if (cached) return cached;
  if (env.AUTH_MODE !== "oidc") {
    cached = noop;
    return cached;
  }

  redisClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const store = new RedisStore({ client: createConnectRedisClient(redisClient), prefix: "pg:sess:" });
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

async function* scanIterator(
  client: Redis,
  options: { MATCH?: string; COUNT?: number }
): AsyncIterable<string[]> {
  let cursor = "0";
  do {
    const [nextCursor, keys] =
      options.MATCH && options.COUNT
        ? await client.scan(cursor, "MATCH", options.MATCH, "COUNT", options.COUNT)
        : options.MATCH
          ? await client.scan(cursor, "MATCH", options.MATCH)
          : options.COUNT
            ? await client.scan(cursor, "COUNT", options.COUNT)
            : await client.scan(cursor);
    cursor = nextCursor;
    if (keys.length > 0) yield keys;
  } while (cursor !== "0");
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
