// Builds the "everything" ZIP: aligned per-person WAVs, original videos, mix,
// notes, markers and a sync file for editors.
import { extForMime } from "./media";
import { alignedTrackWav, mixdown } from "./mix";
import { buildSegments, editsOf, srcToOut } from "./timeline";
import { trackBlob } from "./tracks";
import { episodeDurationMs, type Episode } from "./types";
import { formatDuration, slugify } from "./util";
import { buildZip, type ZipEntry } from "./zip";

export interface ZipOptions {
  applyEdits: boolean;
  applyCleanup: boolean;
  includeVideo: boolean;
  includeMix: boolean;
  onStatus?: (text: string, fraction: number) => void;
  signal?: AbortSignal;
}

export async function exportZip(ep: Episode, opts: ZipOptions): Promise<Blob> {
  const entries: ZipEntry[] = [];
  const status = opts.onStatus || (() => {});
  const audio = ep.tracks.filter((t) => t.kind === "audio" && t.complete);
  const video = ep.tracks.filter((t) => t.kind === "video" && t.complete);
  const people = ep.participants;
  const nameOf = (peerId: string, fallback: string) => {
    const i = people.findIndex((p) => p.peerId === peerId);
    return `${String(i + 1).padStart(2, "0")}-${slugify(people[i]?.name || fallback)}`;
  };

  for (let i = 0; i < audio.length; i++) {
    if (opts.signal?.aborted) throw new DOMException("Cancelado", "AbortError");
    const t = audio[i];
    status(`A preparar o áudio de ${t.name}…`, i / (audio.length + 3));
    entries.push({ name: `audio/${nameOf(t.peerId, t.name)}.wav`, blob: await alignedTrackWav(ep, t, opts.applyEdits, opts.applyCleanup) });
  }
  if (opts.includeVideo) {
    for (const t of video) {
      status(`A juntar o vídeo de ${t.name}…`, audio.length / (audio.length + 3));
      entries.push({ name: `video/${nameOf(t.peerId, t.name)}.${extForMime(t.mime)}`, blob: await trackBlob(t) });
    }
  }
  if (opts.includeMix && audio.length) {
    status("A misturar o áudio de todos…", (audio.length + 1) / (audio.length + 3));
    entries.push({
      name: "mistura.wav",
      blob: await mixdown(ep, {
        applyEdits: opts.applyEdits,
        format: "wav",
        signal: opts.signal,
        onProgress: (f) => status(`A misturar o áudio de todos… ${Math.round(f * 100)}%`, (audio.length + 1 + f) / (audio.length + 3)),
      }),
    });
  }

  const edits = editsOf(ep);
  const segs = buildSegments(ep, opts.applyEdits ? edits : null);
  const markers = ep.markers
    .map((m) => ({ ...m, ms: srcToOut(segs, m.t - ep.startHost) }))
    .filter((m) => m.ms !== null)
    .sort((a, b) => a.ms! - b.ms!);

  const sync = {
    app: "PodcastHelper",
    episode: ep.title,
    createdAt: new Date(ep.createdAt).toISOString(),
    durationMs: episodeDurationMs(ep),
    editsApplied: opts.applyEdits,
    cleanupApplied: opts.applyCleanup,
    note: "Os WAV em audio/ já estão alinhados: começam todos no instante zero. Para os vídeos, coloca cada um na linha do tempo em offsetMs (pode ser negativo = começa antes do zero).",
    audio: audio.map((t) => ({ file: `audio/${nameOf(t.peerId, t.name)}.wav`, person: t.name, sampleRate: t.sampleRate, alignedToZero: true })),
    video: video.map((t) => ({
      file: opts.includeVideo ? `video/${nameOf(t.peerId, t.name)}.${extForMime(t.mime)}` : null,
      person: t.name,
      offsetMs: Math.round(t.startHost - ep.startHost - (opts.applyEdits ? edits.trimStart : 0)),
      width: t.width,
      height: t.height,
      durationMs: Math.round(t.durationMs),
    })),
    markers: markers.map((m) => ({ timeMs: Math.round(m.ms!), label: m.label, by: m.by })),
  };
  const enc = new TextEncoder();
  entries.push({ name: "sync.json", blob: new Blob([enc.encode(JSON.stringify(sync, null, 2))]) });

  const notes = [
    `# ${ep.title}`,
    "",
    `Gravado a ${new Date(ep.createdAt).toLocaleString("pt-PT")} · ${formatDuration(episodeDurationMs(ep))}`,
    `Com: ${people.map((p) => p.name).join(", ")}`,
    "",
    "## Marcadores",
    ...(markers.length ? markers.map((m) => `- ${formatDuration(m.ms!)} — ${m.label} (${m.by})`) : ["(nenhum)"]),
    "",
    "## Notas",
    ep.notes?.trim() || "(sem notas)",
    "",
  ].join("\n");
  entries.push({ name: "notas.md", blob: new Blob([enc.encode(notes)]) });

  const readme = [
    "PodcastHelper — exportação",
    "",
    "audio/      Uma faixa WAV por pessoa, já alinhadas: arrasta todas para o início da linha do tempo.",
    "video/      O vídeo original de cada pessoa (com o som da câmara, útil para sincronizar por forma de onda).",
    "mistura.wav Todos juntos, normalizado para cerca de -16 LUFS (padrão de podcast).",
    "sync.json   Onde colocar cada vídeo (offsetMs) e os marcadores.",
    "notas.md    Notas partilhadas e marcadores com o tempo.",
    "",
    "DaVinci Resolve / Premiere / CapCut / Audacity:",
    "1. Importa os WAV de audio/ e põe todos no tempo 0.",
    "2. Importa os vídeos e coloca cada um no offsetMs indicado em sync.json",
    "   (ou usa 'sincronizar por áudio' do teu editor com o WAV da mesma pessoa).",
    "",
  ].join("\n");
  entries.push({ name: "LEIA-ME.txt", blob: new Blob([enc.encode(readme)]) });

  status("A criar o ZIP…", (audio.length + 2) / (audio.length + 3));
  return buildZip(entries, (f) => status(`A criar o ZIP… ${Math.round(f * 100)}%`, (audio.length + 2 + f) / (audio.length + 3)));
}
