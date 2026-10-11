"use client";

import {
  ArrowLeft,
  Bookmark,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  RotateCw,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layout } from "@/lib/compositor";
import { getEpisode, updateEpisode, type PeaksRecord } from "@/lib/db";
import { trackPeaks } from "@/lib/mix";
import { PreviewPlayer } from "@/lib/preview";
import { buildSegments, editsOf, outputDuration, srcToOut } from "@/lib/timeline";
import { episodeDurationMs, type Episode, type EpisodeEdits, type TrackEdit } from "@/lib/types";
import { formatDuration, randomId } from "@/lib/util";
import { Button, Card, Segmented, Toggle } from "../ui";
import { ExportPanel } from "./export-panel";
import { Timeline, type Selection } from "./timeline";
import { TrackPanel } from "./track-panel";

export function EditorScreen() {
  const params = useSearchParams();
  const id = params.get("e") || "";
  const [ep, setEp] = useState<Episode | null | undefined>(undefined);

  useEffect(() => {
    if (!id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEp(null);
      return;
    }
    getEpisode(id).then((e) => setEp(e || null));
  }, [id]);

  if (ep === undefined) return <div className="flex-1 p-10 text-label-3">A abrir…</div>;
  if (ep === null)
    return (
      <main className="mx-auto max-w-md flex-1 px-4 py-20 text-center">
        <h1 className="text-[28px] font-semibold">Episódio não encontrado</h1>
        <p className="mt-2 text-label-2">Não está guardado neste aparelho.</p>
        <Link href="/episodios" className="mt-6 inline-block">
          <Button>Ver episódios</Button>
        </Link>
      </main>
    );
  return <Editor initial={ep} />;
}

type Tab = "people" | "notes" | "export";

function Editor({ initial }: { initial: Episode }) {
  const [ep, setEp] = useState(initial);
  const [edits, setEditsState] = useState<EpisodeEdits>(() => editsOf(initial));
  const [history, setHistory] = useState<{ past: EpisodeEdits[]; future: EpisodeEdits[] }>({ past: [], future: [] });
  const [player, setPlayer] = useState<PreviewPlayer | null>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [peaks, setPeaks] = useState<Record<string, PeaksRecord | null>>({});
  const [tab, setTab] = useState<Tab>("people");
  const [person, setPerson] = useState(initial.participants[0]?.peerId || "");
  const [layout, setLayout] = useState<Layout>("grid");
  const [saved, setSaved] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ ep, edits });
  useEffect(() => {
    latest.current = { ep, edits };
  });

  const duration = episodeDurationMs(ep);
  const segs = useMemo(() => buildSegments(ep, edits), [ep, edits]);
  const finalDuration = outputDuration(segs);

  // Refresh tracks that arrive while the editor is open.
  useEffect(() => {
    const t = setInterval(async () => {
      const fresh = await getEpisode(initial.id);
      if (fresh && fresh.tracks.filter((x) => x.complete).length !== latest.current.ep.tracks.filter((x) => x.complete).length) {
        setEp((cur) => ({ ...fresh, edits: cur.edits, notes: cur.notes }));
      }
    }, 4000);
    return () => clearInterval(t);
  }, [initial.id]);

  // Player lifecycle (rebuilt when the set of complete tracks changes)
  const completeKey = ep.tracks.filter((t) => t.complete).map((t) => t.id).join("|");
  useEffect(() => {
    const p = new PreviewPlayer(latest.current.ep, latest.current.edits);
    let alive = true;
    p.load().then(() => {
      if (!alive) return;
      p.attachCanvas(canvasRef.current);
      setPlayer(p);
    });
    const off = p.onTime((t, pl) => {
      setCurrent(t);
      setPlaying(pl);
    });
    return () => {
      alive = false;
      off();
      p.dispose();
    };
  }, [completeKey]);

  useEffect(() => {
    player?.setEdits(edits);
  }, [player, edits]);
  useEffect(() => {
    player?.setLayout(layout);
  }, [player, layout]);

  // Peaks
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const t of ep.tracks) {
        if (t.kind !== "audio" || !t.complete) continue;
        const pk = await trackPeaks(t);
        if (!alive) return;
        setPeaks((cur) => (cur[t.id] ? cur : { ...cur, [t.id]: pk }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [completeKey, ep.tracks]);

  // ---------- persistence ----------
  const persist = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const { ep: e, edits: ed } = latest.current;
    const updated = await updateEpisode(e.id, (cur) => {
      if (!cur) return cur;
      cur.edits = ed;
      cur.title = e.title;
      cur.notes = e.notes;
      cur.notesUpdatedAt = e.notesUpdatedAt;
      cur.markers = e.markers;
      return cur;
    });
    setSaved(true);
    return updated || e;
  }, []);

  const schedulePersist = useCallback(() => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, 600);
  }, [persist]);

  const setEdits = useCallback(
    (fn: (e: EpisodeEdits) => EpisodeEdits, record = true) => {
      setEditsState((cur) => {
        const next = fn(cur);
        if (record) setHistory((h) => ({ past: [...h.past.slice(-80), cur], future: [] }));
        return next;
      });
      schedulePersist();
    },
    [schedulePersist],
  );

  const patchEp = (patch: Partial<Episode>) => {
    setEp((cur) => ({ ...cur, ...patch }));
    schedulePersist();
  };

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      setEditsState((cur) => {
        setTimeout(() => setHistory((hh) => ({ ...hh, future: [cur, ...hh.future] })), 0);
        return prev;
      });
      schedulePersist();
      return { ...h, past: h.past.slice(0, -1) };
    });
  }, [schedulePersist]);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (!h.future.length) return h;
      const next = h.future[0];
      setEditsState((cur) => {
        setTimeout(() => setHistory((hh) => ({ ...hh, past: [...hh.past, cur] })), 0);
        return next;
      });
      schedulePersist();
      return { ...h, future: h.future.slice(1) };
    });
  }, [schedulePersist]);

  // ---------- actions ----------
  const seek = useCallback((ms: number) => player?.seek(ms), [player]);
  const cutSelection = useCallback(() => {
    if (!selection || selection.end - selection.start < 50) return;
    setEdits((e) => ({ ...e, cuts: [...e.cuts, { id: randomId(6), start: selection.start, end: selection.end }] }));
    setSelection(null);
  }, [selection, setEdits]);
  const restoreSelection = () => {
    if (!selection) return;
    setEdits((e) => ({ ...e, cuts: e.cuts.filter((c) => Math.max(c.start, c.end) <= selection.start || Math.min(c.start, c.end) >= selection.end) }));
    setSelection(null);
  };
  const updateTrack = (peerId: string, patch: Partial<TrackEdit>) =>
    setEdits((e) => ({ ...e, tracks: { ...e.tracks, [peerId]: { ...(e.tracks[peerId] || {}), ...patch } as TrackEdit } }));
  const addMarker = () => {
    const label = prompt("Nome do marcador", `Marcador ${ep.markers.length + 1}`);
    if (label === null) return;
    patchEp({ markers: [...ep.markers, { id: randomId(8), t: ep.startHost + current, by: "editor", label }] });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        player?.toggle();
      } else if (e.key === "ArrowLeft") player?.seek(current - (e.shiftKey ? 1000 : 5000));
      else if (e.key === "ArrowRight") player?.seek(current + (e.shiftKey ? 1000 : 5000));
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "x" || e.key === "Delete" || e.key === "Backspace") cutSelection();
      else if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, current, undo, redo, cutSelection]);

  // Flush on leave
  useEffect(() => () => void persist(), [persist]);

  const outNow = srcToOut(segs, current);

  return (
    <>
      <header className="glass sticky top-0 z-30 border-b border-separator">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/episodios" aria-label="Voltar aos episódios" className="grid h-9 w-9 place-items-center rounded-full hover:bg-fill">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <input
            aria-label="Título do episódio"
            value={ep.title}
            onChange={(e) => patchEp({ title: e.target.value })}
            className="min-w-0 flex-1 rounded-[8px] bg-transparent px-2 py-1 text-[17px] font-semibold outline-none hover:bg-fill focus:bg-fill"
          />
          <span className="shrink-0 text-[12px] text-label-3">{saved ? "Guardado" : "A guardar…"}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-3">
            <Card className="overflow-hidden p-0">
              <canvas ref={canvasRef} width={1280} height={720} className="block aspect-video w-full bg-grouped" />
            </Card>
            {/* Transport */}
            <div className="flex flex-wrap items-center gap-2">
              <button aria-label="Recuar 5 segundos" onClick={() => seek(current - 5000)} className="grid h-11 w-11 place-items-center rounded-full bg-elevated shadow-[var(--shadow)]">
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                aria-label={playing ? "Pausa" : "Reproduzir"}
                onClick={() => player?.toggle()}
                disabled={!player}
                className="grid h-12 w-12 place-items-center rounded-full bg-label text-bg shadow-[var(--shadow)] disabled:opacity-40"
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
              </button>
              <button aria-label="Avançar 5 segundos" onClick={() => seek(current + 5000)} className="grid h-11 w-11 place-items-center rounded-full bg-elevated shadow-[var(--shadow)]">
                <SkipForward className="h-4 w-4" />
              </button>
              <div className="ml-1 tabular text-[14px]">
                <span className="font-semibold">{formatDuration(current, true)}</span>
                <span className="text-label-3"> / {formatDuration(duration)}</span>
                <span className="ml-2 hidden text-[12px] text-label-3 sm:inline">
                  final {outNow !== null ? formatDuration(outNow) : "—"} de {formatDuration(finalDuration)}
                </span>
              </div>
              <div className="ml-auto w-full sm:w-64">
                <Segmented label="Disposição" value={layout} onChange={setLayout} options={[{ value: "grid", label: "Grelha" }, { value: "speaker", label: "Quem fala" }]} />
              </div>
            </div>
            {/* Edit tools */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEdits((e) => ({ ...e, trimStart: Math.min(current, e.trimEnd ?? duration) }))}>
                <RotateCcw className="h-3.5 w-3.5" /> Começar aqui
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEdits((e) => ({ ...e, trimEnd: Math.max(current, e.trimStart) }))}>
                <RotateCw className="h-3.5 w-3.5" /> Acabar aqui
              </Button>
              <Button size="sm" variant={selection ? "primary" : "secondary"} disabled={!selection} onClick={cutSelection}>
                <Scissors className="h-3.5 w-3.5" /> Cortar seleção
              </Button>
              {selection && edits.cuts.some((c) => Math.max(c.start, c.end) > selection.start && Math.min(c.start, c.end) < selection.end) && (
                <Button size="sm" variant="secondary" onClick={restoreSelection}>
                  Repor parte cortada
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={addMarker}>
                <Bookmark className="h-3.5 w-3.5" /> Marcador
              </Button>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="secondary" onClick={undo} disabled={!history.past.length} aria-label="Desfazer">
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="secondary" onClick={redo} disabled={!history.future.length} aria-label="Refazer">
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
                {(edits.cuts.length > 0 || edits.trimStart > 0 || edits.trimEnd !== null) && (
                  <Button
                    size="sm"
                    variant="plain"
                    onClick={() => {
                      if (confirm("Remover todos os cortes e o início/fim?")) setEdits((e) => ({ ...e, cuts: [], trimStart: 0, trimEnd: null }));
                    }}
                  >
                    Repor tudo
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="min-w-0">
            <Segmented
              label="Painel"
              value={tab}
              onChange={setTab}
              options={[
                { value: "people", label: "Pessoas" },
                { value: "notes", label: "Notas" },
                { value: "export", label: "Exportar" },
              ]}
            />
            <Card className="mt-3 max-h-[calc(100dvh-160px)] overflow-y-auto p-4">
              {tab === "people" && (
                <>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {ep.participants.map((p) => (
                      <button
                        key={p.peerId}
                        onClick={() => setPerson(p.peerId)}
                        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-medium ${person === p.peerId ? "bg-label text-bg" : "bg-fill"}`}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                  {person && <TrackPanel ep={ep} edits={edits} peerId={person} current={current} onChange={(patch) => updateTrack(person, patch)} />}
                </>
              )}
              {tab === "notes" && (
                <div>
                  <textarea
                    aria-label="Notas do episódio"
                    value={ep.notes || ""}
                    onChange={(e) => patchEp({ notes: e.target.value, notesUpdatedAt: Date.now() })}
                    placeholder="Notas do episódio, descrição, links…"
                    className="min-h-48 w-full resize-y rounded-[14px] bg-grouped p-3.5 text-[15px] leading-relaxed outline-none focus:ring-3 focus:ring-accent/30"
                  />
                  <h3 className="mt-4 text-[13px] font-semibold text-label-2">Marcadores</h3>
                  {ep.markers.length === 0 ? (
                    <p className="mt-1 text-[13px] text-label-3">Sem marcadores. Usa o botão Marcador ou marca momentos durante a gravação.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {[...ep.markers]
                        .sort((a, b) => a.t - b.t)
                        .map((m) => (
                          <li key={m.id} className="flex items-center gap-2">
                            <button onClick={() => seek(m.t - ep.startHost)} className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-1.5 py-1 text-left text-[14px] hover:bg-fill">
                              <span className="tabular rounded-md bg-[#FF9500]/15 px-1.5 py-0.5 text-[12px] font-semibold text-orange">{formatDuration(m.t - ep.startHost)}</span>
                              <span className="truncate">{m.label}</span>
                            </button>
                            <button
                              aria-label={`Apagar marcador ${m.label}`}
                              onClick={() => patchEp({ markers: ep.markers.filter((x) => x.id !== m.id) })}
                              className="grid h-8 w-8 place-items-center rounded-full text-label-3 hover:text-red"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              )}
              {tab === "export" && (
                <>
                  <div className="mb-4 rounded-[14px] bg-grouped px-4 py-1">
                    <Toggle label="Normalizar volume (-16 LUFS)" hint="Padrão do Spotify e Apple Podcasts." checked={edits.loudness} onChange={(v) => setEdits((e) => ({ ...e, loudness: v }))} />
                  </div>
                  <ExportPanel ep={{ ...ep, edits }} beforeExport={persist} />
                </>
              )}
            </Card>
          </div>
        </div>

        <Timeline
          ep={ep}
          edits={edits}
          duration={duration}
          current={current}
          peaks={peaks}
          selection={selection}
          onSelect={setSelection}
          onSeek={seek}
          onToggle={(peerId, key) =>
            setEdits((e) => {
              const cur = e.tracks[peerId] || ({} as TrackEdit);
              return { ...e, tracks: { ...e.tracks, [peerId]: { ...cur, [key]: !cur[key] } as TrackEdit } };
            })
          }
          onOpenTrack={(peerId) => {
            setPerson(peerId);
            setTab("people");
          }}
        />
        <p className="pb-6 text-center text-[12px] text-label-3">
          Atalhos: espaço reproduzir · ← → 5 s · X cortar seleção · ⌘Z desfazer
        </p>
      </main>
    </>
  );
}
