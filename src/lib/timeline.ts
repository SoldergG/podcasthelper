// Maps between the edited output timeline and the episode (source) timeline.
import { DEFAULT_TRACK_EDIT, episodeDurationMs, type Episode, type EpisodeEdits, type TrackEdit } from "./types";

export interface Segment {
  /** Episode-relative ms. */
  srcStart: number;
  srcEnd: number;
  /** Output-relative ms. */
  outStart: number;
}

export function defaultEdits(): EpisodeEdits {
  return { trimStart: 0, trimEnd: null, cuts: [], tracks: {}, loudness: true };
}

export function editsOf(ep: Episode): EpisodeEdits {
  return { ...defaultEdits(), ...(ep.edits || {}) };
}

export function trackEdit(edits: EpisodeEdits, peerId: string): TrackEdit {
  const t = edits.tracks[peerId] || {};
  return { ...DEFAULT_TRACK_EDIT, ...t, cleanup: { ...DEFAULT_TRACK_EDIT.cleanup, ...(t.cleanup || {}) } };
}

export function buildSegments(ep: Episode, edits: EpisodeEdits | null): Segment[] {
  const total = episodeDurationMs(ep);
  if (!edits) return [{ srcStart: 0, srcEnd: total, outStart: 0 }];
  const start = Math.max(0, Math.min(total, edits.trimStart));
  const end = Math.max(start, Math.min(total, edits.trimEnd ?? total));
  const cuts = [...edits.cuts]
    .map((c) => ({ s: Math.max(start, Math.min(c.start, c.end)), e: Math.min(end, Math.max(c.start, c.end)) }))
    .filter((c) => c.e > c.s)
    .sort((a, b) => a.s - b.s);
  const segs: Segment[] = [];
  let cursor = start;
  let out = 0;
  for (const c of cuts) {
    if (c.s > cursor) {
      segs.push({ srcStart: cursor, srcEnd: c.s, outStart: out });
      out += c.s - cursor;
    }
    cursor = Math.max(cursor, c.e);
  }
  if (end > cursor) segs.push({ srcStart: cursor, srcEnd: end, outStart: out });
  return segs;
}

export function outputDuration(segs: Segment[]): number {
  const last = segs[segs.length - 1];
  return last ? last.outStart + (last.srcEnd - last.srcStart) : 0;
}

export function outToSrc(segs: Segment[], outMs: number): number {
  for (const s of segs) {
    const len = s.srcEnd - s.srcStart;
    if (outMs < s.outStart + len) return s.srcStart + Math.max(0, outMs - s.outStart);
  }
  const last = segs[segs.length - 1];
  return last ? last.srcEnd : 0;
}

/** Returns null when the source time is inside a cut / trimmed area. */
export function srcToOut(segs: Segment[], srcMs: number): number | null {
  for (const s of segs) {
    if (srcMs >= s.srcStart && srcMs <= s.srcEnd) return s.outStart + (srcMs - s.srcStart);
  }
  return null;
}

/** Next kept source time at or after srcMs (skips cuts while previewing). */
export function nextKeptSrc(segs: Segment[], srcMs: number): number | null {
  for (const s of segs) {
    if (srcMs < s.srcEnd) return Math.max(srcMs, s.srcStart);
  }
  return null;
}
