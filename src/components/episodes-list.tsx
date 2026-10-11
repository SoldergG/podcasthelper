"use client";

import { Captions, ChevronRight, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteEpisode, listEpisodes, storageEstimate } from "@/lib/db";
import { trackPeaks } from "@/lib/mix";
import { episodeDurationMs, trackOffsetMs, type Episode } from "@/lib/types";
import { formatBytes, formatDuration } from "@/lib/util";
import { Button, ProgressBar } from "./ui";

/** Every person's waveform stacked into one small strip. */
function MiniWave({ ep }: { ep: Episode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const c = ref.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const W = c.clientWidth;
      const H = c.clientHeight;
      c.width = W * dpr;
      c.height = H * dpr;
      const g = c.getContext("2d")!;
      g.scale(dpr, dpr);
      const total = Math.max(1, episodeDurationMs(ep));
      const audio = ep.tracks.filter((t) => t.kind === "audio" && t.complete);
      for (const t of audio) {
        const pk = await trackPeaks(t);
        if (!alive || !pk) continue;
        const color = ep.participants.find((p) => p.peerId === t.peerId)?.color || "#888";
        const offset = trackOffsetMs(ep, t, ep.edits);
        g.fillStyle = color;
        g.globalAlpha = 0.85;
        for (let x = 0; x < W; x++) {
          const ms = (x / W) * total - offset;
          const a = Math.floor((ms / 1000) * pk.perSecond);
          const b = Math.floor((((x + 1) / W) * total - offset) / 1000 * pk.perSecond);
          let m = 0;
          for (let i = Math.max(0, a); i < Math.min(pk.peaks.length, Math.max(a + 1, b)); i++) m = Math.max(m, pk.peaks[i]);
          if (m < 0.01) continue;
          const h = Math.max(1, Math.sqrt(m) * (H / 2 - 2));
          g.fillRect(x, H / 2 - h, 1, h * 2);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [ep]);
  return <canvas ref={ref} aria-hidden className="h-12 w-full rounded-[8px] bg-[#141417]" />;
}

export function EpisodesList() {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [query, setQuery] = useState("");

  const load = () => {
    listEpisodes().then(setEpisodes).catch(() => setEpisodes([]));
    storageEstimate().then(setStorage);
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!episodes || !q) return episodes;
    return episodes.filter((e) => e.title.toLowerCase().includes(q) || e.participants.some((p) => p.name.toLowerCase().includes(q)) || (e.notes || "").toLowerCase().includes(q));
  }, [episodes, query]);

  if (!episodes) {
    return (
      <div className="mt-10 space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-[14px] bg-fill" />
        ))}
      </div>
    );
  }

  const totalMs = episodes.reduce((n, e) => n + episodeDurationMs(e), 0);

  return (
    <>
      <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <dl className="flex flex-wrap gap-x-8 gap-y-4">
          <div>
            <dt className="text-[13px] text-label-3">Episódios</dt>
            <dd className="font-mono text-[24px] font-medium tabular">{episodes.length}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-label-3">Gravado</dt>
            <dd className="font-mono text-[24px] font-medium tabular">{formatDuration(totalMs)}</dd>
          </div>
          {storage && storage.quota > 0 && (
            <div className="min-w-44">
              <dt className="text-[13px] text-label-3">Espaço neste aparelho</dt>
              <dd className="mt-2">
                <ProgressBar value={storage.usage / storage.quota} />
                <span className="mt-1 block font-mono text-[12px] text-label-3 tabular">
                  {formatBytes(storage.usage)} de {formatBytes(storage.quota)}
                </span>
              </dd>
            </div>
          )}
        </dl>
        {episodes.length > 0 && (
          <label className="relative block md:w-72">
            <span className="sr-only">Procurar episódios</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-label-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Título, pessoa ou notas"
              className="h-11 w-full rounded-full border border-separator bg-elevated pr-4 pl-10 text-[15px] outline-none placeholder:text-label-3 focus:border-accent"
            />
          </label>
        )}
      </div>

      {episodes.length === 0 ? (
        <div className="mt-10 rounded-[14px] border border-dashed border-separator p-10 text-center">
          <p className="text-[18px] font-semibold">Ainda não há episódios neste aparelho</p>
          <p className="mx-auto mt-2 max-w-[44ch] text-[15px] text-label-2">
            Quando gravarem numa sala, o episódio aparece aqui com as faixas de todos. Se gravaste noutro aparelho, entra outra vez na mesma sala para as receber.
          </p>
          <Link href="/" className="mt-6 inline-block">
            <Button variant="accent">Criar sala</Button>
          </Link>
        </div>
      ) : filtered && filtered.length === 0 ? (
        <p className="mt-10 text-center text-[15px] text-label-3">Nenhum episódio com &quot;{query}&quot;.</p>
      ) : (
        <ul className="mt-8 divide-y divide-separator border-y border-separator">
          {filtered!.map((ep) => {
            const size = ep.tracks.reduce((n, t) => n + (t.complete ? t.size : 0), 0);
            const done = ep.tracks.filter((t) => t.complete).length;
            const missing = ep.tracks.length - done;
            return (
              <li key={ep.id} className="group grid items-center gap-4 py-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
                <Link href={`/estudio?e=${encodeURIComponent(ep.id)}`} className="min-w-0">
                  <p className="truncate text-[18px] font-semibold group-hover:text-accent-ink">{ep.title}</p>
                  <p className="mt-0.5 truncate text-[14px] text-label-2">
                    {new Date(ep.createdAt).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })} · {ep.participants.map((p) => p.name).join(", ")}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-label-3 tabular">
                    <span>{formatDuration(episodeDurationMs(ep))}</span>
                    <span>{formatBytes(size)}</span>
                    <span className={missing ? "text-orange" : ""}>{missing ? `faltam ${missing} faixas` : `${done} faixas`}</span>
                    {(ep.transcript?.length || 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Captions className="h-3 w-3" /> transcrição
                      </span>
                    )}
                  </p>
                </Link>
                <Link href={`/estudio?e=${encodeURIComponent(ep.id)}`} aria-hidden tabIndex={-1} className="hidden md:block">
                  <MiniWave ep={ep} />
                </Link>
                <div className="flex items-center gap-1">
                  <Link href={`/estudio?e=${encodeURIComponent(ep.id)}`} className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-[14px] font-medium hover:bg-fill">
                    Abrir <ChevronRight className="h-4 w-4" />
                  </Link>
                  <button
                    aria-label={`Apagar ${ep.title}`}
                    className="grid h-10 w-10 place-items-center rounded-full text-label-3 hover:bg-red-soft hover:text-red"
                    onClick={async () => {
                      if (!confirm(`Apagar "${ep.title}" deste aparelho? As gravações dos outros não são afetadas.`)) return;
                      await deleteEpisode(ep);
                      load();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
