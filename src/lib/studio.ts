// Session controller: one per open room. React subscribes through
// useSyncExternalStore (subscribe / getSnapshot).
import { ClockSync } from "./clock";
import { getEpisode, listEpisodes, putEpisode, requestPersistentStorage, storageEstimate, updateEpisode } from "./db";
import { getMedia, keepAwake, saveSettings, type CaptureSettings } from "./media";
import { LocalRecorder } from "./recorder";
import { Room, type CtrlMessage, type PeerInfo, type PeerState } from "./room";
import { recoverTrack } from "./tracks";
import { FileReceiver, FileSender, type TransferProgress } from "./transfer";
import type { Episode, Marker, Participant, TrackMeta } from "./types";
import { nowMs, randomId } from "./util";

export type RecState = "idle" | "countdown" | "recording" | "finalizing";

export interface PeerView {
  info: PeerInfo;
  stream: MediaStream | null;
  connection: RTCPeerConnectionState;
  dataOpen: boolean;
}

export interface StudioSnapshot {
  status: "idle" | "joining" | "joined" | "error";
  error: string | null;
  self: PeerInfo | null;
  localStream: MediaStream | null;
  peers: PeerView[];
  masterId: string | null;
  isMaster: boolean;
  clock: { offset: number; rtt: number; synced: boolean };
  rec: {
    state: RecState;
    episodeId: string | null;
    title: string;
    startHost: number | null;
    hostNowAtSnapshot: number;
  };
  markers: Marker[];
  transfers: TransferProgress[];
  lastEpisodeId: string | null;
  settings: CaptureSettings;
  notes: { text: string; at: number; by: string };
  notice: string | null;
  kicked: boolean;
}

const COUNTDOWN_MS = 3500;

export function isRoomHost(code: string) {
  try {
    return localStorage.getItem(`ph:host:${code}`) === "1";
  } catch {
    return false;
  }
}
export function markRoomHost(code: string) {
  try {
    localStorage.setItem(`ph:host:${code}`, "1");
  } catch {
    /* ignore */
  }
}

export function getPeerId(): string {
  try {
    let id = sessionStorage.getItem("ph:peer");
    if (!id) {
      id = randomId(10);
      sessionStorage.setItem("ph:peer", id);
    }
    return id;
  } catch {
    return randomId(10);
  }
}

export class Studio {
  private listeners = new Set<() => void>();
  private snap: StudioSnapshot;
  private room: Room | null = null;
  private clock: ClockSync | null = null;
  private ctx: AudioContext | null = null;
  private recorder: LocalRecorder | null = null;
  private senders = new Map<string, FileSender>();
  private transfers = new Map<string, TransferProgress>();
  private pendingWants = new Map<string, number>();
  private tick: ReturnType<typeof setInterval> | null = null;
  private recTitle = "";
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private statusTicks = 0;
  private notesTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    settings: CaptureSettings,
  ) {
    this.snap = {
      status: "idle",
      error: null,
      self: null,
      localStream: null,
      peers: [],
      masterId: null,
      isMaster: false,
      clock: { offset: 0, rtt: 0, synced: false },
      rec: { state: "idle", episodeId: null, title: "", startHost: null, hostNowAtSnapshot: 0 },
      markers: [],
      transfers: [],
      lastEpisodeId: null,
      settings,
      notes: { text: "", at: 0, by: "" },
      notice: null,
      kicked: false,
    };
  }

  // ---------- store plumbing ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  private set(patch: Partial<StudioSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((f) => f());
  }
  private setRec(patch: Partial<StudioSnapshot["rec"]>) {
    this.set({ rec: { ...this.snap.rec, ...patch } });
  }

  hostNow() {
    return this.clock ? this.clock.hostNow() : nowMs();
  }

  get audioContext() {
    return this.ctx;
  }

  // ---------- preview (lobby) ----------
  async startPreview(settings: CaptureSettings) {
    this.snap.localStream?.getTracks().forEach((t) => t.stop());
    const stream = await getMedia(settings);
    this.set({ localStream: stream, settings });
    return stream;
  }

  // ---------- join / leave ----------
  async join(name: string, color: string) {
    if (this.room) return;
    this.set({ status: "joining", error: null });
    try {
      await requestPersistentStorage();
      try {
        this.ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
      } catch {
        this.ctx = new AudioContext();
      }
      await this.ctx.resume();
      const stream = this.snap.localStream || (await getMedia(this.snap.settings));
      const self: PeerInfo = {
        peerId: getPeerId(),
        name,
        color,
        role: isRoomHost(this.code) ? "host" : "guest",
        joinedAt: nowMs(),
        video: stream.getVideoTracks().length > 0,
        muted: false,
        recording: false,
      };
      const room = new Room(this.code, self);
      this.room = room;
      this.clock = new ClockSync(room);
      this.recorder = new LocalRecorder(this.ctx, stream, this.snap.settings);
      await this.recorder.prepare();

      room.onPeers((list) => this.onPeers(list));
      room.onCtrl((msg, from) => this.onCtrl(msg, from));
      room.onFileChannel((peerId, ch) => this.attachFileChannel(peerId, ch));
      room.onPeerConnected((peerId) => this.onPeerConnected(peerId));

      await room.join(stream);
      this.set({ status: "joined", self, localStream: stream });
      this.recomputeMaster();
      await keepAwake(true);
      this.tick = setInterval(() => {
        if (!this.clock) return;
        this.set({
          clock: { offset: this.clock.offset, rtt: this.clock.rtt, synced: this.clock.synced },
          rec: { ...this.snap.rec, hostNowAtSnapshot: this.hostNow() },
        });
      }, 500);
      this.recoverInterrupted();
      this.statusTimer = setInterval(() => {
        this.publishStatus();
        if (++this.statusTicks % 3 === 0) this.syncInventory();
      }, 5000);
      this.publishStatus();
    } catch (e) {
      this.set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  async leave() {
    if (this.recorder?.recording && this.snap.rec.episodeId) {
      await this.finishRecording(this.snap.rec.episodeId, undefined);
    }
    if (this.tick) clearInterval(this.tick);
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.clock?.dispose();
    await this.room?.leave();
    this.room = null;
    this.recorder?.dispose();
    this.snap.localStream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
    await keepAwake(false);
    this.set({ status: "idle", localStream: null, peers: [] });
  }

  // ---------- peers ----------
  private onPeers(list: PeerState[]) {
    this.set({
      peers: list.map((p) => ({
        info: p.info,
        stream: p.stream,
        connection: p.connection,
        dataOpen: p.ctrl.readyState === "open",
      })),
    });
    this.recomputeMaster();
  }

  private recomputeMaster() {
    const self = this.snap.self;
    if (!self || !this.clock) return;
    const everyone: PeerInfo[] = [self, ...this.snap.peers.map((p) => p.info)];
    const hosts = everyone.filter((p) => p.role === "host");
    const pool = hosts.length ? hosts : everyone;
    const master = [...pool].sort((a, b) => a.joinedAt - b.joinedAt || a.peerId.localeCompare(b.peerId))[0];
    const masterId = master?.peerId ?? null;
    this.clock.setMaster(masterId);
    if (masterId !== this.snap.masterId || (masterId === self.peerId) !== this.snap.isMaster) {
      this.set({ masterId, isMaster: masterId === self.peerId });
    }
  }

  private attachFileChannel(peerId: string, ch: RTCDataChannel) {
    const onProgress = (p: TransferProgress) => {
      this.transfers.set(`${p.direction}:${p.peerId}:${p.trackId}`, p);
      if (p.done || p.error) this.pendingWants.delete(p.trackId);
      this.set({ transfers: [...this.transfers.values()] });
    };
    const maxMsg = () => {
      const pc = this.room?.peers.get(peerId)?.pc;
      return pc?.sctp?.maxMessageSize || 65536;
    };
    this.senders.set(peerId, new FileSender(peerId, ch, onProgress, maxMsg));
    new FileReceiver(peerId, ch, onProgress, (track) => this.onTrackReceived(track));
  }

  /** Periodic catch-up: share what we have so anyone missing a file asks again. */
  private async syncInventory() {
    if (!this.room || this.snap.rec.state !== "idle") return;
    const eps = (await listEpisodes()).filter((e) => e.roomCode === this.code).slice(0, 3);
    if (!eps.length) return;
    for (const p of this.snap.peers) {
      if (p.dataOpen) this.room.sendDirect(p.info.peerId, { type: "inventory", episodes: eps.map(stripEdits) });
    }
  }

  private async onPeerConnected(peerId: string) {
    // Exchange what each side has, so late joiners and reconnects catch up.
    const eps = (await listEpisodes()).filter((e) => e.roomCode === this.code).slice(0, 10);
    this.room?.sendTo(peerId, { type: "inventory", episodes: eps.map(stripEdits) });
    if (this.snap.notes.at) this.room?.sendTo(peerId, { type: "notes", ...this.snap.notes });
    // If we're recording and we're the master, bring the newcomer in.
    if (this.snap.isMaster && this.snap.rec.state === "recording" && this.snap.rec.episodeId) {
      const ep = await getEpisode(this.snap.rec.episodeId);
      if (ep) {
        this.room?.sendTo(peerId, {
          type: "rec-start",
          episodeId: ep.id,
          title: ep.title,
          startHost: ep.startHost,
          participants: this.participants(),
          late: true,
        });
      }
    }
  }

  // ---------- control messages ----------
  private onCtrl(msg: CtrlMessage, from: string) {
    switch (msg.type) {
      case "rec-start":
        if (from === this.snap.masterId || msg.late) this.beginRecording(msg.episodeId, msg.title, msg.startHost, from, msg.participants);
        break;
      case "rec-stop":
        if (this.snap.rec.episodeId === msg.episodeId) this.finishRecording(msg.episodeId, msg.stopHost);
        break;
      case "marker":
        this.addMarkerLocal(msg.episodeId, msg.marker);
        break;
      case "track-ready":
      case "inventory": {
        const eps: Episode[] = msg.type === "inventory" ? msg.episodes : [msg.episode];
        for (const ep of eps) this.mergeRemoteEpisode(ep, from);
        break;
      }
      case "want":
        this.onWant(msg.trackIds as string[], from);
        break;
      case "notes":
        if (msg.at > this.snap.notes.at) {
          this.set({ notes: { text: msg.text, at: msg.at, by: msg.by } });
          this.persistNotes();
        }
        break;
      case "host-mute":
        if (from === this.snap.masterId && msg.to === this.snap.self?.peerId) {
          this.setMuted(true);
          this.notify("O anfitrião desligou o teu micro. Podes voltar a ligá-lo quando quiseres.");
        }
        break;
      case "kick":
        if (from === this.snap.masterId && msg.to === this.snap.self?.peerId) {
          this.set({ kicked: true });
          this.leave();
        }
        break;
    }
  }

  private participants(): Participant[] {
    const self = this.snap.self!;
    return [self, ...this.snap.peers.map((p) => p.info)].map((p) => ({ peerId: p.peerId, name: p.name, color: p.color }));
  }

  // ---------- recording ----------
  canRecord() {
    return this.snap.isMaster && this.snap.status === "joined";
  }

  startRecording(title: string) {
    if (!this.canRecord() || this.snap.rec.state !== "idle") return;
    const episodeId = `${this.code}-${Date.now().toString(36)}`;
    const startHost = this.hostNow() + COUNTDOWN_MS;
    const participants = this.participants();
    this.room?.broadcast({ type: "rec-start", episodeId, title, startHost, participants });
    this.beginRecording(episodeId, title, startHost, this.snap.self!.peerId, participants);
  }

  stopRecording() {
    const id = this.snap.rec.episodeId;
    if (!this.canRecord() || !id || (this.snap.rec.state !== "recording" && this.snap.rec.state !== "countdown")) return;
    const stopHost = this.hostNow() + 250;
    this.room?.broadcast({ type: "rec-stop", episodeId: id, stopHost });
    this.finishRecording(id, stopHost);
  }

  private async beginRecording(episodeId: string, title: string, startHost: number, hostPeerId: string, participants: Participant[]) {
    if (this.snap.rec.state !== "idle" || !this.recorder || !this.clock) return;
    const self = this.snap.self!;
    this.recTitle = title;
    const actualStartHost = Math.max(startHost, this.hostNow() + 150);
    this.setRec({ state: "countdown", episodeId, title, startHost: actualStartHost });
    this.set({ markers: [] });

    const hasVideo = (this.snap.localStream?.getVideoTracks().length ?? 0) > 0;
    const audioId = `${episodeId}:${self.peerId}:audio`;
    const videoId = hasVideo ? `${episodeId}:${self.peerId}:video` : null;

    await updateEpisode(episodeId, (cur) => {
      const ep: Episode =
        cur ||
        ({
          id: episodeId,
          roomCode: this.code,
          title,
          createdAt: Date.now(),
          startHost,
          stopHost: null,
          hostPeerId,
          participants: [],
          markers: [],
          tracks: [],
        } as Episode);
      ep.participants = mergeParticipants(ep.participants, participants);
      if (this.snap.notes.at && (ep.notesUpdatedAt || 0) < this.snap.notes.at) {
        ep.notes = this.snap.notes.text;
        ep.notesUpdatedAt = this.snap.notes.at;
      }
      const base = { episodeId, peerId: self.peerId, name: self.name, color: self.color, startHost: actualStartHost, durationMs: 0, size: 0, complete: false, local: true };
      ep.tracks = ep.tracks.filter((t) => t.id !== audioId && t.id !== videoId);
      ep.tracks.push({ ...base, id: audioId, kind: "audio", mime: "audio/wav", sampleRate: this.recorder!.sampleRate });
      if (videoId) ep.tracks.push({ ...base, id: videoId, kind: "video", mime: "" });
      return ep;
    });

    await this.recorder.start(this.clock.toLocal(actualStartHost), audioId, videoId);
    this.room?.updateSelf({ recording: true });
    const wait = Math.max(0, this.clock.toLocal(actualStartHost) - nowMs());
    setTimeout(() => {
      if (this.snap.rec.state === "countdown" && this.snap.rec.episodeId === episodeId) this.setRec({ state: "recording" });
    }, wait);
  }

  private async finishRecording(episodeId: string, stopHost: number | undefined) {
    if (!this.recorder?.recording || !this.clock) return;
    this.setRec({ state: "finalizing" });
    const self = this.snap.self!;
    const result = await this.recorder.stop(stopHost ? this.clock.toLocal(stopHost) : undefined);
    const toHost = (local: number) => this.clock!.toHost(local);
    const ep = await updateEpisode(episodeId, (cur) => {
      if (!cur) return cur;
      cur.stopHost = Math.max(cur.stopHost || 0, stopHost || this.hostNow());
      cur.tracks = cur.tracks.map((t) => {
        if (t.peerId !== self.peerId) return t;
        if (t.kind === "audio") {
          return { ...t, startHost: toHost(result.audio.startLocal), durationMs: result.audio.durationMs, size: result.audio.size, sampleRate: result.audio.sampleRate, complete: true };
        }
        if (t.kind === "video" && result.video) {
          return {
            ...t,
            startHost: toHost(result.video.startLocal),
            durationMs: result.video.durationMs,
            size: result.video.size,
            mime: result.video.mime,
            width: result.video.width,
            height: result.video.height,
            complete: result.video.size > 0,
          };
        }
        return t;
      });
      return cur;
    });
    this.room?.updateSelf({ recording: false });
    this.setRec({ state: "idle", startHost: null });
    this.set({ lastEpisodeId: episodeId });
    if (ep) this.room?.broadcast({ type: "track-ready", episode: stripEdits(ep) });
  }

  addMarker(label = "") {
    const id = this.snap.rec.episodeId;
    if (!id || this.snap.rec.state !== "recording") return;
    const marker: Marker = { id: randomId(8), t: this.hostNow(), by: this.snap.self!.name, label: label || `Marcador ${this.snap.markers.length + 1}` };
    this.room?.broadcast({ type: "marker", episodeId: id, marker });
    this.addMarkerLocal(id, marker);
  }

  private async addMarkerLocal(episodeId: string, marker: Marker) {
    if (this.snap.rec.episodeId === episodeId && !this.snap.markers.some((m) => m.id === marker.id)) {
      this.set({ markers: [...this.snap.markers, marker] });
    }
    await updateEpisode(episodeId, (cur) => {
      if (!cur || cur.markers.some((m) => m.id === marker.id)) return undefined;
      cur.markers.push(marker);
      return cur;
    });
  }

  // ---------- sharing ----------
  private async mergeRemoteEpisode(remote: Episode, from: string) {
    if (remote.roomCode !== this.code) return;
    const settings = this.snap.settings;
    const wants: string[] = [];
    await updateEpisode(remote.id, (cur) => {
      const ep: Episode = cur || { ...remote, tracks: [], edits: undefined };
      ep.title = cur?.title || remote.title;
      ep.stopHost = Math.max(ep.stopHost || 0, remote.stopHost || 0) || null;
      ep.participants = mergeParticipants(ep.participants, remote.participants);
      for (const m of remote.markers) if (!ep.markers.some((x) => x.id === m.id)) ep.markers.push(m);
      if ((remote.notesUpdatedAt || 0) > (ep.notesUpdatedAt || 0)) {
        ep.notes = remote.notes;
        ep.notesUpdatedAt = remote.notesUpdatedAt;
      }
      for (const rt of remote.tracks) {
        const mine = ep.tracks.find((t) => t.id === rt.id);
        if (mine?.local) continue;
        if (mine?.complete) continue;
        const meta: TrackMeta = { ...rt, local: false, complete: false };
        if (mine) Object.assign(mine, meta);
        else ep.tracks.push(meta);
        const wanted = rt.kind === "audio" || settings.receiveVideo;
        const pending = this.pendingWants.get(rt.id);
        if (rt.complete && wanted && (!pending || Date.now() - pending > 45_000)) {
          wants.push(rt.id);
          this.pendingWants.set(rt.id, Date.now());
        }
      }
      return ep;
    });
    if (wants.length) this.room?.sendTo(from, { type: "want", trackIds: wants });
  }

  private async onWant(trackIds: string[], from: string) {
    const sender = this.senders.get(from);
    if (!sender) return;
    const eps = await listEpisodes();
    for (const id of trackIds) {
      for (const ep of eps) {
        const t = ep.tracks.find((x) => x.id === id);
        if (t && t.complete) sender.enqueue(t);
      }
    }
  }

  private async onTrackReceived(track: TrackMeta) {
    await updateEpisode(track.episodeId, (cur) => {
      if (!cur) return cur;
      const i = cur.tracks.findIndex((t) => t.id === track.id);
      if (i >= 0) cur.tracks[i] = { ...cur.tracks[i], ...track, complete: true, local: false };
      else cur.tracks.push(track);
      return cur;
    });
  }

  /** Tracks this device was recording when the tab died: make them usable. */
  private async recoverInterrupted() {
    const eps = await listEpisodes();
    for (const ep of eps) {
      const broken = ep.tracks.filter((t) => t.local && !t.complete);
      if (!broken.length) continue;
      const fixed = await Promise.all(broken.map((t) => recoverTrack(t)));
      await updateEpisode(ep.id, (cur) => {
        if (!cur) return cur;
        cur.tracks = cur.tracks.map((t) => fixed.find((f) => f.id === t.id) || t);
        return cur;
      });
    }
  }

  // ---------- notes ----------
  setNotes(text: string) {
    const notes = { text, at: this.hostNow(), by: this.snap.self?.name || "" };
    this.set({ notes });
    if (this.notesTimer) clearTimeout(this.notesTimer);
    this.notesTimer = setTimeout(() => {
      this.room?.broadcast({ type: "notes", ...this.snap.notes });
      this.persistNotes();
    }, 350);
  }

  private persistNotes() {
    const id = this.snap.rec.episodeId || this.snap.lastEpisodeId;
    if (!id) return;
    const { text, at } = this.snap.notes;
    updateEpisode(id, (cur) => {
      if (!cur || (cur.notesUpdatedAt || 0) >= at) return undefined;
      cur.notes = text;
      cur.notesUpdatedAt = at;
      return cur;
    });
  }

  // ---------- host tools ----------
  muteParticipant(peerId: string) {
    if (!this.snap.isMaster) return;
    this.room?.sendTo(peerId, { type: "host-mute", to: peerId });
  }

  removeParticipant(peerId: string) {
    if (!this.snap.isMaster) return;
    this.room?.broadcast({ type: "kick", to: peerId });
  }

  notify(text: string | null) {
    this.set({ notice: text });
  }

  private async publishStatus() {
    if (!this.room || !this.clock) return;
    const vt = this.snap.localStream?.getVideoTracks()[0]?.getSettings();
    const est = await storageEstimate();
    this.room.updateSelf({
      syncMs: this.clock.synced ? Math.round(this.clock.rtt / 2) : undefined,
      res: vt?.width ? `${vt.width}×${vt.height} · ${Math.round(vt.frameRate || 0)} fps` : undefined,
      storageFreeGb: est ? Math.max(0, Math.round(((est.quota - est.usage) / 1e9) * 10) / 10) : undefined,
    });
    this.set({ self: this.room.self });
  }

  // ---------- local controls ----------
  setMuted(muted: boolean) {
    this.snap.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.room?.updateSelf({ muted });
    if (this.snap.self) this.set({ self: { ...this.snap.self, muted } });
  }

  async applySettings(settings: CaptureSettings) {
    saveSettings(settings);
    if (this.recorder?.recording) {
      this.set({ settings });
      return;
    }
    const old = this.snap.localStream;
    old?.getTracks().forEach((t) => t.stop());
    const stream = await getMedia(settings);
    if (this.snap.self?.muted) stream.getAudioTracks().forEach((t) => (t.enabled = false));
    this.set({ localStream: stream, settings });
    if (this.ctx && this.recorder) {
      this.recorder.dispose();
      this.recorder = new LocalRecorder(this.ctx, stream, settings);
      await this.recorder.prepare();
    }
    await this.room?.replaceLocalStream(stream);
    this.room?.updateSelf({ video: stream.getVideoTracks().length > 0 });
    if (this.snap.self) this.set({ self: { ...this.snap.self, video: stream.getVideoTracks().length > 0 } });
  }

  /** Debug info for tests. */
  debug() {
    const peers = this.room ? [...this.room.peers.values()] : [];
    return peers.map((p) => ({ id: p.info.peerId, name: p.info.name, pc: p.pc.connectionState, ice: p.pc.iceConnectionState, sig: p.pc.signalingState, ctrl: p.ctrl.readyState, file: p.file.readyState }));
  }

  get elapsedMs() {
    return this.recorder?.recording ? this.recorder.elapsedMs : 0;
  }
}

function mergeParticipants(a: Participant[], b: Participant[]): Participant[] {
  const out = [...a];
  for (const p of b) {
    const i = out.findIndex((x) => x.peerId === p.peerId);
    if (i >= 0) out[i] = { ...out[i], ...p };
    else out.push(p);
  }
  return out;
}

function stripEdits(ep: Episode): Episode {
  const rest = { ...ep };
  delete rest.edits;
  return rest;
}

export async function saveEpisode(ep: Episode) {
  await putEpisode(ep);
}
