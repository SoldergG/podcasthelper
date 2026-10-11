export type TrackKind = "audio" | "video";

export interface TrackMeta {
  /** `${episodeId}:${peerId}:${kind}` */
  id: string;
  episodeId: string;
  peerId: string;
  name: string;
  color: string;
  kind: TrackKind;
  mime: string;
  /** Host-clock time (ms) of the first sample/frame. */
  startHost: number;
  durationMs: number;
  size: number;
  /** Audio only. */
  sampleRate?: number;
  /** Video only. */
  width?: number;
  height?: number;
  /** True when the full file is stored on this device. */
  complete: boolean;
  /** True when this device recorded it. */
  local: boolean;
}

export interface Marker {
  id: string;
  /** Host-clock ms. */
  t: number;
  by: string;
  label: string;
}

export interface Participant {
  peerId: string;
  name: string;
  color: string;
}

export interface CutRegion {
  id: string;
  /** Episode-relative ms. */
  start: number;
  end: number;
}

export interface AudioCleanup {
  /** Remove rumble below ~80 Hz. */
  highpass: boolean;
  /** Spectral noise reduction strength 0..1 (0 = off). */
  denoise: number;
  /** Voice focus: gate everything that isn't this person talking (bleed, room noise). */
  voiceFocus: boolean;
  /** Gentle compression to even out the voice. */
  compress: boolean;
}

export const DEFAULT_CLEANUP: AudioCleanup = { highpass: false, denoise: 0, voiceFocus: false, compress: false };

export interface TrackEdit {
  gain: number; // 0..2
  muted: boolean;
  solo: boolean;
  cleanup: AudioCleanup;
  brightness: number; // 0.5..1.5
  contrast: number;
  saturation: number;
  mirror: boolean;
  zoom: number; // 1..2
}

export interface EpisodeEdits {
  trimStart: number; // episode-relative ms
  trimEnd: number | null; // null = end
  cuts: CutRegion[];
  tracks: Record<string, TrackEdit>; // keyed by peerId
  /** Loudness-normalize the final mix to about -16 LUFS. */
  loudness: boolean;
}

export interface Episode {
  id: string;
  roomCode: string;
  title: string;
  createdAt: number;
  /** Host-clock time of the synced start (the "zero" of the episode). */
  startHost: number;
  /** Host-clock time of stop, once known. */
  stopHost: number | null;
  hostPeerId: string;
  participants: Participant[];
  markers: Marker[];
  tracks: TrackMeta[];
  /** Shared show notes written during the session. */
  notes?: string;
  notesUpdatedAt?: number;
  edits?: EpisodeEdits;
}

export const DEFAULT_TRACK_EDIT: TrackEdit = {
  gain: 1,
  muted: false,
  solo: false,
  cleanup: DEFAULT_CLEANUP,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  mirror: false,
  zoom: 1,
};

export function episodeDurationMs(ep: Episode): number {
  if (ep.stopHost) return Math.max(0, ep.stopHost - ep.startHost);
  let end = 0;
  for (const t of ep.tracks) end = Math.max(end, t.startHost - ep.startHost + t.durationMs);
  return end;
}
