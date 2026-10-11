"use client";

import {
  ArrowLeft,
  Bookmark,
  Camera,
  Captions,
  Copy,
  ListOrdered,
  SlidersHorizontal,
  WandSparkles,
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
import { episodeDurationMs, hostToEp, markerMs, type Episode, type EpisodeEdits, type TrackEdit } from "@/lib/types";
import { chaptersText, equalizeGains, findSilences } from "@/lib/editor-tools";
import { saveFile } from "@/lib/save";
import { toSrt } from "@/lib/transcribe";
import { formatDuration, randomId, slugify } from "@/lib/util";
import { Button, Segmented, Toggle } from "../ui";
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

type Tab = "people" | "text" | "notes" | "export";

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
  const [toolBusy, setToolBusy] = useState<string | null>(null);
  const [toolNote, setToolNote] = useState<string | null>(null);
  const removeSilences = async () => {
    setToolBusy("silence");
    const cuts = await findSilences(ep, edits);
    setToolBusy(null);
    if (!cuts.length) {
      setToolNote("Não encontrei silêncios longos (mais de 2,5 s).");
      return;
    }
    const saved = cuts.reduce((n, c) => n + (c.end - c.start), 0);
    setEdits((e) => ({ ...e, cuts: [...e.cuts, ...cuts] }));
    setToolNote(`Cortei ${cuts.length} silêncios (${formatDuration(saved)} no total). Podes desfazer com ⌘Z.`);
  };
  const equalize = async () => {
    setToolBusy("eq");
    const gains = await equalizeGains(ep);
    setToolBusy(null);
    setEdits((e) => {
      const tracks = { ...e.tracks };
      for (const [peerId, gain] of Object.entries(gains)) tracks[peerId] = { ...(tracks[peerId] || {}), gain } as TrackEdit;
      return { ...e, tracks };
    });
    setToolNote("Volumes igualados: todos falam ao mesmo nível.");
  };
  const saveFrame = () => {
    canvasRef.current?.toBlob(async (b) => {
      if (!b) return;
      const where = await saveFile(b, `${slugify(ep.title)}-${Math.round(current / 1000)}s.png`);
      setToolNote(`Imagem guardada em ${where}.`);
    }, "image/png");
  };
  const copyChapters = async () => {
    try {
      await navigator.clipboard.writeText(chaptersText(ep, edits));
      setToolNote("Capítulos copiados. Cola na descrição do YouTube.");
    } catch {
      setToolNote(chaptersText(ep, edits));
    }
  };

  const addMarker = () => {
    const label = prompt("Nome do marcador", `Marcador ${ep.markers.length + 1}`);
    if (label === null) return;
    patchEp({ markers: [...ep.markers, { id: randomId(8), t: ep.startHost + current, ms: current, by: "editor", label }] });
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

  const transcriptLines = (ep.transcript || []).map((l, i, all) => {
    const ms = hostToEp(ep, l.t);
    const next = all[i + 1];
    return { ...l, ms, end: next ? Math.min(hostToEp(ep, next.t), ms + 8000) : ms + 5000 };
  });
  const downloadSrt = async () => {
    const lines = transcriptLines
      .map((l) => ({ ...l, out: srcToOut(segs, l.ms), outEnd: srcToOut(segs, l.end) }))
      .filter((l) => l.out !== null)
      .map((l) => ({ ms: l.out!, end: Math.max(l.out! + 800, l.outEnd ?? l.out! + 3000), name: l.name, text: l.text }));
    const where = await saveFile(new Blob([toSrt(lines)], { type: "application/x-subrip" }), `${slugify(ep.title)}.srt`);
    setToolNote(`Legendas guardadas em ${where}.`);
  };

  const toolButton = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-medium text-label transition hover:bg-fill-strong disabled:opacity-40";

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="glass z-30 shrink-0 border-b border-separator">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/episodios" aria-label="Voltar aos episódios" className="grid h-9 w-9 place-items-center rounded-full hover:bg-fill">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <input
            aria-label="Título do episódio"
            value={ep.title}
            onChange={(e) => patchEp({ title: e.target.value })}
            className="min-w-0 flex-1 rounded-[8px] bg-transparent px-2 py-1 text-[17px] font-semibold outline-none hover:bg-fill focus:bg-fill"
          />
          <span className="hidden font-mono text-[12px] text-label-3 tabular sm:inline">
            final {formatDuration(finalDuration)} de {formatDuration(duration)}
          </span>
          <span className="shrink-0 text-[12px] text-label-3">{saved ? "Guardado" : "A guardar…"}</span>
          <Button size="sm" variant="accent" onClick={() => setTab("export")}>
            Exportar
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Preview */}
          <div className="flex min-h-[220px] flex-1 items-center justify-center bg-[#121214] p-3 sm:p-4">
            <canvas ref={canvasRef} width={1280} height={720} className="block aspect-video max-h-full w-full max-w-full rounded-[10px] object-contain lg:w-auto" />
          </div>

          {/* Transport */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-separator bg-panel px-3 py-2.5 sm:px-4">
            <button aria-label="Recuar 5 segundos" onClick={() => seek(current - 5000)} className="key grid h-10 w-10 place-items-center rounded-[12px]">
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              aria-label={playing ? "Pausa" : "Reproduzir"}
              onClick={() => player?.toggle()}
              disabled={!player}
              className="grid h-11 w-11 place-items-center rounded-[12px] bg-accent text-on-accent shadow-[var(--key-shadow)] disabled:opacity-40"
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-[1px]" />}
            </button>
            <button aria-label="Avançar 5 segundos" onClick={() => seek(current + 5000)} className="key grid h-10 w-10 place-items-center rounded-[12px]">
              <SkipForward className="h-4 w-4" />
            </button>
            <div className="ml-1 rounded-[10px] border border-separator bg-elevated px-3 py-1.5 font-mono text-[15px] tabular">
              <span className="font-medium">{formatDuration(current, true)}</span>
              <span className="text-label-3"> / {formatDuration(duration)}</span>
            </div>
            <span className="hidden font-mono text-[12px] text-label-3 tabular md:inline">final {outNow !== null ? formatDuration(outNow) : "-"}</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-48">
                <Segmented label="Disposição" value={layout} onChange={setLayout} options={[{ value: "grid", label: "Grelha" }, { value: "speaker", label: "Quem fala" }]} />
              </div>
              <button onClick={undo} disabled={!history.past.length} aria-label="Desfazer" title="Desfazer (⌘Z)" className="key grid h-9 w-9 place-items-center rounded-[10px] disabled:opacity-35">
                <Undo2 className="h-4 w-4" />
              </button>
              <button onClick={redo} disabled={!history.future.length} aria-label="Refazer" title="Refazer (⇧⌘Z)" className="key grid h-9 w-9 place-items-center rounded-[10px] disabled:opacity-35">
                <Redo2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tools */}
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-t border-separator bg-panel px-3 py-2 sm:px-4">
            <button className={toolButton} onClick={() => setEdits((e) => ({ ...e, trimStart: Math.min(current, e.trimEnd ?? duration) }))}>
              <RotateCcw className="h-3.5 w-3.5" /> Começar aqui
            </button>
            <button className={toolButton} onClick={() => setEdits((e) => ({ ...e, trimEnd: Math.max(current, e.trimStart) }))}>
              <RotateCw className="h-3.5 w-3.5" /> Acabar aqui
            </button>
            <button className={selection ? toolButton.replace("bg-fill", "bg-label").replace("text-label", "text-bg") : toolButton} disabled={!selection} onClick={cutSelection}>
              <Scissors className="h-3.5 w-3.5" /> Cortar seleção
            </button>
            {selection && edits.cuts.some((c) => Math.max(c.start, c.end) > selection.start && Math.min(c.start, c.end) < selection.end) && (
              <button className={toolButton} onClick={restoreSelection}>
                Repor parte cortada
              </button>
            )}
            <button className={toolButton} onClick={addMarker}>
              <Bookmark className="h-3.5 w-3.5" /> Marcador
            </button>
            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-separator" />
            <button className={toolButton} onClick={removeSilences} disabled={!!toolBusy}>
              <WandSparkles className="h-3.5 w-3.5" /> {toolBusy === "silence" ? "A procurar…" : "Remover silêncios"}
            </button>
            <button className={toolButton} onClick={equalize} disabled={!!toolBusy}>
              <SlidersHorizontal className="h-3.5 w-3.5" /> {toolBusy === "eq" ? "A medir…" : "Igualar volumes"}
            </button>
            <button className={toolButton} onClick={saveFrame}>
              <Camera className="h-3.5 w-3.5" /> Guardar imagem
            </button>
            {(edits.cuts.length > 0 || edits.trimStart > 0 || edits.trimEnd !== null) && (
              <button
                className={`${toolButton} bg-transparent text-accent-ink hover:bg-accent-soft`}
                onClick={() => {
                  if (confirm("Remover todos os cortes e o início/fim?")) setEdits((e) => ({ ...e, cuts: [], trimStart: 0, trimEnd: null }));
                }}
              >
                Repor tudo
              </button>
            )}
          </div>
          {toolNote && (
            <p role="status" className="shrink-0 border-t border-separator bg-accent-soft px-4 py-2 text-[13px] text-accent-ink">
              {toolNote}
            </p>
          )}

          {/* Timeline */}
          <div className="shrink-0 border-t border-separator bg-bg p-3 sm:px-4">
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
          </div>
        </section>

        {/* Inspector */}
        <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-separator bg-panel lg:w-[380px] lg:border-t-0 lg:border-l">
          <div className="shrink-0 p-3">
            <Segmented
              label="Painel"
              value={tab}
              onChange={setTab}
              options={[
                { value: "people", label: "Pessoas" },
                { value: "text", label: "Texto" },
                { value: "notes", label: "Notas" },
                { value: "export", label: "Exportar" },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
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
            {tab === "text" && (
              <div>
                {transcriptLines.length === 0 ? (
                  <p className="py-6 text-center text-[14px] text-label-3">
                    Este episódio não tem transcrição. Na próxima gravação, liguem &quot;Transcrever a minha voz&quot; no painel Texto da sala.
                  </p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={downloadSrt}>
                        <Captions className="h-3.5 w-3.5" /> Legendas .srt
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await navigator.clipboard.writeText(transcriptLines.map((l) => `[${formatDuration(l.ms)}] ${l.name}: ${l.text}`).join("\n")).catch(() => {});
                          setToolNote("Transcrição copiada.");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" /> Copiar texto
                      </Button>
                    </div>
                    <ul className="space-y-2.5">
                      {transcriptLines.map((l) => {
                        const color = ep.participants.find((p) => p.peerId === l.peerId)?.color;
                        const active = current >= l.ms && current < l.end;
                        return (
                          <li key={l.id}>
                            <button onClick={() => seek(l.ms)} className={`grid w-full grid-cols-[auto_1fr] gap-x-3 rounded-[10px] px-2 py-1.5 text-left hover:bg-fill ${active ? "bg-accent-soft" : ""}`}>
                              <span className="pt-0.5 font-mono text-[11px] text-label-3 tabular">{formatDuration(l.ms)}</span>
                              <span className="text-[14px] leading-relaxed">
                                <span className="mr-1.5 font-semibold" style={{ color }}>
                                  {l.name}
                                </span>
                                {l.text}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            )}
            {tab === "notes" && (
              <div>
                <label htmlFor="ep-notes" className="mb-2 block text-[13px] font-medium text-label-2">
                  Notas do episódio
                </label>
                <textarea
                  id="ep-notes"
                  value={ep.notes || ""}
                  onChange={(e) => patchEp({ notes: e.target.value, notesUpdatedAt: Date.now() })}
                  placeholder="Descrição, links, convidados…"
                  className="min-h-48 w-full resize-y rounded-[12px] border border-separator bg-elevated p-3.5 text-[15px] leading-relaxed outline-none focus:border-accent"
                />
                <div className="mt-4 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-label-2">Marcadores</h3>
                  <Button size="sm" variant="plain" onClick={copyChapters}>
                    <ListOrdered className="h-3.5 w-3.5" /> Copiar capítulos
                  </Button>
                </div>
                {ep.markers.length === 0 ? (
                  <p className="mt-1 text-[13px] text-label-3">Sem marcadores. Usa o botão Marcador ou marca momentos durante a gravação.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {[...ep.markers]
                      .sort((a, b) => markerMs(ep, a) - markerMs(ep, b))
                      .map((m) => (
                        <li key={m.id} className="flex items-center gap-2">
                          <button onClick={() => seek(markerMs(ep, m))} className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-1.5 py-1 text-left text-[14px] hover:bg-fill">
                            <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[12px] font-medium text-accent-ink tabular">{formatDuration(markerMs(ep, m))}</span>
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
                <div className="mb-4 rounded-[12px] bg-grouped px-4 py-1">
                  <Toggle label="Normalizar volume (-16 LUFS)" hint="Padrão do Spotify e Apple Podcasts." checked={edits.loudness} onChange={(v) => setEdits((e) => ({ ...e, loudness: v }))} />
                </div>
                <ExportPanel ep={{ ...ep, edits }} beforeExport={persist} selection={selection} />
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
