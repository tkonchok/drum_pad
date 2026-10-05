import { defineConfig } from "vite";
// Local middleware mirrors the serverless search endpoint; production uses api/.
export default defineConfig({
  plugins: [
    {
      name: "local-youtube-search",
      configureServer(server) {
        server.middlewares.use("/api/youtube/search", async (req, res) => {
          const url = new URL(req.url || "", "http://localhost");
          const handler = (await import("./api/youtube/search.ts")).default;
          const env = (await import("vite")).loadEnv(
            "development",
            process.cwd(),
            "",
          );
          if (env.YOUTUBE_API_KEY)
            process.env.YOUTUBE_API_KEY = env.YOUTUBE_API_KEY;
          const output = {
            status(n: number) {
              res.statusCode = n;
              return output;
            },
            json(value: unknown) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(value));
            },
            setHeader(k: string, v: string) {
              res.setHeader(k, v);
            },
          };
          await handler(
            { method: req.method, query: Object.fromEntries(url.searchParams) },
            output,
          );
        });
      },
    },
  ],
});
