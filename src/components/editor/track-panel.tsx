"use client";

import { Play, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cleanupPreview } from "@/lib/mix";
import { trackEdit } from "@/lib/timeline";
import type { AudioCleanup, Episode, EpisodeEdits, TrackEdit } from "@/lib/types";
import { Button, Toggle } from "../ui";

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-[14px]">
        <span>{label}</span>
        <span className="tabular text-label-3">{format(value)}</span>
      </span>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const PRESETS: { id: string; label: string; hint: string; cleanup: AudioCleanup }[] = [
  { id: "off", label: "Original", hint: "Sem processamento", cleanup: { highpass: false, denoise: 0, voiceFocus: false, compress: false } },
  { id: "light", label: "Limpeza leve", hint: "Tira graves e um pouco de ruído", cleanup: { highpass: true, denoise: 0.35, voiceFocus: false, compress: false } },
  { id: "podcast", label: "Voz de podcast", hint: "Menos ruído e voz mais estável", cleanup: { highpass: true, denoise: 0.55, voiceFocus: false, compress: true } },
  { id: "focus", label: "Só a voz", hint: "Corta tudo o que não é esta pessoa a falar", cleanup: { highpass: true, denoise: 0.7, voiceFocus: true, compress: true } },
];

export function TrackPanel({
  ep,
  edits,
  peerId,
  current,
  onChange,
}: {
  ep: Episode;
  edits: EpisodeEdits;
  peerId: string;
  current: number;
  onChange: (patch: Partial<TrackEdit>) => void;
}) {
  const te = trackEdit(edits, peerId);
  const person = ep.participants.find((p) => p.peerId === peerId);
  const audio = ep.tracks.find((t) => t.peerId === peerId && t.kind === "audio" && t.complete);
  const video = ep.tracks.find((t) => t.peerId === peerId && t.kind === "video");
  const [ab, setAb] = useState<"idle" | "loading" | "before" | "after">("idle");
  const [clips, setClips] = useState<{ before: string; after: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const setCleanup = (patch: Partial<AudioCleanup>) => {
    setClips(null);
    onChange({ cleanup: { ...te.cleanup, ...patch } });
  };

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );
  useEffect(() => {
    return () => {
      if (clips) {
        URL.revokeObjectURL(clips.before);
        URL.revokeObjectURL(clips.after);
      }
    };
  }, [clips]);

  const playAb = async (which: "before" | "after") => {
    if (!audio) return;
    audioRef.current?.pause();
    if (ab === which) {
      setAb("idle");
      return;
    }
    let c = clips;
    if (!c) {
      setAb("loading");
      const res = await cleanupPreview(ep, audio, te.cleanup, current);
      c = { before: URL.createObjectURL(res.before), after: URL.createObjectURL(res.after) };
      setClips(c);
    }
    const el = new Audio(which === "before" ? c.before : c.after);
    el.volume = Math.min(1, te.gain);
    el.onended = () => setAb("idle");
    audioRef.current = el;
    await el.play();
    setAb(which);
  };

  const activePreset = PRESETS.find((p) => JSON.stringify(p.cleanup) === JSON.stringify(te.cleanup))?.id;

  if (!person) return null;
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-label-3">Som</h3>
        <Slider label="Volume" value={te.gain} min={0} max={2} step={0.01} format={(v) => `${v >= 1 ? "+" : ""}${(20 * Math.log10(Math.max(0.001, v))).toFixed(1)} dB`} onChange={(v) => onChange({ gain: v })} />
        <div className="mt-2 rounded-[14px] bg-grouped px-4 py-1">
          <Toggle label="Silenciar" checked={te.muted} onChange={(v) => onChange({ muted: v })} />
          <div className="h-px bg-separator" />
          <Toggle label="Solo (ouvir só esta pessoa)" checked={te.solo} onChange={(v) => onChange({ solo: v })} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-label-3">
          <Sparkles className="h-3.5 w-3.5" /> Limpeza de áudio
        </h3>
        {!audio ? (
          <p className="text-[14px] text-label-3">O áudio desta pessoa ainda não está neste aparelho.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setCleanup(p.cleanup)}
                  className={`rounded-[14px] p-3 text-left transition ${activePreset === p.id ? "bg-accent text-white" : "bg-grouped hover:bg-fill"}`}
                >
                  <span className="block text-[14px] font-semibold">{p.label}</span>
                  <span className={`block text-[12px] ${activePreset === p.id ? "text-white/80" : "text-label-3"}`}>{p.hint}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-3">
              <Slider label="Redução de ruído" value={te.cleanup.denoise} min={0} max={1} step={0.05} format={(v) => (v === 0 ? "Desligada" : `${Math.round(v * 100)}%`)} onChange={(v) => setCleanup({ denoise: v })} />
              <div className="rounded-[14px] bg-grouped px-4 py-1">
                <Toggle label="Foco na voz" hint="Silencia ruído de fundo e o som de outros que entra neste micro quando esta pessoa não fala." checked={te.cleanup.voiceFocus} onChange={(v) => setCleanup({ voiceFocus: v })} />
                <div className="h-px bg-separator" />
                <Toggle label="Cortar graves" hint="Tira zumbidos, vento e pancadas na mesa." checked={te.cleanup.highpass} onChange={(v) => setCleanup({ highpass: v })} />
                <div className="h-px bg-separator" />
                <Toggle label="Compressor" hint="Iguala partes altas e baixas da voz." checked={te.cleanup.compress} onChange={(v) => setCleanup({ compress: v })} />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => playAb("before")} disabled={ab === "loading"}>
                {ab === "before" ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Antes
              </Button>
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => playAb("after")} disabled={ab === "loading"}>
                {ab === "after" ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} {ab === "loading" ? "A processar…" : "Depois"}
              </Button>
            </div>
            <p className="mt-2 text-[12px] text-label-3">
              Ouve 8 segundos a partir da posição atual. A pré-visualização principal toca o original; a limpeza aplica-se ao exportar.
            </p>
          </>
        )}
      </section>

      {video && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-label-3">Imagem</h3>
          <div className="space-y-2">
            <Slider label="Brilho" value={te.brightness} min={0.5} max={1.5} step={0.01} format={(v) => `${Math.round((v - 1) * 100)}`} onChange={(v) => onChange({ brightness: v })} />
            <Slider label="Contraste" value={te.contrast} min={0.5} max={1.5} step={0.01} format={(v) => `${Math.round((v - 1) * 100)}`} onChange={(v) => onChange({ contrast: v })} />
            <Slider label="Saturação" value={te.saturation} min={0} max={2} step={0.01} format={(v) => `${Math.round((v - 1) * 100)}`} onChange={(v) => onChange({ saturation: v })} />
            <Slider label="Aproximar" value={te.zoom} min={1} max={2} step={0.01} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => onChange({ zoom: v })} />
          </div>
          <div className="mt-2 rounded-[14px] bg-grouped px-4 py-1">
            <Toggle label="Espelhar" checked={te.mirror} onChange={(v) => onChange({ mirror: v })} />
          </div>
          <Button
            variant="plain"
            size="sm"
            className="mt-2"
            onClick={() => onChange({ brightness: 1, contrast: 1, saturation: 1, zoom: 1, mirror: false })}
          >
            Repor imagem
          </Button>
        </section>
      )}
    </div>
  );
}
