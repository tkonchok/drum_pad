import { describe, it, expect } from "vitest";
import { saveProject, loadProject, type Project } from "./project";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import { KEYS } from "./model";
const buffer = {
  duration: 1,
  length: 44100,
  sampleRate: 44100,
  numberOfChannels: 1,
  getChannelData: () => new Float32Array(44100),
} as unknown as AudioBuffer;
const project: Project = {
  name: "Test session",
  bpm: 90,
  bars: 4,
  samples: [{ id: "a", name: "Sound", kind: "chop", buffer }],
  pads: KEYS.map((key) => ({
    key,
    sampleId: "a",
    start: 0.2,
    end: 0.8,
    gain: 0.7,
    pitch: 2,
    choke: true,
  })),
  takes: [{ id: "take", hits: [{ pad: 0, time: 1 }] }],
  regions: [],
};
const ctx = { decodeAudioData: async () => buffer } as unknown as AudioContext;
const file = (bytes: Uint8Array) =>
  new File([bytes as BlobPart], "test.chopper");
describe("portable projects", () => {
  it("round trips pad settings, embedded sounds, and takes", async () => {
    const bytes = saveProject(project),
      restored = await loadProject(file(bytes), ctx);
    expect(restored.pads).toEqual(project.pads);
    expect(restored.takes).toEqual(project.takes);
    expect(restored.samples[0].name).toBe("Sound");
    const files = unzipSync(bytes);
    expect(files["samples/0.wav"].length).toBe(132344);
    expect(JSON.parse(strFromU8(files["project.json"])).version).toBe(1);
  });
  it("rejects unsupported versions and missing samples", async () => {
    const files = unzipSync(saveProject(project));
    const manifest = JSON.parse(strFromU8(files["project.json"]));
    manifest.version = 99;
    files["project.json"] = strToU8(JSON.stringify(manifest));
    await expect(loadProject(file(zipSync(files)), ctx)).rejects.toThrow(
      "unsupported",
    );
    manifest.version = 1;
    files["project.json"] = strToU8(JSON.stringify(manifest));
    delete files["samples/0.wav"];
    await expect(loadProject(file(zipSync(files)), ctx)).rejects.toThrow(
      "Missing",
    );
  });
  it("rejects invalid hits rather than allowing corrupt playback", async () => {
    const files = unzipSync(saveProject(project)),
      manifest = JSON.parse(strFromU8(files["project.json"]));
    manifest.takes[0].hits[0].pad = 999;
    files["project.json"] = strToU8(JSON.stringify(manifest));
    await expect(loadProject(file(zipSync(files)), ctx)).rejects.toThrow(
      "Invalid recorded hit",
    );
  });
});
it("rejects oversized saves before allocating PCM assets", () => {
  const huge = {
    ...buffer,
    length: 40_000_000,
    getChannelData: () => {
      throw Error("must not allocate");
    },
  } as AudioBuffer;
  expect(() =>
    saveProject({
      ...project,
      samples: [{ ...project.samples[0], buffer: huge }],
    }),
  ).toThrow("too large to save");
});
it("accepts empty projects with cleared pads", async () => {
  const empty = {
    ...project,
    samples: [],
    takes: [],
    pads: project.pads.map((p) => ({ ...p, sampleId: null, start: 0, end: 1 })),
  };
  const restored = await loadProject(file(saveProject(empty)), ctx);
  expect(restored.samples).toHaveLength(0);
  expect(restored.pads.every((p) => p.sampleId === null)).toBe(true);
});
