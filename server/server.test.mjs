import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createChopperServer } from "./index.ts";
let server, base;
before(async () => {
  server = createChopperServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});
test("serves the production instrument and health check", async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Chopper/);
  assert.equal(
    page.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  const health = await fetch(`${base}/healthz`);
  assert.deepEqual(await health.json(), { status: "ok", app: "Chopper" });
});
test("does not serve source, secrets, or legacy sounds", async () => {
  for (const path of [
    "/.env.local",
    "/src/main.tsx",
    "/sounds/KICK.wav",
    "/api/unknown",
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 404);
  }
});
test("uses the same API handler and rate limits repeated searches", async () => {
  const prior = process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_API_KEY;
  try {
    const first = await fetch(`${base}/api/youtube/search?q=drums`);
    assert.equal(first.status, 503);
    assert.match((await first.json()).error, /configured/);
    for (let i = 0; i < 5; i++)
      await fetch(`${base}/api/youtube/search?q=drums`);
    const limited = await fetch(`${base}/api/youtube/search?q=drums`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
  } finally {
    if (prior !== undefined) process.env.YOUTUBE_API_KEY = prior;
  }
});
