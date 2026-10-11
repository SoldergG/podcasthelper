// Offline voice cleanup: high-pass, spectral noise reduction, voice-focus gate
// and compression. Blocks are processed independently with padding, so this
// streams over hour-long files.
import { trackBlob } from "./tracks";
import type { AudioCleanup, TrackMeta } from "./types";
import { readFrames, readWavInfo } from "./wav";

const N = 1024;
const HOP = N / 4;
const BINS = N / 2 + 1;

const HANN = (() => {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  return w;
})();

// ---------- FFT (radix-2, in place) ----------
const REV = (() => {
  const r = new Uint32Array(N);
  const bits = Math.log2(N);
  for (let i = 0; i < N; i++) {
    let x = i;
    let y = 0;
    for (let b = 0; b < bits; b++) {
      y = (y << 1) | (x & 1);
      x >>= 1;
    }
    r[i] = y;
  }
  return r;
})();
const COS = new Float32Array(N / 2);
const SIN = new Float32Array(N / 2);
for (let i = 0; i < N / 2; i++) {
  COS[i] = Math.cos((2 * Math.PI * i) / N);
  SIN[i] = -Math.sin((2 * Math.PI * i) / N);
}

function fft(re: Float32Array, im: Float32Array, inverse: boolean) {
  for (let i = 0; i < N; i++) {
    const j = REV[i];
    if (j > i) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1;
    const step = N / size;
    for (let i = 0; i < N; i += size) {
      for (let j = 0; j < half; j++) {
        const k = j * step;
        const wr = COS[k];
        const wi = inverse ? -SIN[k] : SIN[k];
        const a = i + j;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < N; i++) {
      re[i] /= N;
      im[i] /= N;
    }
  }
}

// ---------- Noise profile ----------
export interface NoiseProfile {
  /** Average noise power per bin. */
  noisePower: Float32Array;
  noiseDb: number;
  speechDb: number;
}

const profiles = new Map<string, Promise<NoiseProfile>>();

const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));

export function noiseProfile(track: TrackMeta): Promise<NoiseProfile> {
  let p = profiles.get(track.id);
  if (!p) {
    p = computeProfile(track);
    profiles.set(track.id, p);
  }
  return p;
}

async function computeProfile(track: TrackMeta): Promise<NoiseProfile> {
  const blob = await trackBlob(track);
  const info = await readWavInfo(blob);
  // Analyse up to 3 minutes spread over the recording.
  const sr = info.sampleRate;
  const windows = 6;
  const winFrames = Math.min(info.frames, sr * 30);
  const frames: { rms: number; power: Float32Array }[] = [];
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let w = 0; w < windows; w++) {
    const start = Math.floor(((info.frames - winFrames) * w) / Math.max(1, windows - 1));
    const data = await readFrames(blob, info, start, winFrames);
    for (let i = 0; i + N <= data.length; i += N) {
      let s = 0;
      for (let j = 0; j < N; j++) {
        const x = data[i + j];
        s += x * x;
        re[j] = x * HANN[j];
        im[j] = 0;
      }
      const rms = Math.sqrt(s / N);
      fft(re, im, false);
      const power = new Float32Array(BINS);
      for (let k = 0; k < BINS; k++) power[k] = re[k] * re[k] + im[k] * im[k];
      frames.push({ rms, power });
    }
    await new Promise((r) => setTimeout(r, 0));
    if (info.frames <= winFrames) break;
  }
  const sorted = [...frames].sort((a, b) => a.rms - b.rms);
  // Ignore digital silence (muted mic) when looking for the noise floor.
  const audible = sorted.filter((f) => f.rms > 1e-5);
  const pool = audible.length > 20 ? audible : sorted;
  const quiet = pool.slice(0, Math.max(1, Math.floor(pool.length * 0.12)));
  const noisePower = new Float32Array(BINS);
  for (const f of quiet) for (let k = 0; k < BINS; k++) noisePower[k] += f.power[k] / quiet.length;
  const noiseDb = db(quiet.reduce((n, f) => n + f.rms, 0) / quiet.length);
  const speechDb = db(pool[Math.floor(pool.length * 0.9)]?.rms ?? 0.1);
  return { noisePower, noiseDb, speechDb: Math.max(speechDb, noiseDb + 10) };
}

export function cleanupActive(c: AudioCleanup) {
  return c.highpass || c.denoise > 0 || c.voiceFocus || c.compress;
}

/** Padding (frames) needed around a block so state settles before the cropped part. */
export function cleanupPad(c: AudioCleanup, sr: number) {
  if (c.voiceFocus || c.compress) return Math.round(sr * 0.5);
  return N * 2;
}

// ---------- Processing ----------

function highpass(x: Float32Array, sr: number, fc = 80) {
  // 2nd-order Butterworth, run twice (4th order).
  const w0 = (2 * Math.PI * fc) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  for (let pass = 0; pass < 2; pass++) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = xi;
      y2 = y1;
      y1 = y;
      x[i] = y;
    }
  }
}

function denoise(x: Float32Array, prof: NoiseProfile, strength: number): Float32Array {
  const out = new Float32Array(x.length);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const prevGain = new Float32Array(BINS).fill(1);
  const gain = new Float32Array(BINS);
  const overSub = 1.5 + strength * 2.5;
  const floor = Math.pow(10, -(6 + 22 * strength) / 20);
  const norm = 1 / 1.5; // sum of Hann^2 at 75% overlap
  for (let start = -N + HOP; start < x.length; start += HOP) {
    for (let j = 0; j < N; j++) {
      const idx = start + j;
      re[j] = (idx >= 0 && idx < x.length ? x[idx] : 0) * HANN[j];
      im[j] = 0;
    }
    fft(re, im, false);
    for (let k = 0; k < BINS; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const g = Math.max(floor, 1 - (overSub * prof.noisePower[k]) / Math.max(1e-12, p));
      // temporal smoothing reduces "musical noise"
      gain[k] = Math.max(g, prevGain[k] * 0.55);
    }
    for (let k = 0; k < BINS; k++) {
      // light frequency smoothing
      const g = (gain[Math.max(0, k - 1)] + 2 * gain[k] + gain[Math.min(BINS - 1, k + 1)]) / 4;
      prevGain[k] = g;
      re[k] *= g;
      im[k] *= g;
      if (k > 0 && k < N / 2) {
        re[N - k] = re[k];
        im[N - k] = -im[k];
      }
    }
    fft(re, im, true);
    for (let j = 0; j < N; j++) {
      const idx = start + j;
      if (idx >= 0 && idx < out.length) out[idx] += re[j] * HANN[j] * norm;
    }
  }
  return out;
}

function voiceGate(x: Float32Array, sr: number, prof: NoiseProfile) {
  const thrDb = Math.max(prof.noiseDb + 8, prof.noiseDb + 0.35 * (prof.speechDb - prof.noiseDb));
  const thr = Math.pow(10, thrDb / 20);
  const envCoef = Math.exp(-1 / (0.01 * sr));
  const att = Math.exp(-1 / (0.003 * sr));
  const rel = Math.exp(-1 / (0.15 * sr));
  const hold = Math.round(0.25 * sr);
  const range = 0.03; // -30 dB
  let env = 0;
  let g = range;
  let holdLeft = 0;
  for (let i = 0; i < x.length; i++) {
    env = envCoef * env + (1 - envCoef) * x[i] * x[i];
    const level = Math.sqrt(env);
    if (level > thr) holdLeft = hold;
    else if (holdLeft > 0) holdLeft--;
    const target = holdLeft > 0 ? 1 : range;
    g = target > g ? att * g + (1 - att) * target : rel * g + (1 - rel) * target;
    x[i] *= g;
  }
}

function compressor(x: Float32Array, sr: number, prof: NoiseProfile) {
  const thrDb = prof.speechDb - 8;
  const ratio = 3;
  const makeup = Math.pow(10, ((8 * (1 - 1 / ratio)) * 0.6) / 20);
  const att = Math.exp(-1 / (0.01 * sr));
  const rel = Math.exp(-1 / (0.15 * sr));
  let envDb = -120;
  for (let i = 0; i < x.length; i++) {
    const lvl = db(Math.abs(x[i]));
    envDb = lvl > envDb ? att * envDb + (1 - att) * lvl : rel * envDb + (1 - rel) * lvl;
    const over = envDb - thrDb;
    const gr = over > 0 ? over * (1 - 1 / ratio) : 0;
    x[i] *= Math.pow(10, -gr / 20) * makeup;
  }
}

/** Process a mono block (with padding already included). */
export function cleanBlock(input: Float32Array, sr: number, c: AudioCleanup, prof: NoiseProfile | null): Float32Array {
  let x: Float32Array = input.slice();
  if (c.highpass || c.voiceFocus) highpass(x, sr, c.voiceFocus ? 90 : 80);
  if (c.denoise > 0 && prof) x = denoise(x, prof, c.denoise);
  if (c.voiceFocus && prof) voiceGate(x, sr, prof);
  if (c.compress && prof) compressor(x, sr, prof);
  return x;
}

/** Streaming peak limiter for the final mix (state kept across blocks). */
export class Limiter {
  private g = 1;
  constructor(
    private sr: number,
    private ceiling = 0.89, // about -1 dBFS
  ) {}
  process(x: Float32Array) {
    const rel = Math.exp(-1 / (0.2 * this.sr));
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]) * this.g;
      if (a > this.ceiling) this.g = this.ceiling / Math.abs(x[i]);
      x[i] *= this.g;
      this.g = rel * this.g + (1 - rel) * 1;
      if (this.g > 1) this.g = 1;
    }
  }
}
