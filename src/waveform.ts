/** Scan once per immutable buffer, then reuse these peaks while trimming. */
export function waveformPeaks(
  buffer: Pick<AudioBuffer, "length" | "numberOfChannels" | "getChannelData">,
  count = 334,
) {
  const peaks = new Float32Array(count);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let column = 0; column < count; column++) {
      const start = Math.floor((column / count) * data.length),
        end = Math.min(
          data.length,
          Math.max(start + 1, Math.floor(((column + 1) / count) * data.length)),
        );
      for (let i = start; i < end; i++)
        peaks[column] = Math.max(peaks[column], Math.abs(data[i]));
    }
  }
  return peaks;
}
