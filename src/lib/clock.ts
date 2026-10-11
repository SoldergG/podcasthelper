// NTP-style clock sync against the room's clock master (the host).
// offset = masterClock - localClock, estimated from the lowest-RTT samples.
import type { CtrlMessage, Room } from "./room";
import { nowMs } from "./util";

interface Sample {
  offset: number;
  rtt: number;
  at: number;
}

export class ClockSync {
  private samples: Sample[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private masterId: string | null = null;
  private unsub: (() => void) | null = null;
  offset = 0;
  rtt = 0;
  synced = false;

  constructor(private room: Room) {
    this.unsub = room.onCtrl((msg, from) => this.onMsg(msg, from));
  }

  /** Host clock time for "now" on this device. */
  hostNow() {
    return nowMs() + this.offset;
  }
  toLocal(hostTime: number) {
    return hostTime - this.offset;
  }
  toHost(localTime: number) {
    return localTime + this.offset;
  }

  setMaster(masterId: string | null) {
    if (masterId === this.masterId) return;
    this.masterId = masterId;
    this.samples = [];
    if (!masterId || masterId === this.room.self.peerId) {
      this.offset = 0;
      this.rtt = 0;
      this.synced = true;
      this.stop();
      return;
    }
    this.synced = false;
    this.start();
  }

  private start() {
    this.stop();
    const burst = () => {
      for (let i = 0; i < 6; i++) setTimeout(() => this.ping(), i * 120);
    };
    burst();
    this.timer = setInterval(burst, 4000);
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private ping() {
    if (!this.masterId) return;
    const sent = this.room.sendDirect(this.masterId, { type: "clock-ping", t0: nowMs() });
    if (!sent) this.room.sendTo(this.masterId, { type: "clock-ping", t0: nowMs() });
  }

  private onMsg(msg: CtrlMessage, from: string) {
    if (msg.type === "clock-ping") {
      // Answer anyone (we may be the master).
      const reply = { type: "clock-pong", t0: msg.t0, t1: nowMs() };
      if (!this.room.sendDirect(from, reply)) this.room.sendTo(from, reply);
      return;
    }
    if (msg.type === "clock-pong" && from === this.masterId) {
      const t2 = nowMs();
      const rtt = t2 - msg.t0;
      if (rtt < 0 || rtt > 5000) return;
      const offset = msg.t1 - (msg.t0 + t2) / 2;
      this.samples.push({ offset, rtt, at: t2 });
      // Keep the last ~60s of samples.
      this.samples = this.samples.filter((s) => t2 - s.at < 60_000).slice(-60);
      const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 5);
      this.offset = best.reduce((n, s) => n + s.offset, 0) / best.length;
      this.rtt = best[0].rtt;
      this.synced = this.samples.length >= 3;
    }
  }

  dispose() {
    this.stop();
    this.unsub?.();
  }
}
