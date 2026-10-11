// Streaming audio processing: peaks, aligned per-person WAVs, mixdown, MP3.
import { Mp3Encoder } from "@breezystack/lamejs";
import { cleanBlock, cleanupActive, cleanupPad, Limiter, noiseProfile, type NoiseProfile } from "./cleanup";
import { getPeaks, putPeaks, type PeaksRecord } from "./db";
import { buildSegments, editsOf, outputDuration, trackEdit, type Segment } from "./timeline";
import { trackBlob } from "./tracks";
import { DEFAULT_CLEANUP, type AudioCleanup, type Episode, type EpisodeEdits, type TrackMeta } from "./types";
import { floatToInt16, readFrames, readWavInfo, resampleLinear, wavHeader } from "./wav";

export const MIX_RATE = 48000;
const PEAKS_PER_SECOND = 50;
const TARGET_LUFS = -16;

const yieldToUi = () => new Promise((r) => setTimeout(r, 0));

/** Waveform peaks (max |sample| per 20 ms), cached in IndexedDB. */
export async function trackPeaks(track: TrackMeta): Promise<PeaksRecord | null> {
  if (track.kind !== "audio" || !track.complete) return null;
  const cached = await getPeaks(track.id);
  if (cached) return cached;
  const blob = await trackBlob(track);
  const info = await readWavInfo(blob);
  const per = Math.round(info.sampleRate / PEAKS_PER_SECOND);
  const nPeaks = Math.ceil(info.frames / per);
  const peaks = new Float32Array(nPeaks);
  const BLOCK = per * PEAKS_PER_SECOND * 30; // 30 s per read
  for (let f = 0; f < info.frames; f += BLOCK) {
    const data = await readFrames(blob, info, f, Math.min(BLOCK, info.frames - f));
    for (let i = 0; i < data.length; i += per) {
      let m = 0;
      const end = Math.min(data.length, i + per);
      for (let j = i; j < end; j++) {
        const a = Math.abs(data[j]);
        if (a > m) m = a;
      }
      peaks[Math.floor((f + i) / per)] = m;
    }
    await yieldToUi();
  }
  const rec = { peaks, perSecond: PEAKS_PER_SECOND };
  await putPeaks(track.id, rec);
  return rec;
}

interface Source {
  track: TrackMeta;
  blob: Blob;
  info: Awaited<ReturnType<typeof readWavInfo>>;
  /** Episode-relative ms of the first sample. */
  offsetMs: number;
  gain: number;
  cleanup: AudioCleanup;
  profile: NoiseProfile | null;
}

async function makeSource(ep: Episode, t: TrackMeta, gain: number, cleanup: AudioCleanup): Promise<Source> {
  const blob = await trackBlob(t);
  const profile = cleanupActive(cleanup) ? await noiseProfile(t) : null;
  return { track: t, blob, info: await readWavInfo(blob), offsetMs: t.startHost - ep.startHost, gain, cleanup, profile };
}

async function audioSources(ep: Episode, edits: EpisodeEdits | null): Promise<Source[]> {
  const audio = ep.tracks.filter((t) => t.kind === "audio" && t.complete);
  const anySolo = edits ? audio.some((t) => trackEdit(edits, t.peerId).solo) : false;
  const out: Source[] = [];
  for (const t of audio) {
    const te = edits ? trackEdit(edits, t.peerId) : null;
    if (te?.muted) continue;
    if (anySolo && !te?.solo) continue;
    out.push(await makeSource(ep, t, te ? te.gain : 1, te ? te.cleanup : DEFAULT_CLEANUP));
  }
  return out;
}

/** Native-rate frames of a source, cleaned if requested. */
async function readNative(s: Source, startFrame: number, count: number): Promise<Float32Array> {
  if (!cleanupActive(s.cleanup)) return readFrames(s.blob, s.info, startFrame, count);
  const pad = cleanupPad(s.cleanup, s.info.sampleRate);
  const raw = await readFrames(s.blob, s.info, startFrame - pad, count + pad * 2);
  const cleaned = cleanBlock(raw, s.info.sampleRate, s.cleanup, s.profile);
  return cleaned.subarray(pad, pad + count);
}

/** Reads a block of a source, resampled to MIX_RATE, for episode time `srcMs`. */
async function readSourceBlock(s: Source, srcMs: number, frames: number): Promise<Float32Array> {
  const rate = s.info.sampleRate;
  const startFrame = Math.round(((srcMs - s.offsetMs) / 1000) * rate);
  if (rate === MIX_RATE) return readNative(s, startFrame, frames);
  const need = Math.ceil((frames * rate) / MIX_RATE) + 2;
  const raw = await readNative(s, startFrame, need);
  return resampleLinear(raw, rate, MIX_RATE, frames);
}

export interface MixOptions {
  applyEdits: boolean;
  format: "wav" | "mp3";
  mp3Kbps?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Iterate output blocks of the edited timeline, giving the mixed samples. */
async function forEachMixedBlock(
  sources: Source[],
  segs: Segment[],
  fn: (mixed: Float32Array) => void | Promise<void>,
  onProgress?: (f: number) => void,
  signal?: AbortSignal,
) {
  const total = outputDuration(segs);
  const BLOCK_MS = 5000;
  let doneMs = 0;
  for (const seg of segs) {
    for (let t = seg.srcStart; t < seg.srcEnd; t += BLOCK_MS) {
      if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
      const ms = Math.min(BLOCK_MS, seg.srcEnd - t);
      const frames = Math.round((ms / 1000) * MIX_RATE);
      const mixed = new Float32Array(frames);
      for (const s of sources) {
        const block = await readSourceBlock(s, t, frames);
        const g = s.gain;
        for (let i = 0; i < frames; i++) mixed[i] += block[i] * g;
      }
      await fn(mixed);
      doneMs += ms;
      onProgress?.(total ? doneMs / total : 1);
      await yieldToUi();
    }
  }
}

/** Approximate integrated loudness (gated RMS of 400 ms blocks). */
class LoudnessMeter {
  private blocks: number[] = [];
  private acc = 0;
  private n = 0;
  private size = Math.round(MIX_RATE * 0.4);
  push(x: Float32Array) {
    for (let i = 0; i < x.length; i++) {
      this.acc += x[i] * x[i];
      if (++this.n === this.size) {
        this.blocks.push(this.acc / this.size);
        this.acc = 0;
        this.n = 0;
      }
    }
  }
  lufs(): number {
    const abs = this.blocks.filter((ms) => ms > Math.pow(10, -70 / 10));
    if (!abs.length) return -70;
    const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
    const rel = abs.filter((ms) => ms > mean * Math.pow(10, -10 / 10));
    const m = (rel.length ? rel : abs).reduce((a, b) => a + b, 0) / (rel.length || abs.length);
    // +0.7 dB roughly accounts for K-weighting on speech.
    return 10 * Math.log10(m) + 0.7;
  }
}

/** Mixdown of everyone into one mono file. */
export async function mixdown(ep: Episode, opts: MixOptions): Promise<Blob> {
  const edits = opts.applyEdits ? editsOf(ep) : null;
  const segs = buildSegments(ep, edits);
  const sources = await audioSources(ep, edits);
  if (!sources.length) throw new Error("Não há faixas de áudio para misturar (estão todas silenciadas ou ainda a chegar).");

  const loud = edits ? edits.loudness : true;
  let scale = 1;
  if (loud) {
    const meter = new LoudnessMeter();
    await forEachMixedBlock(sources, segs, (m) => meter.push(m), (f) => opts.onProgress?.(f * 0.5), opts.signal);
    const lufs = meter.lufs();
    scale = Math.min(20, Math.pow(10, (TARGET_LUFS - lufs) / 20));
  }
  const progress = (f: number) => opts.onProgress?.(loud ? 0.5 + f * 0.5 : f);
  const limiter = new Limiter(MIX_RATE);
  const finish = (m: Float32Array) => {
    for (let i = 0; i < m.length; i++) m[i] *= scale;
    limiter.process(m);
    return floatToInt16(m);
  };

  if (opts.format === "mp3") {
    const enc = new Mp3Encoder(1, MIX_RATE, opts.mp3Kbps || 192);
    const parts: BlobPart[] = [];
    await forEachMixedBlock(sources, segs, (m) => {
      const pcm = finish(m);
      const CH = 1152 * 20;
      for (let i = 0; i < pcm.length; i += CH) {
        const buf = enc.encodeBuffer(pcm.subarray(i, i + CH));
        if (buf.length) parts.push(new Uint8Array(buf));
      }
    }, progress, opts.signal);
    const end = enc.flush();
    if (end.length) parts.push(new Uint8Array(end));
    return new Blob(parts, { type: "audio/mpeg" });
  }

  const parts: BlobPart[] = [];
  let bytes = 0;
  await forEachMixedBlock(sources, segs, (m) => {
    const pcm = finish(m);
    parts.push(pcm.buffer as ArrayBuffer);
    bytes += pcm.byteLength;
  }, progress, opts.signal);
  return new Blob([wavHeader(bytes, MIX_RATE, 1), ...parts], { type: "audio/wav" });
}

/**
 * One person's track, padded/trimmed so it starts exactly at the episode's zero
 * (and follows the edits if asked). Without cleanup it is built from Blob slices
 * (no re-encoding, instant); with cleanup it is processed block by block.
 */
export async function alignedTrackWav(ep: Episode, track: TrackMeta, applyEdits: boolean, applyCleanup: boolean): Promise<Blob> {
  const edits = editsOf(ep);
  const segs = buildSegments(ep, applyEdits ? edits : null);
  const te = trackEdit(edits, track.peerId);
  if (applyCleanup && cleanupActive(te.cleanup)) {
    const src = await makeSource(ep, track, 1, te.cleanup);
    const rate = src.info.sampleRate;
    const parts: BlobPart[] = [];
    let bytes = 0;
    for (const seg of segs) {
      for (let t = seg.srcStart; t < seg.srcEnd; t += 10_000) {
        const ms = Math.min(10_000, seg.srcEnd - t);
        const frames = Math.round((ms / 1000) * rate);
        const startFrame = Math.round(((t - src.offsetMs) / 1000) * rate);
        const pcm = floatToInt16(await readNative(src, startFrame, frames));
        parts.push(pcm.buffer as ArrayBuffer);
        bytes += pcm.byteLength;
        await yieldToUi();
      }
    }
    return new Blob([wavHeader(bytes, rate, 1), ...parts], { type: "audio/wav" });
  }

  const blob = await trackBlob(track);
  const info = await readWavInfo(blob);
  const rate = info.sampleRate;
  const offsetMs = track.startHost - ep.startHost;
  const parts: BlobPart[] = [];
  let bytes = 0;
  const zeros = (frames: number) => {
    const CH = rate * 10;
    while (frames > 0) {
      const n = Math.min(CH, frames);
      parts.push(new ArrayBuffer(n * 2));
      bytes += n * 2;
      frames -= n;
    }
  };
  for (const seg of segs) {
    const segFrames = Math.round(((seg.srcEnd - seg.srcStart) / 1000) * rate);
    const startFrame = Math.round(((seg.srcStart - offsetMs) / 1000) * rate);
    let pos = startFrame;
    const end = startFrame + segFrames;
    if (pos < 0) {
      zeros(Math.min(end, 0) - pos);
      pos = 0;
    }
    const dataEnd = Math.min(end, info.frames);
    if (dataEnd > pos) {
      parts.push(blob.slice(info.dataOffset + pos * 2, info.dataOffset + dataEnd * 2));
      bytes += (dataEnd - pos) * 2;
      pos = dataEnd;
    }
    if (end > pos) zeros(end - pos);
  }
  return new Blob([wavHeader(bytes, rate, 1), ...parts], { type: "audio/wav" });
}

/** Short before/after clip of one track for previewing cleanup settings. */
export async function cleanupPreview(ep: Episode, track: TrackMeta, cleanup: AudioCleanup, srcMs: number, durMs = 8000): Promise<{ before: Blob; after: Blob }> {
  const raw = await makeSource(ep, track, 1, DEFAULT_CLEANUP);
  const clean = await makeSource(ep, track, 1, cleanup);
  const rate = raw.info.sampleRate;
  const frames = Math.round((durMs / 1000) * rate);
  const startFrame = Math.round(((srcMs - raw.offsetMs) / 1000) * rate);
  const a = floatToInt16(await readNative(raw, startFrame, frames));
  const b = floatToInt16(await readNative(clean, startFrame, frames));
  return {
    before: new Blob([wavHeader(a.byteLength, rate, 1), a.buffer as ArrayBuffer], { type: "audio/wav" }),
    after: new Blob([wavHeader(b.byteLength, rate, 1), b.buffer as ArrayBuffer], { type: "audio/wav" }),
  };
}

/** Per-person loudness over the output timeline (for "active speaker" video). */
export async function speakerActivity(ep: Episode, applyEdits: boolean): Promise<{ peerIds: string[]; perSecond: number; levels: Float32Array[] }> {
  const edits = applyEdits ? editsOf(ep) : null;
  const segs = buildSegments(ep, edits);
  const total = outputDuration(segs);
  const perSecond = 10;
  const n = Math.ceil((total / 1000) * perSecond);
  const peerIds: string[] = [];
  const levels: Float32Array[] = [];
  for (const t of ep.tracks) {
    if (t.kind !== "audio" || !t.complete) continue;
    if (edits && trackEdit(edits, t.peerId).muted) continue;
    const pk = await trackPeaks(t);
    if (!pk) continue;
    const arr = new Float32Array(n);
    const offset = t.startHost - ep.startHost;
    let si = 0;
    for (let i = 0; i < n; i++) {
      const outMs = (i / perSecond) * 1000;
      while (si < segs.length - 1 && outMs >= segs[si].outStart + (segs[si].srcEnd - segs[si].srcStart)) si++;
      const s = segs[si];
      const src = s ? s.srcStart + (outMs - s.outStart) : 0;
      const pi = Math.floor(((src - offset) / 1000) * pk.perSecond);
      let m = 0;
      for (let j = pi; j < pi + pk.perSecond / perSecond; j++) m = Math.max(m, pk.peaks[j] || 0);
      arr[i] = m;
    }
    peerIds.push(t.peerId);
    levels.push(arr);
  }
  return { peerIds, perSecond, levels };
}
