// Pre-flight checks: microphone, camera, storage and power.
import { storageEstimate } from "./db";
import { recordingVideoBitrate, type CaptureSettings } from "./media";

const db = (x: number) => 20 * Math.log10(Math.max(1e-7, x));

/** Live microphone analysis: RMS and peak in dBFS, plus clipping. */
export class MicAnalyser {
  private ctx: AudioContext;
  private src: MediaStreamAudioSourceNode;
  private an: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;
  clipped = 0;

  constructor(stream: MediaStream) {
    this.ctx = new AudioContext();
    this.src = this.ctx.createMediaStreamSource(stream);
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 2048;
    this.buf = new Float32Array(this.an.fftSize);
    this.src.connect(this.an);
  }

  read(): { rmsDb: number; peakDb: number } {
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0;
    let peak = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = this.buf[i];
      s += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    if (peak >= 0.99) this.clipped++;
    return { rmsDb: db(Math.sqrt(s / this.buf.length)), peakDb: db(peak) };
  }

  /** Measure background noise: average RMS over `ms` of silence. */
  async noiseFloor(ms = 3000): Promise<number> {
    const values: number[] = [];
    const end = performance.now() + ms;
    while (performance.now() < end) {
      values.push(this.read().rmsDb);
      await new Promise((r) => setTimeout(r, 50));
    }
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length * 0.5)] ?? -90;
  }

  dispose() {
    try {
      this.src.disconnect();
    } catch {
      /* ignore */
    }
    this.ctx.close().catch(() => {});
  }
}

export function rateNoise(db: number): { label: string; tone: "good" | "ok" | "bad" } {
  if (db < -60) return { label: "Muito silencioso. Ótimo.", tone: "good" };
  if (db < -48) return { label: "Algum ruído de fundo. Aceitável.", tone: "ok" };
  return { label: "Muito ruído. Fecha janelas, desliga ventoinhas ou liga a redução de ruído.", tone: "bad" };
}

export function rateVoice(peakDb: number): { label: string; tone: "good" | "ok" | "bad" } {
  if (peakDb > -1) return { label: "Demasiado alto: afasta-te um pouco do micro.", tone: "bad" };
  if (peakDb > -20) return { label: "Bom nível de voz.", tone: "good" };
  if (peakDb > -32) return { label: "Um pouco baixo: aproxima-te do micro.", tone: "ok" };
  return { label: "Quase não se ouve. Confirma o micro escolhido.", tone: "bad" };
}

/** Records a short audio sample so the person can hear themselves. */
export function recordSample(stream: MediaStream, seconds = 5): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const audio = new MediaStream(stream.getAudioTracks());
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    const mr = new MediaRecorder(audio, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => resolve(new Blob(chunks, { type: mr.mimeType }));
    mr.onerror = () => reject(new Error("Não foi possível gravar o teste."));
    mr.start();
    setTimeout(() => mr.state !== "inactive" && mr.stop(), seconds * 1000);
  });
}

/** Average brightness (0..255) of the current camera frame. */
export function frameBrightness(video: HTMLVideoElement): number | null {
  if (!video.videoWidth) return null;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 36;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(video, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return sum / (d.length / 4);
}

export function rateLight(luma: number): { label: string; tone: "good" | "ok" | "bad" } {
  if (luma < 55) return { label: "Pouca luz. Vira-te para uma janela ou acende uma luz à frente.", tone: "bad" };
  if (luma < 85) return { label: "Luz razoável. Um pouco mais de luz à frente ajuda.", tone: "ok" };
  if (luma > 215) return { label: "Imagem muito clara. Afasta-te da luz direta.", tone: "ok" };
  return { label: "Boa luz.", tone: "good" };
}

/** Estimate how many hours of recording fit in the free space. */
export async function storageForecast(stream: MediaStream | null, settings: CaptureSettings) {
  const est = await storageEstimate();
  if (!est) return null;
  const free = Math.max(0, est.quota - est.usage);
  const audioPerHour = 48000 * 2 * 3600; // WAV mono 16-bit
  let videoPerHour = 0;
  const vs = stream?.getVideoTracks()[0]?.getSettings();
  if (vs?.width && vs.height) {
    videoPerHour = (recordingVideoBitrate(vs.width, vs.height, vs.frameRate || settings.fps, settings.quality) / 8) * 3600;
  }
  const perHour = audioPerHour + videoPerHour;
  return { free, perHour, hours: free / perHour };
}

export async function batteryStatus(): Promise<{ level: number; charging: boolean } | null> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
    const b = await nav.getBattery?.();
    return b ? { level: Math.round(b.level * 100), charging: b.charging } : null;
  } catch {
    return null;
  }
}
