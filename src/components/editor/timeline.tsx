"use client";

import { Headphones, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PeaksRecord } from "@/lib/db";
import { trackEdit } from "@/lib/timeline";
import type { Episode, EpisodeEdits } from "@/lib/types";
import { formatDuration } from "@/lib/util";

export interface Selection {
  start: number;
  end: number;
}

const ROW_H = 64;
const RULER_H = 28;
const LABEL_W = 148;

function niceStep(msPerPx: number) {
  const target = msPerPx * 90; // a label every ~90px
  const steps = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000];
  return steps.find((s) => s >= target) || 3600000;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

export function Timeline({
  ep,
  edits,
  duration,
  current,
  peaks,
  selection,
  onSelect,
  onSeek,
  onToggle,
  onOpenTrack,
}: {
  ep: Episode;
  edits: EpisodeEdits;
  duration: number;
  current: number;
  peaks: Record<string, PeaksRecord | null>;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  onSeek: (ms: number) => void;
  onToggle: (peerId: string, key: "muted" | "solo") => void;
  onOpenTrack: (peerId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewW, setViewW] = useState(800);
  const [scrollX, setScrollX] = useState(0);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ startMs: number; moved: boolean } | null>(null);

  const rows = ep.participants
    .map((p) => ({ p, audio: ep.tracks.find((t) => t.peerId === p.peerId && t.kind === "audio") || null, video: ep.tracks.find((t) => t.peerId === p.peerId && t.kind === "video") || null }))
    .filter((r) => r.audio || r.video);

  const contentW = Math.max(viewW, viewW * zoom);
  const msPerPx = duration / Math.max(1, contentW);
  const height = RULER_H + rows.length * ROW_H;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Keep playhead visible while playing
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || zoom <= 1) return;
    const x = current / msPerPx;
    if (x < el.scrollLeft || x > el.scrollLeft + viewW - 40) el.scrollLeft = Math.max(0, x - viewW * 0.2);
  }, [current, msPerPx, viewW, zoom]);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(viewW * dpr);
    c.height = Math.round(height * dpr);
    c.style.width = `${viewW}px`;
    c.style.height = `${height}px`;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, viewW, height);
    const x0 = scrollX;
    const toX = (ms: number) => ms / msPerPx - x0;
    const label3 = cssVar("--label-3");
    const sep = cssVar("--separator");
    const fill = cssVar("--fill");

    // Ruler
    g.fillStyle = label3;
    g.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
    g.textBaseline = "middle";
    const step = niceStep(msPerPx);
    const firstTick = Math.floor((x0 * msPerPx) / step) * step;
    for (let t = firstTick; t <= duration; t += step) {
      const x = toX(t);
      if (x < -50) continue;
      if (x > viewW) break;
      g.fillRect(Math.round(x), RULER_H - 8, 1, 8);
      g.fillText(formatDuration(t), x + 4, RULER_H / 2 - 1);
    }
    g.fillStyle = sep;
    g.fillRect(0, RULER_H - 0.5, viewW, 1);

    // Rows
    const anySolo = rows.some((r) => trackEdit(edits, r.p.peerId).solo);
    rows.forEach((r, i) => {
      const y = RULER_H + i * ROW_H;
      const te = trackEdit(edits, r.p.peerId);
      const audible = !te.muted && (!anySolo || te.solo);
      if (i % 2 === 1) {
        g.fillStyle = fill;
        g.globalAlpha = 0.35;
        g.fillRect(0, y, viewW, ROW_H);
        g.globalAlpha = 1;
      }
      // video coverage bar
      if (r.video) {
        g.fillStyle = r.p.color;
        g.globalAlpha = r.video.complete ? 0.25 : 0.1;
        const vs = toX(r.video.startHost - ep.startHost);
        const ve = toX(r.video.startHost - ep.startHost + (r.video.durationMs || duration));
        g.fillRect(Math.max(0, vs), y + ROW_H - 6, Math.min(viewW, ve) - Math.max(0, vs), 3);
        g.globalAlpha = 1;
      }
      const pk = r.audio ? peaks[r.audio.id] : null;
      const mid = y + ROW_H / 2 - 2;
      const amp = ROW_H / 2 - 8;
      g.fillStyle = r.p.color;
      g.globalAlpha = audible ? 0.9 : 0.25;
      if (pk && r.audio) {
        const offset = r.audio.startHost - ep.startHost;
        for (let x = 0; x < viewW; x++) {
          const msA = (x + x0) * msPerPx - offset;
          const msB = msA + msPerPx;
          if (msB < 0) continue;
          const ia = Math.max(0, Math.floor((msA / 1000) * pk.perSecond));
          const ib = Math.min(pk.peaks.length, Math.ceil((msB / 1000) * pk.perSecond));
          if (ia >= pk.peaks.length) break;
          let m = 0;
          for (let j = ia; j < Math.max(ia + 1, ib); j++) m = Math.max(m, pk.peaks[j] || 0);
          // perceptual scaling so quiet speech is still visible
          const h = Math.max(0.5, Math.sqrt(m) * amp * te.gain);
          g.fillRect(x, mid - h, 1, h * 2);
        }
      } else if (r.audio && !r.audio.complete) {
        g.font = "12px -apple-system, sans-serif";
        g.fillText("Ainda a chegar a este aparelho…", 12, mid);
      }
      g.globalAlpha = 1;
      g.fillStyle = sep;
      g.fillRect(0, y + ROW_H - 0.5, viewW, 1);
    });

    // Trims
    g.fillStyle = "rgba(0,0,0,0.35)";
    const ts = toX(edits.trimStart);
    if (ts > 0) g.fillRect(0, RULER_H, ts, height - RULER_H);
    if (edits.trimEnd !== null) {
      const te = toX(edits.trimEnd);
      if (te < viewW) g.fillRect(Math.max(0, te), RULER_H, viewW - te, height - RULER_H);
    }
    // Cuts
    for (const cut of edits.cuts) {
      const a = toX(Math.min(cut.start, cut.end));
      const b = toX(Math.max(cut.start, cut.end));
      if (b < 0 || a > viewW) continue;
      g.fillStyle = "rgba(255,59,48,0.18)";
      g.fillRect(a, RULER_H, b - a, height - RULER_H);
      g.strokeStyle = "rgba(255,59,48,0.8)";
      g.lineWidth = 1;
      g.beginPath();
      for (let x = a - (height - RULER_H); x < b; x += 10) {
        g.moveTo(Math.max(a, x), RULER_H + Math.max(0, a - x));
        g.lineTo(Math.min(b, x + (height - RULER_H)), RULER_H + Math.min(height - RULER_H, b - x));
      }
      g.globalAlpha = 0.35;
      g.stroke();
      g.globalAlpha = 1;
    }
    // Selection
    if (selection) {
      const a = toX(Math.min(selection.start, selection.end));
      const b = toX(Math.max(selection.start, selection.end));
      g.fillStyle = "rgba(0,113,227,0.16)";
      g.fillRect(a, 0, b - a, height);
      g.fillStyle = "rgba(0,113,227,0.9)";
      g.fillRect(a, 0, 1.5, height);
      g.fillRect(b, 0, 1.5, height);
    }
    // Markers
    for (const m of ep.markers) {
      const x = toX(m.t - ep.startHost);
      if (x < 0 || x > viewW) continue;
      g.fillStyle = "#FF9500";
      g.beginPath();
      g.moveTo(x, 4);
      g.lineTo(x + 8, 4);
      g.lineTo(x + 8, 14);
      g.lineTo(x, 18);
      g.closePath();
      g.fill();
      g.fillRect(x, 4, 1.5, height);
    }
    // Playhead
    const px = toX(current);
    g.fillStyle = cssVar("--red");
    g.fillRect(px - 0.75, 0, 1.5, height);
    g.beginPath();
    g.arc(px, 5, 5, 0, Math.PI * 2);
    g.fill();
  }, [viewW, height, scrollX, msPerPx, duration, rows, edits, peaks, ep, selection, current]);

  useEffect(() => {
    draw();
  }, [draw]);

  const msAt = (clientX: number) => {
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(duration, (clientX - rect.left + el.scrollLeft) * msPerPx));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startMs: msAt(e.clientX), moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const ms = msAt(e.clientX);
    if (Math.abs(ms - d.startMs) / msPerPx > 4) d.moved = true;
    if (d.moved) onSelect({ start: Math.min(d.startMs, ms), end: Math.max(d.startMs, ms) });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      const ms = msAt(e.clientX);
      const inCut = edits.cuts.find((c) => ms >= Math.min(c.start, c.end) && ms <= Math.max(c.start, c.end));
      if (inCut) onSelect({ start: Math.min(inCut.start, inCut.end), end: Math.max(inCut.start, inCut.end) });
      else onSelect(null);
      onSeek(ms);
    }
  };

  return (
    <div className="rounded-[18px] bg-elevated shadow-[var(--shadow)]">
      <div className="flex">
        {/* Labels */}
        <div className="shrink-0 border-r border-separator" style={{ width: LABEL_W }}>
          <div style={{ height: RULER_H }} className="flex items-center px-3 text-[11px] font-medium text-label-3">
            Pessoas
          </div>
          {rows.map((r) => {
            const te = trackEdit(edits, r.p.peerId);
            return (
              <div key={r.p.peerId} style={{ height: ROW_H }} className="flex items-center gap-2 border-b border-separator px-2.5">
                <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpenTrack(r.p.peerId)} title="Ajustes desta pessoa">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.p.color }} />
                  <span className="truncate text-[14px] font-medium">{r.p.name}</span>
                </button>
                <button
                  aria-label={te.muted ? `Ligar som de ${r.p.name}` : `Silenciar ${r.p.name}`}
                  title="Silenciar"
                  aria-pressed={te.muted}
                  onClick={() => onToggle(r.p.peerId, "muted")}
                  className={`grid h-7 w-7 place-items-center rounded-[8px] text-[12px] font-bold ${te.muted ? "bg-red text-white" : "bg-fill text-label-2"}`}
                >
                  <VolumeX className="h-3.5 w-3.5" />
                </button>
                <button
                  aria-label={`Ouvir só ${r.p.name}`}
                  title="Solo: ouvir só esta pessoa"
                  aria-pressed={te.solo}
                  onClick={() => onToggle(r.p.peerId, "solo")}
                  className={`grid h-7 w-7 place-items-center rounded-[8px] ${te.solo ? "bg-[#FFCC00] text-black" : "bg-fill text-label-2"}`}
                >
                  <Headphones className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        {/* Canvas area */}
        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 cursor-crosshair touch-pan-x overflow-x-auto overflow-y-hidden"
          onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div style={{ width: contentW, height }}>
            <canvas ref={canvasRef} className="sticky left-0 block" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-separator px-3 py-2">
        <span className="text-[12px] text-label-3">Zoom</span>
        <input aria-label="Zoom da linha do tempo" type="range" min={1} max={60} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-40" />
        <span className="ml-auto hidden text-[12px] text-label-3 sm:inline">Clica para ir para um ponto · arrasta para selecionar</span>
      </div>
    </div>
  );
}
