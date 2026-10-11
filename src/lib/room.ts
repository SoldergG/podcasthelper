// Room transport: Supabase Realtime (presence + signaling + control messages)
// and a WebRTC full mesh (live call, low-latency control, file transfer).
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { nowMs } from "./util";

export interface PeerInfo {
  peerId: string;
  name: string;
  color: string;
  role: "host" | "guest";
  joinedAt: number;
  video: boolean;
  muted: boolean;
  recording: boolean;
  /** Live status shared with the host. */
  syncMs?: number;
  res?: string;
  storageFreeGb?: number;
}

export interface PeerState {
  info: PeerInfo;
  pc: RTCPeerConnection;
  ctrl: RTCDataChannel;
  file: RTCDataChannel;
  stream: MediaStream | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  connection: RTCPeerConnectionState;
  pendingCandidates: RTCIceCandidateInit[];
  /** The polite side waits for the first offer instead of racing it (a rollback would close the data channels). */
  negotiatedOnce: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CtrlMessage = { type: string; from?: string; [k: string]: any };

type Listener<T> = (v: T) => void;

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] },
  ];
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (turn) {
    servers.push({
      urls: turn.split(","),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

const LIVE_MAX_BITRATE = 900_000;
const LIVE_MAX_HEIGHT = 540;

export class Room {
  readonly peers = new Map<string, PeerState>();
  private channel: RealtimeChannel | null = null;
  private localStream: MediaStream | null = null;
  private closed = false;

  // listeners
  private peerListeners = new Set<Listener<PeerState[]>>();
  private ctrlListeners = new Set<(msg: CtrlMessage, peerId: string) => void>();
  private fileChannelListeners = new Set<(peerId: string, ch: RTCDataChannel) => void>();
  private connectedListeners = new Set<(peerId: string) => void>();
  private statusListeners = new Set<Listener<string>>();

  constructor(
    readonly code: string,
    public self: PeerInfo,
  ) {}

  // ---------- events ----------
  onPeers(fn: Listener<PeerState[]>) {
    this.peerListeners.add(fn);
    return () => this.peerListeners.delete(fn);
  }
  onCtrl(fn: (msg: CtrlMessage, peerId: string) => void) {
    this.ctrlListeners.add(fn);
    return () => this.ctrlListeners.delete(fn);
  }
  onFileChannel(fn: (peerId: string, ch: RTCDataChannel) => void) {
    this.fileChannelListeners.add(fn);
    return () => this.fileChannelListeners.delete(fn);
  }
  onPeerConnected(fn: (peerId: string) => void) {
    this.connectedListeners.add(fn);
    return () => this.connectedListeners.delete(fn);
  }
  onStatus(fn: Listener<string>) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }
  private emitPeers() {
    const list = [...this.peers.values()];
    this.peerListeners.forEach((f) => f(list));
  }
  private emitCtrl(msg: CtrlMessage, peerId: string) {
    this.ctrlListeners.forEach((f) => f(msg, peerId));
  }

  // ---------- lifecycle ----------
  async join(stream: MediaStream) {
    this.localStream = stream;
    await this.subscribe(true);
  }

  /**
   * Presence is only used to announce who is in the room (tracked once per
   * subscription: Supabase rate-limits presence updates). Live status goes
   * through "peer-status" messages instead.
   */
  private subscribe(initial: boolean): Promise<void> {
    const ch = supabase().channel(`ph:${this.code}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.self.peerId } },
    });
    this.channel = ch;

    ch.on("presence", { event: "sync" }, () => this.onPresenceSync());
    ch.on("broadcast", { event: "signal" }, ({ payload }) => {
      if (payload?.to === this.self.peerId) this.onSignal(payload.from, payload.data);
    });
    ch.on("broadcast", { event: "ctrl" }, ({ payload }) => {
      if (!payload) return;
      if (payload.to && payload.to !== this.self.peerId) return;
      this.handleCtrl(payload, payload.from);
    });

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => initial && reject(new Error("Não foi possível ligar ao servidor da sala.")), 15000);
      let settled = false;
      ch.subscribe(async (status) => {
        this.statusListeners.forEach((f) => f(status));
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          await ch.track(this.presenceInfo());
          if (!settled) {
            settled = true;
            resolve();
          }
          // Let everyone know our current status after (re)joining.
          this.broadcast({ type: "peer-status", info: this.self });
        } else if ((status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !this.closed && this.channel === ch) {
          // The server dropped us (e.g. rate limit): rejoin with a fresh channel.
          this.channel = null;
          supabase().removeChannel(ch).catch(() => {});
          setTimeout(() => {
            if (!this.closed && !this.channel) this.subscribe(false).catch(() => {});
          }, 1500 + Math.random() * 1500);
        }
      });
    });
  }

  /** Stable identity fields only. */
  private presenceInfo(): PeerInfo {
    const { peerId, name, color, role, joinedAt } = this.self;
    return { peerId, name, color, role, joinedAt, video: this.self.video, muted: false, recording: false };
  }

  async leave() {
    this.closed = true;
    for (const p of this.peers.values()) this.closePeer(p);
    this.peers.clear();
    const ch = this.channel;
    this.channel = null;
    if (ch) {
      try {
        await ch.untrack();
      } catch {
        /* ignore */
      }
      await supabase().removeChannel(ch);
    }
    this.emitPeers();
  }

  /** Share live status (mute, recording, sync, storage…) with everyone. */
  updateSelf(patch: Partial<PeerInfo>) {
    this.self = { ...this.self, ...patch };
    const msg = { type: "peer-status", info: this.self };
    let viaServer = false;
    for (const id of this.peers.keys()) if (!this.sendDirect(id, msg)) viaServer = true;
    if (viaServer) this.broadcast(msg);
  }

  private handleCtrl(msg: CtrlMessage, from: string) {
    if (msg.type === "peer-status") {
      const p = this.peers.get(from);
      if (p && msg.info) {
        p.info = { ...p.info, ...msg.info, peerId: from };
        this.emitPeers();
      }
      return;
    }
    this.emitCtrl(msg, from);
  }

  // ---------- control messages ----------

  /** Reliable-ish broadcast through the server (works even if P2P is down). */
  broadcast(msg: CtrlMessage) {
    const payload = { ...msg, from: this.self.peerId };
    this.channel?.send({ type: "broadcast", event: "ctrl", payload }).catch(() => {});
  }

  /** Direct message: data channel if open, server otherwise. */
  sendTo(peerId: string, msg: CtrlMessage) {
    const payload = { ...msg, from: this.self.peerId };
    const p = this.peers.get(peerId);
    if (p && p.ctrl.readyState === "open") {
      p.ctrl.send(JSON.stringify(payload));
    } else {
      this.channel?.send({ type: "broadcast", event: "ctrl", payload: { ...payload, to: peerId } });
    }
  }

  /** Only via data channel (for latency-sensitive messages such as clock pings). */
  sendDirect(peerId: string, msg: CtrlMessage): boolean {
    const p = this.peers.get(peerId);
    if (!p || p.ctrl.readyState !== "open") return false;
    p.ctrl.send(JSON.stringify({ ...msg, from: this.self.peerId }));
    return true;
  }

  // ---------- local media ----------

  async replaceLocalStream(stream: MediaStream) {
    this.localStream = stream;
    for (const p of this.peers.values()) {
      const senders = p.pc.getSenders();
      for (const kind of ["audio", "video"] as const) {
        const track = stream.getTracks().find((t) => t.kind === kind) || null;
        const sender = senders.find((s) => s.track?.kind === kind || (!s.track && (s as RTCRtpSender & { _kind?: string })._kind === kind));
        if (sender) {
          await sender.replaceTrack(track);
        } else if (track) {
          const s = p.pc.addTrack(track, stream);
          (s as RTCRtpSender & { _kind?: string })._kind = kind;
        }
      }
      this.tuneSenders(p);
    }
  }

  private tuneSenders(p: PeerState) {
    for (const sender of p.pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      const h = sender.track.getSettings().height || 720;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = LIVE_MAX_BITRATE;
      params.encodings[0].scaleResolutionDownBy = Math.max(1, h / LIVE_MAX_HEIGHT);
      sender.setParameters(params).catch(() => {});
    }
  }

  // ---------- presence & peers ----------

  private onPresenceSync() {
    if (!this.channel || this.closed) return;
    const state = this.channel.presenceState<PeerInfo>();
    const present = new Map<string, PeerInfo>();
    for (const [key, metas] of Object.entries(state)) {
      const latest = metas[metas.length - 1];
      if (key !== this.self.peerId && latest) present.set(key, latest as unknown as PeerInfo);
    }
    for (const [id, info] of present) {
      const existing = this.peers.get(id);
      if (existing) existing.info = { ...info, ...existing.info, name: info.name, role: info.role, joinedAt: info.joinedAt };
      else this.createPeer(id, info);
    }
    for (const [id, p] of this.peers) {
      if (!present.has(id)) {
        this.closePeer(p);
        this.peers.delete(id);
      }
    }
    this.emitPeers();
  }

  private signal(to: string, data: unknown) {
    this.channel?.send({ type: "broadcast", event: "signal", payload: { from: this.self.peerId, to, data } });
  }

  private createPeer(peerId: string, info?: PeerInfo): PeerState {
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    const ctrl = pc.createDataChannel("ctrl", { negotiated: true, id: 0 });
    const file = pc.createDataChannel("file", { negotiated: true, id: 1 });
    file.binaryType = "arraybuffer";
    const p: PeerState = {
      info:
        info ||
        ({ peerId, name: "…", color: "#8E8E93", role: "guest", joinedAt: nowMs(), video: false, muted: false, recording: false } as PeerInfo),
      pc,
      ctrl,
      file,
      stream: null,
      makingOffer: false,
      ignoreOffer: false,
      polite: this.self.peerId < peerId,
      connection: "new",
      pendingCandidates: [],
      negotiatedOnce: false,
    };
    this.peers.set(peerId, p);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        const s = pc.addTrack(track, this.localStream);
        (s as RTCRtpSender & { _kind?: string })._kind = track.kind;
      }
    }

    pc.onnegotiationneeded = async () => {
      if (p.polite && !p.negotiatedOnce) return;
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.signal(peerId, { description: pc.localDescription });
      } catch (e) {
        console.warn("negotiation", e);
      } finally {
        p.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signal(peerId, { candidate });
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (!stream) return;
      p.stream = stream;
      this.emitPeers();
    };
    pc.onconnectionstatechange = () => {
      p.connection = pc.connectionState;
      if (pc.connectionState === "connected") this.tuneSenders(p);
      if (pc.connectionState === "failed") pc.restartIce();
      this.emitPeers();
    };
    ctrl.onopen = () => {
      ctrl.send(JSON.stringify({ type: "peer-status", info: this.self, from: this.self.peerId }));
      this.connectedListeners.forEach((f) => f(peerId));
      this.emitPeers();
    };
    ctrl.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        this.handleCtrl(msg, peerId);
      } catch {
        /* ignore */
      }
    };
    this.fileChannelListeners.forEach((f) => f(peerId, file));
    return p;
  }

  private async onSignal(from: string, data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }) {
    if (this.closed) return;
    const p = this.peers.get(from) || this.createPeer(from);
    const pc = p.pc;
    try {
      if (data.description) {
        const description = data.description;
        const offerCollision = description.type === "offer" && (p.makingOffer || pc.signalingState !== "stable");
        p.ignoreOffer = !p.polite && offerCollision;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        for (const c of p.pendingCandidates.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (description.type === "offer") {
          await pc.setLocalDescription();
          this.signal(from, { description: pc.localDescription });
        }
        p.negotiatedOnce = true;
      } else if (data.candidate) {
        if (!pc.remoteDescription) {
          p.pendingCandidates.push(data.candidate);
          return;
        }
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (e) {
          if (!p.ignoreOffer) console.warn("ice", e);
        }
      }
    } catch (e) {
      console.warn("signal", e);
    }
  }

  private closePeer(p: PeerState) {
    try {
      p.ctrl.close();
      p.file.close();
      p.pc.close();
    } catch {
      /* ignore */
    }
  }
}
