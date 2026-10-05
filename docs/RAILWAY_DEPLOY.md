# Deploy Chopper on Railway

Live app: https://chopper-production-71a7.up.railway.app/ . Project: https://railway.com/project/d2b117b5-4d88-4873-9ea2-60661e300cfd . Service: `chopper`.

Chopper now has a production Node server that serves the built frontend and the same YouTube search handler used locally. Audio, captures, and projects stay in browser memory; the server does not accept audio uploads.

## Service configuration

- Runtime: Node 24 (declared in package.json).
- Builder: Railpack; build command: `npm run build`.
- Start command: `npm start`.
- Health check: `/healthz`.
- Railway supplies `PORT`; the server binds to `0.0.0.0`.
- One replica for the initial portfolio release. Search request counters are in memory per process, not distributed across replicas.

`railway.json` supplies the build/start/health settings. Generate a public Railway domain after deployment. No database, volume, or storage bucket is needed.

The deployed CLI reports that Config as Code is supported until December 1, 2026. Before then, migrate with `railway config migrate --service chopper`, review its dry run, and apply the Infrastructure as Code configuration following Railway's migration guide.

## Google Cloud setup

1. Select your Google Cloud project.
2. Enable [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com).
3. Create an API key in [Credentials](https://console.cloud.google.com/apis/credentials). Restrict the key's API access to YouTube Data API v3.
4. In Railway's service Variables tab, add `YOUTUBE_API_KEY`. This is a server key; do not prefix it with `VITE_` and do not commit it.
5. Redeploy and test an actual YouTube search. Missing keys show a clear URL fallback; provider quota/access failures show a retry/fallback message.

For local development, put the same variable in `.env.local`. Both `npm run dev` and `npm start` can read it. `.env.local` is git-ignored and excluded from Railway upload. Do not paste credentials into chat or screenshots.

## Deploy

If using the Railway CLI, authorize it with `railway login --browserless`, create or select the Chopper project and service, and deploy with `railway up`. The CLI can deploy the local working tree; a GitHub connection needs the implementation committed and pushed first.

The Railway account login and Google API key are external prerequisites. Never claim deployment or live search is verified until the public domain responds and an authenticated search succeeds.

## Production checks

Before upload:

```sh
npm ci
npm run build
npm test
npm run test:server
npm start
```

After deploy:

- Confirm `/healthz` returns `{ "status": "ok", "app": "Chopper" }`.
- Load the root page and play the demo pads.
- Search a video and load it in the embedded player.
- Record/overdub an original demo loop, export WAV, and reopen a saved .chopper project.
- Test tab audio sharing on the actual target desktop browser, including cancellation and missing audio.
- Confirm `.env.local`, `/src/`, and `/sounds/` are not publicly served.

Search is limited to six requests per client per minute and twenty requests per minute for the single running service, with `Retry-After` responses. Counters reset on restart and do not replace Google's daily quotas. Monitor search quota usage in Google Cloud. The server's health response and API errors provide the initial operational checks.

The production build keeps experimental automatic YouTube batch capture disabled. Generic authorized-source tab capture, local file sampling, browsing, and exports remain available. The source markers are approximate and still require waveform review after capture.

Reference: [Railway start commands](https://docs.railway.com/deployments/start-command), [CLI login](https://docs.railway.com/cli/login), [Railpack Node support](https://railpack.com/languages/node/).
