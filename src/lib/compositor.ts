// Draws the multi-person video frame for a given moment. Used by the editor
// preview and by the final render.
import type { Participant, TrackEdit, TrackMeta } from "./types";

export type Layout = "grid" | "speaker";

export interface CompositorInput {
  participant: Participant;
  video: HTMLVideoElement | null;
  videoTrack: TrackMeta | null;
  /** Episode-relative ms where the video's first frame sits. */
  videoOffsetMs: number;
  edit: TrackEdit;
  /** 0..1 current loudness. */
  level: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function gridRects(n: number, W: number, H: number, gap: number): Rect[] {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, y: 0, w: W, h: H }];
  if (H > W * 1.1) {
    // Vertical video: stack people on top of each other.
    const cols = n <= 3 ? 1 : 2;
    const rows = Math.ceil(n / cols);
    const cw = (W - gap * (cols + 1)) / cols;
    const ch = (H - gap * (rows + 1)) / rows;
    return Array.from({ length: n }, (_, i) => ({ x: gap + (i % cols) * (cw + gap), y: gap + Math.floor(i / cols) * (ch + gap), w: cw, h: ch }));
  }
  const cols = n <= 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const cw = (W - gap * (cols + 1)) / cols;
  const ch = (H - gap * (rows + 1)) / rows;
  const rects: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const c = i % cols;
    const rowOffset = ((cols - inRow) * (cw + gap)) / 2;
    rects.push({ x: gap + rowOffset + c * (cw + gap), y: gap + r * (ch + gap), w: cw, h: ch });
  }
  // Two people: use full height, side by side.
  if (n === 2) {
    const w = (W - gap * 3) / 2;
    return [
      { x: gap, y: gap, w, h: H - gap * 2 },
      { x: gap * 2 + w, y: gap, w, h: H - gap * 2 },
    ];
  }
  return rects;
}

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

export class Compositor {
  private activeId: string | null = null;
  private activeSince = 0;

  constructor(
    private ctx: CanvasRenderingContext2D,
    public width: number,
    public height: number,
  ) {}

  draw(inputs: CompositorInput[], srcMs: number, layout: Layout, nowMs = performance.now(), caption?: string | null) {
    const { ctx, width: W, height: H } = this;
    ctx.save();
    ctx.fillStyle = "#121214";
    ctx.fillRect(0, 0, W, H);
    const gap = Math.round(W * 0.012);
    const radius = Math.round(W * 0.012);

    if (layout === "speaker" && inputs.length > 1) {
      // Hold the active speaker at least 1.2 s to avoid flicker.
      const loudest = [...inputs].sort((a, b) => b.level - a.level)[0];
      if (!this.activeId || !inputs.some((i) => i.participant.peerId === this.activeId)) {
        this.activeId = loudest.participant.peerId;
        this.activeSince = nowMs;
      } else if (loudest.participant.peerId !== this.activeId && loudest.level > 0.06 && nowMs - this.activeSince > 1200) {
        const cur = inputs.find((i) => i.participant.peerId === this.activeId);
        if (!cur || loudest.level > cur.level * 1.6) {
          this.activeId = loudest.participant.peerId;
          this.activeSince = nowMs;
        }
      }
      const main = inputs.find((i) => i.participant.peerId === this.activeId)!;
      this.drawTile(main, { x: 0, y: 0, w: W, h: H }, 0, srcMs, true);
      const others = inputs.filter((i) => i !== main);
      const tw = Math.round(W * 0.18);
      const th = Math.round((tw * 9) / 16);
      others.forEach((o, idx) => {
        const r = { x: W - gap - tw, y: H - gap - th - idx * (th + gap), w: tw, h: th };
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = gap;
        roundRect(ctx, r, radius);
        ctx.fillStyle = "#1e1e22";
        ctx.fill();
        ctx.restore();
        this.drawTile(o, r, radius, srcMs, false);
      });
    } else {
      const rects = gridRects(inputs.length, W, H, gap);
      inputs.forEach((inp, i) => this.drawTile(inp, rects[i], inputs.length === 1 ? 0 : radius, srcMs, false));
    }
    ctx.restore();
    if (caption) this.drawCaption(caption);
  }

  private drawCaption(text: string) {
    const { ctx, width: W, height: H } = this;
    const fs = Math.round(Math.min(W, H) * 0.045);
    ctx.save();
    ctx.font = `600 ${fs}px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
    const maxW = W * 0.84;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    const shown = lines.slice(-2);
    const lh = fs * 1.3;
    const boxH = shown.length * lh + fs * 0.8;
    const y0 = H - boxH - H * 0.06;
    const boxW = Math.min(W * 0.9, Math.max(...shown.map((l) => ctx.measureText(l).width)) + fs * 1.4);
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.beginPath();
    ctx.roundRect((W - boxW) / 2, y0, boxW, boxH, fs * 0.4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    shown.forEach((l, i) => ctx.fillText(l, W / 2, y0 + fs * 0.4 + i * lh));
    ctx.restore();
  }

  private drawTile(inp: CompositorInput, r: Rect, radius: number, srcMs: number, big: boolean) {
    const { ctx } = this;
    ctx.save();
    roundRect(ctx, r, radius);
    ctx.clip();

    const v = inp.video;
    const local = srcMs - inp.videoOffsetMs;
    const hasFrame = !!v && v.readyState >= 2 && v.videoWidth > 0 && local >= -1500 && (!inp.videoTrack || local <= inp.videoTrack.durationMs + 500);

    if (hasFrame && v) {
      const e = inp.edit;
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      // cover-fit with zoom
      const scale = Math.max(r.w / vw, r.h / vh) * e.zoom;
      const dw = vw * scale;
      const dh = vh * scale;
      ctx.filter = `brightness(${e.brightness}) contrast(${e.contrast}) saturate(${e.saturation})`;
      if (e.mirror) {
        ctx.translate(r.x + r.w, r.y);
        ctx.scale(-1, 1);
        ctx.drawImage(v, (r.w - dw) / 2, (r.h - dh) / 2, dw, dh);
      } else {
        ctx.drawImage(v, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
      }
      ctx.filter = "none";
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      // Audio-only card: color background + initial + live ring.
      ctx.fillStyle = "#1e1e22";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const base = Math.min(r.w, r.h) * 0.18;
      ctx.beginPath();
      ctx.arc(cx, cy, base * (1.15 + inp.level * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = hexA(inp.participant.color, 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, base, 0, Math.PI * 2);
      ctx.fillStyle = inp.participant.color;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `600 ${Math.round(base)}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((inp.participant.name || "?").trim().charAt(0).toUpperCase(), cx, cy + base * 0.04);
    }
    ctx.restore();

    // Name tag
    const fs = Math.max(12, Math.round((big ? this.width : r.w) * (big ? 0.016 : 0.045)));
    ctx.save();
    ctx.font = `600 ${fs}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif`;
    const label = inp.edit.subtitle ? `${inp.participant.name} · ${inp.edit.subtitle}` : inp.participant.name;
    const tw = ctx.measureText(label).width;
    const pad = fs * 0.6;
    const bx = r.x + fs * 0.8;
    const by = r.y + r.h - fs * 2.4;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw + pad * 2 + fs * 0.9, fs * 1.7, fs * 0.85);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx + pad + fs * 0.3, by + fs * 0.85, fs * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = inp.level > 0.08 ? "#34C759" : inp.participant.color;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + pad + fs * 0.9, by + fs * 0.88);
    ctx.restore();

    // Speaking outline
    if (inp.level > 0.08 && radius > 0) {
      ctx.save();
      roundRect(ctx, r, radius);
      ctx.lineWidth = Math.max(2, this.width * 0.0025);
      ctx.strokeStyle = "#34C759";
      ctx.stroke();
      ctx.restore();
    }
  }
}

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
