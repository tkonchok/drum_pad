import { it, expect } from "vitest";
import { waveformPeaks } from "./waveform";
it("shows peaks from both stereo channels, including the final sample", () => {
  const channels = [
    new Float32Array([0.1, 0, 0, 0]),
    new Float32Array([0, 0, 0, -0.9]),
  ];
  const p = waveformPeaks(
    { length: 4, numberOfChannels: 2, getChannelData: (c) => channels[c] },
    2,
  );
  expect(p[0]).toBeCloseTo(0.1);
  expect(p[1]).toBeCloseTo(0.9);
});
