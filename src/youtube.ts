export type Player = {
  loadVideoById(id: string): void;
  seekTo(time: number, allow: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  destroy(): void;
};
declare global {
  interface Window {
    YT?: { Player: new (element: HTMLElement, options: object) => Player };
    onYouTubeIframeAPIReady?: () => void;
  }
}
let loading: Promise<void> | undefined;
export function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve();
  if (!loading)
    loading = new Promise((resolve, reject) => {
      window.onYouTubeIframeAPIReady = () => resolve();
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => {
        loading = undefined;
        reject(Error("YouTube could not load. Check your connection."));
      };
      document.head.append(s);
    });
  return loading;
}
export async function captureStream() {
  if (!navigator.mediaDevices?.getDisplayMedia)
    throw Error(
      "Tab audio capture needs desktop Chrome or Edge. You can still import audio files.",
    );
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    systemAudio: "exclude",
  } as DisplayMediaStreamOptions);
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw Error(
      "No audio was shared. Choose a browser tab and enable Share tab audio.",
    );
  }
  return stream;
}
export function recorder(stream: MediaStream) {
  if (typeof MediaRecorder === "undefined")
    throw Error(
      "Audio capture needs a browser with MediaRecorder support. Import a file instead.",
    );
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  const rec = new MediaRecorder(
    new MediaStream(stream.getAudioTracks()),
    type ? { mimeType: type } : undefined,
  );
  const chunks: Blob[] = [];
  let fail: (reason: Error) => void = () => {};
  const done = new Promise<Blob>((resolve, reject) => {
    fail = reject;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onerror = () => reject(Error("Audio capture failed."));
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
  });
  void done.catch(() => {});
  return { rec, done, fail };
}
