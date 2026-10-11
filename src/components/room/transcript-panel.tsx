"use client";

import { Captions } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Studio, StudioSnapshot } from "@/lib/studio";
import { speechSupported } from "@/lib/transcribe";
import { hostToEp } from "@/lib/types";
import { formatDuration } from "@/lib/util";
import { Toggle } from "../ui";

export function TranscriptPanel({ studio, snap }: { studio: Studio; snap: StudioSnapshot }) {
  const listRef = useRef<HTMLDivElement>(null);
  const colorOf = (peerId: string) => (peerId === snap.self?.peerId ? snap.self.color : snap.peers.find((p) => p.info.peerId === peerId)?.info.color) || "var(--label-3)";
  const start = snap.rec.startHost;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [snap.transcript.length, snap.interim]);

  const supported = speechSupported();
  return (
    <div className="flex h-full min-h-72 flex-col">
      {!snap.director && (
        <div className="mb-3 rounded-[14px] bg-grouped px-4 py-1">
          <Toggle
            label="Transcrever a minha voz"
            hint={
              supported
                ? "Usa o serviço de voz do navegador (o áudio passa pelo Google ou pela Apple). Só a tua voz, só enquanto gravam."
                : "Este navegador não tem reconhecimento de voz. Usa o Chrome, o Edge ou a app Android."
            }
            checked={snap.settings.transcribe}
            disabled={!supported}
            onChange={(v) => studio.applySettings({ ...snap.settings, transcribe: v })}
          />
        </div>
      )}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {snap.transcript.length === 0 && !snap.interim && (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-[14px] text-label-3">
            <Captions className="h-6 w-6" />
            <p className="max-w-[30ch]">O texto de quem tiver a transcrição ligada aparece aqui enquanto gravam. Fica guardado com o episódio.</p>
          </div>
        )}
        {snap.transcript.map((l) => (
          <div key={l.id} className="grid grid-cols-[auto_1fr] gap-x-3">
            <span className="pt-0.5 font-mono text-[11px] text-label-3 tabular">{start ? formatDuration(hostToEp({ startHost: start, pauses: snap.rec.pauses }, l.t)) : ""}</span>
            <p className="text-[14px] leading-relaxed">
              <span className="mr-1.5 font-semibold" style={{ color: colorOf(l.peerId) }}>
                {l.name}
              </span>
              {l.text}
            </p>
          </div>
        ))}
        {snap.interim && (
          <p className="pl-12 text-[14px] italic text-label-3">
            {snap.self?.name}: {snap.interim}
          </p>
        )}
      </div>
    </div>
  );
}
