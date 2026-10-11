"use client";

import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MicAnalyser, rateVoice } from "@/lib/checks";
import { LedMeter, type LedMeterHandle } from "../ui";

/** Always-on mic level under the lobby preview: you see right away that the mic works. */
export function LobbyMeter({ stream }: { stream: MediaStream | null }) {
  const meter = useRef<LedMeterHandle>(null);
  const [hint, setHint] = useState<{ label: string; tone: "good" | "ok" | "bad" } | null>(null);
  useEffect(() => {
    if (!stream?.getAudioTracks().length) return;
    const an = new MicAnalyser(stream);
    let raf = 0;
    let last = 0;
    const peaks: number[] = [];
    const loop = (t: number) => {
      const r = an.read();
      meter.current?.set((r.peakDb + 60) / 60);
      if (t - last > 400) {
        last = t;
        peaks.push(r.peakDb);
        if (peaks.length > 10) peaks.shift();
        const loud = Math.max(...peaks);
        setHint(loud > -45 ? rateVoice(loud) : null);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      an.dispose();
    };
  }, [stream]);
  const tone = hint?.tone === "good" ? "text-green" : hint?.tone === "bad" ? "text-red" : "text-label-2";
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-separator bg-panel px-4 py-3">
      <Mic aria-hidden className="h-4 w-4 shrink-0 text-label-3" />
      <LedMeter ref={meter} segments={24} className="h-3 flex-1" />
      <span className={`w-48 shrink-0 text-right text-[13px] ${tone}`} aria-live="polite">
        {hint ? hint.label : "Diz qualquer coisa para testar"}
      </span>
    </div>
  );
}
