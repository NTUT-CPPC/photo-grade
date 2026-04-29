import { describe, expect, it } from "vitest";
import type { Redis } from "ioredis";

process.env.AUTH_MODE = "basic";

const { createConnectRedisClient } = await import("../apps/server/src/session.js");

describe("createConnectRedisClient", () => {
  it("translates connect-redis expiration options to ioredis SET syntax", async () => {
    const calls: unknown[][] = [];
    const redis = {
      set: async (...args: unknown[]) => {
        calls.push(args);
        return "OK";
      }
    } as unknown as Redis;

    const client = createConnectRedisClient(redis);

    await client.set("pg:sess:abc", "value", { expiration: { type: "EX", value: 60 } });
    await client.set("pg:sess:def", "value", { expiration: { type: "PX", value: 500 } });
    await client.set("pg:sess:ghi", "value");

    expect(calls).toEqual([
      ["pg:sess:abc", "value", "EX", 60],
      ["pg:sess:def", "value", "PX", 500],
      ["pg:sess:ghi", "value"]
    ]);
  });

  it("expands array keys for ioredis DEL and MGET", async () => {
    const calls: unknown[][] = [];
    const redis = {
      del: async (...args: unknown[]) => {
        calls.push(["del", ...args]);
        return 2;
      },
      mget: async (...args: unknown[]) => {
        calls.push(["mget", ...args]);
        return ["one", null];
      }
    } as unknown as Redis;

    const client = createConnectRedisClient(redis);
    await client.del(["a", "b"]);
    const values = await client.mGet(["a", "b"]);

    expect(values).toEqual(["one", null]);
    expect(calls).toEqual([
      ["del", "a", "b"],
      ["mget", "a", "b"]
    ]);
  });
});
