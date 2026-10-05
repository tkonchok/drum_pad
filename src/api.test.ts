import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import handler from "../api/youtube/search";
function response() {
  return {
    statusCode: 200,
    data: undefined as unknown,
    status(n: number) {
      this.statusCode = n;
      return this;
    },
    json(value: unknown) {
      this.data = value;
    },
    setHeader: vi.fn(),
  };
}
beforeEach(() => {
  vi.stubEnv("YOUTUBE_API_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("YouTube search endpoint", () => {
  it("provides a useful URL fallback without credentials", async () => {
    const res = response();
    await handler({ method: "GET", query: { q: "drums" } }, res);
    expect(res.statusCode).toBe(503);
    expect(res.data).toEqual({
      error: "YouTube search is not configured yet. Paste a video URL instead.",
    });
  });
  it("rejects invalid queries and methods", async () => {
    const res = response();
    await handler({ method: "GET", query: { q: "a".repeat(121) } }, res);
    expect(res.statusCode).toBe(400);
    await handler({ method: "POST", query: { q: "drums" } }, res);
    expect(res.statusCode).toBe(405);
  });
  it("returns embeddable search results without exposing credentials", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: string, _options?: unknown) => ({
      ok: true,
      json: async () => ({
        items: [
          {
            id: { videoId: "abcdefghijk" },
            snippet: {
              title: "Drums",
              channelTitle: "Artist",
              thumbnails: { medium: { url: "https://example.com/thumb.jpg" } },
            },
          },
        ],
        nextPageToken: "next",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await handler(
      { method: "GET", query: { q: "drums", pageToken: "page" } },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.data)).not.toContain("test-key");
    expect(fetchMock.mock.calls[0][0]).toContain("videoEmbeddable=true");
    expect(res.data).toMatchObject({
      nextPageToken: "next",
      items: [{ id: "abcdefghijk", title: "Drums" }],
    });
  });
  it("handles quota exhaustion without returning provider secrets", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: "internal details" } }),
    }));
    const res = response();
    await handler({ method: "GET", query: { q: "drums" } }, res);
    expect(res.statusCode).toBe(429);
    expect(JSON.stringify(res.data)).not.toContain("internal details");
  });
});
