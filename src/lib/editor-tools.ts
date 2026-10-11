// One-click editor helpers.
import { noiseProfile } from "./cleanup";
import { trackPeaks } from "./mix";
import { buildSegments, srcToOut, trackEdit } from "./timeline";
import { episodeDurationMs, markerMs, trackOffsetMs, type CutRegion, type Episode, type EpisodeEdits } from "./types";
import { formatDuration, randomId } from "./util";

/**
 * Finds stretches where nobody speaks (all unmuted mics below -40 dBFS) for at
 * least `minMs`, and returns cuts that leave `keepMs` of breathing room.
 */
export async function findSilences(ep: Episode, edits: EpisodeEdits, minMs = 2500, keepMs = 600, thresholdDb = -40): Promise<CutRegion[]> {
  const thr = Math.pow(10, thresholdDb / 20);
  const total = episodeDurationMs(ep);
  const binMs = 20;
  const bins = Math.ceil(total / binMs);
  const loud = new Uint8Array(bins);
  let any = false;
  for (const t of ep.tracks) {
    if (t.kind !== "audio" || !t.complete) continue;
    if (trackEdit(edits, t.peerId).muted) continue;
    const pk = await trackPeaks(t);
    if (!pk) continue;
    any = true;
    const offset = trackOffsetMs(ep, t, edits);
    const perBin = 1000 / pk.perSecond;
    for (let i = 0; i < pk.peaks.length; i++) {
      if (pk.peaks[i] < thr) continue;
      const b = Math.floor((offset + i * perBin) / binMs);
      if (b >= 0 && b < bins) loud[b] = 1;
    }
  }
  if (!any) return [];
  const cuts: CutRegion[] = [];
  let runStart = -1;
  for (let b = 0; b <= bins; b++) {
    const silent = b < bins && !loud[b];
    if (silent && runStart < 0) runStart = b;
    if (!silent && runStart >= 0) {
      const s = runStart * binMs;
      const e = b * binMs;
      if (e - s >= minMs) cuts.push({ id: randomId(6), start: s + keepMs / 2, end: e - keepMs / 2 });
      runStart = -1;
    }
  }
  // Only keep cuts inside the trimmed range.
  const end = edits.trimEnd ?? total;
  return cuts.filter((c) => c.end > edits.trimStart && c.start < end);
}

/** Gains that bring everyone's speaking level to the same loudness. */
export async function equalizeGains(ep: Episode): Promise<Record<string, number>> {
  const levels: { peerId: string; speech: number }[] = [];
  for (const t of ep.tracks) {
    if (t.kind !== "audio" || !t.complete) continue;
    const p = await noiseProfile(t);
    levels.push({ peerId: t.peerId, speech: p.speechDb });
  }
  if (!levels.length) return {};
  const sorted = [...levels].sort((a, b) => a.speech - b.speech);
  const target = sorted[Math.floor(sorted.length / 2)].speech;
  const out: Record<string, number> = {};
  for (const l of levels) out[l.peerId] = Math.max(0.25, Math.min(2, Math.pow(10, (target - l.speech) / 20)));
  return out;
}

/** YouTube-style chapters from the markers ("0:00 Início" first). */
export function chaptersText(ep: Episode, edits: EpisodeEdits): string {
  const segs = buildSegments(ep, edits);
  const items = ep.markers
    .map((m) => ({ ms: srcToOut(segs, markerMs(ep, m)), label: m.label }))
    .filter((m): m is { ms: number; label: string } => m.ms !== null)
    .sort((a, b) => a.ms - b.ms);
  const lines: string[] = [];
  if (!items.length || items[0].ms > 1000) lines.push("0:00 Início");
  for (const it of items) lines.push(`${formatDuration(it.ms)} ${it.label}`);
  return lines.join("\n");
}
