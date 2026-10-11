// Editor preview: plays each person's WAV through Web Audio (gain/mute/solo) and
// keeps the videos in sync, skipping cut regions.
import { Compositor, type CompositorInput, type Layout } from "./compositor";
import { buildSegments, nextKeptSrc, trackEdit } from "./timeline";
import { trackBlob } from "./tracks";
import type { Episode, EpisodeEdits, TrackMeta } from "./types";
import { episodeDurationMs } from "./types";

interface AudioLane {
  track: TrackMeta;
  el: HTMLAudioElement;
  gain: GainNode;
  analyser: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
  offsetMs: number;
}

interface VideoLane {
  track: TrackMeta;
  el: HTMLVideoElement;
  offsetMs: number;
}

export class PreviewPlayer {
  private ctx: AudioContext;
  private audio: AudioLane[] = [];
  private video = new Map<string, VideoLane>();
  private urls: string[] = [];
  private playing = false;
  private startPerf = 0;
  private startSrc = 0;
  private raf = 0;
  private edits: EpisodeEdits;
  private listeners = new Set<(t: number, playing: boolean) => void>();
  canvas: HTMLCanvasElement | null = null;
  private compositor: Compositor | null = null;
  layout: Layout = "grid";
  current = 0;
  readonly duration: number;

  constructor(
    private ep: Episode,
    edits: EpisodeEdits,
  ) {
    this.edits = edits;
    this.duration = episodeDurationMs(ep);
    this.ctx = new AudioContext();
  }

  async load() {
    for (const t of this.ep.tracks) {
      if (!t.complete) continue;
      const url = URL.createObjectURL(await trackBlob(t));
      this.urls.push(url);
      if (t.kind === "audio") {
        const el = new Audio(url);
        el.preload = "auto";
        const src = this.ctx.createMediaElementSource(el);
        const gain = this.ctx.createGain();
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(gain).connect(this.ctx.destination);
        gain.connect(analyser);
        this.audio.push({ track: t, el, gain, analyser, buf: new Float32Array(512), offsetMs: t.startHost - this.ep.startHost });
      } else {
        const el = document.createElement("video");
        el.muted = true;
        el.playsInline = true;
        el.preload = "auto";
        el.src = url;
        el.addEventListener("seeked", () => !this.playing && this.draw());
        el.addEventListener("loadeddata", () => !this.playing && this.draw());
        this.video.set(t.peerId, { track: t, el, offsetMs: t.startHost - this.ep.startHost });
      }
    }
    this.applyGains();
    this.seek(this.edits.trimStart || 0);
  }

  onTime(fn: (t: number, playing: boolean) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setEdits(edits: EpisodeEdits) {
    this.edits = edits;
    this.applyGains();
    this.draw();
  }

  setLayout(layout: Layout) {
    this.layout = layout;
    this.draw();
  }

  attachCanvas(canvas: HTMLCanvasElement | null) {
    this.canvas = canvas;
    this.compositor = canvas ? new Compositor(canvas.getContext("2d")!, canvas.width, canvas.height) : null;
    this.draw();
  }

  private applyGains() {
    const anySolo = this.audio.some((a) => trackEdit(this.edits, a.track.peerId).solo);
    for (const a of this.audio) {
      const te = trackEdit(this.edits, a.track.peerId);
      const audible = !te.muted && (!anySolo || te.solo);
      a.gain.gain.value = audible ? te.gain : 0;
    }
  }

  get isPlaying() {
    return this.playing;
  }

  async play() {
    if (this.playing) return;
    await this.ctx.resume();
    const segs = buildSegments(this.ep, this.edits);
    const next = nextKeptSrc(segs, this.current);
    if (next === null) this.current = segs[0]?.srcStart ?? 0;
    else this.current = next;
    this.playing = true;
    this.startPerf = performance.now();
    this.startSrc = this.current;
    this.syncElements(true);
    this.loop();
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const a of this.audio) a.el.pause();
    for (const v of this.video.values()) v.el.pause();
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(ms: number) {
    this.current = Math.max(0, Math.min(this.duration, ms));
    this.startPerf = performance.now();
    this.startSrc = this.current;
    this.syncElements(true);
    this.emit();
    this.draw();
  }

  private syncElements(force: boolean) {
    const t = this.current;
    for (const a of this.audio) {
      const want = (t - a.offsetMs) / 1000;
      const inRange = want >= 0 && want < a.track.durationMs / 1000;
      if (!inRange) {
        if (!a.el.paused) a.el.pause();
        continue;
      }
      if (force || Math.abs(a.el.currentTime - want) > 0.08) a.el.currentTime = want;
      if (this.playing && a.el.paused) a.el.play().catch(() => {});
      if (!this.playing && !a.el.paused) a.el.pause();
    }
    for (const v of this.video.values()) {
      const want = (t - v.offsetMs) / 1000;
      const inRange = want >= 0 && want < v.track.durationMs / 1000;
      if (!inRange) {
        if (!v.el.paused) v.el.pause();
        continue;
      }
      if (force || Math.abs(v.el.currentTime - want) > 0.2) v.el.currentTime = want;
      if (this.playing && v.el.paused) v.el.play().catch(() => {});
      if (!this.playing && !v.el.paused) v.el.pause();
    }
  }

  private loop = () => {
    if (!this.playing) return;
    let t = this.startSrc + (performance.now() - this.startPerf);
    const segs = buildSegments(this.ep, this.edits);
    const kept = nextKeptSrc(segs, t);
    if (kept === null) {
      this.current = segs[segs.length - 1]?.srcEnd ?? this.duration;
      this.pause();
      return;
    }
    if (kept > t + 1) {
      // Jump over a cut.
      t = kept;
      this.current = t;
      this.startSrc = t;
      this.startPerf = performance.now();
      this.syncElements(true);
    } else {
      this.current = t;
      this.syncElements(false);
    }
    this.emit();
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private levelOf(peerId: string) {
    const a = this.audio.find((x) => x.track.peerId === peerId);
    if (!a || !this.playing) return 0;
    a.analyser.getFloatTimeDomainData(a.buf);
    let s = 0;
    for (let i = 0; i < a.buf.length; i++) s += a.buf[i] * a.buf[i];
    return Math.min(1, Math.sqrt(s / a.buf.length) * 4);
  }

  draw() {
    if (!this.compositor) return;
    const inputs: CompositorInput[] = [];
    for (const p of this.ep.participants) {
      const te = trackEdit(this.edits, p.peerId);
      const v = this.video.get(p.peerId);
      const hasAudio = this.audio.some((a) => a.track.peerId === p.peerId);
      if (!v && !hasAudio) continue;
      inputs.push({
        participant: p,
        video: v?.el || null,
        videoTrack: v?.track || null,
        videoOffsetMs: v?.offsetMs || 0,
        edit: te,
        level: te.muted ? 0 : this.levelOf(p.peerId),
      });
    }
    if (inputs.length) this.compositor.draw(inputs, this.current, this.layout);
  }

  private emit() {
    this.listeners.forEach((f) => f(this.current, this.playing));
  }

  dispose() {
    this.pause();
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.ctx.close().catch(() => {});
  }
}
