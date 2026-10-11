"use client";

import { CheckCircle2, Film, Mic } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getEpisode } from "@/lib/db";
import type { TransferProgress } from "@/lib/transfer";
import type { Episode } from "@/lib/types";
import { formatBytes } from "@/lib/util";
import { Button, Card, ProgressBar } from "../ui";

export function EpisodeStatus({ episodeId, transfers }: { episodeId: string; transfers: TransferProgress[] }) {
  const [ep, setEp] = useState<Episode | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => getEpisode(episodeId).then((e) => alive && setEp(e || null));
    load();
    const t = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [episodeId]);

  if (!ep) return null;

  const tracks = [...ep.tracks].sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
  const allDone = tracks.length > 0 && tracks.every((t) => t.complete);
  const sending = transfers.filter((t) => t.direction === "send" && !t.done && !t.error && t.trackId.startsWith(episodeId));

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">{ep.title}</h2>
          <p className="text-[13px] text-label-3">
            {allDone ? "Tens tudo neste aparelho." : "A juntar as gravações de todos…"}
          </p>
        </div>
        <Link href={`/estudio?e=${encodeURIComponent(ep.id)}`}>
          <Button size="sm" variant={allDone ? "primary" : "secondary"}>
            Abrir no editor
          </Button>
        </Link>
      </div>
      <ul className="mt-4 space-y-3">
        {tracks.map((t) => {
          const recv = transfers.find((x) => x.direction === "recv" && x.trackId === t.id);
          const Icon = t.kind === "audio" ? Mic : Film;
          const progress = t.complete ? 1 : recv ? recv.bytes / Math.max(1, recv.total) : 0;
          return (
            <li key={t.id} className="flex items-center gap-3">
              <Icon aria-hidden className="h-4 w-4 shrink-0 text-label-3" />
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-[14px]">
                  <span className="truncate">
                    {t.name} · {t.kind === "audio" ? "áudio" : "vídeo"}
                    {t.local ? " (deste aparelho)" : ""}
                  </span>
                  <span className="shrink-0 text-[12px] text-label-3 tabular">
                    {t.complete ? (
                      <span className="inline-flex items-center gap-1 text-green">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {formatBytes(t.size)}
                      </span>
                    ) : recv?.error ? (
                      <span className="text-red">falhou, a tentar de novo</span>
                    ) : recv ? (
                      `${Math.round(progress * 100)}%`
                    ) : (
                      "à espera"
                    )}
                  </span>
                </div>
                {!t.complete && <div className="mt-1.5"><ProgressBar value={progress} /></div>}
              </div>
            </li>
          );
        })}
      </ul>
      {sending.length > 0 && (
        <p className="mt-4 text-[13px] text-label-3">
          A enviar as tuas gravações para {new Set(sending.map((s) => s.peerId)).size} pessoa(s). Não feches esta página.
        </p>
      )}
    </Card>
  );
}
