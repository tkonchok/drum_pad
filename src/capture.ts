import type { Region } from "./model";
import { recorder, type Player } from "./youtube";
type Recording = ReturnType<typeof recorder>;
type Options = {
  player: Player;
  stream: MediaStream;
  regions: Region[];
  signal: AbortSignal;
  onSlice: (blob: Blob, region: Region) => Promise<void>;
  onProgress: (region: Region, phase: "seeking" | "recording") => void;
  createRecorder?: (stream: MediaStream) => Recording;
};
function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted)
      return reject(new DOMException("Capture cancelled.", "AbortError"));
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Capture cancelled.", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 40);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
/** Keeps source control and recording lifetimes together; completed slices survive cancellation. */
export async function captureRegions({
  player,
  stream,
  regions,
  signal,
  onSlice,
  onProgress,
  createRecorder = recorder,
}: Options) {
  for (const r of regions)
    if (
      !Number.isFinite(r.start) ||
      !Number.isFinite(r.end) ||
      r.start < 0 ||
      r.end <= r.start ||
      r.end - r.start > 60
    )
      throw Error("Capture regions must be between 0 and 60 seconds long.");
  let recording: Recording | undefined;
  let completed = 0;
  try {
    for (const region of regions) {
      if (signal.aborted) break;
      onProgress(region, "seeking");
      player.pauseVideo();
      player.seekTo(region.start, true);
      player.playVideo();
      const seekDeadline = Date.now() + 15000;
      while (
        player.getPlayerState() !== 1 ||
        Math.abs(player.getCurrentTime() - region.start) > 1 ||
        player.getCurrentTime() >= region.end
      ) {
        if (Date.now() > seekDeadline)
          throw Error(
            "Video did not seek reliably. Completed slices were kept; retry this passage or capture manually.",
          );
        await pause(signal);
      }
      if (signal.aborted) break;
      recording = createRecorder(stream);
      let recordingError: unknown;
      void recording.done.catch((error) => {
        recordingError = error;
      });
      recording.rec.start();
      onProgress(region, "recording");
      const deadline = Date.now() + (region.end - region.start) * 1000 + 20000;
      while (player.getCurrentTime() < region.end) {
        if (recordingError) throw recordingError;
        if (Date.now() > deadline)
          throw Error(
            "Playback stalled. Completed slices were kept; retry this passage.",
          );
        // Exclude buffering silence while retaining normal silence within the passage.
        const playing = player.getPlayerState() === 1;
        if (!playing && recording.rec.state === "recording")
          recording.rec.pause();
        else if (playing && recording.rec.state === "paused")
          recording.rec.resume();
        await pause(signal);
      }
      if (signal.aborted) break;
      if (recording.rec.state !== "inactive") recording.rec.stop();
      const blob = await recording.done;
      player.pauseVideo();
      if (signal.aborted) break;
      await onSlice(blob, region);
      completed++;
      recording = undefined;
    }
    return { completed, cancelled: signal.aborted };
  } catch (error) {
    if (signal.aborted) return { completed, cancelled: true };
    throw error;
  } finally {
    if (recording && recording.rec.state !== "inactive") recording.rec.stop();
    player.pauseVideo();
  }
}
