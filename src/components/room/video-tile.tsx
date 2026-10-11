"use client";

import { EyeOff, MicOff, VideoOff } from "lucide-react";
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
  volume = 1,
  hidden = false,
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
  /** Local listening volume for remote people. */
  volume?: number;
  hidden?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) v.play().catch(() => {});
  }, [stream]);

  useEffect(() => {
    if (videoRef.current && !isSelf) videoRef.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume, isSelf]);

  useLevelRef(stream, ctx, (level) => {
    const speaking = level > 0.06 && !muted;
    if (ringRef.current) ringRef.current.style.opacity = speaking ? "1" : "0";
  });

  const hasVideo = videoOn && !!stream?.getVideoTracks().length;
  const connecting = !isSelf && connection && connection !== "connected";

  return (
    <div style={{ containerType: "size" }} className="relative aspect-video w-full overflow-hidden rounded-[14px] bg-[#1b1b1f] shadow-[var(--shadow)]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isSelf}
        className={`h-full w-full object-cover transition-opacity ${hasVideo ? "opacity-100" : "opacity-0"}`}
        style={mirror ? { transform: "scaleX(-1)" } : undefined}
      />
      {!hasVideo && (
        <div className="absolute inset-0 grid place-items-center bg-[#1b1b1f]">
          <div className="grid aspect-square h-[34%] place-items-center rounded-full font-semibold text-white" style={{ background: color, fontSize: "clamp(14px, 15cqh, 44px)" }}>
            {(name || "?").trim().charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      <div
        ref={ringRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[14px] opacity-0 transition-opacity duration-150"
        style={{ boxShadow: "inset 0 0 0 3px var(--green-bright)" }}
      />
      <div className="absolute bottom-2.5 left-2.5 flex max-w-[calc(100%-20px)] items-center gap-1.5 rounded-[10px] bg-black/60 py-1 pr-2.5 pl-2 text-[13px] font-medium text-white backdrop-blur-md">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="truncate">
          {name}
          {isSelf ? " (tu)" : ""}
        </span>
        {muted && <MicOff aria-label="Micro desligado" className="h-3.5 w-3.5 shrink-0 text-[#ff6b5f]" />}
        {!videoOn && <VideoOff aria-label="Câmara desligada" className="h-3.5 w-3.5 shrink-0 opacity-80" />}
      </div>
      <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
        {recording && (
          <span className="flex items-center gap-1.5 rounded-[8px] bg-black/60 px-2 py-1 font-mono text-[11px] font-medium text-white backdrop-blur-md">
            <span className="h-2 w-2 rounded-full bg-[#ff3b30] animate-rec" />
            REC
          </span>
        )}
        {badge && <span className="rounded-[8px] bg-accent px-2 py-1 font-mono text-[11px] font-medium text-on-accent">{badge}</span>}
        {hidden && (
          <span className="flex items-center gap-1 rounded-[8px] bg-[#ff3b30] px-2 py-1 text-[11px] font-medium text-white">
            <EyeOff className="h-3 w-3" /> Saiu da app
          </span>
        )}
      </div>
      {connecting && (
        <div className="absolute top-2.5 right-2.5 rounded-[8px] bg-black/60 px-2 py-1 text-[12px] font-medium text-white backdrop-blur-md">
          {connection === "failed" ? "Sem ligação direta" : "A ligar…"}
        </div>
      )}
    </div>
  );
}
