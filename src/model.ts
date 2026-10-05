export type Sample = {
  id: string;
  name: string;
  buffer: AudioBuffer;
  kind: "drum" | "chop";
};
export type Pad = {
  key: string;
  sampleId: string | null;
  start: number;
  end: number;
  gain: number;
  pitch: number;
  choke: boolean;
};
export type Hit = { pad: number; time: number };
export type Take = { id: string; hits: Hit[] };
export type Region = {
  id: string;
  videoId: string;
  start: number;
  end: number;
  name: string;
};
export const KEYS = [
  "Q",
  "W",
  "E",
  "R",
  "A",
  "S",
  "D",
  "F",
  "Z",
  "X",
  "C",
  "V",
  "T",
  "Y",
  "U",
  "I",
];
export const loopSeconds = (bpm: number, bars: number) => (bars * 4 * 60) / bpm;
export function quantizeTime(time: number, bpm: number, duration: number) {
  const step = 60 / bpm / 4;
  return (Math.round(time / step) * step) % duration;
}
export function youtubeId(value: string): string | null {
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const u = new URL(value);
    if (u.hostname === "youtu.be")
      return u.pathname.slice(1).split("/")[0] || null;
    if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "www.youtube-nocookie.com",
      ].includes(u.hostname)
    ) {
      const id =
        u.searchParams.get("v") ||
        u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
  } catch {
    /* not a URL */
  }
  return null;
}
export function wav(channels: Float32Array[], rate: number): Uint8Array {
  const frames = channels[0].length,
    count = channels.length,
    bytes = new Uint8Array(44 + frames * count * 3),
    view = new DataView(bytes.buffer);
  const str = (at: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * count * 3, true);
  view.setUint16(32, count * 3, true);
  view.setUint16(34, 24, true);
  str(36, "data");
  view.setUint32(40, bytes.length - 44, true);
  let at = 44;
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < count; c++) {
      const x = Math.max(-1, Math.min(1, channels[c][i]));
      const n = Math.round(x * (x < 0 ? 8388608 : 8388607));
      bytes[at++] = n & 255;
      bytes[at++] = (n >> 8) & 255;
      bytes[at++] = (n >> 16) & 255;
    }
  return bytes;
}
export function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
