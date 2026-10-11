// Captures raw mono PCM starting at an exact audio frame.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.startFrame = -1;
    this.stopFrame = -1;
    this.recording = false;
    this.started = false;
    this.gates = []; // [pauseFrame, resumeFrame] windows that are not captured
    this.bufSize = 4800;
    this.buf = new Float32Array(this.bufSize);
    this.fill = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.cmd === "start") {
        this.startFrame = m.frame;
        this.stopFrame = -1;
        this.recording = true;
        this.started = false;
        this.fill = 0;
        this.gates = [];
      } else if (m.cmd === "pause") {
        this.gates.push([m.frame, Infinity]);
      } else if (m.cmd === "resume") {
        const g = this.gates[this.gates.length - 1];
        if (g && g[1] === Infinity) g[1] = m.frame;
      } else if (m.cmd === "stop") {
        this.stopFrame = m.frame ?? currentFrame;
      }
    };
  }

  flush() {
    if (this.fill > 0) {
      const out = this.buf.slice(0, this.fill);
      this.port.postMessage({ type: "data", pcm: out }, [out.buffer]);
      this.fill = 0;
    }
  }

  process(inputs) {
    if (!this.recording) return true;
    const input = inputs[0];
    const ch = input && input[0];
    const n = ch ? ch.length : 128;
    const blockStart = currentFrame;
    const blockEnd = currentFrame + n;
    if (blockEnd <= this.startFrame) return true;

    let from = Math.max(0, this.startFrame - blockStart);
    let to = n;
    if (this.stopFrame >= 0) to = Math.min(n, Math.max(0, this.stopFrame - blockStart));

    if (!this.started && from < to) {
      this.started = true;
      this.port.postMessage({ type: "started", frame: blockStart + from });
    }

    const gates = this.gates;
    for (let i = from; i < to; i++) {
      if (gates.length) {
        const f = blockStart + i;
        let skip = false;
        for (let g = 0; g < gates.length; g++) {
          if (f >= gates[g][0] && f < gates[g][1]) {
            skip = true;
            break;
          }
        }
        if (skip) continue;
      }
      this.buf[this.fill++] = ch ? ch[i] : 0;
      if (this.fill === this.bufSize) this.flush();
    }

    if (this.stopFrame >= 0 && blockEnd >= this.stopFrame) {
      this.flush();
      this.recording = false;
      this.port.postMessage({ type: "stopped", frame: this.stopFrame });
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
