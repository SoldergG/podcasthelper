"use client";

import { MicOff, VideoOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { createLevelMeter } from "@/lib/media";

export function useLevelRef(stream: MediaStream | null, ctx: AudioContext | null, apply: (level: number) => void) {
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    if (!stream || !ctx || !stream.getAudioTracks().length) return;
    const meter = createLevelMeter(stream, ctx);
    let raf = 0;
    let smooth = 0;
    const loop = () => {
      const v = meter.read();
      smooth = Math.max(v, smooth * 0.85);
      applyRef.current(smooth);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      meter.dispose();
    };
  }, [stream, ctx]);
}

export function VideoTile({
  stream,
  name,
  color,
  isSelf,
  mirror,
  muted,
  videoOn,
  recording,
  connection,
  ctx,
  badge,
}: {
  stream: MediaStream | null;
  name: string;
  color: string;
  isSelf: boolean;
  mirror: boolean;
  muted: boolean;
  videoOn: boolean;
  recording: boolean;
  connection?: string;
  ctx: AudioContext | null;
  badge?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) v.play().catch(() => {});
  }, [stream]);

  useLevelRef(stream, ctx, (level) => {
    const speaking = level > 0.06 && !muted;
    if (ringRef.current) ringRef.current.style.opacity = speaking ? "1" : "0";
    if (dotRef.current) dotRef.current.style.transform = `scale(${1 + Math.min(1, level * 2) * 0.8})`;
  });

  const hasVideo = videoOn && !!stream?.getVideoTracks().length;
  const connecting = !isSelf && connection && connection !== "connected";

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[18px] bg-grouped shadow-[var(--shadow)]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf}
        className={`h-full w-full object-cover transition-opacity ${hasVideo ? "opacity-100" : "opacity-0"}`}
        style={mirror ? { transform: "scaleX(-1)" } : undefined}
      />
      {!hasVideo && (
        <div className="absolute inset-0 grid place-items-center bg-elevated">
          <div
            className="grid h-20 w-20 place-items-center rounded-full text-[32px] font-semibold text-white sm:h-24 sm:w-24"
            style={{ background: color }}
          >
            {(name || "?").trim().charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[18px] opacity-0 transition-opacity duration-150"
        style={{ boxShadow: "inset 0 0 0 3px var(--green-bright)" }}
      />
      <div className="absolute bottom-2.5 left-2.5 flex max-w-[calc(100%-20px)] items-center gap-1.5 rounded-full bg-black/55 py-1 pr-3 pl-2 text-[13px] font-medium text-white backdrop-blur-md">
        <span ref={dotRef} className="h-2 w-2 shrink-0 rounded-full transition-transform" style={{ background: color }} />
        <span className="truncate">
          {name}
          {isSelf ? " (tu)" : ""}
        </span>
        {muted && <MicOff aria-label="Micro desligado" className="h-3.5 w-3.5 shrink-0" />}
        {!videoOn && <VideoOff aria-label="Câmara desligada" className="h-3.5 w-3.5 shrink-0" />}
      </div>
      <div className="absolute top-2.5 left-2.5 flex gap-1.5">
        {recording && (
          <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-[#ff3b30] animate-rec" />
            A gravar
          </span>
        )}
        {badge && (
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur-md">{badge}</span>
        )}
      </div>
      {connecting && (
        <div className="absolute top-2.5 right-2.5 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur-md">
          {connection === "failed" ? "Sem ligação direta" : "A ligar…"}
        </div>
      )}
    </div>
  );
}
