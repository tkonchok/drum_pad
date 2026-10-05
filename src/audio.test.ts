import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { Engine } from "./audio";
import type { Pad, Sample } from "./model";
class Node {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  frequency = { value: 0 };
  playbackRate = { value: 1 };
  buffer: unknown;
  onended: unknown;
  connect(n: unknown) {
    return n;
  }
  disconnect() {}
  start = vi.fn();
  stop = vi.fn();
  addEventListener() {}
}
class Context {
  currentTime = 0;
  destination = new Node();
  nodes: Node[] = [];
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return new Node();
  }
  createBufferSource() {
    const n = new Node();
    this.nodes.push(n);
    return n;
  }
  createOscillator() {
    return new Node();
  }
}
const pad: Pad = {
  key: "Q",
  sampleId: "sound",
  start: 0,
  end: 1,
  gain: 1,
  pitch: 0,
  choke: false,
};
let engine: Engine;
let ctx: Context;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("AudioContext", Context);
  engine = new Engine();
  ctx = engine.ctx as unknown as Context;
  engine.pads = [pad];
  engine.samples = [
    {
      id: "sound",
      name: "test",
      kind: "drum",
      buffer: { duration: 1 },
    } as Sample,
  ];
  engine.bpm = 120;
  engine.bars = 1;
});
afterEach(() => {
  engine.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("loop engine", () => {
  it("does not schedule a boundary hit twice across lookahead windows", async () => {
    engine.takes = [{ id: "take", hits: [{ pad: 0, time: 0 }] }];
    await engine.play();
    ctx.currentTime = 0.05;
    vi.advanceTimersByTime(20);
    expect(ctx.nodes).toHaveLength(1);
    ctx.currentTime = 2.05;
    vi.advanceTimersByTime(20);
    expect(ctx.nodes).toHaveLength(2);
    ctx.currentTime = 2.13;
    vi.advanceTimersByTime(20);
    expect(ctx.nodes).toHaveLength(2);
  });
  it("records only after the count-in, quantizes, and adds one take", async () => {
    engine.quantize = true;
    const commit = vi.fn();
    engine.onTake = commit;
    await engine.play(true);
    engine.hit(0);
    expect(ctx.nodes).toHaveLength(0);
    ctx.currentTime = 2.26;
    vi.advanceTimersByTime(20);
    engine.hit(0);
    expect(ctx.nodes).toHaveLength(1);
    ctx.currentTime = 4.13;
    vi.advanceTimersByTime(20);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0][0].hits).toEqual([{ pad: 0, time: 0.125 }]);
    expect(engine.mode).toBe("playing");
  });
  it("stops voices and discards an incomplete take", async () => {
    const commit = vi.fn();
    engine.onTake = commit;
    await engine.play(true);
    ctx.currentTime = 2.3;
    vi.advanceTimersByTime(20);
    engine.hit(0);
    engine.stop();
    expect(ctx.nodes[0].stop).toHaveBeenCalled();
    ctx.currentTime = 7;
    vi.advanceTimersByTime(200);
    expect(commit).not.toHaveBeenCalled();
    expect(engine.mode).toBe("stopped");
  });
  it("chokes melodic voices without stopping overlapping drums", () => {
    engine.pads = [{ ...pad, choke: true }, pad];
    engine.hit(0);
    ctx.currentTime = 0.1;
    engine.hit(1);
    ctx.currentTime = 0.2;
    engine.hit(0);
    expect(ctx.nodes[0].stop).toHaveBeenCalledWith(0.2);
    expect(ctx.nodes[1].stop).not.toHaveBeenCalled();
  });
});
it("orders melody events across overdub layers before scheduling choke", async () => {
  engine.pads = [{ ...pad, choke: true }];
  engine.takes = [
    { id: "old", hits: [{ pad: 0, time: 0.06 }] },
    { id: "new", hits: [{ pad: 0, time: 0.01 }] },
  ];
  await engine.play();
  ctx.currentTime = 0.1;
  vi.advanceTimersByTime(20);
  expect(ctx.nodes[0].start.mock.calls[0][0]).toBeCloseTo(0.13);
  expect(ctx.nodes[1].start.mock.calls[0][0]).toBeCloseTo(0.18);
  expect(ctx.nodes[0].stop.mock.calls[0][0]).toBeCloseTo(0.18);
});
it("cuts a live melody hit when an already scheduled chop starts", async () => {
  engine.pads = [{ ...pad, choke: true }];
  engine.takes = [{ id: "take", hits: [{ pad: 0, time: 0.05 }] }];
  await engine.play();
  ctx.currentTime = 0.1;
  vi.advanceTimersByTime(20);
  ctx.currentTime = 0.11;
  engine.hit(0);
  expect(ctx.nodes[1].stop.mock.calls[0][0]).toBeCloseTo(0.17);
});
it("does not record hits on empty pads", async () => {
  engine.pads = [{ ...pad, sampleId: null }];
  const commit = vi.fn();
  engine.onTake = commit;
  await engine.play(true);
  ctx.currentTime = 2.3;
  vi.advanceTimersByTime(20);
  engine.hit(0);
  ctx.currentTime = 4.2;
  vi.advanceTimersByTime(20);
  expect(commit).not.toHaveBeenCalled();
  expect(ctx.nodes).toHaveLength(0);
});
