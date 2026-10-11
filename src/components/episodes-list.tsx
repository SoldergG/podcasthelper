"use client";

import { ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteEpisode, listEpisodes, storageEstimate } from "@/lib/db";
import { episodeDurationMs, type Episode } from "@/lib/types";
import { formatBytes, formatDuration } from "@/lib/util";
import { Button, Card, ProgressBar } from "./ui";

export function EpisodesList() {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  const load = () => {
    listEpisodes().then(setEpisodes).catch(() => setEpisodes([]));
    storageEstimate().then(setStorage);
  };
  useEffect(load, []);

  if (!episodes) return <p className="mt-8 text-label-3">A carregar…</p>;

  return (
    <>
      {storage && storage.quota > 0 && (
        <div className="mt-6 max-w-sm">
          <div className="mb-1.5 flex justify-between text-[13px] text-label-3">
            <span>Espaço usado</span>
            <span className="tabular">
              {formatBytes(storage.usage)} de {formatBytes(storage.quota)}
            </span>
          </div>
          <ProgressBar value={storage.usage / storage.quota} />
        </div>
      )}
      {episodes.length === 0 ? (
        <Card className="mt-8 p-8 text-center">
          <p className="text-[17px] font-medium">Ainda não há episódios</p>
          <p className="mt-1 text-[15px] text-label-2">Cria uma sala e grava. As gravações ficam aqui.</p>
          <Link href="/" className="mt-5 inline-block">
            <Button>Criar sala</Button>
          </Link>
        </Card>
      ) : (
        <ul className="mt-8 space-y-3">
          {episodes.map((ep) => {
            const size = ep.tracks.reduce((n, t) => n + (t.complete ? t.size : 0), 0);
            const done = ep.tracks.filter((t) => t.complete).length;
            return (
              <li key={ep.id}>
                <Card className="flex items-center gap-3 p-4 sm:p-5">
                  <Link href={`/estudio?e=${encodeURIComponent(ep.id)}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <div className="flex -space-x-2">
                      {ep.participants.slice(0, 4).map((p) => (
                        <span
                          key={p.peerId}
                          className="grid h-9 w-9 place-items-center rounded-full border-2 border-elevated text-[14px] font-semibold text-white"
                          style={{ background: p.color }}
                          title={p.name}
                        >
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold">{ep.title}</p>
                      <p className="truncate text-[13px] text-label-3">
                        {new Date(ep.createdAt).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                        {formatDuration(episodeDurationMs(ep))} · {ep.participants.map((p) => p.name).join(", ")}
                      </p>
                      <p className="text-[13px] text-label-3 tabular">
                        {done}/{ep.tracks.length} faixas neste aparelho · {formatBytes(size)}
                      </p>
                    </div>
                    <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-label-3" />
                  </Link>
                  <button
                    aria-label={`Apagar ${ep.title}`}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-label-3 hover:bg-red-soft hover:text-red"
                    onClick={async () => {
                      if (!confirm(`Apagar "${ep.title}" deste aparelho? As gravações dos outros não são afetadas.`)) return;
                      await deleteEpisode(ep);
                      load();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
