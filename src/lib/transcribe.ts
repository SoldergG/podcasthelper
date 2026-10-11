// Live transcription of this device's speaker using the browser speech service
// (Chrome/Edge/Android: Google; Safari: Apple). Each person only transcribes
// themselves, so lines come with the right speaker for free.

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export class LiveTranscriber {
  private rec: SpeechRecognitionLike | null = null;
  private running = false;
  private phraseStart: number | null = null;

  constructor(
    private lang: string,
    /** Wall-clock now (already mapped by the caller if needed). */
    private now: () => number,
    private onFinal: (text: string, startedAt: number) => void,
    private onInterim: (text: string) => void,
    private onError: (msg: string) => void,
  ) {}

  start() {
    if (this.running || !speechSupported()) return;
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition!;
    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript.trim();
        if (!text) continue;
        if (this.phraseStart === null) this.phraseStart = this.now() - 400;
        if (r.isFinal) {
          this.onFinal(text, this.phraseStart);
          this.phraseStart = null;
        } else interim += text + " ";
      }
      this.onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.running = false;
        this.onError("O navegador não deixou usar a transcrição.");
      }
    };
    // Recognition stops by itself every so often: keep it going while we're running.
    rec.onend = () => {
      if (this.running) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    this.rec = rec;
    this.running = true;
    try {
      rec.start();
    } catch {
      /* ignore */
    }
  }

  stop() {
    this.running = false;
    this.phraseStart = null;
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
    this.rec = null;
    this.onInterim("");
  }

  get active() {
    return this.running;
  }
}

/** SubRip subtitles from transcript lines (times in output ms). */
export function toSrt(lines: { ms: number; end: number; name: string; text: string }[]): string {
  const ts = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const x = Math.floor(ms % 1000);
    const p = (n: number, l = 2) => String(n).padStart(l, "0");
    return `${p(h)}:${p(m)}:${p(s)},${p(x, 3)}`;
  };
  return lines.map((l, i) => `${i + 1}\n${ts(l.ms)} --> ${ts(l.end)}\n${l.name}: ${l.text}\n`).join("\n");
}
