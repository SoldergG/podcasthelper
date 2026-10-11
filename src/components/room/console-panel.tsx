"use client";

import { Battery, BatteryCharging, BatteryLow, Crown, EyeOff, Headphones, HeadphoneOff, MicOff, UserMinus, Volume2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { createLevelMeter } from "@/lib/media";
import type { LiveQuality, PeerInfo } from "@/lib/room";
import type { PeerView, Studio, StudioSnapshot } from "@/lib/studio";
import { formatBytes, formatDuration } from "@/lib/util";
import { Button, LedMeter, Pill, Segmented, Toggle, type LedMeterHandle } from "../ui";
import { CueMenu } from "./cue";

function useMeter(stream: MediaStream | null, ctx: AudioContext | null, muted: boolean) {
  const ref = useRef<LedMeterHandle>(null);
  useEffect(() => {
    const handle = ref.current;
    if (!stream || !ctx || !stream.getAudioTracks().length) return;
    const m = createLevelMeter(stream, ctx);
    let raf = 0;
    let smooth = 0;
    const loop = () => {
      smooth = Math.max(muted ? 0 : m.read(), smooth * 0.86);
      ref.current?.set(smooth);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      m.dispose();
      handle?.set(0);
    };
  }, [stream, ctx, muted]);
  return ref;
}

const linkLabel = { local: "rede local", internet: "internet", relay: "servidor", unknown: "" } as const;

function Strip({
  studio,
  snap,
  info,
  view,
  isSelf,
  totalTalk,
}: {
  studio: Studio;
  snap: StudioSnapshot;
  info: PeerInfo;
  view?: PeerView;
  isSelf: boolean;
  totalTalk: number;
}) {
  const stream = isSelf ? snap.localStream : view?.stream || null;
  const meter = useMeter(stream, studio.audioContext, info.muted);
  const isMaster = info.peerId === snap.masterId;
  const volume = snap.monitor[info.peerId] ?? 1;
  const talk = snap.talk[info.peerId] || 0;
  const share = totalTalk > 0 ? talk / totalTalk : 0;
  const conn = isSelf ? "connected" : view?.connection;
  const lowBattery = info.battery && !info.battery.charging && info.battery.level < 20;
  const lowStorage = info.storageFreeGb !== undefined && info.storageFreeGb < 2;

  return (
    <div className="rounded-[14px] border border-separator bg-elevated p-3">
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: info.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px] font-semibold">
            <span className="truncate">{info.name}</span>
            {isSelf && <span className="text-[12px] font-normal text-label-3">tu</span>}
            {isMaster && <Crown aria-label="Anfitrião" className="h-3.5 w-3.5 shrink-0 text-accent-ink" />}
          </div>
          <div className="font-mono text-[11px] text-label-3">
            {info.director
              ? "centro de controlo"
              : info.recording
                ? `rec ${formatDuration(info.recMs || 0)}${info.recBytes ? ` · ${formatBytes(info.recBytes)}` : ""}`
                : conn === "connected"
                  ? `ligado${view?.link && view.link.type !== "unknown" ? ` por ${linkLabel[view.link.type]}` : ""}`
                  : conn === "failed"
                    ? "sem ligação direta"
                    : "a ligar"}
          </div>
        </div>
        {snap.isMaster && !isSelf && !info.director && (
          <div className="flex gap-1">
            <CueMenu studio={studio} to={info.peerId} label={`Enviar sinal a ${info.name}`} compact />
            {info.muted ? (
              <button onClick={() => studio.askUnmute(info.peerId)} className="key grid h-8 w-8 place-items-center rounded-[10px] text-label-2" title="Pedir para ligar o micro" aria-label={`Pedir a ${info.name} para ligar o micro`}>
                <Volume2 className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={() => studio.muteParticipant(info.peerId)} className="key grid h-8 w-8 place-items-center rounded-[10px] text-label-2" title="Silenciar" aria-label={`Silenciar ${info.name}`}>
                <MicOff className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => confirm(`Remover ${info.name} da sala?`) && studio.removeParticipant(info.peerId)}
              className="key grid h-8 w-8 place-items-center rounded-[10px] text-red"
              title="Remover da sala"
              aria-label={`Remover ${info.name}`}
            >
              <UserMinus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {!info.director && (
        <>
          <div className="mt-3 flex items-center gap-2">
            {info.muted ? <MicOff aria-label="Micro desligado" className="h-3.5 w-3.5 shrink-0 text-red" /> : <span className="w-3.5" />}
            <LedMeter ref={meter} segments={22} className="h-2.5 flex-1" />
          </div>
          {!isSelf && (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={() => studio.setMonitor(info.peerId, volume > 0 ? 0 : 1)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-label-2 hover:bg-fill"
                aria-label={volume > 0 ? `Deixar de ouvir ${info.name} neste aparelho` : `Voltar a ouvir ${info.name}`}
                title={volume > 0 ? "Deixar de ouvir (só aqui)" : "Voltar a ouvir"}
              >
                {volume > 0 ? <Headphones className="h-3.5 w-3.5" /> : <HeadphoneOff className="h-3.5 w-3.5 text-red" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => studio.setMonitor(info.peerId, Number(e.target.value))}
                aria-label={`Volume de ${info.name} neste aparelho`}
                className="flex-1"
              />
              <span className="w-9 text-right font-mono text-[11px] text-label-3 tabular">{Math.round(volume * 100)}</span>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {!isMaster && info.syncMs !== undefined && <Pill tone={info.syncMs > 60 ? "warn" : "good"}>sync ±{info.syncMs} ms</Pill>}
            {info.video && info.res && <Pill>{info.res.split(" · ")[0]}</Pill>}
            {info.battery && (
              <Pill tone={lowBattery ? "bad" : "default"}>
                {lowBattery && <BatteryLow className="h-3 w-3" />}
                {info.battery.charging ? <BatteryCharging className="h-3 w-3" /> : !lowBattery && <Battery className="h-3 w-3" />}
                {info.battery.level}%
              </Pill>
            )}
            {info.storageFreeGb !== undefined && <Pill tone={lowStorage ? "bad" : "default"}>{info.storageFreeGb} GB livres</Pill>}
            {info.hidden && (
              <Pill tone="bad">
                <EyeOff className="h-3 w-3" /> app em segundo plano
              </Pill>
            )}
          </div>
          {totalTalk > 0 && (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="font-mono text-[11px] text-label-3">fala</span>
              <span className="h-1.5 rounded-full" style={{ width: `${Math.max(2, share * 100)}%`, background: info.color }} />
              <span className="font-mono text-[11px] text-label-2 tabular">{Math.round(share * 100)}%</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ConsolePanel({ studio, snap }: { studio: Studio; snap: StudioSnapshot }) {
  if (!snap.self) return null;
  const rows: { info: PeerInfo; view?: PeerView; isSelf: boolean }[] = [
    ...(snap.director ? [] : [{ info: snap.self, isSelf: true }]),
    ...snap.peers.map((p) => ({ info: p.info, view: p, isSelf: false })),
  ];
  const totalTalk = Object.values(snap.talk).reduce((a, b) => a + b, 0);
  const people = rows.filter((r) => !r.info.director).length;
  const recording = rows.filter((r) => r.info.recording).length;
  const warnings = rows.filter((r) => r.info.hidden || (r.info.battery && !r.info.battery.charging && r.info.battery.level < 20) || (r.info.storageFreeGb !== undefined && r.info.storageFreeGb < 2)).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-[12px] bg-fill px-3 py-2">
          <div className="font-mono text-[20px] font-medium tabular">{people}</div>
          <div className="text-[12px] text-label-3">pessoas</div>
        </div>
        <div className="rounded-[12px] bg-fill px-3 py-2">
          <div className={`font-mono text-[20px] font-medium tabular ${recording ? "text-red" : ""}`}>{recording}</div>
          <div className="text-[12px] text-label-3">a gravar</div>
        </div>
        <div className="rounded-[12px] bg-fill px-3 py-2">
          <div className={`font-mono text-[20px] font-medium tabular ${warnings ? "text-orange" : ""}`}>{warnings}</div>
          <div className="text-[12px] text-label-3">avisos</div>
        </div>
      </div>

      {snap.isMaster && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => studio.muteAll()} disabled={!snap.peers.some((p) => !p.info.muted && !p.info.director)}>
              <MicOff className="h-4 w-4" /> Silenciar todos
            </Button>
            <CueMenu studio={studio} to="all" label="Sinal para todos" />
          </div>
          <div className="rounded-[14px] bg-grouped px-4 py-0.5">
            <Toggle label="Trancar a sala" hint="Ninguém novo consegue entrar. Quem já está continua." checked={snap.locked} onChange={(v) => studio.setLocked(v)} />
          </div>
        </>
      )}

      <div>
        <span className="mb-1.5 block text-[12px] font-medium text-label-3">Qualidade da chamada (não afeta a gravação)</span>
        <Segmented<LiveQuality>
          label="Qualidade da chamada"
          value={snap.liveQuality}
          onChange={(q) => studio.setLiveQuality(q)}
          options={[
            { value: "high", label: "Alta" },
            { value: "normal", label: "Normal" },
            { value: "saver", label: "Poupança" },
            { value: "audio", label: "Só áudio" },
          ]}
        />
      </div>

      {rows.map((r) => (
        <Strip key={r.info.peerId} studio={studio} snap={snap} info={r.info} view={r.view} isSelf={r.isSelf} totalTalk={totalTalk} />
      ))}
    </div>
  );
}
