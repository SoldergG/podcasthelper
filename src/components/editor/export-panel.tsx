"use client";

import { FileArchive, Film, Music } from "lucide-react";
import { useRef, useState } from "react";
import type { Layout } from "@/lib/compositor";
import { exportZip } from "@/lib/export";
import { mixdown } from "@/lib/mix";
import { renderVideo } from "@/lib/render";
import type { Episode } from "@/lib/types";
import { saveFile } from "@/lib/save";
import { formatBytes, slugify } from "@/lib/util";
import { Button, ProgressBar, Segmented, Toggle } from "../ui";

type Job = { label: string; fraction: number } | null;

export function ExportPanel({ ep, beforeExport }: { ep: Episode; beforeExport: () => Promise<Episode> }) {
  const [job, setJob] = useState<Job>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [zipEdits, setZipEdits] = useState(true);
  const [zipCleanup, setZipCleanup] = useState(true);
  const [zipVideo, setZipVideo] = useState(true);
  const [zipMix, setZipMix] = useState(true);
  const [audioFmt, setAudioFmt] = useState<"mp3" | "wav">("mp3");
  const [layout, setLayout] = useState<Layout>("grid");
  const [res, setRes] = useState<"720" | "1080">("1080");

  const base = slugify(ep.title);
  const hasVideo = ep.tracks.some((t) => t.kind === "video" && t.complete);
  const missing = ep.tracks.filter((t) => !t.complete);

  const run = async (label: string, fn: (signal: AbortSignal, latest: Episode) => Promise<{ blob: Blob; name: string }>) => {
    setError(null);
    setResult(null);
    const ac = new AbortController();
    abortRef.current = ac;
    setJob({ label, fraction: 0 });
    try {
      const latest = await beforeExport();
      const { blob, name } = await fn(ac.signal, latest);
      setJob({ label: "A guardar o ficheiro…", fraction: 1 });
      const where = await saveFile(blob, name);
      setResult(`${name} (${formatBytes(blob.size)}) guardado em ${where}`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : String(e));
    } finally {
      setJob(null);
      abortRef.current = null;
    }
  };

  return (
    <div className="space-y-6">
      {missing.length > 0 && (
        <p className="rounded-[12px] bg-accent-soft px-3 py-2 text-[13px] text-accent-ink">
          Faltam {missing.length} faixa(s) neste aparelho ({[...new Set(missing.map((m) => m.name))].join(", ")}). Entrem na mesma sala outra vez para elas
          passarem, ou exporta só o que já tens.
        </p>
      )}

      {job && (
        <div className="rounded-[14px] bg-grouped p-4">
          <p className="text-[14px] font-medium">{job.label}</p>
          <div className="mt-2">
            <ProgressBar value={job.fraction} />
          </div>
          <Button variant="plain" size="sm" className="mt-2" onClick={() => abortRef.current?.abort()}>
            Cancelar
          </Button>
        </div>
      )}
      {result && <p className="rounded-[12px] bg-[color-mix(in_srgb,var(--green-bright)_14%,transparent)] px-3 py-2 text-[13px] text-green">{result}</p>}
      {error && <p className="rounded-[12px] bg-red-soft px-3 py-2 text-[13px] text-red">{error}</p>}

      <section className="rounded-[18px] bg-grouped p-4">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold">
          <FileArchive className="h-4 w-4 text-accent-ink" /> Pacote completo (ZIP)
        </h3>
        <p className="mt-1 text-[13px] text-label-2">Uma faixa WAV por pessoa já alinhada, vídeos, mistura, notas e marcadores. Ideal para DaVinci, Premiere, CapCut ou Audacity.</p>
        <div className="mt-2">
          <Toggle label="Aplicar cortes e início/fim" checked={zipEdits} onChange={setZipEdits} />
          <Toggle label="Aplicar limpeza de áudio" checked={zipCleanup} onChange={setZipCleanup} />
          <Toggle label="Incluir vídeos originais" checked={zipVideo} onChange={setZipVideo} disabled={!hasVideo} />
          <Toggle label="Incluir mistura" checked={zipMix} onChange={setZipMix} />
        </div>
        <Button
          className="mt-3 w-full"
          disabled={!!job}
          onClick={() =>
            run("A preparar o ZIP…", async (signal, latest) => ({
              blob: await exportZip(latest, {
                applyEdits: zipEdits,
                applyCleanup: zipCleanup,
                includeVideo: zipVideo,
                includeMix: zipMix,
                signal,
                onStatus: (label, fraction) => setJob({ label, fraction }),
              }),
              name: `${base}.zip`,
            }))
          }
        >
          Descarregar ZIP
        </Button>
      </section>

      <section className="rounded-[18px] bg-grouped p-4">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold">
          <Music className="h-4 w-4 text-accent-ink" /> Áudio final
        </h3>
        <p className="mt-1 text-[13px] text-label-2">Todos misturados, com cortes, volumes e limpeza, normalizado para cerca de -16 LUFS. Pronto para publicar.</p>
        <div className="mt-3">
          <Segmented label="Formato" value={audioFmt} onChange={setAudioFmt} options={[{ value: "mp3", label: "MP3 192 kbps" }, { value: "wav", label: "WAV sem perdas" }]} />
        </div>
        <Button
          className="mt-3 w-full"
          disabled={!!job}
          onClick={() =>
            run("A misturar…", async (signal, latest) => ({
              blob: await mixdown(latest, { applyEdits: true, format: audioFmt, signal, onProgress: (f) => setJob({ label: `A misturar… ${Math.round(f * 100)}%`, fraction: f }) }),
              name: `${base}.${audioFmt}`,
            }))
          }
        >
          Descarregar {audioFmt.toUpperCase()}
        </Button>
      </section>

      <section className="rounded-[18px] bg-grouped p-4">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold">
          <Film className="h-4 w-4 text-accent-ink" /> Vídeo final
        </h3>
        <p className="mt-1 text-[13px] text-label-2">
          Gera o vídeo com todos, como aparece na pré-visualização. Demora o mesmo tempo que o episódio: deixa este separador aberto e visível.
        </p>
        <div className="mt-3 space-y-2">
          <Segmented label="Disposição" value={layout} onChange={setLayout} options={[{ value: "grid", label: "Grelha" }, { value: "speaker", label: "Quem fala em destaque" }]} />
          <Segmented label="Resolução" value={res} onChange={setRes} options={[{ value: "720", label: "720p" }, { value: "1080", label: "1080p" }]} />
        </div>
        <Button
          className="mt-3 w-full"
          disabled={!!job}
          onClick={() =>
            run("A preparar o vídeo…", async (signal, latest) => {
              const blob = await renderVideo(latest, {
                layout,
                height: res === "1080" ? 1080 : 720,
                fps: 30,
                signal,
                onProgress: (phase, f) =>
                  setJob(phase === "audio" ? { label: `A preparar o áudio… ${Math.round(f * 100)}%`, fraction: f * 0.15 } : { label: `A gravar o vídeo… ${Math.round(f * 100)}%`, fraction: 0.15 + f * 0.85 }),
              });
              return { blob, name: `${base}.${blob.type.includes("mp4") ? "mp4" : "webm"}` };
            })
          }
        >
          Gerar vídeo
        </Button>
      </section>
    </div>
  );
}
