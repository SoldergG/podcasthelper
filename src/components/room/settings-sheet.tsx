"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { listDevices, type CaptureSettings, type Resolution } from "@/lib/media";
import { Field, Segmented, Toggle, selectClass } from "../ui";

export function SettingsPanel({
  settings,
  onChange,
  stream,
  locked,
}: {
  settings: CaptureSettings;
  onChange: (s: CaptureSettings) => void;
  stream: MediaStream | null;
  locked: boolean;
}) {
  const [devices, setDevices] = useState<{ audio: MediaDeviceInfo[]; video: MediaDeviceInfo[] }>({ audio: [], video: [] });
  const [caps, setCaps] = useState<{ maxH: number; maxFps: number } | null>(null);

  useEffect(() => {
    listDevices().then(setDevices).catch(() => {});
    const onChangeDevices = () => listDevices().then(setDevices).catch(() => {});
    navigator.mediaDevices?.addEventListener?.("devicechange", onChangeDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChangeDevices);
  }, [stream]);

  useEffect(() => {
    const vt = stream?.getVideoTracks()[0];
    const c = vt?.getCapabilities?.();
    if (c && c.height && "max" in c.height) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCaps({ maxH: c.height.max || 0, maxFps: (c.frameRate && "max" in c.frameRate ? c.frameRate.max : 30) || 30 });
    } else setCaps(null);
  }, [stream]);

  const vs = stream?.getVideoTracks()[0]?.getSettings();
  const set = (patch: Partial<CaptureSettings>) => onChange({ ...settings, ...patch });

  const resOptions: { value: Resolution; label: string; disabled?: boolean }[] = [
    { value: "720", label: "720p" },
    { value: "1080", label: "1080p", disabled: !!caps && caps.maxH < 1080 },
    { value: "2160", label: "4K", disabled: !!caps && caps.maxH < 2160 },
    { value: "max", label: "Máximo" },
  ];

  return (
    <div className="space-y-5">
      {locked && (
        <p className="rounded-[12px] bg-accent-soft px-3 py-2 text-[13px] text-accent-ink">
          Durante a gravação não dá para mudar de dispositivo. As alterações aplicam-se quando parar.
        </p>
      )}
      <Field label="Microfone">
        <select
          className={selectClass}
          value={settings.audioDeviceId || ""}
          disabled={locked}
          onChange={(e) => set({ audioDeviceId: e.target.value || null })}
        >
          <option value="">Predefinido</option>
          {devices.audio.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.label || `Microfone ${i + 1}`}
            </option>
          ))}
        </select>
      </Field>

      <div className="rounded-[14px] bg-grouped px-4 py-1">
        <Toggle
          label="Estou com fones"
          hint={settings.headphones ? "Micro em bruto: melhor qualidade." : "Cancelamento de eco ligado."}
          checked={settings.headphones}
          disabled={locked}
          onChange={(v) => set({ headphones: v })}
        />
        <div className="h-px bg-separator" />
        <Toggle
          label="Reduzir ruído"
          hint="Útil em sítios barulhentos. Pode deixar a voz menos natural."
          checked={settings.noiseSuppression}
          disabled={locked}
          onChange={(v) => set({ noiseSuppression: v })}
        />
      </div>

      <div className="rounded-[14px] bg-grouped px-4 py-1">
        <Toggle label="Câmara" checked={settings.videoEnabled} disabled={locked} onChange={(v) => set({ videoEnabled: v })} />
      </div>

      {settings.videoEnabled && (
        <>
          <Field label="Câmara">
            <select
              className={selectClass}
              value={settings.videoDeviceId || ""}
              disabled={locked}
              onChange={(e) => set({ videoDeviceId: e.target.value || null })}
            >
              <option value="">{settings.facingMode === "user" ? "Frontal (predefinida)" : "Traseira"}</option>
              {devices.video.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Câmara ${i + 1}`}
                </option>
              ))}
            </select>
          </Field>
          {!settings.videoDeviceId && (
            <Segmented
              label="Câmara do telemóvel"
              value={settings.facingMode}
              disabled={locked}
              onChange={(v) => set({ facingMode: v })}
              options={[
                { value: "user", label: "Frontal" },
                { value: "environment", label: "Traseira" },
              ]}
            />
          )}
          <Field
            label="Resolução da gravação"
            hint={
              vs?.width
                ? `A câmara está a dar ${vs.width}×${vs.height} a ${Math.round(vs.frameRate || 0)} fps.${caps ? ` Máximo desta câmara: ${caps.maxH}p.` : ""}`
                : undefined
            }
          >
            <Segmented label="Resolução" value={settings.resolution} disabled={locked} onChange={(v) => set({ resolution: v })} options={resOptions} />
          </Field>
          <Field label="Imagens por segundo">
            <Segmented
              label="FPS"
              value={String(settings.fps) as "24" | "30" | "60"}
              disabled={locked}
              onChange={(v) => set({ fps: Number(v) as 24 | 30 | 60 })}
              options={[
                { value: "24", label: "24" },
                { value: "30", label: "30" },
                { value: "60", label: "60", disabled: !!caps && caps.maxFps < 60 },
              ]}
            />
          </Field>
          <Field label="Qualidade do vídeo" hint="Mais qualidade ocupa mais espaço e demora mais a partilhar.">
            <Segmented
              label="Qualidade"
              value={settings.quality}
              onChange={(v) => set({ quality: v })}
              disabled={locked}
              options={[
                { value: "standard", label: "Normal" },
                { value: "high", label: "Alta" },
                { value: "max", label: "Máxima" },
              ]}
            />
          </Field>
          <div className="rounded-[14px] bg-grouped px-4 py-1">
            <Toggle label="Espelhar a minha imagem" hint="Só no teu ecrã. A gravação fica normal." checked={settings.mirrorPreview} onChange={(v) => set({ mirrorPreview: v })} />
          </div>
        </>
      )}

      <div className="rounded-[14px] bg-grouped px-4 py-1">
        <Toggle
          label="Receber os vídeos dos outros"
          hint="O áudio de todos chega sempre. Desliga se tiveres pouco espaço."
          checked={settings.receiveVideo}
          onChange={(v) => set({ receiveVideo: v })}
        />
      </div>
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Fechar" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[16px] bg-elevated p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[16px] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[20px] font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-fill text-label-2 hover:bg-fill-strong">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
