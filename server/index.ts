import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import search from "../api/youtube/search.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
function send(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}
/** Single-instance limits protect the shared search quota with short-lived, in-memory counters. */
export function createChopperServer() {
  const buckets = new Map<string, { start: number; count: number }>();
  let globalStart = 0,
    globalCount = 0;
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    try {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname === "/healthz")
        return send(res, 200, JSON.stringify({ status: "ok", app: "Chopper" }));
      if (url.pathname === "/api/youtube/search") {
        if (req.method !== "GET")
          return send(res, 405, JSON.stringify({ error: "Use GET." }));
        // Railway's trusted proxy appends the client IP to X-Forwarded-For.
        const forwarded = Array.isArray(req.headers["x-forwarded-for"])
          ? req.headers["x-forwarded-for"][0]
          : req.headers["x-forwarded-for"];
        const address =
          forwarded?.split(",").at(-1)?.trim() ||
          req.socket.remoteAddress ||
          "unknown";
        const now = Date.now(),
          interval = 60000;
        for (const [id, bucket] of buckets)
          if (now - bucket.start >= interval) buckets.delete(id);
        const bucket = buckets.get(address) || { start: now, count: 0 };
        if (now - globalStart >= interval) {
          globalStart = now;
          globalCount = 0;
        }
        if (bucket.count >= 6 || globalCount >= 20) {
          res.setHeader("Retry-After", "60");
          return send(
            res,
            429,
            JSON.stringify({
              error: "Search is busy. Wait a minute, or paste a video URL.",
            }),
          );
        }
        bucket.count++;
        globalCount++;
        buckets.set(address, bucket);
        const out = {
          status(n: number) {
            res.statusCode = n;
            return out;
          },
          json(value: unknown) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(value));
          },
          setHeader(k: string, v: string) {
            res.setHeader(k, v);
          },
        };
        await search(
          { method: req.method, query: Object.fromEntries(url.searchParams) },
          out,
        );
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        return send(res, 405, JSON.stringify({ error: "Use GET." }));
      // Only built public assets are served. Source files, env files, and unknown routes stay private.
      const pathname = decodeURIComponent(url.pathname);
      const target =
        pathname === "/"
          ? resolve(root, "index.html")
          : resolve(root, "." + pathname);
      if (
        !target.startsWith(root + sep) ||
        pathname.split("/").some((part) => part.startsWith(".")) ||
        !(pathname === "/" || pathname.startsWith("/assets/"))
      )
        return send(res, 404, JSON.stringify({ error: "Not found." }));
      const info = await stat(target);
      if (!info.isFile())
        return send(res, 404, JSON.stringify({ error: "Not found." }));
      const bytes = await readFile(target);
      res.setHeader(
        "Content-Type",
        mime[extname(target)] || "application/octet-stream",
      );
      res.setHeader("Content-Length", bytes.length);
      res.setHeader(
        "Cache-Control",
        pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      res.statusCode = 200;
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      if (!res.headersSent)
        send(
          res,
          (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500,
          JSON.stringify({ error: "Request could not be completed." }),
        );
      else res.end();
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT || 3000);
  const server = createChopperServer();
  server.listen(port, "0.0.0.0", () =>
    console.log(`Chopper listening on port ${port}`),
  );
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
