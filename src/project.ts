import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { type Sample, type Pad, type Take, type Region, wav } from "./model";
export type Project = {
  name: string;
  bpm: number;
  bars: number;
  pads: Pad[];
  takes: Take[];
  regions: Region[];
  samples: Sample[];
};
export function saveProject(p: Project) {
  // Leave room for the manifest and ZIP headers, so every saved project can reopen.
  const audioBytes = p.samples.reduce(
    (sum, s) => sum + 44 + s.buffer.length * s.buffer.numberOfChannels * 3,
    0,
  );
  if (audioBytes > 99 * 1024 * 1024)
    throw Error(
      "This project is too large to save (100 MB). Remove unused sounds or keep only your trimmed slices.",
    );
  const { samples, ...rest } = p,
    files: Record<string, Uint8Array> = {};
  const assets = samples.map((s, i) => {
    const path = `samples/${i}.wav`;
    files[path] = wav(
      Array.from({ length: s.buffer.numberOfChannels }, (_, c) =>
        s.buffer.getChannelData(c),
      ),
      s.buffer.sampleRate,
    );
    return { id: s.id, name: s.name, kind: s.kind, path };
  });
  files["project.json"] = strToU8(
    JSON.stringify({ version: 1, ...rest, samples: assets }),
  );
  const archive = zipSync(files, { level: 0 });
  if (archive.length > 100 * 1024 * 1024)
    throw Error(
      "Project exceeds the 100 MB save limit. Remove unused sounds first.",
    );
  return archive;
}
export async function loadProject(
  file: File,
  ctx: AudioContext,
): Promise<Project> {
  if (file.size > 100 * 1024 * 1024)
    throw Error("Project exceeds the 100 MB limit.");
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (f) => {
      total += f.originalSize;
      if (total > 200 * 1024 * 1024)
        throw Error("Expanded project exceeds 200 MB.");
      return true;
    },
  });
  if (!files["project.json"]) throw Error("This is not a Chopper project.");
  const p = JSON.parse(strFromU8(files["project.json"]));
  if (
    !p ||
    p.version !== 1 ||
    typeof p.name !== "string" ||
    !Number.isFinite(p.bpm) ||
    p.bpm < 40 ||
    p.bpm > 200 ||
    ![1, 2, 4, 8].includes(p.bars) ||
    !Array.isArray(p.pads) ||
    p.pads.length !== 16 ||
    !Array.isArray(p.samples) ||
    p.samples.length > 128 ||
    !Array.isArray(p.takes) ||
    p.takes.length > 128 ||
    !Array.isArray(p.regions) ||
    p.regions.length > 16
  )
    throw Error("Invalid or unsupported project.");
  const samples: Sample[] = [];
  let decodedBytes = 0;
  for (const s of p.samples as {
    id: string;
    name: string;
    kind: "drum" | "chop";
    path: string;
  }[]) {
    if (
      !s ||
      typeof s.id !== "string" ||
      typeof s.name !== "string" ||
      !["drum", "chop"].includes(s.kind) ||
      !files[s.path]
    )
      throw Error("Missing sample asset.");
    const buffer = await ctx.decodeAudioData(
      files[s.path].slice().buffer as ArrayBuffer,
    );
    decodedBytes += buffer.length * buffer.numberOfChannels * 4;
    if (decodedBytes > 256 * 1024 * 1024)
      throw Error("Project exceeds the 256 MB audio memory limit.");
    samples.push({ id: s.id, name: s.name, kind: s.kind, buffer });
  }
  if (new Set(samples.map((s) => s.id)).size !== samples.length)
    throw Error("Duplicate sample IDs.");
  for (const pad of p.pads) {
    if (!pad) throw Error("Invalid pad settings.");
    const s = samples.find((s) => s.id === pad.sampleId);
    if (
      !pad ||
      typeof pad.key !== "string" ||
      (pad.sampleId !== null && !s) ||
      ![pad.start, pad.end, pad.gain, pad.pitch].every(Number.isFinite) ||
      pad.start < 0 ||
      pad.end <= pad.start ||
      (s && pad.end > s.buffer.duration + 0.01) ||
      pad.gain < 0 ||
      pad.gain > 2 ||
      Math.abs(pad.pitch) > 24 ||
      typeof pad.choke !== "boolean"
    )
      throw Error("Invalid pad settings.");
  }
  const duration = (p.bars * 240) / p.bpm;
  for (const take of p.takes) {
    if (
      !take ||
      typeof take.id !== "string" ||
      !Array.isArray(take.hits) ||
      take.hits.length > 10000
    )
      throw Error("Invalid take.");
    for (const h of take.hits)
      if (
        !h ||
        !Number.isInteger(h.pad) ||
        h.pad < 0 ||
        h.pad > 15 ||
        !Number.isFinite(h.time) ||
        h.time < 0 ||
        h.time >= duration
      )
        throw Error("Invalid recorded hit.");
  }
  for (const r of p.regions)
    if (
      !r ||
      typeof r.id !== "string" ||
      typeof r.videoId !== "string" ||
      typeof r.name !== "string" ||
      ![r.start, r.end].every(Number.isFinite) ||
      r.start < 0 ||
      r.end <= r.start
    )
      throw Error("Invalid video region.");
  return { ...p, samples };
}
