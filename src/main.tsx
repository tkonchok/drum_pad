import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import chopperReference from "./assets/chopper-reference.jpg";
import {
  Play,
  Square,
  Circle,
  Download,
  FolderOpen,
  Scissors,
  Search,
  Upload,
  Radio,
  Undo2,
  X,
  Plus,
  Volume2,
  ChevronRight,
  Save,
  Music2,
  ExternalLink,
  Headphones,
  Keyboard,
  Trash2,
} from "lucide-react";
import { Engine, demo } from "./audio";
import {
  KEYS,
  download,
  loopSeconds,
  wav,
  youtubeId,
  type Sample,
  type Pad,
  type Take,
  type Region,
} from "./model";
import { saveProject, loadProject } from "./project";
import { loadYouTube, captureStream, recorder, type Player } from "./youtube";
import { captureRegions } from "./capture";
import { waveformPeaks } from "./waveform";
import "./style.css";
const env = (
  import.meta as unknown as { env: Record<string, string | boolean> }
).env;
const enabled = env.DEV && env.VITE_ENABLE_YOUTUBE_CAPTURE !== "false";
function Waveform({
  sample,
  start,
  end,
  onTrim,
}: {
  sample?: Sample;
  start: number;
  end: number;
  onTrim?: (s: number, e: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const peaks = useMemo(
    () => (sample ? waveformPeaks(sample.buffer) : null),
    [sample?.buffer],
  );
  const minimumSlice = Math.min(0.01, sample?.buffer.duration ?? 0.01);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const c = el.getContext("2d")!;
    el.width = 1000;
    el.height = 170;
    c.clearRect(0, 0, 1000, 170);
    if (!sample) {
      c.strokeStyle = "#435168";
      c.beginPath();
      c.moveTo(0, 85);
      c.lineTo(1000, 85);
      c.stroke();
      return;
    }
    const dur = sample.buffer.duration;
    c.fillStyle = "#3fe1fd";
    for (let x = 0; x < 1000; x += 3) {
      const h = Math.max(2, (peaks?.[Math.floor(x / 3)] ?? 0) * 140);
      c.fillRect(x, 85 - h / 2, 2, h);
    }
    c.fillStyle = "#0d131fc7";
    c.fillRect(0, 0, (start / dur) * 1000, 170);
    c.fillRect((end / dur) * 1000, 0, 1000, 170);
    c.fillStyle = "#ff5e7e";
    c.fillRect((start / dur) * 1000, 0, 2, 170);
    c.fillRect((end / dur) * 1000 - 2, 0, 2, 170);
  }, [sample, peaks, start, end]);
  return (
    <div className="waveform">
      <canvas ref={canvas} aria-label="Sample waveform" />
      {sample && onTrim && (
        <div className="trim-controls">
          <label>
            IN{" "}
            <input
              aria-label="Slice start"
              type="range"
              min="0"
              max={Math.max(0, sample.buffer.duration - minimumSlice)}
              step=".001"
              value={start}
              onChange={(e) =>
                onTrim(
                  Math.max(0, Math.min(+e.target.value, end - minimumSlice)),
                  end,
                )
              }
            />
          </label>
          <label>
            OUT{" "}
            <input
              aria-label="Slice end"
              type="range"
              min={minimumSlice}
              max={sample.buffer.duration}
              step=".001"
              value={end}
              onChange={(e) =>
                onTrim(
                  start,
                  Math.min(
                    sample.buffer.duration,
                    Math.max(+e.target.value, start + minimumSlice),
                  ),
                )
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}
function App() {
  const [engine] = useState(() => new Engine());
  const [samples, setSamples] = useState<Sample[]>(() => demo(engine.ctx));
  const [pads, setPads] = useState<Pad[]>(() =>
    KEYS.map((key, i) => ({
      key,
      sampleId: samples[i].id,
      start: 0,
      end: samples[i].buffer.duration,
      gain: 1,
      pitch: 0,
      choke: i >= 12,
    })),
  );
  const [selected, setSelected] = useState(12),
    [editing, setEditing] = useState(() => samples[12].id),
    [trim, setTrim] = useState<[number, number]>(() => [
      0,
      samples[12].buffer.duration,
    ]);
  const [takes, setTakes] = useState<Take[]>([]),
    [bpm, setBpm] = useState(90),
    [bars, setBars] = useState(4),
    [quantize, setQuantize] = useState(false),
    [metro, setMetro] = useState(false),
    [progress, setProgress] = useState(0),
    [mode, setMode] = useState(engine.mode);
  const [tab, setTab] = useState<"samples" | "youtube">("samples"),
    [name, setName] = useState("Untitled session"),
    [message, setMessage] = useState("Your next idea starts with a sound."),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState<number[]>([]);
  const [query, setQuery] = useState(""),
    [submittedQuery, setSubmittedQuery] = useState(""),
    [results, setResults] = useState<
      { id: string; title: string; channel: string; thumbnail: string }[]
    >([]),
    [next, setNext] = useState<string>(),
    [searching, setSearching] = useState(false);
  const [videoId, setVideoId] = useState(""),
    [videoTitle, setVideoTitle] = useState(""),
    [playerReady, setPlayerReady] = useState(false),
    [regions, setRegions] = useState<Region[]>([]),
    [mark, setMark] = useState<number>(),
    [capture, setCapture] = useState(false),
    [about, setAbout] = useState(false);
  const player = useRef<Player | undefined>(undefined),
    host = useRef<HTMLDivElement>(null),
    stream = useRef<MediaStream | undefined>(undefined),
    recording = useRef<ReturnType<typeof recorder> | undefined>(undefined),
    abort = useRef(false),
    audioInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null);
  const regionPreviewTimer = useRef<number | undefined>(undefined);
  const captureController = useRef<AbortController | undefined>(undefined);
  const locked = takes.length > 0 || mode !== "stopped" || busy || capture;
  const sample = samples.find((s) => s.id === editing);
  const selectedSample = samples.find((s) => s.id === pads[selected].sampleId);
  engine.samples = samples;
  engine.pads = pads;
  engine.takes = takes;
  engine.bpm = bpm;
  engine.bars = bars;
  engine.quantize = quantize;
  engine.metro = metro;
  engine.onTake = (t) => {
    setTakes((old) => [...old, t]);
    setDirty(true);
    setMessage("Take recorded. Keep playing, or add another layer.");
  };
  engine.onChange = () => setMode(engine.mode);
  const notify = (error: unknown) =>
    setMessage(error instanceof Error ? error.message : String(error));
  useEffect(() => {
    const timer = window.setInterval(() => setProgress(engine.progress()), 50);
    return () => {
      clearInterval(timer);
      clearInterval(regionPreviewTimer.current);
      captureController.current?.abort();
      engine.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [engine]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  const hit = async (i: number) => {
    if (capture || busy) return;
    await engine.ready();
    engine.hit(i);
    setActive((a) => [...a, i]);
    window.setTimeout(() => setActive((a) => a.filter((x) => x !== i)), 120);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"]',
        )
      )
        return;
      if (e.key === "Escape") {
        engine.stop();
        return;
      }
      const i = KEYS.indexOf(e.key.toUpperCase());
      if (i >= 0) {
        e.preventDefault();
        void hit(i);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    if (tab !== "youtube" || !videoId || !host.current) return;
    let cancelled = false;
    setPlayerReady(false);
    loadYouTube()
      .then(() => {
        if (cancelled || !host.current) return;
        host.current.replaceChildren();
        const el = document.createElement("div");
        host.current.append(el);
        player.current = new window.YT!.Player(el, {
          videoId,
          playerVars: { origin: location.origin, playsinline: 1 },
          events: {
            onReady: () => {
              if (!cancelled) setPlayerReady(true);
            },
            onError: () =>
              setMessage(
                "This video cannot play here. Choose another video or open it on YouTube.",
              ),
          },
        });
      })
      .catch(notify);
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = undefined;
    };
  }, [videoId, tab]);
  function edit(s: Sample) {
    setEditing(s.id);
    setTrim([0, s.buffer.duration]);
  }
  function assign(id: string, i: number) {
    if (locked) {
      setMessage("Stop and clear the loop before replacing pad sounds.");
      return;
    }
    const s = samples.find((s) => s.id === id);
    if (!s) return;
    setPads((p) =>
      p.map((pad, n) =>
        n === i
          ? {
              ...pad,
              sampleId: id,
              start: 0,
              end: s.buffer.duration,
              choke: s.kind === "chop",
            }
          : pad,
      ),
    );
    setSelected(i);
    edit(s);
    setDirty(true);
    setMessage(`${s.name} assigned to ${KEYS[i]}.`);
  }
  async function importFiles(files: FileList | null, target?: number) {
    if (!files || busy || capture) return;
    setBusy(true);
    try {
      const added: Sample[] = [];
      let decodedBytes = samples.reduce(
        (sum, s) => sum + s.buffer.length * s.buffer.numberOfChannels * 4,
        0,
      );
      for (const file of Array.from(files).slice(0, 16)) {
        if (file.size > 30 * 1024 * 1024)
          throw Error("Choose audio files smaller than 30 MB.");
        const buffer = await engine.ctx.decodeAudioData(
          await file.arrayBuffer(),
        );
        if (buffer.duration > 300)
          throw Error("Choose a source shorter than five minutes.");
        decodedBytes += buffer.length * buffer.numberOfChannels * 4;
        if (decodedBytes > 256 * 1024 * 1024)
          throw Error(
            "This session has reached its 256 MB audio memory limit.",
          );
        added.push({
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^.]+$/, ""),
          buffer,
          kind: buffer.duration > 3 ? "chop" : "drum",
        });
      }
      if (samples.length + added.length > 128)
        throw Error("This session already has too many samples (128 maximum).");
      setSamples((s) => [...s, ...added]);
      if (added[0]) {
        edit(added[0]);
        if (target !== undefined && !locked) {
          const s = added[0];
          setPads((p) =>
            p.map((pad, i) =>
              i === target
                ? {
                    ...pad,
                    sampleId: s.id,
                    start: 0,
                    end: s.buffer.duration,
                    choke: s.kind === "chop",
                  }
                : pad,
            ),
          );
        }
      }
      setDirty(true);
      setMessage(
        `${added.length} sound${added.length === 1 ? "" : "s"} imported. Trim it, then make a slice.`,
      );
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  function makeSlice() {
    if (!sample) return;
    if (samples.length >= 128) {
      setMessage("This session has reached the 128 sample limit.");
      return;
    }
    const start = Math.floor(trim[0] * sample.buffer.sampleRate),
      end = Math.min(
        sample.buffer.length,
        Math.ceil(trim[1] * sample.buffer.sampleRate),
      );
    const buffer = engine.ctx.createBuffer(
      sample.buffer.numberOfChannels,
      Math.max(1, end - start),
      sample.buffer.sampleRate,
    );
    for (let c = 0; c < buffer.numberOfChannels; c++)
      buffer.copyToChannel(
        sample.buffer.getChannelData(c).slice(start, end),
        c,
      );
    const s: Sample = {
      id: crypto.randomUUID(),
      name: `${sample.name} · slice ${samples.filter((s) => s.name.startsWith(sample.name + " · slice")).length + 1}`,
      buffer,
      kind: "chop",
    };
    setSamples((old) => [...old, s]);
    setDirty(true);
    setMessage("Slice ready. Drag it onto a pad, or use Assign to pad.");
    edit(s);
  }
  function removeSample() {
    if (!sample || busy || capture) return;
    if (pads.some((p) => p.sampleId === sample.id)) {
      setMessage("Clear or replace its pads before deleting this sound.");
      return;
    }
    const remaining = samples.filter((s) => s.id !== sample.id);
    setSamples(remaining);
    if (remaining[0]) edit(remaining[0]);
    else {
      setEditing("");
      setTrim([0, 0.001]);
    }
    setDirty(true);
    setMessage("Unused sound removed from the session.");
  }
  async function search(token?: string) {
    const id = youtubeId(query.trim());
    if (id && !token) {
      setVideoId(id);
      setVideoTitle("YouTube source");
      setMark(undefined);
      return;
    }
    const searchText = token ? submittedQuery : query.trim();
    if (!searchText) return;
    setSearching(true);
    try {
      const response = await fetch(
        `/api/youtube/search?${new URLSearchParams({ q: searchText, ...(token ? { pageToken: token } : {}) })}`,
      );
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw Error(
          "Search needs the configured server. Paste a YouTube URL to play a video locally.",
        );
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setResults(token ? [...results, ...data.items] : data.items);
      setSubmittedQuery(searchText);
      setNext(data.nextPageToken);
      setMessage(
        data.items.length
          ? "Choose a video to start marking passages."
          : "No videos found. Try a different search.",
      );
    } catch (e) {
      notify(e);
    } finally {
      setSearching(false);
    }
  }
  function endMark() {
    if (!player.current || mark === undefined) return;
    const end = player.current.getCurrentTime();
    if (end <= mark) {
      setMessage("The end must be after the start.");
      return;
    }
    if (end - mark > 60) {
      setMessage("Keep each capture region under 60 seconds.");
      return;
    }
    if (regions.length >= 16) {
      setMessage("You can mark up to 16 regions in a session.");
      return;
    }
    setRegions((r) => [
      ...r,
      {
        id: crypto.randomUUID(),
        videoId,
        start: mark,
        end,
        name: `Region ${r.length + 1}`,
      },
    ]);
    setMark(undefined);
    setDirty(true);
  }
  function stopCapture() {
    abort.current = true;
    captureController.current?.abort();
    const r = recording.current;
    if (r && r.rec.state !== "inactive") r.rec.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    player.current?.pauseVideo();
  }
  function previewRegion(region: Region) {
    clearInterval(regionPreviewTimer.current);
    const current = player.current;
    if (!current) return;
    current.seekTo(region.start, true);
    current.playVideo();
    const deadline = Date.now() + (region.end - region.start) * 1000 + 15000;
    regionPreviewTimer.current = window.setInterval(() => {
      if (
        player.current !== current ||
        current.getCurrentTime() >= region.end ||
        Date.now() > deadline
      ) {
        clearInterval(regionPreviewTimer.current);
        if (player.current === current) current.pauseVideo();
      }
    }, 50);
  }
  async function finishCapture(blob: Blob, label: string) {
    if (!blob.size) throw Error("No audio was recorded.");
    const buffer = await engine.ctx.decodeAudioData(await blob.arrayBuffer());
    if (
      engine.samples.reduce(
        (sum, s) => sum + s.buffer.length * s.buffer.numberOfChannels * 4,
        0,
      ) +
        buffer.length * buffer.numberOfChannels * 4 >
      256 * 1024 * 1024
    )
      throw Error("This session has reached its 256 MB audio memory limit.");
    const s: Sample = {
      id: crypto.randomUUID(),
      name: label,
      buffer,
      kind: "chop",
    };
    setSamples((old) => (old.length < 128 ? [...old, s] : old));
    edit(s);
    setDirty(true);
  }
  async function manualCapture() {
    if (capture) {
      stopCapture();
      return;
    }
    if (samples.length >= 128) {
      setMessage("Sample limit reached.");
      return;
    }
    if (busy) return;
    setBusy(true);
    clearInterval(regionPreviewTimer.current);
    let timeout: number | undefined;
    try {
      engine.stop();
      abort.current = false;
      const input = await captureStream();
      stream.current = input;
      const r = recorder(input);
      recording.current = r;
      setCapture(true);
      setBusy(false);
      engine.stop();
      input.getVideoTracks()[0].addEventListener("ended", () => {
        if (r.rec.state === "recording") r.rec.stop();
      });
      r.rec.start();
      setMessage(
        "Recording shared tab audio. Click Stop capture when finished.",
      );
      timeout = window.setTimeout(() => {
        if (r.rec.state === "recording") r.rec.stop();
      }, 60000);
      const blob = await r.done;
      clearTimeout(timeout);
      setBusy(true);
      await finishCapture(blob, "Tab recording");
      setMessage("Capture ready. Trim the waveform and create your slices.");
    } catch (e) {
      notify(e);
    } finally {
      clearTimeout(timeout);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = undefined;
      recording.current = undefined;
      setCapture(false);
      setBusy(false);
    }
  }
  async function batchCapture() {
    if (busy || capture) return;
    const queue = regions.filter((r) => r.videoId === videoId);
    if (!queue.length || !player.current) return;
    if (queue.some((r) => r.end - r.start > 60)) {
      setMessage("Trim each region to 60 seconds or less before capture.");
      return;
    }
    if (samples.length + queue.length > 128) {
      setMessage("Not enough space in this session for every region.");
      return;
    }
    setBusy(true);
    clearInterval(regionPreviewTimer.current);
    try {
      engine.stop();
      const controller = new AbortController();
      captureController.current = controller;
      stream.current = await captureStream();
      stream.current
        .getVideoTracks()[0]
        .addEventListener("ended", () => controller.abort());
      setCapture(true);
      setBusy(false);
      const result = await captureRegions({
        player: player.current!,
        stream: stream.current,
        regions: queue,
        signal: controller.signal,
        onSlice: (blob, region) => finishCapture(blob, region.name),
        onProgress: (region, phase) =>
          setMessage(
            `${phase === "seeking" ? "Seeking" : "Capturing"} ${region.name}…`,
          ),
      });
      setMessage(
        result.cancelled
          ? `Capture cancelled. ${result.completed} completed slices were kept.`
          : "Regions captured. Review and trim each slice before playing.",
      );
    } catch (e) {
      notify(e);
    } finally {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = undefined;
      captureController.current = undefined;
      setCapture(false);
      setBusy(false);
    }
  }
  async function exportWav() {
    setBusy(true);
    try {
      engine.stop();
      const b = await engine.render();
      download(
        wav([b.getChannelData(0), b.getChannelData(1)], 44100),
        `${name || "Chopper"}-${bpm}bpm.wav`,
        "audio/wav",
      );
      setMessage(
        "Your loop is ready for the studio. Stereo WAV · 24-bit · 44.1 kHz.",
      );
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  async function openProject(file?: File) {
    if (!file) return;
    if (
      dirty &&
      !window.confirm(
        "Replace this unsaved session? Save it first if you want to keep it.",
      )
    )
      return;
    setBusy(true);
    try {
      engine.stop();
      const p = await loadProject(file, engine.ctx);
      setSamples(p.samples);
      setPads(p.pads.map((pad, i) => ({ ...pad, key: KEYS[i] })));
      setTakes(p.takes);
      setBpm(p.bpm);
      setBars(p.bars);
      setRegions(p.regions);
      setName(p.name);
      if (p.samples[0]) edit(p.samples[0]);
      else {
        setEditing("");
        setTrim([0, 0.001]);
      }
      setMark(undefined);
      setDirty(false);
      setMessage("Project restored. Pick up where you left off.");
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  function save() {
    try {
      download(
        saveProject({ name, bpm, bars, samples, pads, takes, regions }),
        `${name || "Chopper"}.chopper`,
        "application/zip",
      );
      setDirty(false);
      setMessage("Project saved with its sounds, pads, and recorded takes.");
    } catch (e) {
      notify(e);
    }
  }
  function clear() {
    engine.stop();
    setTakes([]);
    setDirty(true);
    setMessage("Loop cleared. Your samples and pads are still here.");
  }
  return (
    <div className="app">
      <input
        ref={audioInput}
        hidden
        type="file"
        accept="audio/*"
        multiple
        onChange={(e) => {
          void importFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={projectInput}
        hidden
        type="file"
        accept=".chopper,.choplab"
        onChange={(e) => {
          void openProject(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <header>
        <a className="brand" href="#">
          <span className="brand-icon">
            <Scissors size={22} />
          </span>
          <span>
            chopper<span className="brand-dot">.</span>
          </span>
          <small>SAMPLE WORKSTATION</small>
        </a>
        <div className="session">
          <span className={dirty ? "status-dot dirty" : "status-dot"} />
          <input
            aria-label="Project name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
          <span className="session-tag">LOCAL SESSION</span>
        </div>
        <div className="header-actions">
          <button
            aria-label="Open"
            disabled={busy || capture}
            onClick={() => projectInput.current?.click()}
          >
            <FolderOpen size={15} />
            <span>Open</span>
          </button>
          <button
            aria-label="Save project"
            disabled={busy || capture}
            onClick={save}
          >
            <Save size={15} />
            <span>Save project</span>
          </button>
          <button
            className="icon-button"
            aria-label="Help and shortcuts"
            onClick={() => setAbout(true)}
          >
            <Keyboard size={18} />
          </button>
        </div>
      </header>
      <div className="intro">
        <div>
          <div className="eyebrow">A LITTLE SOUND. A LOT OF POSSIBILITIES.</div>
          <h1>
            Slice something good<span>.</span>
          </h1>
          <p>Find a sound. Chop it up. Make it yours.</p>
        </div>
        <div className="signal-label">
          <span className="status-dot" /> BROWSER POWERED <span>/</span> NO
          UPLOADS
        </div>
      </div>
      <main>
        <section className="panel source-panel">
          <div className="panel-heading">
            <div>
              <span className="section-number">01</span>
              <h2>Sound source</h2>
            </div>
            <span className="mini-label">FIND YOUR STARTING POINT</span>
          </div>
          <div className="tabs">
            <button
              className={tab === "samples" ? "selected" : ""}
              disabled={capture}
              onClick={() => setTab("samples")}
            >
              <Music2 size={15} />
              Sample library
            </button>
            <button
              className={tab === "youtube" ? "selected" : ""}
              disabled={capture}
              onClick={() => setTab("youtube")}
            >
              <Play size={15} />
              YouTube
            </button>
          </div>
          {tab === "samples" ? (
            <>
              <div
                className="import-box"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void importFiles(e.dataTransfer.files);
                }}
              >
                <div className="import-icon">
                  <Upload size={21} />
                </div>
                <div>
                  <strong>Bring your own sound</strong>
                  <p>Drop audio here, or browse your files</p>
                </div>
                <button
                  disabled={busy || capture}
                  onClick={() => audioInput.current?.click()}
                >
                  Browse <Plus size={14} />
                </button>
              </div>
              <div className="library-label">
                <span>SESSION SOUNDS</span>
                <span>{samples.length} SOUNDS</span>
              </div>
              <div className="sample-list">
                {samples.map((s) => (
                  <button
                    key={s.id}
                    draggable={!locked}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("application/chopper-sample", s.id)
                    }
                    className={`sample-row ${editing === s.id ? "selected" : ""}`}
                    onClick={() => edit(s)}
                  >
                    <span className={`sample-icon ${s.kind}`}>
                      <Music2 size={15} />
                    </span>
                    <span className="sample-name">
                      {s.name}
                      <small>
                        {s.kind === "chop" ? "MELODIC / CHOP" : "ONE SHOT"}
                      </small>
                    </span>
                    <span className="sample-duration">
                      {s.buffer.duration.toFixed(2)}s
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
              <div className="library-foot">
                <Headphones size={14} />
                <span>
                  Original demo sounds included. Your files stay on your device.
                </span>
              </div>
            </>
          ) : (
            <div className="youtube-workspace">
              <form
                className="search-box"
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
              >
                <Search size={16} />
                <input
                  aria-label="Search YouTube"
                  placeholder="Search YouTube or paste a URL"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={120}
                />
                <button disabled={searching || capture} type="submit">
                  {searching ? "…" : "Go"}
                </button>
              </form>
              {videoId ? (
                <>
                  <div ref={host} className="video-host" />
                  <div className="video-caption">
                    <span>{videoTitle}</span>
                    <a
                      href={`https://www.youtube.com/watch?v=${videoId}`}
                      target="_blank"
                      rel="noopener"
                    >
                      YouTube <ExternalLink size={12} />
                    </a>
                  </div>
                  <div className="region-actions">
                    <button
                      disabled={!playerReady || capture}
                      onClick={() => {
                        setMark(player.current!.getCurrentTime());
                        setMessage(
                          "Start marked. Play to your end point, then mark end.",
                        );
                      }}
                    >
                      {mark === undefined
                        ? "Mark start"
                        : `Start: ${mark.toFixed(2)}s`}
                    </button>
                    <button
                      disabled={!playerReady || mark === undefined || capture}
                      onClick={endMark}
                    >
                      Mark end <Plus size={13} />
                    </button>
                  </div>
                  {regions
                    .filter((r) => r.videoId === videoId)
                    .map((r) => (
                      <div className="region" key={r.id}>
                        <button
                          aria-label={`Preview ${r.name}`}
                          disabled={capture || !playerReady}
                          onClick={() => previewRegion(r)}
                        >
                          <Play size={12} />
                        </button>
                        <input
                          aria-label="Region name"
                          value={r.name}
                          disabled={capture}
                          onChange={(e) => {
                            setRegions((a) =>
                              a.map((x) =>
                                x.id === r.id
                                  ? { ...x, name: e.target.value }
                                  : x,
                              ),
                            );
                            setDirty(true);
                          }}
                        />
                        {(["start", "end"] as const).map((k) => (
                          <input
                            key={k}
                            aria-label={`Region ${k}`}
                            type="number"
                            min={k === "start" ? 0 : r.start + 0.01}
                            step=".01"
                            value={Number(r[k].toFixed(2))}
                            disabled={capture}
                            onChange={(e) => {
                              const n = +e.target.value;
                              if (
                                n < 0 ||
                                !Number.isFinite(n) ||
                                (k === "start" ? n >= r.end : n <= r.start)
                              )
                                return;
                              setRegions((a) =>
                                a.map((x) =>
                                  x.id === r.id ? { ...x, [k]: n } : x,
                                ),
                              );
                              setDirty(true);
                            }}
                          />
                        ))}
                        <button
                          aria-label="Delete region"
                          disabled={capture}
                          onClick={() => {
                            setRegions((a) => a.filter((x) => x.id !== r.id));
                            setDirty(true);
                          }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  {enabled && (
                    <button
                      className="batch-button"
                      disabled={
                        !playerReady ||
                        capture ||
                        busy ||
                        !regions.some((r) => r.videoId === videoId)
                      }
                      onClick={() => void batchCapture()}
                    >
                      <Scissors size={14} />
                      Capture marked regions · experimental
                    </button>
                  )}
                </>
              ) : (
                <div className="video-empty">
                  <Play size={30} />
                  <strong>A world of sounds to explore</strong>
                  <p>Search for a video, or paste its link.</p>
                </div>
              )}
              <div className="search-results">
                {results.map((r) => (
                  <button
                    key={r.id}
                    disabled={capture}
                    onClick={() => {
                      setVideoId(r.id);
                      setVideoTitle(r.title);
                      setMark(undefined);
                    }}
                  >
                    <img src={r.thumbnail} alt="" />
                    <span>
                      {r.title}
                      <small>{r.channel}</small>
                    </span>
                  </button>
                ))}
                {next && (
                  <button
                    disabled={searching || capture}
                    onClick={() => void search(next)}
                  >
                    Load more
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
        <section className="panel performance-panel">
          <div className="panel-heading">
            <div>
              <span className="section-number">02</span>
              <h2>Make some noise</h2>
            </div>
            <span className="live-label">
              <span className="status-dot" />
              16 PADS · KEYBOARD READY
            </span>
          </div>
          <div className="pad-grid">
            {pads.map((p, i) => {
              const s = samples.find((s) => s.id === p.sampleId);
              return (
                <button
                  key={p.key}
                  aria-label={`Pad ${p.key}: ${s?.name || "Empty"}`}
                  className={`pad ${p.choke ? "chop" : ""} ${selected === i ? "focused" : ""} ${active.includes(i) ? "playing" : ""}`}
                  onPointerDown={() => {
                    setSelected(i);
                    void hit(i);
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) {
                      setSelected(i);
                      void hit(i);
                    }
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData(
                      "application/chopper-sample",
                    );
                    if (id) assign(id, i);
                    else if (locked)
                      setMessage("Clear the loop before replacing pads.");
                    else void importFiles(e.dataTransfer.files, i);
                  }}
                >
                  <span className="pad-top">
                    <span className="pad-key">{p.key}</span>
                    <span className="pad-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </span>
                  <span className="pad-name">{s?.name || "Drop a sound"}</span>
                  <span className="pad-bottom">
                    <span className="pad-bars">▂▅▃▆▂▅▃▂</span>
                    <span>{p.choke ? "CHOP" : "ONE SHOT"}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="pad-settings">
            <span className="selected-pad">
              PAD {pads[selected].key}
              <small>{selectedSample?.name || "Empty pad"}</small>
            </span>
            <label>
              <Volume2 size={13} /> LEVEL{" "}
              <input
                aria-label="Pad level"
                disabled={locked}
                type="range"
                min="0"
                max="2"
                step=".01"
                value={pads[selected].gain}
                onChange={(e) => {
                  setPads((p) =>
                    p.map((x, i) =>
                      i === selected ? { ...x, gain: +e.target.value } : x,
                    ),
                  );
                  setDirty(true);
                }}
              />
            </label>
            <label>
              PITCH{" "}
              <input
                aria-label="Pad pitch"
                disabled={locked}
                type="number"
                min="-24"
                max="24"
                value={pads[selected].pitch}
                onChange={(e) => {
                  setPads((p) =>
                    p.map((x, i) =>
                      i === selected
                        ? {
                            ...x,
                            pitch: Math.max(-24, Math.min(24, +e.target.value)),
                          }
                        : x,
                    ),
                  );
                  setDirty(true);
                }}
              />{" "}
              st
            </label>
            <label>
              <input
                type="checkbox"
                disabled={locked}
                checked={pads[selected].choke}
                onChange={(e) => {
                  setPads((p) =>
                    p.map((x, i) =>
                      i === selected ? { ...x, choke: e.target.checked } : x,
                    ),
                  );
                  setDirty(true);
                }}
              />{" "}
              CHOKE
            </label>
          </div>
          <button
            className="clear-pad-button"
            disabled={locked || !pads[selected].sampleId}
            onClick={() => {
              setPads((old) =>
                old.map((p, i) =>
                  i === selected
                    ? { ...p, sampleId: null, start: 0, end: 1 }
                    : p,
                ),
              );
              setDirty(true);
              setMessage(
                `Pad ${KEYS[selected]} cleared. Its sound is still in the library.`,
              );
            }}
          >
            Clear pad
          </button>
          <div className="keyboard-tip">
            <Keyboard size={14} />
            <span>Play with your keyboard. Drag any sound onto a pad.</span>
            <kbd>ESC</kbd>
            <span>stop all</span>
          </div>
        </section>
        <section className="panel editor-panel">
          <div className="panel-heading">
            <div>
              <span className="section-number">03</span>
              <h2>Find the sweet spot</h2>
            </div>
            <div className="sample-management">
              <input
                aria-label="Sample name"
                placeholder="Select a sound"
                value={sample?.name ?? ""}
                maxLength={80}
                disabled={!sample || busy || capture}
                onChange={(e) => {
                  setSamples((old) =>
                    old.map((s) =>
                      s.id === editing ? { ...s, name: e.target.value } : s,
                    ),
                  );
                  setDirty(true);
                }}
              />
              <button
                aria-label="Delete unused sound"
                title={
                  pads.some((p) => p.sampleId === sample?.id)
                    ? "Clear its pads before deleting"
                    : "Delete unused sound"
                }
                disabled={
                  !sample ||
                  busy ||
                  capture ||
                  pads.some((p) => p.sampleId === sample.id)
                }
                onClick={removeSample}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          <Waveform
            sample={sample}
            start={trim[0]}
            end={trim[1]}
            onTrim={(s, e) => setTrim([s, e])}
          />
          <div className="editor-controls">
            <div className="time-points">
              <span>
                IN <b>{trim[0].toFixed(3)}s</b>
              </span>
              <span>
                OUT <b>{trim[1].toFixed(3)}s</b>
              </span>
              <span>
                LENGTH <b>{(trim[1] - trim[0]).toFixed(3)}s</b>
              </span>
            </div>
            <div>
              <button
                disabled={!sample || capture || busy}
                onClick={async () => {
                  await engine.ready();
                  engine.preview(sample!, ...trim);
                }}
              >
                <Play size={13} />
                Preview
              </button>
              <button disabled={!sample || busy || capture} onClick={makeSlice}>
                <Scissors size={14} />
                Make slice
              </button>
              <button
                className="accent-button"
                disabled={!sample || locked}
                onClick={() => {
                  assign(sample!.id, selected);
                  setPads((p) =>
                    p.map((x, i) =>
                      i === selected
                        ? { ...x, start: trim[0], end: trim[1] }
                        : x,
                    ),
                  );
                }}
              >
                Assign to {KEYS[selected]} <ChevronRight size={13} />
              </button>
            </div>
          </div>
          <div className="capture-strip">
            <Radio size={15} />
            <span>
              <strong>Capture a new sound</strong> Record audio from a browser
              tab you’re authorized to capture.
            </span>
            <button
              className={capture ? "recording-button" : ""}
              disabled={busy}
              onClick={() => void manualCapture()}
            >
              {capture ? <Square size={13} /> : <Circle size={13} />}{" "}
              {capture ? "Stop capture" : "Capture tab audio"}
            </button>
          </div>
        </section>
      </main>
      <section className="transport">
        <div className="transport-top">
          <div className="transport-title">
            <span className="section-number">04</span>
            <div>
              <h2>Build your loop</h2>
              <small>
                {mode === "count-in"
                  ? "COUNT IN…"
                  : mode === "recording"
                    ? "RECORDING TAKE"
                    : `${takes.length} TAKE${takes.length === 1 ? "" : "S"} · ${mode.toUpperCase()}`}
              </small>
            </div>
          </div>
          <div className="transport-settings">
            <label>
              BPM{" "}
              <input
                aria-label="BPM"
                type="number"
                min="40"
                max="200"
                disabled={locked}
                value={bpm}
                onChange={(e) =>
                  setBpm(Math.max(40, Math.min(200, +e.target.value)))
                }
              />
            </label>
            <label>
              LENGTH{" "}
              <select
                aria-label="Loop length"
                disabled={locked}
                value={bars}
                onChange={(e) => setBars(+e.target.value)}
              >
                {[1, 2, 4, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} bar{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={quantize}
                onChange={(e) => setQuantize(e.target.checked)}
              />
              QUANTIZE 1/16
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={metro}
                onChange={(e) => setMetro(e.target.checked)}
              />
              METRONOME
            </label>
          </div>
          <span className="loop-duration">
            {loopSeconds(bpm, bars).toFixed(2)}
            <small>SECONDS</small>
          </span>
        </div>
        <div className="loop-track" aria-label="Loop progress">
          {Array.from({ length: bars * 4 }, (_, i) => (
            <div key={i} className={`beat ${i % 4 === 0 ? "downbeat" : ""}`}>
              <span>{i % 4 === 0 ? i / 4 + 1 : ""}</span>
            </div>
          ))}
          {takes.flatMap((t) =>
            t.hits.map((h, i) => (
              <span
                key={`${t.id}-${i}`}
                className={`hit-marker ${pads[h.pad].choke ? "chop" : ""}`}
                style={{ left: `${(h.time / loopSeconds(bpm, bars)) * 100}%` }}
              />
            )),
          )}
          <span className="playhead" style={{ left: `${progress * 100}%` }} />
        </div>
        <div className="transport-bottom">
          <div className="transport-buttons">
            <button
              className="play-button"
              disabled={
                !takes.length ||
                capture ||
                busy ||
                mode === "recording" ||
                mode === "count-in"
              }
              onClick={() => {
                player.current?.pauseVideo();
                void engine.play();
              }}
            >
              <Play size={16} fill="currentColor" />
              Play
            </button>
            <button aria-label="Stop playback" onClick={() => engine.stop()}>
              <Square size={15} />
            </button>
            <button
              className={`record-button ${mode === "recording" || mode === "count-in" ? "recording-button" : ""}`}
              disabled={
                capture || busy || mode === "recording" || mode === "count-in"
              }
              onClick={() => {
                player.current?.pauseVideo();
                void engine.play(true);
              }}
            >
              <Circle size={13} fill="currentColor" />
              {takes.length ? "Overdub" : "Record loop"}
            </button>
            <button
              disabled={
                !takes.length ||
                capture ||
                busy ||
                mode === "recording" ||
                mode === "count-in"
              }
              onClick={() => {
                engine.stop();
                setTakes((t) => t.slice(0, -1));
                setDirty(true);
              }}
            >
              <Undo2 size={15} />
              Undo take
            </button>
            <button
              className="text-button"
              disabled={!takes.length || capture || busy}
              onClick={clear}
            >
              Clear loop
            </button>
          </div>
          <button
            className="export-button"
            disabled={!takes.length || busy || capture}
            onClick={() => void exportWav()}
          >
            <Download size={16} />
            {busy ? "Working…" : "Export WAV"}
            <span>24-BIT</span>
          </button>
        </div>
      </section>
      <footer>
        <span role="status" aria-live="polite">
          <span className="status-dot" />
          {message}
        </span>
        <button onClick={() => setAbout(true)}>
          HOW TO CHOP <ChevronRight size={12} />
        </button>
        <span className="footer-brand">CHOPPER / VOL. 01</span>
        <img
          className="chopper-cameo"
          src={chopperReference}
          alt=""
          width="48"
          height="48"
          loading="lazy"
          decoding="async"
          title="A little Chopper cameo"
        />
      </footer>
      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="How to use Chopper"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal"
              aria-label="Close help"
              onClick={() => setAbout(false)}
            >
              <X />
            </button>
            <Scissors className="help-icon" />
            <h2>A little guide to chopping.</h2>
            <p>
              1. Import a sound or explore YouTube. Tab capture requires desktop
              Chrome/Edge and the browser’s Share tab audio option.
            </p>
            <p>
              2. Choose a sound, trim its waveform, and make slices. Drag them
              onto pads, or select a pad and use Assign.
            </p>
            <p>
              3. Press Record loop. After four count-in beats, play the keyboard
              pads. Add another layer with Overdub. Escape stops playback.
            </p>
            <p>
              4. Export your stereo WAV, or save a .chopper project to keep all
              your sounds and takes.
            </p>
            <p>
              Capture records all audio from the selected tab. YouTube browsing
              doesn’t grant permission to extract its content. Automatic YouTube
              capture is experimental and disabled in public builds.
            </p>
            <p>
              No app account. No cloud audio uploads. Unsaved work clears when
              you leave.
            </p>
            <div className="help-links">
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener"
              >
                YouTube terms
              </a>
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener"
              >
                Google privacy
              </a>
            </div>
            <button className="accent-button" onClick={() => setAbout(false)}>
              Let’s make something <ChevronRight size={14} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
