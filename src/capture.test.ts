import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { captureRegions } from "./capture";
import type { Player, recorder } from "./youtube";
import type { Region } from "./model";
const regions: Region[] = [
  { id: "1", videoId: "video", name: "First", start: 5, end: 6 },
  { id: "2", videoId: "video", name: "Second", start: 10, end: 11 },
];
function fakePlayer() {
  let position = 0,
    began = 0,
    playing = false;
  const p: Player = {
    loadVideoById: vi.fn(),
    destroy: vi.fn(),
    seekTo: vi.fn((t) => {
      position = t;
      began = Date.now();
    }),
    playVideo: vi.fn(() => {
      playing = true;
      began = Date.now();
    }),
    pauseVideo: vi.fn(() => {
      position = p.getCurrentTime();
      playing = false;
    }),
    getCurrentTime: () =>
      position + (playing ? (Date.now() - began) / 1000 : 0),
    getPlayerState: () => (playing ? 1 : 2),
  };
  return p;
}
function fakeRecorder() {
  let resolve: (blob: Blob) => void = () => {};
  const done = new Promise<Blob>((r) => (resolve = r));
  const rec = {
    state: "inactive",
    start: vi.fn(() => (rec.state = "recording")),
    stop: vi.fn(() => {
      rec.state = "inactive";
      resolve(new Blob(["audio"]));
    }),
    pause: vi.fn(() => (rec.state = "paused")),
    resume: vi.fn(() => (rec.state = "recording")),
  };
  return { rec, done, fail: vi.fn() } as unknown as ReturnType<typeof recorder>;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});
describe("marked region capture", () => {
  it("plays regions sequentially and delivers a separate recording for each", async () => {
    const p = fakePlayer(),
      onSlice = vi.fn(async () => {}),
      recordings: ReturnType<typeof recorder>[] = [];
    const run = captureRegions({
      player: p,
      stream: {} as MediaStream,
      regions,
      signal: new AbortController().signal,
      onSlice,
      onProgress: vi.fn(),
      createRecorder: () => {
        const r = fakeRecorder();
        recordings.push(r);
        return r;
      },
    });
    await vi.advanceTimersByTimeAsync(2500);
    expect(await run).toEqual({ completed: 2, cancelled: false });
    expect(onSlice.mock.calls).toHaveLength(2);
    expect(p.seekTo).toHaveBeenNthCalledWith(1, 5, true);
    expect(p.seekTo).toHaveBeenNthCalledWith(2, 10, true);
    expect(recordings.every((r) => r.rec.state === "inactive")).toBe(true);
  });
  it("keeps completed slices when cancelled during the next region", async () => {
    const controller = new AbortController(),
      onSlice = vi.fn(async () => {}),
      recordings: ReturnType<typeof recorder>[] = [];
    const run = captureRegions({
      player: fakePlayer(),
      stream: {} as MediaStream,
      regions,
      signal: controller.signal,
      onSlice,
      onProgress: vi.fn(),
      createRecorder: () => {
        const r = fakeRecorder();
        recordings.push(r);
        return r;
      },
    });
    await vi.advanceTimersByTimeAsync(1400);
    controller.abort();
    expect(await run).toEqual({ completed: 1, cancelled: true });
    expect(onSlice).toHaveBeenCalledOnce();
    expect(recordings.every((r) => r.rec.state === "inactive")).toBe(true);
  });
  it("times out a stalled seek without starting a recorder", async () => {
    const p = fakePlayer();
    p.getPlayerState = () => 3;
    const createRecorder = vi.fn(fakeRecorder);
    const run = captureRegions({
      player: p,
      stream: {} as MediaStream,
      regions,
      signal: new AbortController().signal,
      onSlice: vi.fn(async () => {}),
      onProgress: vi.fn(),
      createRecorder,
    });
    const result = expect(run).rejects.toThrow("seek reliably");
    await vi.advanceTimersByTimeAsync(15100);
    await result;
    expect(createRecorder).not.toHaveBeenCalled();
    expect(p.pauseVideo).toHaveBeenCalled();
  });
  it("pauses recording during buffering and resumes on playback", async () => {
    const p = fakePlayer(),
      originalState = p.getPlayerState,
      r = fakeRecorder();
    p.getPlayerState = () =>
      Date.now() >= 300 && Date.now() < 700 ? 3 : originalState();
    const run = captureRegions({
      player: p,
      stream: {} as MediaStream,
      regions: regions.slice(0, 1),
      signal: new AbortController().signal,
      onSlice: vi.fn(async () => {}),
      onProgress: vi.fn(),
      createRecorder: () => r,
    });
    await vi.advanceTimersByTimeAsync(1500);
    expect(await run).toEqual({ completed: 1, cancelled: false });
    expect(r.rec.pause).toHaveBeenCalledOnce();
    expect(r.rec.resume).toHaveBeenCalledOnce();
  });
});
