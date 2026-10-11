// A track's bytes are stored as ordered chunks in IndexedDB. Audio chunks hold raw
// 16-bit PCM (the WAV header is generated on read); video chunks hold the
// recorder output as-is (WebM gets a duration patch on read).
import { countChunks, getChunks } from "./db";
import type { TrackMeta } from "./types";
import { wavHeader } from "./wav";
import { fixWebmDuration } from "./webm";

export async function rawTrackBlob(trackId: string, type = "application/octet-stream"): Promise<Blob> {
  const chunks = await getChunks(trackId);
  return new Blob(chunks, { type });
}

/** The playable / exportable file for a track. */
export async function trackBlob(track: TrackMeta): Promise<Blob> {
  const raw = await rawTrackBlob(track.id);
  if (track.kind === "audio") {
    const sr = track.sampleRate || 48000;
    return new Blob([wavHeader(raw.size, sr, 1), raw], { type: "audio/wav" });
  }
  const typed = new Blob([raw], { type: track.mime.split(";")[0] });
  if (track.mime.includes("webm") && track.durationMs > 0) return fixWebmDuration(typed, track.durationMs);
  return typed;
}

/** Rebuild metadata for a track whose recording was interrupted (tab closed, crash). */
export async function recoverTrack(track: TrackMeta): Promise<TrackMeta> {
  const raw = await rawTrackBlob(track.id);
  const n = await countChunks(track.id);
  const t = { ...track, size: raw.size, complete: raw.size > 0 };
  if (track.kind === "audio") {
    t.durationMs = (raw.size / 2 / (track.sampleRate || 48000)) * 1000;
  } else if (!t.durationMs) {
    t.durationMs = n * 1000; // one chunk per second while recording
  }
  return t;
}
