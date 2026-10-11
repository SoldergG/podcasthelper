// Peer-to-peer file transfer over an ordered, reliable RTCDataChannel.
// On the same Wi-Fi this goes straight through the local network.
import { deleteChunks, putChunk } from "./db";
import { rawTrackBlob } from "./tracks";
import type { TrackMeta } from "./types";

const READ_SLICE = 4 * 1024 * 1024;
const HIGH_WATER = 8 * 1024 * 1024;
const LOW_WATER = 1 * 1024 * 1024;
const STORE_BATCH = 8 * 1024 * 1024;

export interface TransferProgress {
  trackId: string;
  peerId: string;
  direction: "send" | "recv";
  bytes: number;
  total: number;
  done: boolean;
  error?: string;
}

type ProgressFn = (p: TransferProgress) => void;

function waitLow(ch: RTCDataChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ch.bufferedAmount <= LOW_WATER) return resolve();
    const onLow = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error("ligação fechada"));
    };
    const cleanup = () => {
      ch.removeEventListener("bufferedamountlow", onLow);
      ch.removeEventListener("close", onClose);
    };
    ch.addEventListener("bufferedamountlow", onLow);
    ch.addEventListener("close", onClose);
  });
}

function waitOpen(ch: RTCDataChannel, timeoutMs = 30000): Promise<void> {
  if (ch.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("canal não abriu")), timeoutMs);
    ch.addEventListener(
      "open",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

/** One sender queue per peer so files go one after another. */
export class FileSender {
  private queue: TrackMeta[] = [];
  private running = false;
  private queued = new Set<string>();

  constructor(
    private peerId: string,
    private ch: RTCDataChannel,
    private onProgress: ProgressFn,
    private maxMessage: () => number,
  ) {
    ch.bufferedAmountLowThreshold = LOW_WATER;
  }

  enqueue(track: TrackMeta) {
    if (this.queued.has(track.id)) return;
    this.queued.add(track.id);
    this.queue.push(track);
    this.run();
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const track = this.queue.shift()!;
        try {
          await this.sendTrack(track);
        } catch (e) {
          this.onProgress({ trackId: track.id, peerId: this.peerId, direction: "send", bytes: 0, total: track.size, done: false, error: String(e) });
        } finally {
          this.queued.delete(track.id);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async sendTrack(track: TrackMeta) {
    await waitOpen(this.ch);
    const blob = await rawTrackBlob(track.id);
    const total = blob.size;
    const chunk = Math.max(16 * 1024, Math.min(64 * 1024, this.maxMessage()));
    this.ch.send(JSON.stringify({ t: "begin", track: { ...track, size: total }, total }));
    let sent = 0;
    let lastReport = 0;
    for (let off = 0; off < total; off += READ_SLICE) {
      const buf = new Uint8Array(await blob.slice(off, Math.min(total, off + READ_SLICE)).arrayBuffer());
      for (let i = 0; i < buf.length; i += chunk) {
        if (this.ch.bufferedAmount > HIGH_WATER) await waitLow(this.ch);
        if (this.ch.readyState !== "open") throw new Error("ligação fechada");
        this.ch.send(buf.subarray(i, Math.min(buf.length, i + chunk)));
        sent += Math.min(chunk, buf.length - i);
      }
      const now = performance.now();
      if (now - lastReport > 200) {
        lastReport = now;
        this.onProgress({ trackId: track.id, peerId: this.peerId, direction: "send", bytes: sent, total, done: false });
      }
    }
    this.ch.send(JSON.stringify({ t: "end", trackId: track.id }));
    this.onProgress({ trackId: track.id, peerId: this.peerId, direction: "send", bytes: total, total, done: true });
  }
}

/** Receives files from one peer and stores them as chunks. */
export class FileReceiver {
  private current: { track: TrackMeta; total: number; bytes: number; parts: Uint8Array[]; partBytes: number; index: number; writes: Promise<unknown>[] } | null = null;
  private lastReport = 0;

  constructor(
    private peerId: string,
    ch: RTCDataChannel,
    private onProgress: ProgressFn,
    private onComplete: (track: TrackMeta) => void,
  ) {
    ch.binaryType = "arraybuffer";
    ch.addEventListener("message", (ev) => this.onMessage(ev.data));
  }

  private onMessage(data: string | ArrayBuffer) {
    if (typeof data === "string") {
      const msg = JSON.parse(data);
      if (msg.t === "begin") {
        const track = msg.track as TrackMeta;
        this.current = { track, total: msg.total, bytes: 0, parts: [], partBytes: 0, index: 0, writes: [deleteChunks(track.id)] };
        this.onProgress({ trackId: track.id, peerId: this.peerId, direction: "recv", bytes: 0, total: msg.total, done: false });
      } else if (msg.t === "end" && this.current) {
        const cur = this.current;
        this.current = null;
        this.flush(cur);
        Promise.all(cur.writes).then(() => {
          this.onProgress({ trackId: cur.track.id, peerId: this.peerId, direction: "recv", bytes: cur.total, total: cur.total, done: true });
          this.onComplete({ ...cur.track, complete: true, local: false });
        });
      }
      return;
    }
    const cur = this.current;
    if (!cur) return;
    const u8 = new Uint8Array(data);
    cur.parts.push(u8);
    cur.partBytes += u8.length;
    cur.bytes += u8.length;
    if (cur.partBytes >= STORE_BATCH) this.flush(cur);
    const now = performance.now();
    if (now - this.lastReport > 200) {
      this.lastReport = now;
      this.onProgress({ trackId: cur.track.id, peerId: this.peerId, direction: "recv", bytes: cur.bytes, total: cur.total, done: false });
    }
  }

  private flush(cur: NonNullable<FileReceiver["current"]>) {
    if (!cur.parts.length) return;
    const blob = new Blob(cur.parts as BlobPart[]);
    cur.parts = [];
    cur.partBytes = 0;
    const idx = cur.index++;
    // Chain after the delete of stale chunks.
    const prev = cur.writes[0];
    cur.writes.push(prev.then(() => putChunk(cur.track.id, idx, blob)));
  }
}
