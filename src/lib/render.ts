// Renders the final video (grid / active speaker) in the browser, in real time:
// the mixed audio plays into a MediaStream while a canvas draws each frame.
import { Compositor, type CompositorInput, type Layout } from "./compositor";
import { mixdown, speakerActivity } from "./mix";
import { buildSegments, editsOf, outToSrc, trackEdit } from "./timeline";
import { trackBlob } from "./tracks";
import { hostToEp, trackOffsetMs, type Episode } from "./types";

export interface RenderOptions {
  layout: Layout;
  height: 720 | 1080;
  fps: 30;
  aspect?: "16:9" | "9:16" | "1:1";
  /** Burn the transcript in as captions. */
  captions?: boolean;
  onProgress?: (phase: "audio" | "video", fraction: number) => void;
  signal?: AbortSignal;
}

function pickOutputMime() {
  const c = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return c.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = url;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Não foi possível abrir um dos vídeos."));
  });
}

export async function renderVideo(ep: Episode, opts: RenderOptions): Promise<Blob> {
  const edits = editsOf(ep);
  const segs = buildSegments(ep, edits);

  // 1. Audio mix (with edits) — fast, offline.
  const audioBlob = await mixdown(ep, { applyEdits: true, format: "wav", onProgress: (f) => opts.onProgress?.("audio", f), signal: opts.signal });
  const activity = await speakerActivity(ep, true);

  // 2. Video elements
  const urls: string[] = [];
  const inputs: CompositorInput[] = [];
  for (const p of ep.participants) {
    const vt = ep.tracks.find((t) => t.peerId === p.peerId && t.kind === "video" && t.complete) || null;
    const at = ep.tracks.find((t) => t.peerId === p.peerId && t.kind === "audio");
    const te = trackEdit(edits, p.peerId);
    if (!vt && !at) continue;
    if (te.muted && !vt) continue;
    let video: HTMLVideoElement | null = null;
    if (vt) {
      const url = URL.createObjectURL(await trackBlob(vt));
      urls.push(url);
      video = await loadVideo(url);
    }
    inputs.push({ participant: p, video, videoTrack: vt, videoOffsetMs: vt ? trackOffsetMs(ep, vt, edits) : 0, edit: te, level: 0 });
  }
  if (!inputs.length) throw new Error("Não há ninguém para mostrar no vídeo.");

  const base = opts.height;
  const aspect = opts.aspect || "16:9";
  const W = aspect === "16:9" ? Math.round((base * 16) / 9) : base;
  const H = aspect === "9:16" ? Math.round((base * 16) / 9) : base;
  const lines = (ep.transcript || []).map((l, i, all) => {
    const ms = hostToEp(ep, l.t);
    const next = all[i + 1];
    return { ms, end: next ? Math.min(hostToEp(ep, next.t), ms + 7000) : ms + 5000, text: l.text };
  });
  const captionAt = (srcMs: number) => (opts.captions ? lines.find((l) => srcMs >= l.ms && srcMs < l.end)?.text ?? null : null);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx2d = canvas.getContext("2d")!;
  const comp = new Compositor(ctx2d, W, H);

  // 3. Audio element -> MediaStream
  const audioUrl = URL.createObjectURL(audioBlob);
  urls.push(audioUrl);
  const audio = new Audio(audioUrl);
  audio.preload = "auto";
  const actx = new AudioContext();
  const src = actx.createMediaElementSource(audio);
  const dest = actx.createMediaStreamDestination();
  src.connect(dest);
  await new Promise<void>((r) => {
    if (audio.readyState >= 2) r();
    else audio.oncanplay = () => r();
  });

  const stream = canvas.captureStream(opts.fps);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = pickOutputMime();
  const rec = new MediaRecorder(stream, {
    mimeType: mime || undefined,
    videoBitsPerSecond: Math.max(W, H) >= 1900 ? 8_000_000 : 5_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));

  const totalMs = audio.duration * 1000;
  const peerIndex = new Map(activity.peerIds.map((id, i) => [id, i]));

  const drawAt = (outMs: number) => {
    const srcMs = outToSrc(segs, outMs);
    const ai = Math.floor((outMs / 1000) * activity.perSecond);
    for (const inp of inputs) {
      const li = peerIndex.get(inp.participant.peerId);
      inp.level = li === undefined ? 0 : (activity.levels[li][ai] || 0) * 3;
      const v = inp.video;
      if (v && inp.videoTrack) {
        const want = (srcMs - inp.videoOffsetMs) / 1000;
        if (want >= -1.5 && want <= inp.videoTrack.durationMs / 1000) {
          if (Math.abs(v.currentTime - Math.max(0, want)) > 0.3) v.currentTime = Math.max(0, want);
          if (v.paused) v.play().catch(() => {});
        } else if (!v.paused) v.pause();
      }
    }
    comp.draw(inputs, srcMs, opts.layout, performance.now(), captionAt(srcMs));
  };

  // Prime the first frame.
  drawAt(0);
  await new Promise((r) => setTimeout(r, 300));
  drawAt(0);

  await actx.resume();
  rec.start(1000);
  await audio.play();

  await new Promise<void>((resolve, reject) => {
    let raf = 0;
    const loop = () => {
      if (opts.signal?.aborted) {
        audio.pause();
        reject(new DOMException("Cancelado", "AbortError"));
        return;
      }
      const outMs = audio.currentTime * 1000;
      drawAt(outMs);
      opts.onProgress?.("video", totalMs ? outMs / totalMs : 0);
      if (audio.ended) {
        resolve();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    // Keep drawing even if rAF is throttled (tab in background).
    const fallback = setInterval(() => {
      if (document.hidden) loop();
    }, 1000 / opts.fps);
    audio.onended = () => {
      clearInterval(fallback);
      cancelAnimationFrame(raf);
      resolve();
    };
    loop();
  }).finally(() => {
    if (rec.state !== "inactive") rec.stop();
  });

  await stopped;
  inputs.forEach((i) => i.video?.pause());
  urls.forEach((u) => URL.revokeObjectURL(u));
  await actx.close();
  return new Blob(chunks, { type: (rec.mimeType || mime || "video/webm").split(";")[0] });
}
