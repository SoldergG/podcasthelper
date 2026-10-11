"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Largest 16:9 tile grid that fits the box. */
function bestGrid(n: number, W: number, H: number, gap: number) {
  let best = { cols: 1, w: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const wByWidth = (W - gap * (cols - 1)) / cols;
    const wByHeight = ((H - gap * (rows - 1)) / rows) * (16 / 9);
    const w = Math.min(wByWidth, wByHeight);
    if (w > best.w) best = { cols, w };
  }
  return best;
}

export interface StageTile {
  key: string;
  node: (size: { width: number }) => ReactNode;
}

/**
 * Fills the available space with the tiles. "speaker" layout shows one big tile
 * and the others as a filmstrip.
 */
export function Stage({ tiles, layout, focusKey }: { tiles: StageTile[]; layout: "grid" | "speaker"; focusKey: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const gap = 12;
  const speaker = layout === "speaker" && tiles.length > 1;

  if (speaker) {
    const focus = tiles.find((t) => t.key === focusKey) || tiles[0];
    const others = tiles.filter((t) => t !== focus);
    const stripH = Math.min(150, Math.max(90, size.h * 0.2));
    const stripW = (stripH * 16) / 9;
    const mainW = Math.min(size.w, ((size.h - stripH - gap) * 16) / 9);
    return (
      <div ref={ref} className="flex h-full w-full flex-col items-center justify-center gap-3">
        <div style={{ width: mainW }}>{focus.node({ width: mainW })}</div>
        <div className="flex max-w-full gap-3 overflow-x-auto">
          {others.map((t) => (
            <div key={t.key} className="shrink-0" style={{ width: stripW }}>
              {t.node({ width: stripW })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const { w } = bestGrid(Math.max(1, tiles.length), size.w, size.h, gap);
  const tileW = Math.max(160, Math.floor(w));
  return (
    <div ref={ref} className="flex h-full w-full flex-wrap content-center items-center justify-center" style={{ gap }}>
      {tiles.map((t) => (
        <div key={t.key} style={{ width: tileW }}>
          {t.node({ width: tileW })}
        </div>
      ))}
    </div>
  );
}
