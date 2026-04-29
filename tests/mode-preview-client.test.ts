import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "http://localhost:3000";

beforeEach(() => {
  // Vitest's default env is node; provide a minimal window.location for url() helper.
  // The client module reads window.location.origin to build absolute URLs.
  // Casting through unknown to keep TS happy in pure-node tests.
  (globalThis as unknown as { window?: { location: { origin: string } } }).window = {
    location: { origin: ORIGIN }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe("mode preview + finalCutoff client helpers", () => {
  it("getModePreview builds URL with mode and optional topN", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          mode: "final",
          count: 62,
          baseCount: 60,
          overflow: 2,
          defaultTopN: 60,
          currentTopN: 60
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getModePreview } = await import("../apps/web/src/api/client.ts");
    const result = await getModePreview("final", { topN: 80 });

    expect(result.count).toBe(62);
    expect(result.overflow).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toBe(`${ORIGIN}/api/host/preview-mode?mode=final&topN=80`);
  });

  it("getModePreview omits topN when not provided", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          mode: "initial",
          count: 268,
          baseCount: 268,
          overflow: 0,
          defaultTopN: 60,
          currentTopN: 60,
          judgeCount: 5,
          initialThreshold: 3
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getModePreview } = await import("../apps/web/src/api/client.ts");
    const result = await getModePreview("initial");

    expect(result.judgeCount).toBe(5);
    expect(result.initialThreshold).toBe(3);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toBe(`${ORIGIN}/api/host/preview-mode?mode=initial`);
  });

  it("setFinalCutoff posts finalCutoff to /api/host/state", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { setFinalCutoff } = await import("../apps/web/src/api/client.ts");
    await setFinalCutoff(75);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(calledUrl)).toBe(`${ORIGIN}/api/host/state`);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ finalCutoff: 75 });
  });
});
