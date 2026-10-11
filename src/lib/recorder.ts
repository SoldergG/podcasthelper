// Local, high-quality recording of this device's mic (lossless WAV) and camera.
import { putChunk } from "./db";
import { pickRecorderMime, recordingVideoBitrate, type CaptureSettings } from "./media";
import { floatToInt16 } from "./wav";

export interface RecordingResult {
  audio: { startLocal: number; durationMs: number; size: number; sampleRate: number };
  video: { startLocal: number; durationMs: number; size: number; mime: string; width: number; height: number } | null;
}

/** Converts a performance.now() reading into wall-clock ms. */
const perfToWall = (p: number) => performance.timeOrigin + p;

export class LocalRecorder {
  private ctx: AudioContext;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;
  private mr: MediaRecorder | null = null;

  private audioTrackId = "";
  private videoTrackId = "";
  private pcmParts: Int16Array[] = [];
  private pcmPartFrames = 0;
  private audioChunkIndex = 0;
  private videoChunkIndex = 0;
  private audioBytes = 0;
  private videoBytes = 0;
  private writes: Promise<unknown>[] = [];

  private audioStartWall = 0;
  private audioFrames = 0;
  private videoStartWall = 0;
  private videoStopWall = 0;
  private videoMime = "";
  private stoppedResolve: (() => void) | null = null;
  private videoStopped: Promise<void> = Promise.resolve();
  private audioStartedPromise: Promise<void> = Promise.resolve();

  recording = false;

  constructor(
    ctx: AudioContext,
    private stream: MediaStream,
    private settings: CaptureSettings,
  ) {
    this.ctx = ctx;
  }

  get sampleRate() {
    return this.ctx.sampleRate;
  }

  async prepare() {
    if (this.node) return;
    await this.ctx.audioWorklet.addModule("/pcm-worklet.js");
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: "explicit",
    });
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.node.connect(this.sink).connect(this.ctx.destination);
    this.attachSource();
  }

  /** Re-attach after the stream's audio track changed (device switch). */
  setStream(stream: MediaStream) {
    this.stream = stream;
    this.attachSource();
  }

  private attachSource() {
    if (!this.node) return;
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.stream.getAudioTracks().length) {
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.source.connect(this.node);
    }
  }

  /** Map a wall-clock time on this device to an audio frame index. */
  private wallToFrame(wall: number): number {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime !== undefined && ts.performanceTime) {
      const ctxTimeAtWall = ts.contextTime + (wall - perfToWall(ts.performanceTime)) / 1000;
      return Math.round(ctxTimeAtWall * this.ctx.sampleRate);
    }
    const ctxTimeAtWall = this.ctx.currentTime + (wall - perfToWall(performance.now())) / 1000;
    return Math.round(ctxTimeAtWall * this.ctx.sampleRate);
  }

  private frameToWall(frame: number): number {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.contextTime !== undefined && ts.performanceTime) {
      return perfToWall(ts.performanceTime) + (frame / this.ctx.sampleRate - ts.contextTime) * 1000;
    }
    return perfToWall(performance.now()) + (frame / this.ctx.sampleRate - this.ctx.currentTime) * 1000;
  }

  /**
   * Start recording at `startWall` (this device's wall clock, already converted
   * from the host clock by the caller).
   */
  async start(startWall: number, audioTrackId: string, videoTrackId: string | null) {
    if (!this.node) await this.prepare();
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.recording = true;
    this.audioTrackId = audioTrackId;
    this.videoTrackId = videoTrackId || "";
    this.pcmParts = [];
    this.pcmPartFrames = 0;
    this.audioChunkIndex = 0;
    this.videoChunkIndex = 0;
    this.audioBytes = 0;
    this.videoBytes = 0;
    this.audioFrames = 0;
    this.writes = [];

    const node = this.node!;
    this.audioStartedPromise = new Promise<void>((resolveStarted) => {
      node.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === "started") {
          this.audioStartWall = this.frameToWall(m.frame);
          resolveStarted();
        } else if (m.type === "data") {
          this.onPcm(m.pcm as Float32Array);
        } else if (m.type === "stopped") {
          this.flushPcm();
          this.stoppedResolve?.();
        }
      };
    });
    node.port.postMessage({ cmd: "start", frame: this.wallToFrame(startWall) });

    // Video (with a copy of the audio so the file is self-contained for editors).
    const videoTrack = this.stream.getVideoTracks()[0];
    if (videoTrack && videoTrackId) {
      const mime = pickRecorderMime(true);
      this.videoMime = mime;
      const s = videoTrack.getSettings();
      const w = s.width || 1280;
      const h = s.height || 720;
      const bitrate = recordingVideoBitrate(w, h, s.frameRate || this.settings.fps, this.settings.quality);
      const mr = new MediaRecorder(this.stream, {
        mimeType: mime || undefined,
        videoBitsPerSecond: bitrate,
        audioBitsPerSecond: 192_000,
      });
      this.videoMime = mr.mimeType || mime || "video/webm";
      this.mr = mr;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.videoBytes += e.data.size;
          this.writes.push(putChunk(this.videoTrackId, this.videoChunkIndex++, e.data));
        }
      };
      this.videoStopped = new Promise<void>((res) => {
        mr.onstop = () => {
          this.videoStopWall = perfToWall(performance.now());
          res();
        };
      });
      mr.onstart = () => {
        this.videoStartWall = perfToWall(performance.now());
      };
      const delay = Math.max(0, startWall - perfToWall(performance.now()));
      setTimeout(() => {
        if (this.recording && mr.state === "inactive") mr.start(1000);
      }, delay);
    } else {
      this.mr = null;
    }
  }

  private onPcm(pcm: Float32Array) {
    const i16 = floatToInt16(pcm);
    this.pcmParts.push(i16);
    this.pcmPartFrames += i16.length;
    this.audioFrames += i16.length;
    // Persist roughly every 2 seconds of audio.
    if (this.pcmPartFrames >= this.ctx.sampleRate * 2) this.flushPcm();
  }

  private flushPcm() {
    if (!this.pcmParts.length) return;
    const blob = new Blob(this.pcmParts as BlobPart[], { type: "application/octet-stream" });
    this.audioBytes += blob.size;
    this.pcmParts = [];
    this.pcmPartFrames = 0;
    this.writes.push(putChunk(this.audioTrackId, this.audioChunkIndex++, blob));
  }

  /** Seconds recorded so far (for UI). */
  get elapsedMs() {
    return (this.audioFrames / this.ctx.sampleRate) * 1000;
  }

  async stop(stopWall?: number): Promise<RecordingResult> {
    const node = this.node!;
    const audioStopped = new Promise<void>((res) => (this.stoppedResolve = res));
    // If the start time is still in the future, make sure we don't wait forever.
    await Promise.race([this.audioStartedPromise, new Promise((r) => setTimeout(r, 100))]);
    node.port.postMessage({ cmd: "stop", frame: stopWall ? this.wallToFrame(stopWall) : undefined });
    if (this.mr && this.mr.state !== "inactive") {
      const delay = stopWall ? Math.max(0, stopWall - perfToWall(performance.now())) : 0;
      const mr = this.mr;
      setTimeout(() => {
        if (mr.state !== "inactive") mr.stop();
      }, delay);
    }
    await Promise.race([audioStopped, new Promise((r) => setTimeout(r, 3000))]);
    this.flushPcm();
    if (this.mr) await this.videoStopped;
    // ondataavailable for the final chunk fires before onstop.
    await Promise.all(this.writes);
    this.recording = false;

    const vt = this.stream.getVideoTracks()[0]?.getSettings();
    return {
      audio: {
        startLocal: this.audioStartWall,
        durationMs: (this.audioFrames / this.ctx.sampleRate) * 1000,
        size: this.audioBytes,
        sampleRate: this.ctx.sampleRate,
      },
      video: this.mr
        ? {
            startLocal: this.videoStartWall,
            durationMs: Math.max(0, this.videoStopWall - this.videoStartWall),
            size: this.videoBytes,
            mime: this.videoMime,
            width: vt?.width || 0,
            height: vt?.height || 0,
          }
        : null,
    };
  }

  dispose() {
    try {
      this.source?.disconnect();
      this.node?.disconnect();
      this.sink?.disconnect();
    } catch {
      /* ignore */
    }
    this.node = null;
  }
}
