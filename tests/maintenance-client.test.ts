import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "http://localhost:3000";

beforeEach(() => {
  (globalThis as unknown as { window?: { location: { origin: string } } }).window = {
    location: { origin: ORIGIN }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe("maintenance client helpers", () => {
  it("clearScoresData posts to the maintenance endpoint before legacy aliases", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { clearScoresData } = await import("../apps/web/src/api/client.ts");
    await clearScoresData({
      requireExport: true,
      exportedAt: "2026-04-30T00:00:00.000Z",
      exportedFileName: "scores.csv"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(calledUrl)).toBe(`${ORIGIN}/api/admin/maintenance/clear-scores`);
    expect((init as RequestInit).method).toBe("POST");
  });

  it("clearMediaData posts to the maintenance endpoint before legacy aliases", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { clearMediaData } = await import("../apps/web/src/api/client.ts");
    await clearMediaData({
      requireExport: true,
      exportedAt: "2026-04-30T00:00:00.000Z",
      exportedFileName: "scores.csv"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(calledUrl)).toBe(`${ORIGIN}/api/admin/maintenance/clear-media`);
    expect((init as RequestInit).method).toBe("POST");
  });
});
