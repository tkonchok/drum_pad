# Chopper

[Play Chopper](https://chopper-production-71a7.up.railway.app/) · Browser sampler, keyboard pads, loop recording, and WAV export.

A one-page browser sampler. Find a sound, chop a waveform, play sixteen keyboard pads, record a loop, overdub another layer, and export a studio-ready WAV.

## Run locally

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Node 24 required for the production server. No app account is needed.

## What works

- Original synthesized demo kit: twelve drum/percussion sounds and four melodic chords.
- Multiple audio file imports and direct file drops onto pads.
- Cached stereo waveform peaks, trimming, slice creation, preview, naming, and pad assignment.
- Clear individual pads and remove unused sounds to recover session memory.
- Keyboard, mouse, and touch performance; pitch, level, and melody choke groups.
- 1/2/4/8-bar loops, one-bar count-in, overdubbing, undo, metronome, optional 1/16 quantization.
- Exact-length stereo 24-bit PCM WAV export at 44.1 kHz.
- Downloadable `.chopper` project archives with audio, pad settings, and recorded takes.
- YouTube search, embedded playback, source-linked editable region markers, and previews.
- Manual tab-audio recording and experimental batch capture of marked video regions.

Keyboard layout: `Q W E R / A S D F / Z X C V / T Y U I`. Escape stops pad/loop playback. Shortcuts do not fire while entering text. Pads can also be played with Enter/Space when focused.

## YouTube setup

Create a Google Cloud project, enable YouTube Data API v3, and set `YOUTUBE_API_KEY` in `.env.local` (local development) or hosting environment variables. Do not prefix this key with `VITE_`: it must remain server-side. Search submits explicit queries, requests embeddable videos, and supports pagination. URL playback does not need the search key. Search quota/access errors offer URL loading instead.

The Vite development middleware and Railway production server share the search handler. The Railway production server limits search to six requests per client per minute and twenty per minute across its single process. Monitor Google Cloud quotas before broad distribution. No user OAuth or YouTube login is implemented; the player is an embed, not the complete YouTube website.

## Capture limitations

Use desktop Chrome/Edge with HTTPS or localhost. Click Capture tab audio, select a tab, and enable Share tab audio. The browser always controls that picker; audio availability depends on browser/OS. Recordings are held locally, limited to 60 seconds for manual capture, and never monitored back into the captured tab. Pad playback is stopped and blocked while capturing.

In development, Capture marked regions is enabled unless `VITE_ENABLE_YOUTUBE_CAPTURE=false`. It seeks through the current video's marked regions, waits for approximate playback position, records each passage, and adds completed slices to the library. Cancellation keeps completed slices. Recording pauses during buffering; seek inaccuracies still require waveform review; timing is not sample-accurate. Production builds always hide this experimental YouTube batch integration.

YouTube policies restrict copying and isolating its content. A screen-sharing permission is not content permission. Public YouTube extraction requires the necessary approval; personal use or in-memory storage does not remove the restriction. Only capture sources you are authorized to record. Live capture and external playback must be verified on the release target browser; unit tests cannot establish platform support.

## Projects and limits

Save project bundles a version-1 JSON manifest and lossless PCM audio into a ZIP with a `.chopper` extension. Open restores everything without fetching source videos. Older `.choplab` filenames are accepted. No browser autosave is used. Refreshing loses unsaved work; the app registers a leave warning. Pad settings, BPM, and loop length lock once takes exist; clear the loop to edit them.

Imported sources: up to 30 MB and five minutes per file; 128 sounds per session. Project imports: 100 MB compressed / 200 MB expanded. Saves enforce the same 100 MB limit; decoded session audio is capped at 256 MB. Pitch uses playback rate and changes duration. Export cuts sample tails at the exact loop boundary; time stretching and seamless tail wrapping are not implemented.

## Architecture

React/TypeScript handles the interface. `src/audio.ts` uses decoded AudioBuffers, an AudioContext clock, lookahead scheduling, and a shared master bus. Performances store timestamped pad events; overdubs are independent takes. OfflineAudioContext replays those events into a stereo mix; `src/model.ts` encodes WAV. `src/project.ts` stores and validates portable project archives using fflate. `src/youtube.ts` isolates player and capture integration. `/api/youtube/search` is the only server endpoint; audio and project files do not go through it.

The old `sounds/`, `script.js`, and `style.css` are preserved as legacy assets but are not used by the new application. Their redistribution rights are unknown; the hosted demo exclusively uses generated original sounds. A user-supplied Chopper illustration appears once as a small footer cameo in `src/assets/chopper-reference.jpg`; it can be removed by deleting the footer image and its import from `src/main.tsx`. No license to that illustration is granted by this repository.

## Validation

```sh
npm test
npm run build
npm run preview
npm run test:server
```

Before publishing, test browser capture with shared audio, capture cancellation, batch buffering recovery, export playback in a DAW, and project restoration. A browser that lacks tab audio can still use the sampler with imported files.

## Deploy on Railway

The preferred deployment uses your existing Railway subscription. The production Node server serves the built frontend and YouTube search together. `railway.json` provides build/start commands and a health check. Set `YOUTUBE_API_KEY` in service variables, generate a public domain, and verify the deployed workflow. One replica is the default release target; search rate limits are per process.

See [Railway deployment instructions](docs/RAILWAY_DEPLOY.md) for Google Cloud setup and verification. The live app is deployed on Railway, and YouTube search has been verified with the API key stored in Railway's environment variables. That key is not included in this repository.

## Design

The interface adapts a Google Stitch reference into warm ivory surfaces, coral melodic pads, cyan waveforms, and navy instrument displays. [Google Stitch design prompt](docs/STITCH_PROMPT.md) preserves the actual Chopper workflow and offers additional visual directions.
