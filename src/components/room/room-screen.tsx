"use client";

import {
  Bookmark,
  Check,
  Copy,
  Mic,
  MicOff,
  NotebookPen,
  PhoneOff,
  Settings2,
  UserPlus,
  Users,
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
import { Button, Card, Header, IconButton, Segmented, inputClass } from "../ui";
import { EpisodeStatus } from "./episode-status";
import { SettingsPanel, Sheet } from "./settings-sheet";
import { NotesPanel, PeoplePanel } from "./side-panels";
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
  const [settings, setSettings] = useState<CaptureSettings>(snap.settings);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const host = isRoomHost(code);

  useEffect(() => {
    let cancelled = false;
    studio
      .startPreview(settings)
      .then(() => !cancelled && setPreviewError(null))
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.name : String(e);
        setPreviewError(
          msg === "NotAllowedError"
            ? "Não deste permissão ao micro/câmara. Ativa nas definições do navegador e recarrega."
            : msg === "NotFoundError"
              ? "Não encontrámos micro ou câmara. Liga um e tenta de novo."
              : msg === "OverconstrainedError"
                ? "Esta câmara não suporta essa resolução. Escolhe outra."
                : "Não foi possível abrir o micro/câmara.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [studio, settings]);

  const join = () => {
    const n = name.trim() || "Convidado";
    try {
      localStorage.setItem("ph:name", n);
    } catch {
      /* ignore */
    }
    saveSettings(settings);
    studio.join(n, colorForPeer(getPeerId()));
  };

  return (
    <>
      <Header />
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
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
          {previewError && <p className="rounded-[12px] bg-red-soft px-3 py-2 text-[14px] text-red">{previewError}</p>}
          <Card className="p-5">
            <h2 className="text-[17px] font-semibold">Antes de entrar</h2>
            <ul className="mt-2 space-y-1.5 text-[14px] text-label-2">
              <li>🎧 Põe os fones (com fio é o ideal).</li>
              <li>🔌 Liga o carregador e deixa o ecrã aceso durante a gravação.</li>
              <li>📶 Na mesma casa? Usem a mesma Wi-Fi para partilhar mais depressa.</li>
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-[13px] font-medium text-label-3">
              Sala <span className="tabular font-mono text-label-2">{code}</span>
              {host && " · és o anfitrião"}
            </p>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[13px] font-medium text-label-2">O teu nome</span>
              <input
                className={inputClass}
                value={name}
                maxLength={40}
                autoComplete="nickname"
                placeholder="Como te chamam?"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
            </label>
            <Button size="lg" className="mt-4 w-full" onClick={join} disabled={snap.status === "joining" || !!previewError}>
              {snap.status === "joining" ? "A entrar…" : "Entrar na sala"}
            </Button>
            {snap.error && <p className="mt-3 text-[14px] text-red">{snap.error}</p>}
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 text-[17px] font-semibold">Micro e câmara</h2>
            <SettingsPanel settings={settings} onChange={setSettings} stream={snap.localStream} locked={false} />
          </Card>
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------- In room

type Panel = "notes" | "people" | "recordings";

function InRoom({ studio, code }: { studio: Studio; code: string }) {
  const snap = useSyncExternalStore(studio.subscribe, studio.getSnapshot, studio.getSnapshot);
  const [sheet, setSheet] = useState<null | "settings" | "invite" | "title" | Panel>(null);
  const [panel, setPanel] = useState<Panel>("notes");
  const [title, setTitle] = useState(() => `Episódio de ${new Date().toLocaleDateString("pt-PT", { day: "numeric", month: "long" })}`);
  const [now, setNow] = useState(() => nowMs());

  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), 200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!snap.notice) return;
    const t = setTimeout(() => studio.notify(null), 6000);
    return () => clearTimeout(t);
  }, [snap.notice, studio]);

  const self = snap.self!;
  const hostNow = now + snap.clock.offset;
  const rec = snap.rec;
  const recording = rec.state === "recording";
  const countdown = rec.state === "countdown" && rec.startHost ? Math.ceil((rec.startHost - hostNow) / 1000) : null;
  const elapsed = recording && rec.startHost ? Math.max(0, hostNow - rec.startHost) : 0;
  const master = snap.masterId === self.peerId ? self : snap.peers.find((p) => p.info.peerId === snap.masterId)?.info;

  const tiles = useMemo(
    () => [
      { key: self.peerId, stream: snap.localStream, info: self, isSelf: true, connection: "connected" as string },
      ...snap.peers.map((p) => ({ key: p.info.peerId, stream: p.stream, info: p.info, isSelf: false, connection: p.connection as string })),
    ],
    [snap.localStream, snap.peers, self],
  );

  const cols = tiles.length <= 1 ? "grid-cols-1 max-w-4xl" : tiles.length <= 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

  const leave = async () => {
    if (rec.state !== "idle" && !confirm("Estás a gravar. Sair agora termina a tua gravação. Sair mesmo?")) return;
    await studio.leave();
    window.location.href = snap.lastEpisodeId ? `/estudio?e=${encodeURIComponent(snap.lastEpisodeId)}` : "/episodios";
  };

  const sync = snap.clock;
  const syncLabel = snap.isMaster ? "Relógio de referência" : sync.synced ? `Sincronizado ±${Math.max(1, Math.round(sync.rtt / 2))} ms` : "A sincronizar…";

  const panelContent = (p: Panel) =>
    p === "notes" ? (
      <NotesPanel snap={snap} onChange={(t) => studio.setNotes(t)} />
    ) : p === "people" ? (
      <PeoplePanel snap={snap} onMute={(id) => studio.muteParticipant(id)} onRemove={(id) => studio.removeParticipant(id)} />
    ) : snap.lastEpisodeId ? (
      <EpisodeStatus episodeId={snap.lastEpisodeId} transfers={snap.transfers} />
    ) : (
      <p className="text-[14px] text-label-3">Quando pararem de gravar, as gravações de todos aparecem aqui e passam para este aparelho.</p>
    );

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar */}
      <header className="glass sticky top-0 z-30 border-b border-separator">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="hidden text-[15px] font-semibold sm:block">
            PodcastHelper
          </Link>
          <button
            onClick={() => setSheet("invite")}
            className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[13px] font-medium hover:bg-fill-strong"
          >
            <span className="tabular font-mono">{code}</span>
            <UserPlus className="h-3.5 w-3.5" />
          </button>
          <span className={`hidden items-center gap-1.5 text-[13px] md:flex ${sync.synced || snap.isMaster ? "text-green" : "text-label-3"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${sync.synced || snap.isMaster ? "bg-green-bright" : "bg-label-3"}`} />
            {syncLabel}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {recording ? (
              <span className="flex items-center gap-2 rounded-full bg-red-soft px-3 py-1.5 text-[14px] font-semibold text-red">
                <span className="h-2 w-2 rounded-full bg-red animate-rec" />
                <span className="tabular">{formatDuration(elapsed)}</span>
              </span>
            ) : rec.state === "finalizing" ? (
              <span className="text-[13px] text-label-2">A guardar…</span>
            ) : (
              <span className="text-[13px] text-label-3">{tiles.length} na sala</span>
            )}
          </div>
        </div>
      </header>

      {snap.notice && (
        <div className="mx-auto mt-3 w-full max-w-7xl px-4 sm:px-6">
          <p role="status" className="rounded-[12px] bg-accent-soft px-3.5 py-2.5 text-[14px] text-accent">
            {snap.notice}
          </p>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-5 px-4 pt-4 pb-32 sm:px-6">
        <main className="min-w-0 flex-1">
          {!snap.isMaster && rec.state === "idle" && (
            <p className="mb-3 text-[14px] text-label-2">
              {master ? `${master.name} controla a gravação.` : "À espera do anfitrião."} Quando começar, o teu aparelho grava sozinho.
            </p>
          )}
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
                badge={t.info.peerId === snap.masterId ? "Anfitrião" : undefined}
              />
            ))}
          </div>
          {tiles.length === 1 && (
            <Card className="mx-auto mt-4 max-w-4xl p-5 text-center">
              <p className="text-[15px] text-label-2">Ainda estás sozinho. Convida as outras pessoas com o link ou o QR code.</p>
              <Button className="mt-3" onClick={() => setSheet("invite")}>
                <UserPlus className="h-4 w-4" /> Convidar
              </Button>
            </Card>
          )}
          {snap.lastEpisodeId && (
            <div className="mx-auto mt-4 max-w-4xl lg:hidden">
              <EpisodeStatus episodeId={snap.lastEpisodeId} transfers={snap.transfers} />
            </div>
          )}
        </main>

        {/* Side panel (desktop) */}
        <aside className="sticky top-[72px] hidden h-[calc(100dvh-180px)] w-[340px] shrink-0 flex-col lg:flex">
          <Segmented
            label="Painel"
            value={panel}
            onChange={setPanel}
            options={[
              { value: "notes", label: "Notas" },
              { value: "people", label: "Pessoas" },
              { value: "recordings", label: "Gravações" },
            ]}
          />
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">{panelContent(panel)}</div>
        </aside>
      </div>

      {/* Dock */}
      <div className="fixed inset-x-0 bottom-0 z-30 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="glass mx-auto flex w-fit max-w-[calc(100%-16px)] items-center gap-2 rounded-full border border-separator px-2.5 py-2 shadow-[var(--shadow)] sm:gap-3 sm:px-3">
          <IconButton label={self.muted ? "Ligar micro" : "Desligar micro"} active={self.muted} onClick={() => studio.setMuted(!self.muted)}>
            {self.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </IconButton>
          <IconButton
            label={snap.settings.videoEnabled ? "Desligar câmara" : "Ligar câmara"}
            active={!snap.settings.videoEnabled}
            disabled={rec.state !== "idle"}
            onClick={() => studio.applySettings({ ...snap.settings, videoEnabled: !snap.settings.videoEnabled })}
          >
            {snap.settings.videoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </IconButton>

          {snap.isMaster ? (
            rec.state === "idle" ? (
              <button
                onClick={() => setSheet("title")}
                className="flex h-12 items-center gap-2 rounded-full bg-red px-5 text-[15px] font-semibold text-white shadow-[var(--shadow)] transition active:scale-95 hover:brightness-110"
              >
                <span className="h-3 w-3 rounded-full bg-white" /> Gravar
              </button>
            ) : (
              <button
                onClick={() => studio.stopRecording()}
                disabled={rec.state === "finalizing"}
                className="flex h-12 items-center gap-2 rounded-full bg-label px-5 text-[15px] font-semibold text-bg shadow-[var(--shadow)] transition active:scale-95 disabled:opacity-50"
              >
                <span className="h-3 w-3 rounded-[3px] bg-red" /> Parar
              </button>
            )
          ) : null}

          <IconButton label="Marcar este momento" disabled={!recording} onClick={() => studio.addMarker()}>
            <Bookmark className="h-5 w-5" />
          </IconButton>
          <IconButton label="Notas" className="lg:hidden" onClick={() => setSheet("notes")}>
            <NotebookPen className="h-5 w-5" />
          </IconButton>
          <IconButton label="Pessoas" className="lg:hidden" onClick={() => setSheet("people")}>
            <Users className="h-5 w-5" />
          </IconButton>
          <IconButton label="Definições" onClick={() => setSheet("settings")}>
            <Settings2 className="h-5 w-5" />
          </IconButton>
          <IconButton label="Sair da sala" tone="danger" onClick={leave}>
            <PhoneOff className="h-5 w-5" />
          </IconButton>
        </div>
      </div>

      {/* Countdown */}
      {countdown !== null && countdown > 0 && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-black/25" aria-live="assertive">
          <div key={countdown} className="text-[120px] font-semibold text-white drop-shadow-lg" style={{ animation: "countdown-pop 0.9s ease-out" }}>
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
      {(sheet === "notes" || sheet === "people" || sheet === "recordings") && (
        <Sheet title={sheet === "notes" ? "Notas partilhadas" : sheet === "people" ? "Pessoas na sala" : "Gravações"} onClose={() => setSheet(null)}>
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
              <span className="mb-1.5 block text-[13px] font-medium text-label-2">Título do episódio</span>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <div className="mt-4 space-y-1 text-[13px] text-label-3">
              <p>
                {tiles.length} {tiles.length === 1 ? "pessoa vai" : "pessoas vão"} gravar. Há uma contagem de 3 segundos e todos começam no mesmo instante.
              </p>
              {snap.peers.some((p) => !p.info.syncMs && p.connection !== "connected") && (
                <p className="text-orange">Ainda há quem esteja a ligar. Podes esperar uns segundos.</p>
              )}
            </div>
            <Button type="submit" variant="rec" size="lg" className="mt-5 w-full">
              <span className="h-3 w-3 rounded-full bg-white" /> Gravar
            </Button>
          </form>
        </Sheet>
      )}
    </div>
  );
}

function InviteSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/sala?c=${code}` : "";
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 440, color: { dark: "#1d1d1f", light: "#ffffff" } }).then(setQr).catch(() => {});
  }, [url]);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [url]);
  const share = async () => {
    try {
      await navigator.share?.({ title: "Entra no meu podcast", url });
    } catch {
      /* cancelled */
    }
  };
  return (
    <Sheet title="Convidar pessoas" onClose={onClose}>
      <p className="text-[15px] text-label-2">Abre o link no telemóvel ou computador. Não precisam de conta.</p>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="QR code com o link da sala" className="mx-auto mt-4 h-52 w-52 rounded-[16px] border border-separator" />
      )}
      <div className="mt-4 flex items-center gap-2 rounded-[12px] bg-fill p-1.5 pl-3.5">
        <span className="min-w-0 flex-1 truncate text-[14px]">{url}</span>
        <Button size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      {typeof navigator !== "undefined" && "share" in navigator && (
        <Button variant="secondary" className="mt-3 w-full" onClick={share}>
          Partilhar…
        </Button>
      )}
      <p className="mt-4 text-center text-[13px] text-label-3">
        Código da sala: <span className="tabular font-mono font-medium text-label-2">{code}</span>
      </p>
    </Sheet>
  );
}
