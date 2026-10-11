"use client";

import { Gauge, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { loadSettings, saveSettings, type CaptureSettings } from "@/lib/media";
import { Studio, getPeerId, isRoomHost } from "@/lib/studio";
import { colorFor, normalizeRoomCode } from "@/lib/util";
import { Button, Header, Panel, Segmented, inputClass } from "../ui";
import { ChecksPanel } from "./checks-panel";
import { InRoom } from "./in-room";
import { LobbyMeter } from "./lobby-meter";
import { SettingsPanel } from "./settings-sheet";
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
          <h1 className="text-[28px] font-semibold">{snap.kickReason === "locked" ? "A sala está fechada" : "Saíste da sala"}</h1>
          <p className="mt-2 text-label-2">
            {snap.kickReason === "locked"
              ? "O anfitrião trancou esta sala. Pede-lhe para a abrir e tenta de novo."
              : "O anfitrião removeu-te desta sala. As tuas gravações continuam guardadas neste aparelho."}
          </p>
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
          {!director && !previewError && <LobbyMeter stream={snap.localStream} />}
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
            <details className="group rounded-[14px] border border-separator bg-panel">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-[16px] font-semibold">Micro e câmara</span>
                  <span className="block text-[13px] text-label-3">
                    {settings.headphones ? "Com fones" : "Sem fones"} · {settings.videoEnabled ? `câmara ${settings.resolution === "max" ? "na qualidade máxima" : `${settings.resolution}p`}` : "sem câmara"}
                  </span>
                </span>
                <span className="text-[14px] font-medium text-accent-ink group-open:hidden">Ajustar</span>
                <span className="hidden text-[14px] font-medium text-accent-ink group-open:inline">Fechar</span>
              </summary>
              <div className="border-t border-separator p-5">
                <SettingsPanel settings={settings} onChange={setSettings} stream={snap.localStream} locked={false} />
              </div>
            </details>
          )}
        </div>
      </main>
    </>
  );
}

