import {
  loopSeconds,
  quantizeTime,
  type Hit,
  type Pad,
  type Sample,
  type Take,
} from "./model";
export function voice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  sample: Sample,
  pad: Pad,
  time: number,
) {
  const src = ctx.createBufferSource(),
    gain = ctx.createGain();
  src.buffer = sample.buffer;
  src.playbackRate.value = 2 ** (pad.pitch / 12);
  const length = Math.max(
      0.001,
      Math.min(pad.end, sample.buffer.duration) - pad.start,
    ),
    duration = length / src.playbackRate.value,
    fade = Math.min(0.004, duration / 3);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(pad.gain * 0.65, time + fade);
  gain.gain.setValueAtTime(pad.gain * 0.65, time + duration - fade);
  gain.gain.linearRampToValueAtTime(0, time + duration);
  src.connect(gain).connect(dest);
  src.start(time, pad.start, length);
  src.onended = () => {
    src.disconnect();
    gain.disconnect();
  };
  return src;
}
export class Engine {
  ctx = new AudioContext({ latencyHint: "interactive" });
  master = this.ctx.createGain();
  samples: Sample[] = [];
  pads: Pad[] = [];
  takes: Take[] = [];
  bpm = 90;
  bars = 4;
  quantize = false;
  metro = false;
  mode: "stopped" | "playing" | "count-in" | "recording" = "stopped";
  start = 0;
  private timer: number | undefined;
  private cycle = -1;
  private beat = -1;
  private scheduled = new Set<string>();
  private current: Hit[] = [];
  private voices = new Set<AudioScheduledSourceNode>();
  private chops: { source: AudioBufferSourceNode; time: number }[] = [];
  onTake: (take: Take) => void = () => {};
  onChange: () => void = () => {};
  constructor() {
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
  }
  async ready() {
    await this.ctx.resume();
  }
  private fire(index: number, time: number) {
    const pad = this.pads[index],
      s = this.samples.find((x) => x.id === pad?.sampleId);
    if (!pad || !s) return;
    if (pad.choke) {
      for (const v of this.chops)
        if (v.time <= time)
          try {
            v.source.stop(time);
          } catch {}
      this.chops = this.chops.filter((v) => v.time > time);
    }
    const src = voice(this.ctx, this.master, s, pad, time);
    const nextChop = pad.choke
      ? Math.min(...this.chops.filter((v) => v.time > time).map((v) => v.time))
      : Infinity;
    if (Number.isFinite(nextChop)) src.stop(nextChop);
    this.voices.add(src);
    if (pad.choke) this.chops.push({ source: src, time });
    src.addEventListener("ended", () => {
      this.voices.delete(src);
      this.chops = this.chops.filter((v) => v.source !== src);
    });
  }
  hit(index: number) {
    if (this.mode === "count-in") return;
    if (!this.samples.some((s) => s.id === this.pads[index]?.sampleId)) return;
    const now = this.ctx.currentTime;
    this.fire(index, now);
    if (this.mode === "recording") {
      const duration = loopSeconds(this.bpm, this.bars),
        t = now - this.start;
      if (t >= 0 && t < duration)
        this.current.push({
          pad: index,
          time: this.quantize ? quantizeTime(t, this.bpm, duration) : t,
        });
    }
  }
  preview(sample: Sample, start = 0, end = sample.buffer.duration) {
    const src = voice(
      this.ctx,
      this.master,
      sample,
      {
        key: "",
        sampleId: sample.id,
        start,
        end,
        gain: 1,
        pitch: 0,
        choke: false,
      },
      this.ctx.currentTime,
    );
    this.voices.add(src);
    src.addEventListener("ended", () => this.voices.delete(src));
  }
  async play(record = false) {
    await this.ready();
    this.stop();
    this.start =
      this.ctx.currentTime + 0.12 + (record ? (4 * 60) / this.bpm : 0);
    this.mode = record ? "count-in" : "playing";
    this.current = [];
    this.cycle = -1;
    this.beat = -1;
    this.scheduled.clear();
    this.timer = window.setInterval(() => this.tick(record), 20);
    this.tick(record);
    this.onChange();
  }
  private click(time: number, accent: boolean) {
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.frequency.value = accent ? 1200 : 800;
    g.gain.setValueAtTime(0.12, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    o.connect(g).connect(this.master);
    o.start(time);
    o.stop(time + 0.05);
    this.voices.add(o);
    o.onended = () => {
      this.voices.delete(o);
      o.disconnect();
      g.disconnect();
    };
  }
  private tick(record: boolean) {
    const now = this.ctx.currentTime,
      duration = loopSeconds(this.bpm, this.bars),
      look = now + 0.09;
    if (record && this.mode === "count-in" && now >= this.start) {
      this.mode = "recording";
      this.onChange();
    }
    if (this.mode === "count-in") {
      for (let b = 0; b < 4; b++) {
        const t = this.start - ((4 - b) * 60) / this.bpm;
        const key = `count${b}`;
        if (t >= now && t <= look && !this.scheduled.has(key)) {
          this.scheduled.add(key);
          this.click(t, b === 0);
        }
      }
    }
    if (record && now >= this.start + duration && this.mode === "recording") {
      const take = { id: crypto.randomUUID(), hits: [...this.current] };
      if (take.hits.length) {
        this.takes = [...this.takes, take];
        this.onTake(take);
      }
      this.current = [];
      this.mode = "playing";
      this.onChange();
    }
    const first = Math.max(0, Math.floor((now - this.start) / duration)),
      last = Math.max(0, Math.floor((look - this.start) / duration));
    if (first !== this.cycle) {
      this.cycle = first;
      for (const key of this.scheduled)
        if (!key.startsWith("count") && Number(key.split(":")[0]) < first)
          this.scheduled.delete(key);
    }
    const due: { pad: number; time: number; key: string }[] = [];
    for (let cycle = first; cycle <= last; cycle++)
      for (const take of this.takes)
        take.hits.forEach((hit, i) => {
          const t = this.start + cycle * duration + hit.time,
            key = `${cycle}:${take.id}:${i}`;
          if (t >= now - 0.025 && t <= look && !this.scheduled.has(key)) {
            due.push({ pad: hit.pad, time: Math.max(now, t), key });
          }
        });
    due.sort((a, b) => a.time - b.time);
    for (const hit of due) {
      this.scheduled.add(hit.key);
      this.fire(hit.pad, hit.time);
    }
    if (this.metro && now >= this.start) {
      const b = Math.floor((look - this.start) / (60 / this.bpm));
      if (b > this.beat) {
        this.beat = b;
        const t = this.start + (b * 60) / this.bpm;
        if (t >= now) this.click(t, b % 4 === 0);
      }
    }
  }
  stop() {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.mode = "stopped";
    this.current = [];
    for (const v of this.voices)
      try {
        v.stop();
      } catch {}
    this.voices.clear();
    this.chops = [];
    this.onChange();
  }
  progress() {
    return this.mode === "stopped"
      ? 0
      : Math.max(
          0,
          (this.ctx.currentTime - this.start) %
            loopSeconds(this.bpm, this.bars),
        ) / loopSeconds(this.bpm, this.bars);
  }
  async render() {
    const duration = loopSeconds(this.bpm, this.bars),
      ctx = new OfflineAudioContext(2, Math.round(duration * 44100), 44100),
      master = ctx.createGain();
    master.gain.value = this.master.gain.value;
    master.connect(ctx.destination);
    const events = this.takes
      .flatMap((t) => t.hits)
      .sort((a, b) => a.time - b.time);
    let previous: AudioBufferSourceNode | undefined;
    for (const hit of events) {
      const pad = this.pads[hit.pad],
        sample = this.samples.find((s) => s.id === pad.sampleId);
      if (!sample) continue;
      if (pad.choke && previous)
        try {
          previous.stop(hit.time);
        } catch {}
      const src = voice(ctx, master, sample, pad, hit.time);
      if (pad.choke) previous = src;
    }
    return ctx.startRendering();
  }
}
export function demo(ctx: AudioContext): Sample[] {
  const rate = 44100;
  let seed = 831;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 2 - 1;
  };
  const names = [
    "Dust kick",
    "Soft snare",
    "Closed hat",
    "Open hat",
    "Wood rim",
    "Low tom",
    "Hand clap",
    "Sub bass",
    "Glass bell",
    "Shaker",
    "Vinyl tick",
    "High tom",
    "Warm chord",
    "Blue chord",
    "Soft keys",
    "Last light",
  ];
  return names.map((name, k) => {
    const dur = k >= 12 ? 2.5 : k === 3 ? 0.5 : k === 7 ? 1 : 0.35,
      buffer = ctx.createBuffer(1, Math.floor(dur * rate), rate),
      d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / rate,
        n = noise();
      let x = 0;
      if (k >= 12) {
        const root = [130.81, 155.56, 174.61, 116.54][k - 12];
        x =
          ([1, 1.2599, 1.4983, 2].reduce(
            (a, r) => a + Math.sin(2 * Math.PI * root * r * t),
            0,
          ) /
            5) *
          Math.min(1, t / 0.012) *
          Math.exp(-t * 2);
      } else if (k === 0 || k === 7)
        x =
          Math.sin(
            2 *
              Math.PI *
              (k === 7 ? 50 * t : 48 * t + 9 * (1 - Math.exp(-t * 25))),
          ) * Math.exp(-t * (k === 7 ? 5 : 14));
      else if (k === 1 || k === 6)
        x =
          (n * 0.65 + Math.sin(2 * Math.PI * 180 * t) * 0.25) *
          Math.exp(-t * 22) *
          (k === 6 ? 0.6 + 0.4 * Math.sin(t * 450) : 1);
      else if (k === 2 || k === 3 || k === 9)
        x = n * 0.28 * Math.exp(-t * (k === 3 ? 9 : 55));
      else if (k === 8)
        x =
          (Math.sin(2 * Math.PI * 650 * t) + Math.sin(2 * Math.PI * 975 * t)) *
          0.25 *
          Math.exp(-t * 13);
      else
        x =
          (Math.sin(2 * Math.PI * (k === 5 ? 110 : k === 11 ? 210 : 400) * t) *
            0.6 +
            n * 0.15) *
          Math.exp(-t * 35);
      d[i] = x;
    }
    return { id: `demo-${k}`, name, buffer, kind: k >= 12 ? "chop" : "drum" };
  });
}
