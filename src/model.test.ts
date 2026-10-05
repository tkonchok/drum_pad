import { describe, it, expect } from "vitest";
import { wav, quantizeTime, loopSeconds, youtubeId } from "./model";
describe("musical timing", () => {
  it("calculates exact loop duration", () => {
    expect(loopSeconds(90, 4)).toBeCloseTo(10.6666667);
  });
  it("wraps a quantized hit at the loop boundary", () => {
    expect(quantizeTime(3.99, 120, 4)).toBe(0);
    expect(quantizeTime(0.14, 120, 4)).toBe(0.125);
  });
});
describe("source parsing", () => {
  it("supports URLs and refuses unrelated hosts", () => {
    expect(youtubeId("https://youtu.be/abcdefghijk?t=10")).toBe("abcdefghijk");
    expect(youtubeId("https://www.youtube.com/watch?v=abcdefghijk")).toBe(
      "abcdefghijk",
    );
    expect(youtubeId("https://evil.example/watch?v=abcdefghijk")).toBeNull();
  });
});
describe("studio WAV", () => {
  it("writes stereo 24-bit PCM with correct interleaving and clipping", () => {
    const b = wav([new Float32Array([1, -1]), new Float32Array([0, 2])], 44100);
    const v = new DataView(b.buffer);
    expect(new TextDecoder().decode(b.slice(0, 4))).toBe("RIFF");
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint16(34, true)).toBe(24);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(40, true)).toBe(12);
    expect([...b.slice(44, 50)]).toEqual([255, 255, 127, 0, 0, 0]);
    expect([...b.slice(50)]).toEqual([0, 0, 128, 255, 255, 127]);
  });
});
