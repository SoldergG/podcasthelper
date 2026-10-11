"use client";

import {
  Bookmark,
  Captions,
  Check,
  Copy,
  Gauge,
  Keyboard,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Settings2,
  Share,
  Smartphone,
  SquareUser,
  UserPlus,
  Video,
  VideoOff,
} from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Studio } from "@/lib/studio";
import { pausedBefore } from "@/lib/types";
import { formatDuration, nowMs } from "@/lib/util";
import { Button, Key, Logo, Panel, Segmented, inputClass } from "../ui";
import { ChecksPanel } from "./checks-panel";
import { ConsolePanel } from "./console-panel";
import { CueBanner } from "./cue";
import { EpisodeStatus } from "./episode-status";
import { SettingsPanel, Sheet } from "./settings-sheet";
import { ChatPanel, NotesPanel } from "./side-panels";
import { Stage } from "./stage";
import { TranscriptPanel } from "./transcript-panel";
import { VideoTile } from "./video-tile";

type SidePanel = "console" | "notes" | "chat" | "text" | "files" | "tests";

const TARGETS = [
  { value: "0", label: "Livre" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 h" },
  { value: "90", label: "1h30" },
];

export function InRoom({ studio, code }: { studio: Studio; code: string }) {
  const snap = useSyncExternalStore(studio.subscribe, studio.getSnapshot, studio.getSnapshot);
  const [sheet, setSheet] = useState<null | "settings" | "invite" | "title" | "panels" | "keys" | "tests">(null);
  const [mobileTab, setMobileTab] = useState<SidePanel | "settings">("console");
  const [panel, setPanel] = useState<SidePanel>("console");
  const [layout, setLayout] = useState<"grid" | "speaker">("grid");
  const [title, setTitle] = useState(() => `Episódio de ${new Date().toLocaleDateString("pt-PT", { day: "numeric", month: "long" })}`);
  const [target, setTarget] = useState("0");
  const [now, setNow] = useState(() => nowMs());
  const isPhone = useMemo(() => /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent), []);

  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), 200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!snap.notice) return;
    const t = setTimeout(() => studio.notify(null), 7000);
    return () => clearTimeout(t);
  }, [snap.notice, studio]);

  // Jump to the files tab when a recording ends.
  const [seenEpisode, setSeenEpisode] = useState<string | null>(null);
  if (snap.lastEpisodeId && snap.lastEpisodeId !== seenEpisode) {
    setSeenEpisode(snap.lastEpisodeId);
    setPanel("files");
  }

  const self = snap.self!;
  const director = snap.director;
  const hostNow = now + snap.clock.offset;
  const rec = snap.rec;
  const recording = rec.state === "recording";
  const paused = rec.state === "paused";
  const live = recording || paused;
  const countdown = rec.state === "countdown" && rec.startHost ? Math.ceil((rec.startHost - hostNow) / 1000) : null;
  const elapsed = live && rec.startHost ? Math.max(0, hostNow - rec.startHost - pausedBefore(rec.pauses, hostNow)) : 0;
  const remaining = rec.targetMs ? rec.targetMs - elapsed : null;
  const master = snap.masterId === self.peerId ? self : snap.peers.find((p) => p.info.peerId === snap.masterId)?.info;

  const people = useMemo(
    () => [
      ...(director ? [] : [{ key: self.peerId, stream: snap.localStream, info: self, isSelf: true, connection: "connected" as string }]),
      ...snap.peers.filter((p) => !p.info.director).map((p) => ({ key: p.info.peerId, stream: p.stream, info: p.info, isSelf: false, connection: p.connection as string })),
    ],
    [snap.localStream, snap.peers, self, director],
  );

  const leave = useCallback(async () => {
    if (rec.state !== "idle" && !confirm("Estão a gravar. Sair agora termina a tua gravação. Sair mesmo?")) return;
    const last = snap.lastEpisodeId;
    await studio.leave();
    window.location.href = last ? `/estudio?e=${encodeURIComponent(last)}` : "/episodios";
  }, [rec.state, snap.lastEpisodeId, studio]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "m" && !director) studio.setMuted(!studio.getSnapshot().self?.muted);
      else if (k === "b") studio.addMarker();
      else if (k === "r" && snap.isMaster && rec.state === "idle") setSheet("title");
      else if (k === "p" && snap.isMaster) (paused ? studio.resumeRecording() : studio.pauseRecording());
      else if (k === "g") setLayout((l) => (l === "grid" ? "speaker" : "grid"));
      else if (k === "t") setSheet("tests");
      else if (e.key === "?") setSheet("keys");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [studio, director, snap.isMaster, rec.state, paused]);

  const sync = snap.clock;
  const syncOk = sync.synced || snap.isMaster;

  const panelContent = (p: SidePanel) =>
    p === "console" ? (
      <ConsolePanel studio={studio} snap={snap} />
    ) : p === "notes" ? (
      <NotesPanel snap={snap} onChange={(t) => studio.setNotes(t)} />
    ) : p === "chat" ? (
      <ChatPanel studio={studio} snap={snap} />
    ) : p === "text" ? (
      <TranscriptPanel studio={studio} snap={snap} />
    ) : p === "files" ? (
      snap.lastEpisodeId ? (
        <EpisodeStatus episodeId={snap.lastEpisodeId} transfers={snap.transfers} />
      ) : (
        <p className="py-8 text-center text-[14px] text-label-3">Quando pararem de gravar, as gravações de todos aparecem aqui e passam para este aparelho.</p>
      )
    ) : (
      <ChecksPanel snap={snap} />
    );

  const tabs: { value: SidePanel; label: string }[] = [
    { value: "console", label: "Consola" },
    { value: "notes", label: "Notas" },
    { value: "chat", label: snap.unread && panel !== "chat" ? `Chat ${snap.unread}` : "Chat" },
    { value: "text", label: "Texto" },
    { value: "files", label: "Ficheiros" },
  ];

  const statusLabel = recording ? "A GRAVAR" : paused ? "EM PAUSA" : rec.state === "countdown" ? "A COMEÇAR" : rec.state === "finalizing" ? "A GUARDAR" : "PRONTO";

  const tiles = people.map((t) => ({
    key: t.key,
    node: () => (
      <VideoTile
        stream={t.stream}
        name={t.info.name}
        color={t.info.color}
        isSelf={t.isSelf}
        mirror={t.isSelf && snap.settings.mirrorPreview}
        muted={t.info.muted}
        videoOn={t.info.video}
        recording={t.info.recording}
        connection={t.connection}
        ctx={studio.audioContext}
        badge={t.info.peerId === snap.masterId ? "ANFITRIÃO" : undefined}
        volume={snap.monitor[t.info.peerId] ?? 1}
        hidden={t.info.hidden}
      />
    ),
  }));

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Top bar */}
      <header className="glass z-30 shrink-0 border-b border-separator">
        <div className="mx-auto grid h-16 max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="hidden text-[15px] md:block" aria-label="PodcastHelper">
              <Logo />
            </Link>
            <button onClick={() => setSheet("invite")} className="flex min-w-0 items-center gap-1.5 rounded-[10px] border border-separator bg-elevated px-2.5 py-1.5 text-[13px] font-medium hover:bg-fill">
              {snap.locked && <Lock aria-label="Sala trancada" className="h-3.5 w-3.5 shrink-0 text-accent-ink" />}
              <span className="truncate font-mono tabular">{code}</span>
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
          <div className="relative flex items-center gap-3 overflow-hidden rounded-[12px] border border-separator bg-elevated px-3.5 py-1.5" aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full ${recording ? "bg-red animate-rec" : paused ? "bg-amber" : rec.state === "idle" ? "bg-green-bright" : "bg-amber"}`} />
            <span className="font-mono text-[22px] font-medium leading-none tracking-tight tabular">{formatDuration(elapsed)}</span>
            <span className="hidden font-mono text-[11px] text-label-3 sm:inline">
              {statusLabel}
              {remaining !== null && live && (
                <span className={remaining < 60_000 ? "text-red" : remaining < 5 * 60_000 ? "text-orange" : ""}>
                  {" "}
                  · {remaining >= 0 ? `faltam ${formatDuration(remaining)}` : `+${formatDuration(-remaining)}`}
                </span>
              )}
            </span>
            {rec.targetMs && live ? (
              <span className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" style={{ width: `${Math.min(100, (elapsed / rec.targetMs) * 100)}%` }} />
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] lg:flex ${syncOk ? "bg-[color-mix(in_srgb,var(--green-bright)_14%,transparent)] text-green" : "bg-fill text-label-3"}`}>
              {snap.isMaster ? "relógio de referência" : sync.synced ? `sync ±${Math.max(1, Math.round(sync.rtt / 2))} ms` : "a sincronizar"}
            </span>
            {people.length > 1 && (
              <button
                onClick={() => setLayout(layout === "grid" ? "speaker" : "grid")}
                className="hidden h-8 items-center gap-1.5 rounded-[10px] border border-separator bg-elevated px-2.5 text-[12px] font-medium hover:bg-fill sm:flex"
                title="Mudar disposição (G)"
              >
                {layout === "grid" ? <SquareUser className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
                {layout === "grid" ? "Orador" : "Grelha"}
              </button>
            )}
            <button onClick={() => setSheet("keys")} className="hidden h-8 w-8 place-items-center rounded-[10px] text-label-3 hover:bg-fill md:grid" aria-label="Atalhos de teclado (?)" title="Atalhos (?)">
              <Keyboard className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 gap-5 px-4 pt-4 sm:px-6">
        <main className="flex min-w-0 flex-1 flex-col pb-[104px]">
          {(snap.notice || (isPhone && !director && rec.state !== "idle") || (!snap.isMaster && rec.state === "idle")) && (
            <div className="mb-3 shrink-0 space-y-2">
              {snap.notice && (
                <p role="status" className="rounded-[12px] bg-accent-soft px-3.5 py-2.5 text-[14px] text-accent-ink">
                  {snap.notice}
                </p>
              )}
              {isPhone && !director && rec.state !== "idle" && (
                <p className="flex items-center gap-2 rounded-[12px] bg-label px-3.5 py-2.5 text-[14px] text-bg">
                  <Smartphone className="h-4 w-4 shrink-0" /> Mantém esta app aberta. O ecrã fica ligado sozinho.
                </p>
              )}
              {!snap.isMaster && rec.state === "idle" && (
                <p className="text-[14px] text-label-2">
                  {master ? `${master.name} controla a gravação.` : "À espera do anfitrião."} Quando começar, este aparelho grava sozinho.
                </p>
              )}
            </div>
          )}
          <div className="relative min-h-0 flex-1">
            {people.length === 0 ? (
              <div className="grid h-full place-items-center">
                <Panel className="max-w-md p-8 text-center">
                  <p className="text-[17px] font-medium">Ainda não entrou ninguém para falar.</p>
                  <p className="mt-1 text-[15px] text-label-2">Partilha o link. As câmaras aparecem aqui.</p>
                  <Button className="mt-4" onClick={() => setSheet("invite")}>
                    <UserPlus className="h-4 w-4" /> Convidar
                  </Button>
                </Panel>
              </div>
            ) : (
              <Stage tiles={tiles} layout={layout} focusKey={snap.speaker} />
            )}
            {people.length === 1 && !director && (
              <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
                <button onClick={() => setSheet("invite")} className="pointer-events-auto flex items-center gap-2 rounded-full bg-label px-4 py-2 text-[14px] font-medium text-bg shadow-[var(--shadow)]">
                  <UserPlus className="h-4 w-4" /> Estás sozinho. Convida alguém
                </button>
              </div>
            )}
            {snap.interim && !director && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
                <p className="max-w-2xl rounded-[12px] bg-black/70 px-4 py-2 text-center text-[15px] text-white backdrop-blur-md">{snap.interim}</p>
              </div>
            )}
          </div>
        </main>

        {/* Side panel (desktop) */}
        <aside className={`hidden min-h-0 shrink-0 flex-col pb-[104px] lg:flex ${director ? "w-[440px]" : "w-[380px]"}`}>
          <Segmented label="Painel" value={panel} onChange={setPanel} options={tabs} />
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">{panelContent(panel)}</div>
        </aside>
      </div>

      {/* Dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[max(14px,env(safe-area-inset-bottom))]">
        <div className="glass pointer-events-auto mx-auto flex w-fit max-w-[calc(100%-12px)] items-end gap-1.5 overflow-x-auto rounded-[14px] border border-separator px-2.5 py-2 sm:gap-2.5 sm:px-3">
          {!director && (
            <>
              <Key label={self.muted ? "Ligar micro (M)" : "Desligar micro (M)"} pressed={self.muted} onClick={() => studio.setMuted(!self.muted)}>
                {self.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Key>
              <Key
                label={snap.settings.videoEnabled ? "Desligar câmara" : "Ligar câmara"}
                pressed={!snap.settings.videoEnabled}
                disabled={rec.state !== "idle"}
                onClick={() => studio.applySettings({ ...snap.settings, videoEnabled: !snap.settings.videoEnabled })}
              >
                {snap.settings.videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </Key>
            </>
          )}

          {snap.isMaster &&
            (rec.state === "idle" ? (
              <button
                onClick={() => setSheet("title")}
                className="flex h-11 shrink-0 items-center gap-2 rounded-[13px] bg-accent px-4 text-[15px] font-semibold text-on-accent shadow-[var(--key-shadow)] transition active:translate-y-px sm:h-12 sm:rounded-[14px] sm:px-5"
              >
                <span className="h-3 w-3 rounded-full bg-red" /> Gravar
              </button>
            ) : (
              <>
                {(recording || paused) && (
                  <Key label={paused ? "Retomar (P)" : "Pausar (P)"} pressed={paused} onClick={() => (paused ? studio.resumeRecording() : studio.pauseRecording())}>
                    {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                  </Key>
                )}
                <button
                  onClick={() => studio.stopRecording()}
                  disabled={rec.state === "finalizing"}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-[13px] bg-label px-4 text-[15px] font-semibold text-bg shadow-[var(--key-shadow)] transition active:translate-y-px disabled:opacity-50 sm:h-12 sm:rounded-[14px] sm:px-5"
                >
                  <span className="h-3 w-3 rounded-[3px] bg-red" /> Parar
                </button>
              </>
            ))}

          <Key label="Marcar momento (B)" disabled={!recording} onClick={() => studio.addMarker()}>
            <Bookmark className="h-5 w-5" />
          </Key>
          <span className="relative lg:hidden">
            <Key label="Painéis" onClick={() => setSheet("panels")}>
              <LayoutDashboard className="h-5 w-5" />
            </Key>
            {snap.unread > 0 && <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-mono text-[11px] text-on-accent">{snap.unread}</span>}
          </span>
          <Key label="Testes (T)" wrapperClassName="hidden lg:inline-flex" onClick={() => setSheet("tests")}>
            <Gauge className="h-5 w-5" />
          </Key>
          {!director && (
            <Key label="Definições" wrapperClassName="hidden lg:inline-flex" onClick={() => setSheet("settings")}>
              <Settings2 className="h-5 w-5" />
            </Key>
          )}
          <Key label="Sair da sala" tone="danger" onClick={leave}>
            <PhoneOff className="h-5 w-5" />
          </Key>
        </div>
      </div>

      <CueBanner studio={studio} snap={snap} />

      {countdown !== null && countdown > 0 && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-black/30" aria-live="assertive">
          <div key={countdown} className="font-mono text-[140px] font-medium text-white drop-shadow-lg" style={{ animation: "countdown-pop 0.9s ease-out" }}>
            {countdown}
          </div>
        </div>
      )}
      {paused && (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-20 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-amber px-4 py-2 text-[14px] font-semibold text-black shadow-[var(--shadow)]">
            <Pause className="h-4 w-4" /> Gravação em pausa
          </span>
        </div>
      )}

      {sheet === "settings" && (
        <Sheet title="Micro e câmara" onClose={() => setSheet(null)}>
          <SettingsPanel settings={snap.settings} onChange={(s) => studio.applySettings(s)} stream={snap.localStream} locked={rec.state !== "idle"} />
        </Sheet>
      )}
      {sheet === "tests" && (
        <Sheet title="Testes" onClose={() => setSheet(null)}>
          <ChecksPanel snap={snap} />
        </Sheet>
      )}
      {sheet === "invite" && <InviteSheet code={code} onClose={() => setSheet(null)} />}
      {sheet === "keys" && (
        <Sheet title="Atalhos de teclado" onClose={() => setSheet(null)}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[15px]">
            {[
              ["M", "Ligar ou desligar o micro"],
              ["B", "Marcar este momento"],
              ["R", "Começar a gravar (anfitrião)"],
              ["P", "Pausar ou retomar (anfitrião)"],
              ["G", "Grelha ou orador em destaque"],
              ["T", "Testes de micro, câmara e ligação"],
              ["?", "Mostrar estes atalhos"],
            ].map(([k, d]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="key inline-grid h-8 min-w-8 place-items-center rounded-[8px] px-2 font-mono text-[13px]">{k}</kbd>
                </dt>
                <dd className="self-center text-label-2">{d}</dd>
              </div>
            ))}
          </dl>
        </Sheet>
      )}
      {sheet === "panels" && (
        <Sheet title="Painéis" onClose={() => setSheet(null)}>
          <div className="overflow-x-auto">
            <Segmented
              label="Painel"
              value={mobileTab}
              onChange={setMobileTab}
              options={[...tabs, { value: "tests" as const, label: "Testes" }, ...(director ? [] : [{ value: "settings" as const, label: "Ajustes" }])]}
            />
          </div>
          <div className="mt-4">
            {mobileTab === "settings" ? (
              <SettingsPanel settings={snap.settings} onChange={(s) => studio.applySettings(s)} stream={snap.localStream} locked={rec.state !== "idle"} />
            ) : (
              panelContent(mobileTab)
            )}
          </div>
        </Sheet>
      )}
      {sheet === "title" && (
        <Sheet title="Começar a gravar" onClose={() => setSheet(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              studio.startRecording(title.trim() || "Episódio sem título", Number(target) ? Number(target) * 60_000 : null);
              setSheet(null);
            }}
          >
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-label-2">Título do episódio</span>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <div className="mt-4">
              <span className="mb-2 block text-[13px] font-medium text-label-2">Duração prevista</span>
              <Segmented label="Duração prevista" value={target} onChange={setTarget} options={TARGETS} />
              <p className="mt-1.5 text-[12px] text-label-3">Todos veem quanto falta e recebem aviso a 5 minutos e a 1 minuto do fim.</p>
            </div>
            <div className="mt-4 space-y-1.5 text-[14px] text-label-2">
              <p>
                {people.length} {people.length === 1 ? "pessoa vai" : "pessoas vão"} gravar. Contagem de 3 segundos e começam todos no mesmo instante.
              </p>
              {snap.peers.some((p) => p.connection !== "connected") && <p className="text-orange">Ainda há quem esteja a ligar. Espera uns segundos.</p>}
              {snap.peers.some((p) => p.info.hidden) && <p className="text-red">Há alguém com a app em segundo plano.</p>}
              {!snap.settings.transcribe && !director && (
                <p className="flex items-center gap-1.5 text-label-3">
                  <Captions className="h-4 w-4" /> A transcrição automática liga-se no painel Texto.
                </p>
              )}
            </div>
            <Button type="submit" variant="accent" size="lg" className="mt-5 w-full">
              <span className="h-3 w-3 rounded-full bg-red" /> Gravar
            </Button>
          </form>
        </Sheet>
      )}
    </div>
  );
}

function InviteSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const url = `${window.location.origin}/sala?c=${code}`;
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 440, color: { dark: "#141417", light: "#ffffff" } }).then(setQr).catch(() => {});
  }, [url]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };
  return (
    <Sheet title="Convidar pessoas" onClose={onClose}>
      <p className="text-[15px] text-label-2">Abre o link no telemóvel ou computador. Não precisam de conta.</p>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR code com o link da sala" className="mx-auto mt-4 h-52 w-52 rounded-[16px] border border-separator" />
      )}
      <div className="mt-4 flex items-center gap-2 rounded-[12px] border border-separator bg-elevated p-1.5 pl-3.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{url}</span>
        <Button size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      {"share" in navigator && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => navigator.share({ title: "Entra no meu podcast", url }).catch(() => {})}>
          <Share className="h-4 w-4" /> Partilhar
        </Button>
      )}
      <p className="mt-4 text-center text-[13px] text-label-3">
        Código <span className="font-mono font-medium text-label-2 tabular">{code}</span>
      </p>
    </Sheet>
  );
}
