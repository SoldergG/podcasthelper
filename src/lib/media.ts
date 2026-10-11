// Capture settings and getUserMedia helpers.

export type Resolution = "480" | "720" | "1080" | "1440" | "2160" | "max";

export interface CaptureSettings {
  audioDeviceId: string | null;
  videoDeviceId: string | null;
  facingMode: "user" | "environment";
  videoEnabled: boolean;
  resolution: Resolution;
  fps: 24 | 30 | 60;
  /** With headphones: raw mic (no echo cancel / AGC) for the best recording. */
  headphones: boolean;
  noiseSuppression: boolean;
  mirrorPreview: boolean;
  /** Recording video bitrate preset. */
  quality: "standard" | "high" | "max";
  /** Receive the other people's video files after recording (uses storage). */
  receiveVideo: boolean;
}

export const DEFAULT_SETTINGS: CaptureSettings = {
  audioDeviceId: null,
  videoDeviceId: null,
  facingMode: "user",
  videoEnabled: true,
  resolution: "max",
  fps: 30,
  headphones: true,
  noiseSuppression: false,
  mirrorPreview: true,
  quality: "high",
  receiveVideo: true,
};

const SETTINGS_KEY = "ph:settings";

export function loadSettings(): CaptureSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: CaptureSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const HEIGHTS: Record<Exclude<Resolution, "max">, number> = {
  "480": 480,
  "720": 720,
  "1080": 1080,
  "1440": 1440,
  "2160": 2160,
};

export function audioConstraints(s: CaptureSettings): MediaTrackConstraints {
  return {
    deviceId: s.audioDeviceId ? { exact: s.audioDeviceId } : undefined,
    echoCancellation: !s.headphones,
    autoGainControl: !s.headphones,
    noiseSuppression: s.noiseSuppression || !s.headphones,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
  };
}

export function videoConstraints(s: CaptureSettings): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    frameRate: { ideal: s.fps },
  };
  if (s.videoDeviceId) base.deviceId = { exact: s.videoDeviceId };
  else base.facingMode = s.facingMode;
  if (s.resolution === "max") {
    // Ask for 4K; the browser falls back to the best the camera can do.
    base.width = { ideal: 3840 };
    base.height = { ideal: 2160 };
  } else {
    const h = HEIGHTS[s.resolution];
    base.height = { ideal: h };
    base.width = { ideal: Math.round((h * 16) / 9) };
  }
  return base;
}

export async function getMedia(s: CaptureSettings): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: audioConstraints(s),
    video: s.videoEnabled ? videoConstraints(s) : false,
  });
  return stream;
}

export async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    audio: all.filter((d) => d.kind === "audioinput"),
    video: all.filter((d) => d.kind === "videoinput"),
  };
}

/** Bitrate for local recording, scaled by pixels. */
export function recordingVideoBitrate(width: number, height: number, fps: number, quality: CaptureSettings["quality"]) {
  const pixels = width * height * Math.max(24, fps);
  const bppf = quality === "max" ? 0.16 : quality === "high" ? 0.1 : 0.06;
  return Math.round(Math.min(60_000_000, Math.max(1_000_000, pixels * bppf)));
}

/** Pick the most editor-friendly container the browser can record. */
export function pickRecorderMime(hasVideo: boolean): string {
  const candidates = hasVideo
    ? [
        "video/mp4;codecs=avc1.640033,mp4a.40.2",
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4;codecs=avc1,opus",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ]
    : ["audio/mp4;codecs=mp4a.40.2", "audio/webm;codecs=opus", "audio/webm"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

export function extForMime(mime: string): string {
  if (mime.startsWith("audio/wav")) return "wav";
  if (mime.includes("mp4")) return mime.startsWith("audio") ? "m4a" : "mp4";
  if (mime.includes("webm")) return mime.startsWith("audio") ? "webm" : "webm";
  return "bin";
}

/** Live level meter for a stream (0..1). */
export function createLevelMeter(stream: MediaStream, ctx: AudioContext) {
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  return {
    read() {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      return Math.min(1, rms * 4);
    },
    dispose() {
      try {
        src.disconnect();
        analyser.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

let wakeLock: { release: () => Promise<void> } | null = null;
export async function keepAwake(on: boolean) {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (on && nav.wakeLock && !wakeLock) wakeLock = await nav.wakeLock.request("screen");
    if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    /* not supported */
  }
}
