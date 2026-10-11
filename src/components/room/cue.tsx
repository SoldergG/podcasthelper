"use client";

import { Megaphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Studio, StudioSnapshot } from "@/lib/studio";

export const CUE_PRESETS = [
  "Mais alto",
  "Aproxima-te do micro",
  "Fala mais devagar",
  "Vamos fechar este tema",
  "Pausa em 1 minuto",
  "Olha para a câmara",
  "Está a correr muito bem",
];

/** Small menu to send a signal to one person or everyone. */
export function CueMenu({ studio, to, label, compact = false }: { studio: Studio; to: string; label: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);
  const send = (text: string) => {
    if (!text.trim()) return;
    studio.sendCue(to, text.trim());
    setOpen(false);
    setCustom("");
  };
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={compact ? "key grid h-8 w-8 place-items-center rounded-[10px] text-label-2" : "inline-flex h-9 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[14px] font-medium hover:bg-fill-strong"}
      >
        <Megaphone className="h-4 w-4" />
        {!compact && "Sinal para todos"}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-[14px] border border-separator bg-elevated p-1.5 shadow-[var(--shadow)]">
          {CUE_PRESETS.map((c) => (
            <button key={c} role="menuitem" onClick={() => send(c)} className="block w-full rounded-[9px] px-3 py-2 text-left text-[14px] hover:bg-fill">
              {c}
            </button>
          ))}
          <form
            className="mt-1 flex gap-1 border-t border-separator p-1 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(custom);
            }}
          >
            <label htmlFor={`cue-${to}`} className="sr-only">
              Sinal personalizado
            </label>
            <input
              id={`cue-${to}`}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Outra mensagem"
              className="h-9 min-w-0 flex-1 rounded-[9px] border border-separator bg-bg px-2.5 text-[14px] outline-none focus:border-accent"
            />
            <button type="submit" className="h-9 rounded-[9px] bg-label px-3 text-[13px] font-medium text-bg">
              Enviar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Big banner on the recipient's screen. */
export function CueBanner({ studio, snap }: { studio: Studio; snap: StudioSnapshot }) {
  useEffect(() => {
    if (!snap.cue) return;
    const t = setTimeout(() => studio.clearCue(), 7000);
    return () => clearTimeout(t);
  }, [snap.cue, studio]);
  if (!snap.cue) return null;
  return (
    <button
      onClick={() => studio.clearCue()}
      className="fixed inset-x-4 top-20 z-50 mx-auto flex max-w-xl items-center gap-4 rounded-[20px] bg-accent px-6 py-5 text-left text-on-accent shadow-[0_20px_60px_rgba(0,0,0,0.3)]"
      role="alert"
    >
      <Megaphone className="h-8 w-8 shrink-0" />
      <span>
        <span className="block text-[13px] font-medium opacity-75">{snap.cue.from} diz</span>
        <span className="block text-[26px] font-semibold leading-tight tracking-tight">{snap.cue.text}</span>
      </span>
    </button>
  );
}
