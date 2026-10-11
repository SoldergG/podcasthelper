"use client";

import { Mic, Play, Square, Waves } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MicAnalyser, rateNoise, rateVoice, recordSample } from "@/lib/checks";
import { Button, LedMeter, Panel, type LedMeterHandle } from "../ui";

type Verdict = { label: string; tone: "good" | "ok" | "bad" };

const toneClass = { good: "text-green", ok: "text-orange", bad: "text-red" };

/** A working channel strip: test your microphone right on the landing page. */
export function MicStrip() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [db, setDb] = useState<number | null>(null);
  const [voice, setVoice] = useState<Verdict | null>(null);
  const [noise, setNoise] = useState<{ db: number; v: Verdict } | null>(null);
  const [busy, setBusy] = useState<"noise" | "rec" | "play" | null>(null);
  const meterRef = useRef<LedMeterHandle>(null);
  const analyser = useRef<MicAnalyser | null>(null);
  const peakWindow = useRef<number[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!stream) return;
    const an = new MicAnalyser(stream);
    analyser.current = an;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      const { rmsDb, peakDb } = an.read();
      // map -60..0 dBFS onto the meter
      meterRef.current?.set((peakDb + 60) / 60);
      if (t - last > 250) {
        last = t;
        setDb(Math.round(rmsDb));
        peakWindow.current = [...peakWindow.current.slice(-12), peakDb];
        const loudest = Math.max(...peakWindow.current);
        if (loudest > -45) setVoice(rateVoice(loudest));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      an.dispose();
      analyser.current = null;
    };
  }, [stream]);

  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  const start = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
      setStream(s);
    } catch {
      setError("Não deu para abrir o micro. Dá permissão no navegador e tenta de novo.");
    }
  };

  const stop = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setDb(null);
    setVoice(null);
    meterRef.current?.set(0);
  };

  const measureNoise = async () => {
    if (!analyser.current) return;
    setBusy("noise");
    const n = await analyser.current.noiseFloor(3000);
    setNoise({ db: Math.round(n), v: rateNoise(n) });
    setBusy(null);
  };

  const recordAndPlay = async () => {
    if (!stream) return;
    setBusy("rec");
    const blob = await recordSample(stream, 5);
    setBusy("play");
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    audioRef.current = a;
    a.onended = () => {
      setBusy(null);
      URL.revokeObjectURL(url);
    };
    await a.play().catch(() => setBusy(null));
  };

  return (
    <Panel className="w-full max-w-[460px] p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-label-3">Teste de micro</span>
        <span className={`flex items-center gap-1.5 font-mono text-[11px] ${stream ? "text-red" : "text-label-3"}`}>
          <span className={`h-2 w-2 rounded-full ${stream ? "bg-red animate-rec" : "bg-fill-strong"}`} />
          {stream ? "Ao vivo" : "Desligado"}
        </span>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div className="font-mono text-[52px] font-medium leading-none tracking-tight tabular">
          {db === null ? "--" : db}
          <span className="ml-1 text-[16px] text-label-3">dBFS</span>
        </div>
        <Mic aria-hidden className={`mb-1 h-6 w-6 ${stream ? "text-accent-ink" : "text-label-3"}`} />
      </div>

      <LedMeter ref={meterRef} segments={28} className="mt-4 h-5" />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-label-3">
        <span>-60</span>
        <span>-30</span>
        <span>-12</span>
        <span>0</span>
      </div>

      <div className="mt-5 min-h-[44px] text-[15px]" aria-live="polite">
        {error ? (
          <p className="text-red">{error}</p>
        ) : !stream ? (
          <p className="text-label-2">Fala normalmente e vê se o teu micro está pronto para gravar.</p>
        ) : (
          <>
            <p className={voice ? toneClass[voice.tone] : "text-label-2"}>{voice ? voice.label : "Diz qualquer coisa…"}</p>
            {noise && (
              <p className={`mt-1 text-[13px] ${toneClass[noise.v.tone]}`}>
                Ruído de fundo {noise.db} dB. {noise.v.label}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {!stream ? (
          <Button variant="primary" onClick={start}>
            <Mic className="h-4 w-4" /> Testar o meu micro
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={measureNoise} disabled={!!busy}>
              <Waves className="h-4 w-4" /> {busy === "noise" ? "Silêncio 3 s…" : "Medir ruído"}
            </Button>
            <Button variant="secondary" size="sm" onClick={recordAndPlay} disabled={!!busy}>
              <Play className="h-4 w-4" /> {busy === "rec" ? "A gravar 5 s…" : busy === "play" ? "A tocar…" : "Gravar e ouvir"}
            </Button>
            <Button variant="plain" size="sm" onClick={stop}>
              <Square className="h-3.5 w-3.5" /> Parar
            </Button>
          </>
        )}
      </div>
      <p className="mt-4 text-[12px] text-label-3">O som fica só neste aparelho. Nada é enviado.</p>
    </Panel>
  );
}
