"use client";

import {
  Bookmark,
  Check,
  Copy,
  Gauge,
  LayoutDashboard,
  MessageSquare,
  Mic,
  MicOff,
  NotebookPen,
  PhoneOff,
  Settings2,
  Share,
  Smartphone,
  UserPlus,
  Video,
  VideoOff,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { loadSettings, saveSettings, type CaptureSettings } from "@/lib/media";
import { Studio, getPeerId, isRoomHost } from "@/lib/studio";
import { colorFor, formatDuration, normalizeRoomCode, nowMs } from "@/lib/util";
import { Button, Header, Key, Logo, Panel, Segmented, inputClass } from "../ui";
import { ChecksPanel } from "./checks-panel";
import { ConsolePanel } from "./console-panel";
import { EpisodeStatus } from "./episode-status";
import { SettingsPanel, Sheet } from "./settings-sheet";
import { ChatPanel, NotesPanel } from "./side-panels";
import { VideoTile } from "./video-tile";

function colorForPeer(peerId: string) {
  let h = 0;
  for (const c of peerId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colorFor(h);
}

const noopSubscribe = () => () => {};

export function RoomScreen() {
  const params = useSearchParams();
  // The room depends on browser-only state (devices, storage, peer id): render it on the client only.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const code = normalizeRoomCode(params.get("c") || "");
  if (!mounted) return <div className="flex-1" />;
  if (!code) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md flex-1 px-4 py-20 text-center">
          <h1 className="text-[28px] font-semibold">Sala não encontrada</h1>
          <p className="mt-2 text-label-2">O link parece incompleto.</p>
          <Link href="/" className="mt-6 inline-block">
            <Button>Voltar ao início</Button>
          </Link>
        </main>
      </>
    );
  }
  return <Room code={code} />;
}

function Room({ code }: { code: string }) {
  const [studio] = useState(() => new Studio(code, loadSettings()));
  const snap = useSyncExternalStore(studio.subscribe, studio.getSnapshot, studio.getSnapshot);

  useEffect(() => {
    // Handy for debugging and automated tests.
    (window as unknown as { __studio?: Studio }).__studio = studio;
  }, [studio]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (studio.getSnapshot().rec.state !== "idle") e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      if (studio.getSnapshot().status === "joined") studio.leave();
      else studio.getSnapshot().localStream?.getTracks().forEach((t) => t.stop());
    };
  }, [studio]);

  if (snap.kicked) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md flex-1 px-4 py-20 text-center">
          <h1 className="text-[28px] font-semibold">Saíste da sala</h1>
          <p className="mt-2 text-label-2">O anfitrião removeu-te desta sala. As tuas gravações continuam guardadas neste aparelho.</p>
          <Link href="/episodios" className="mt-6 inline-block">
            <Button>Ver episódios</Button>
          </Link>
        </main>
      </>
    );
  }

  if (snap.status !== "joined") return <Lobby studio={studio} code={code} />;
  return <InRoom studio={studio} code={code} />;
}

// ---------------------------------------------------------------- Lobby

function Lobby({ studio, code }: { studio: Studio; code: string }) {
  const snap = useSyncExternalStore(studio.subscribe, studio.getSnapshot, studio.getSnapshot);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("ph:name") || "";
    } catch {
      return "";
    }
  });
  const [mode, setMode] = useState<"participant" | "director">("participant");
  const [settings, setSettings] = useState<CaptureSettings>(snap.settings);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showTests, setShowTests] = useState(false);
  const host = isRoomHost(code);
  const director = mode === "director";

  useEffect(() => {
    if (director) {
      studio.getSnapshot().localStream?.getTracks().forEach((t) => t.stop());
      return;
    }
    let cancelled = false;
    studio
      .startPreview(settings)
      .then(() => !cancelled && setPreviewError(null))
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.name : String(e);
        setPreviewError(
          msg === "NotAllowedError"
            ? "Não deste permissão ao micro e à câmara. Ativa nas definições do navegador e recarrega a página."
            : msg === "NotFoundError"
              ? "Não encontrámos micro ou câmara. Liga um e tenta de novo."
              : msg === "OverconstrainedError"
                ? "Esta câmara não suporta essa resolução. Escolhe outra."
                : "Não foi possível abrir o micro ou a câmara.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [studio, settings, director]);

  const join = () => {
    const n = name.trim() || (director ? "Centro de controlo" : "Convidado");
    try {
      localStorage.setItem("ph:name", name.trim());
    } catch {
      /* ignore */
    }
    saveSettings(settings);
    studio.join(n, colorForPeer(getPeerId()), { director });
  };

  return (
    <>
      <Header />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          {director ? (
            <Panel className="grid aspect-video place-items-center p-8 text-center">
              <div>
                <LayoutDashboard aria-hidden className="mx-auto h-10 w-10 text-accent-ink" />
                <h2 className="mt-4 text-[22px] font-semibold">Centro de controlo</h2>
                <p className="mx-auto mt-2 max-w-[40ch] text-[15px] text-label-2">
                  Este aparelho não usa micro nem câmara. Vês as câmaras e os medidores de todos, controlas a gravação e recebes todos os ficheiros no fim.
                </p>
              </div>
            </Panel>
          ) : (
            <VideoTile
              stream={snap.localStream}
              name={name || "Tu"}
              color={colorForPeer(getPeerId())}
              isSelf
              mirror={settings.mirrorPreview}
              muted={false}
              videoOn={settings.videoEnabled}
              recording={false}
              ctx={null}
            />
          )}
          {previewError && !director && <p className="rounded-[12px] bg-red-soft px-3.5 py-2.5 text-[14px] text-red">{previewError}</p>}
          {!director && (
            <Panel className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[17px] font-semibold">Testes rápidos</h2>
                <Button size="sm" variant="secondary" onClick={() => setShowTests(!showTests)}>
                  <Gauge className="h-4 w-4" /> {showTests ? "Esconder" : "Mic e câmara check"}
                </Button>
              </div>
              {showTests ? (
                <div className="mt-4">
                  <ChecksPanel snap={{ ...snap, settings, director: false }} />
                </div>
              ) : (
                <p className="mt-2 text-[14px] text-label-2">Confirma o nível da voz, o ruído de fundo, a luz e o espaço livre antes de entrares.</p>
              )}
            </Panel>
          )}
        </div>
        <div className="space-y-4">
          <Panel className="p-5">
            <p className="text-[13px] text-label-3">
              Sala <span className="font-mono text-label-2 tabular">{code}</span>
              {host && " · és o anfitrião"}
            </p>
            <div className="mt-4">
              <Segmented
                label="Como vais usar este aparelho"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "participant", label: "Vou falar e gravar" },
                  { value: "director", label: "Centro de controlo" },
                ]}
              />
            </div>
            <label className="mt-4 block">
              <span className="mb-2 block text-[13px] font-medium text-label-2">O teu nome</span>
              <input
                className={inputClass}
                value={name}
                maxLength={40}
                autoComplete="nickname"
                placeholder={director ? "Centro de controlo" : "Como te chamam?"}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
            </label>
            <Button variant="accent" size="lg" className="mt-4 w-full" onClick={join} disabled={snap.status === "joining" || (!!previewError && !director)}>
              {snap.status === "joining" ? "A entrar…" : "Entrar na sala"}
            </Button>
            {snap.error && <p className="mt-3 text-[14px] text-red">{snap.error}</p>}
          </Panel>
          {!director && (
            <Panel className="p-5">
              <h2 className="mb-4 text-[17px] font-semibold">Micro e câmara</h2>
              <SettingsPanel settings={settings} onChange={setSettings} stream={snap.localStream} locked={false} />
            </Panel>
          )}
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------- In room

type SidePanel = "console" | "notes" | "chat" | "tests";

function InRoom({ studio, code }: { studio: Studio; code: string }) {
  const snap = useSyncExternalStore(studio.subscribe, studio.getSnapshot, studio.getSnapshot);
  const [sheet, setSheet] = useState<null | "settings" | "invite" | "title" | "panels" | SidePanel>(null);
  const [mobileTab, setMobileTab] = useState<SidePanel | "settings">("console");
  const [panel, setPanel] = useState<SidePanel>("console");
  const [title, setTitle] = useState(() => `Episódio de ${new Date().toLocaleDateString("pt-PT", { day: "numeric", month: "long" })}`);
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

  const self = snap.self!;
  const director = snap.director;
  const hostNow = now + snap.clock.offset;
  const rec = snap.rec;
  const recording = rec.state === "recording";
  const countdown = rec.state === "countdown" && rec.startHost ? Math.ceil((rec.startHost - hostNow) / 1000) : null;
  const elapsed = recording && rec.startHost ? Math.max(0, hostNow - rec.startHost) : 0;
  const master = snap.masterId === self.peerId ? self : snap.peers.find((p) => p.info.peerId === snap.masterId)?.info;

  const tiles = useMemo(
    () => [
      ...(director ? [] : [{ key: self.peerId, stream: snap.localStream, info: self, isSelf: true, connection: "connected" as string }]),
      ...snap.peers.filter((p) => !p.info.director).map((p) => ({ key: p.info.peerId, stream: p.stream, info: p.info, isSelf: false, connection: p.connection as string })),
    ],
    [snap.localStream, snap.peers, self, director],
  );

  const cols = tiles.length <= 1 ? "grid-cols-1 max-w-4xl" : tiles.length <= 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 xl:grid-cols-3";

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
      else if (k === "t") setSheet("tests");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [studio, director, snap.isMaster, rec.state]);

  const sync = snap.clock;
  const syncOk = sync.synced || snap.isMaster;

  const panelContent = (p: SidePanel) =>
    p === "console" ? (
      <ConsolePanel studio={studio} snap={snap} />
    ) : p === "notes" ? (
      <NotesPanel snap={snap} onChange={(t) => studio.setNotes(t)} />
    ) : p === "chat" ? (
      <ChatPanel studio={studio} snap={snap} />
    ) : (
      <ChecksPanel snap={snap} />
    );

  const statusLabel = recording ? "A GRAVAR" : rec.state === "countdown" ? "A COMEÇAR" : rec.state === "finalizing" ? "A GUARDAR" : "PRONTO";

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar */}
      <header className="glass sticky top-0 z-30 border-b border-separator">
        <div className="mx-auto grid h-16 max-w-[1500px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="hidden text-[15px] md:block" aria-label="PodcastHelper">
              <Logo />
            </Link>
            <button onClick={() => setSheet("invite")} className="flex min-w-0 items-center gap-1.5 rounded-[10px] border border-separator bg-elevated px-2.5 py-1.5 text-[13px] font-medium hover:bg-fill">
              <span className="truncate font-mono tabular">{code}</span>
              <UserPlus className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-[12px] border border-separator bg-elevated px-3.5 py-1.5 shadow-[var(--shadow)]" aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full ${recording ? "bg-red animate-rec" : rec.state === "idle" ? "bg-green-bright" : "bg-amber"}`} />
            <span className="font-mono text-[22px] font-medium leading-none tracking-tight tabular">{formatDuration(elapsed)}</span>
            <span className="hidden font-mono text-[11px] text-label-3 sm:inline">{statusLabel}</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] md:flex ${syncOk ? "bg-[color-mix(in_srgb,var(--green-bright)_14%,transparent)] text-green" : "bg-fill text-label-3"}`}>
              {snap.isMaster ? "relógio de referência" : sync.synced ? `sync ±${Math.max(1, Math.round(sync.rtt / 2))} ms` : "a sincronizar"}
            </span>
            <span className="font-mono text-[12px] text-label-3">{tiles.length} na sala</span>
          </div>
        </div>
      </header>

      {snap.notice && (
        <div className="mx-auto mt-3 w-full max-w-[1500px] px-4 sm:px-6">
          <p role="status" className="rounded-[12px] bg-accent-soft px-3.5 py-2.5 text-[14px] text-accent-ink">
            {snap.notice}
          </p>
        </div>
      )}
      {isPhone && !director && rec.state !== "idle" && (
        <div className="mx-auto mt-3 w-full max-w-[1500px] px-4 sm:px-6">
          <p className="flex items-center gap-2 rounded-[12px] bg-label px-3.5 py-2.5 text-[14px] text-bg">
            <Smartphone className="h-4 w-4 shrink-0" /> Mantém esta app aberta. O ecrã fica ligado sozinho enquanto gravam.
          </p>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1500px] flex-1 gap-5 px-4 pt-4 pb-32 sm:px-6">
        <main className="min-w-0 flex-1">
          {!snap.isMaster && rec.state === "idle" && (
            <p className="mb-3 text-[14px] text-label-2">
              {master ? `${master.name} controla a gravação.` : "À espera do anfitrião."} Quando começar, este aparelho grava sozinho.
            </p>
          )}
          {tiles.length === 0 ? (
            <Panel className="mx-auto grid max-w-4xl place-items-center p-10 text-center">
              <div>
                <p className="text-[17px] font-medium">Ainda não entrou ninguém para falar.</p>
                <p className="mt-1 text-[15px] text-label-2">Partilha o link. As câmaras aparecem aqui.</p>
                <Button className="mt-4" onClick={() => setSheet("invite")}>
                  <UserPlus className="h-4 w-4" /> Convidar
                </Button>
              </div>
            </Panel>
          ) : (
            <div className={`mx-auto grid gap-3 ${cols}`}>
              {tiles.map((t) => (
                <VideoTile
                  key={t.key}
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
              ))}
            </div>
          )}
          {tiles.length === 1 && !director && (
            <Panel className="mx-auto mt-4 flex max-w-4xl flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-[15px] text-label-2">Ainda estás sozinho. Convida com o link ou o QR code.</p>
              <Button onClick={() => setSheet("invite")}>
                <UserPlus className="h-4 w-4" /> Convidar
              </Button>
            </Panel>
          )}
          {snap.lastEpisodeId && (
            <div className="mx-auto mt-4 max-w-4xl">
              <EpisodeStatus episodeId={snap.lastEpisodeId} transfers={snap.transfers} />
            </div>
          )}
        </main>

        {/* Side panel (desktop) */}
        <aside className={`sticky top-[80px] hidden h-[calc(100dvh-190px)] shrink-0 flex-col lg:flex ${director ? "w-[420px]" : "w-[360px]"}`}>
          <Segmented
            label="Painel"
            value={panel}
            onChange={setPanel}
            options={[
              { value: "console", label: "Consola" },
              { value: "notes", label: "Notas" },
              { value: "chat", label: snap.unread && panel !== "chat" ? `Chat (${snap.unread})` : "Chat" },
              { value: "tests", label: "Testes" },
            ]}
          />
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">{panelContent(panel)}</div>
        </aside>
      </div>

      {/* Dock */}
      <div className="fixed inset-x-0 bottom-0 z-30 pb-[max(14px,env(safe-area-inset-bottom))]">
        <div className="glass mx-auto flex w-fit max-w-[calc(100%-12px)] items-end gap-1.5 overflow-x-auto rounded-[22px] border border-separator px-2.5 py-2 shadow-[var(--shadow)] sm:gap-2.5 sm:px-3">
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
                className="flex h-11 shrink-0 items-center gap-2 rounded-[13px] bg-accent px-4 sm:h-12 sm:rounded-[14px] sm:px-5 text-[15px] font-semibold text-on-accent shadow-[var(--key-shadow)] transition active:translate-y-px"
              >
                <span className="h-3 w-3 rounded-full bg-red" /> Gravar
              </button>
            ) : (
              <button
                onClick={() => studio.stopRecording()}
                disabled={rec.state === "finalizing"}
                className="flex h-11 shrink-0 items-center gap-2 rounded-[13px] bg-label px-4 sm:h-12 sm:rounded-[14px] sm:px-5 text-[15px] font-semibold text-bg shadow-[var(--key-shadow)] transition active:translate-y-px disabled:opacity-50"
              >
                <span className="h-3 w-3 rounded-[3px] bg-red" /> Parar
              </button>
            ))}

          <Key label="Marcar momento (B)" disabled={!recording} onClick={() => studio.addMarker()}>
            <Bookmark className="h-5 w-5" />
          </Key>
          <span className="relative lg:hidden">
            <Key label="Painéis" onClick={() => setSheet("panels")}>
              <LayoutDashboard className="h-5 w-5" />
            </Key>
            {snap.unread > 0 && (
              <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-mono text-[11px] text-on-accent">{snap.unread}</span>
            )}
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

      {/* Countdown */}
      {countdown !== null && countdown > 0 && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-black/30" aria-live="assertive">
          <div key={countdown} className="font-mono text-[140px] font-medium text-white drop-shadow-lg" style={{ animation: "countdown-pop 0.9s ease-out" }}>
            {countdown}
          </div>
        </div>
      )}

      {sheet === "settings" && (
        <Sheet title="Micro e câmara" onClose={() => setSheet(null)}>
          <SettingsPanel settings={snap.settings} onChange={(s) => studio.applySettings(s)} stream={snap.localStream} locked={rec.state !== "idle"} />
        </Sheet>
      )}
      {sheet === "invite" && <InviteSheet code={code} onClose={() => setSheet(null)} />}
      {sheet === "panels" && (
        <Sheet title="Painéis" onClose={() => setSheet(null)}>
          <Segmented
            label="Painel"
            value={mobileTab}
            onChange={setMobileTab}
            options={[
              { value: "console", label: "Consola" },
              { value: "notes", label: "Notas" },
              { value: "chat", label: snap.unread && mobileTab !== "chat" ? `Chat (${snap.unread})` : "Chat" },
              { value: "tests", label: "Testes" },
              ...(director ? [] : [{ value: "settings" as const, label: "Ajustes" }]),
            ]}
          />
          <div className="mt-4">
            {mobileTab === "settings" ? (
              <SettingsPanel settings={snap.settings} onChange={(s) => studio.applySettings(s)} stream={snap.localStream} locked={rec.state !== "idle"} />
            ) : (
              panelContent(mobileTab)
            )}
          </div>
        </Sheet>
      )}
      {(sheet === "console" || sheet === "notes" || sheet === "chat" || sheet === "tests") && (
        <Sheet title={sheet === "console" ? "Consola" : sheet === "notes" ? "Notas partilhadas" : sheet === "chat" ? "Chat" : "Testes"} onClose={() => setSheet(null)}>
          {panelContent(sheet)}
        </Sheet>
      )}
      {sheet === "title" && (
        <Sheet title="Começar a gravar" onClose={() => setSheet(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              studio.startRecording(title.trim() || "Episódio sem título");
              setSheet(null);
            }}
          >
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-label-2">Título do episódio</span>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <div className="mt-4 space-y-1.5 text-[14px] text-label-2">
              <p>
                {tiles.length} {tiles.length === 1 ? "pessoa vai" : "pessoas vão"} gravar. Contagem de 3 segundos e começam todos no mesmo instante.
              </p>
              {snap.peers.some((p) => p.connection !== "connected") && <p className="text-orange">Ainda há quem esteja a ligar. Espera uns segundos.</p>}
              {snap.peers.some((p) => p.info.hidden) && <p className="text-red">Há alguém com a app em segundo plano.</p>}
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
