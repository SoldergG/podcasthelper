"use client";

import { Battery, Grid3x3, HardDrive, Monitor, Play, Server, Waves } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { batteryStatus, frameBrightness, MicAnalyser, rateLight, rateNoise, rateVoice, recordSample, storageForecast } from "@/lib/checks";
import type { StudioSnapshot } from "@/lib/studio";
import { formatBytes } from "@/lib/util";
import { Button, LedMeter, Pill, Segmented, type LedMeterHandle } from "../ui";

type Tone = "good" | "ok" | "bad";
const toneText: Record<Tone, string> = { good: "text-green", ok: "text-orange", bad: "text-red" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[14px] text-label-2">{label}</span>
      <span className="text-right text-[14px]">{children}</span>
    </div>
  );
}

function MicCheck({ stream }: { stream: MediaStream | null }) {
  const meter = useRef<LedMeterHandle>(null);
  const an = useRef<MicAnalyser | null>(null);
  const [db, setDb] = useState<number | null>(null);
  const [voice, setVoice] = useState<{ label: string; tone: Tone } | null>(null);
  const [noise, setNoise] = useState<{ db: number; label: string; tone: Tone } | null>(null);
  const [clips, setClips] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const peaks = useRef<number[]>([]);

  useEffect(() => {
    if (!stream?.getAudioTracks().length) return;
    const a = new MicAnalyser(stream);
    an.current = a;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      const r = a.read();
      meter.current?.set((r.peakDb + 60) / 60);
      if (t - last > 250) {
        last = t;
        setDb(Math.round(r.rmsDb));
        setClips(a.clipped);
        peaks.current = [...peaks.current.slice(-12), r.peakDb];
        const loud = Math.max(...peaks.current);
        if (loud > -45) setVoice(rateVoice(loud));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      a.dispose();
    };
  }, [stream]);

  if (!stream?.getAudioTracks().length) return <p className="text-[14px] text-label-3">Este aparelho não tem micro ligado.</p>;
  const muted = !stream.getAudioTracks()[0].enabled;

  return (
    <div>
      {muted && <p className="mb-3 rounded-[12px] bg-accent-soft px-3 py-2 text-[13px] text-accent-ink">O teu micro está desligado na sala. Liga-o para testar.</p>}
      <div className="flex items-end justify-between">
        <span className="font-mono text-[40px] font-medium leading-none tabular">
          {db ?? "--"}
          <span className="ml-1 text-[14px] text-label-3">dBFS</span>
        </span>
        {clips > 0 && <Pill tone="bad">{clips} picos a saturar</Pill>}
      </div>
      <LedMeter ref={meter} segments={28} className="mt-3 h-4" />
      <p className={`mt-3 text-[14px] ${voice ? toneText[voice.tone] : "text-label-2"}`}>{voice?.label || "Fala com a tua voz normal de gravação."}</p>
      {noise && <p className={`mt-1 text-[13px] ${toneText[noise.tone]}`}>Ruído de fundo {noise.db} dB. {noise.label}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!!busy}
          onClick={async () => {
            setBusy("noise");
            const n = await an.current!.noiseFloor(3000);
            setNoise({ db: Math.round(n), ...rateNoise(n) });
            setBusy(null);
          }}
        >
          <Waves className="h-4 w-4" /> {busy === "noise" ? "Faz silêncio 3 s…" : "Medir ruído de fundo"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!!busy}
          onClick={async () => {
            setBusy("rec");
            const blob = await recordSample(stream, 5);
            setBusy("play");
            const url = URL.createObjectURL(blob);
            const el = new Audio(url);
            el.onended = () => {
              setBusy(null);
              URL.revokeObjectURL(url);
            };
            el.play().catch(() => setBusy(null));
          }}
        >
          <Play className="h-4 w-4" /> {busy === "rec" ? "A gravar 5 s…" : busy === "play" ? "A tocar…" : "Gravar 5 s e ouvir"}
        </Button>
      </div>
    </div>
  );
}

function CameraCheck({ stream, mirror }: { stream: MediaStream | null; mirror: boolean }) {
  const v = useRef<HTMLVideoElement>(null);
  const [grid, setGrid] = useState(true);
  const [light, setLight] = useState<{ luma: number; label: string; tone: Tone } | null>(null);
  const track = stream?.getVideoTracks()[0];

  useEffect(() => {
    const el = v.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play().catch(() => {});
    const t = setInterval(() => {
      const l = frameBrightness(el);
      if (l !== null) setLight({ luma: Math.round(l), ...rateLight(l) });
    }, 800);
    return () => clearInterval(t);
  }, [stream]);

  if (!track) return <p className="text-[14px] text-label-3">A câmara está desligada. Liga-a nas definições para testar.</p>;
  const s = track.getSettings();
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-[14px] bg-grouped">
        <video ref={v} muted playsInline className="h-full w-full object-cover" style={mirror ? { transform: "scaleX(-1)" } : undefined} />
        {grid && (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="border border-white/35" />
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 divide-y divide-separator">
        <Row label="Resolução">
          <span className="font-mono tabular">
            {s.width}×{s.height}
          </span>
        </Row>
        <Row label="Imagens por segundo">
          <span className="font-mono tabular">{Math.round(s.frameRate || 0)} fps</span>
        </Row>
        <Row label="Luz">{light ? <span className={toneText[light.tone]}>{light.label}</span> : "a medir…"}</Row>
      </div>
      <Button size="sm" variant="secondary" className="mt-3" onClick={() => setGrid(!grid)}>
        <Grid3x3 className="h-4 w-4" /> {grid ? "Esconder grelha" : "Mostrar grelha de enquadramento"}
      </Button>
      <p className="mt-2 text-[12px] text-label-3">Põe os olhos perto da linha de cima e deixa algum espaço por cima da cabeça.</p>
    </div>
  );
}

function ConnectionCheck({ snap }: { snap: StudioSnapshot }) {
  const linkLabel = { local: "Rede local", internet: "Internet direta", relay: "Por servidor", unknown: "A medir…" } as const;
  return (
    <div className="divide-y divide-separator">
      <Row label="Servidor da sala">
        <Pill tone="good">
          <Server className="h-3 w-3" /> Ligado
        </Pill>
      </Row>
      <Row label="Relógio">
        {snap.isMaster ? <Pill tone="good">Referência</Pill> : snap.clock.synced ? <Pill tone={snap.clock.rtt > 120 ? "warn" : "good"}>±{Math.max(1, Math.round(snap.clock.rtt / 2))} ms</Pill> : <Pill tone="warn">A acertar</Pill>}
      </Row>
      {snap.peers.length === 0 && <p className="py-3 text-[14px] text-label-3">Ainda não há mais ninguém na sala.</p>}
      {snap.peers.map((p) => {
        const t = p.link?.type || "unknown";
        return (
          <Row key={p.info.peerId} label={p.info.name}>
            <span className="inline-flex items-center gap-1.5">
              <Pill tone={p.connection === "connected" ? (t === "relay" ? "warn" : "good") : p.connection === "failed" ? "bad" : "warn"}>
                {p.connection === "connected" ? linkLabel[t] : p.connection === "failed" ? "Falhou" : "A ligar"}
              </Pill>
              {p.link?.rttMs != null && <Pill tone={p.link.rttMs > 250 ? "warn" : "default"}>{p.link.rttMs} ms</Pill>}
            </span>
          </Row>
        );
      })}
      <p className="pt-3 text-[12px] text-label-3">Na mesma Wi-Fi aparece &quot;Rede local&quot; e a partilha dos ficheiros é muito mais rápida.</p>
    </div>
  );
}

function DeviceCheck({ snap }: { snap: StudioSnapshot }) {
  const [forecast, setForecast] = useState<Awaited<ReturnType<typeof storageForecast>>>(null);
  const [battery, setBattery] = useState<Awaited<ReturnType<typeof batteryStatus>>>(null);
  useEffect(() => {
    storageForecast(snap.localStream, snap.settings).then(setForecast);
    batteryStatus().then(setBattery);
  }, [snap.localStream, snap.settings]);
  const wake = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const hours = forecast ? forecast.hours : null;
  return (
    <div className="divide-y divide-separator">
      <Row label="Espaço livre">
        <span className="inline-flex items-center gap-1.5">
          <HardDrive className="h-4 w-4 text-label-3" /> {forecast ? formatBytes(forecast.free) : "-"}
        </span>
      </Row>
      <Row label="Dá para gravar">
        {hours === null ? "-" : <Pill tone={hours < 1 ? "bad" : hours < 2 ? "warn" : "good"}>{hours > 20 ? "mais de 20 h" : `${hours.toFixed(1)} h`}</Pill>}
      </Row>
      <Row label="Por hora de gravação">{forecast ? <span className="font-mono tabular">{formatBytes(forecast.perHour)}</span> : "-"}</Row>
      <Row label="Bateria">
        {battery ? (
          <Pill tone={battery.charging ? "good" : battery.level < 20 ? "bad" : battery.level < 50 ? "warn" : "good"}>
            <Battery className="h-3 w-3" /> {battery.level}%{battery.charging ? " a carregar" : ""}
          </Pill>
        ) : (
          <span className="text-label-3">não disponível neste navegador</span>
        )}
      </Row>
      <Row label="Ecrã sempre ligado">
        <Pill tone={wake ? "good" : "warn"}>
          <Monitor className="h-3 w-3" /> {wake ? "Ativo" : "Não suportado: mantém o ecrã ligado"}
        </Pill>
      </Row>
    </div>
  );
}

export function ChecksPanel({ snap }: { snap: StudioSnapshot }) {
  const [tab, setTab] = useState<"mic" | "cam" | "net" | "device">(snap.director ? "net" : "mic");
  return (
    <div>
      <Segmented
        label="Testes"
        value={tab}
        onChange={setTab}
        options={[
          { value: "mic", label: "Micro", disabled: snap.director },
          { value: "cam", label: "Câmara", disabled: snap.director },
          { value: "net", label: "Ligação" },
          { value: "device", label: "Aparelho" },
        ]}
      />
      <div className="mt-4">
        {tab === "mic" && <MicCheck stream={snap.localStream} />}
        {tab === "cam" && <CameraCheck stream={snap.localStream} mirror={snap.settings.mirrorPreview} />}
        {tab === "net" && <ConnectionCheck snap={snap} />}
        {tab === "device" && <DeviceCheck snap={snap} />}
      </div>
    </div>
  );
}

