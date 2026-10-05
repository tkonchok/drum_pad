// Vercel Node function; credentials stay on the server.
export default async function handler(
  req: {
    method?: string;
    query: Record<string, string | string[] | undefined>;
  },
  res: {
    status(n: number): any;
    json(value: unknown): void;
    setHeader(k: string, v: string): void;
  },
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET." });
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length > 120)
    return res
      .status(400)
      .json({ error: "Enter a search up to 120 characters." });
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || key === "undefined")
    return res.status(503).json({
      error: "YouTube search is not configured yet. Paste a video URL instead.",
    });
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    maxResults: "12",
    q,
    key,
  });
  if (
    typeof req.query.pageToken === "string" &&
    req.query.pageToken.length < 300
  )
    params.set("pageToken", req.query.pageToken);
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`,
      { signal: AbortSignal.timeout(10000) },
    );
    const data = await response.json();
    if (!response.ok)
      return res.status(response.status === 403 ? 429 : 502).json({
        error:
          response.status === 403
            ? "YouTube search quota or API access is unavailable. Try a video URL."
            : "YouTube search failed. Try again.",
      });
    return res.status(200).json({
      items: data.items.map((i: any) => ({
        id: i.id.videoId,
        title: i.snippet.title,
        channel: i.snippet.channelTitle,
        thumbnail: i.snippet.thumbnails.medium.url,
      })),
      nextPageToken: data.nextPageToken,
    });
  } catch {
    return res
      .status(502)
      .json({ error: "YouTube could not be reached. Try again." });
  }
}
