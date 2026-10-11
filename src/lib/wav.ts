// 16-bit PCM mono/stereo WAV helpers. Data is kept as Blob slices so hour-long
// files never need to be fully loaded in memory.

export const WAV_HEADER_BYTES = 44;

export function wavHeader(dataBytes: number, sampleRate: number, channels = 1): ArrayBuffer {
  const buf = new ArrayBuffer(WAV_HEADER_BYTES);
  const v = new DataView(buf);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  // RIFF sizes are uint32: clamp for >4GB (players still read it fine)
  const riff = Math.min(0xffffffff, 36 + dataBytes);
  writeStr(0, "RIFF");
  v.setUint32(4, riff, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, Math.min(0xffffffff, dataBytes), true);
  return buf;
}

export function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function int16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] / 0x8000;
  return out;
}

/** Reads the sample rate and data offset of a WAV blob we produced. */
export async function readWavInfo(blob: Blob): Promise<{ sampleRate: number; channels: number; dataOffset: number; frames: number }> {
  const head = new DataView(await blob.slice(0, WAV_HEADER_BYTES).arrayBuffer());
  const channels = head.getUint16(22, true) || 1;
  const sampleRate = head.getUint32(24, true) || 48000;
  const dataOffset = WAV_HEADER_BYTES;
  const frames = Math.floor((blob.size - dataOffset) / (2 * channels));
  return { sampleRate, channels, dataOffset, frames };
}

/** Reads `count` mono frames starting at `frame` (zero-filled outside range). */
export async function readFrames(
  blob: Blob,
  info: { channels: number; dataOffset: number; frames: number },
  frame: number,
  count: number,
): Promise<Float32Array> {
  const out = new Float32Array(count);
  const start = Math.max(0, frame);
  const end = Math.min(info.frames, frame + count);
  if (end <= start) return out;
  const bytesPerFrame = 2 * info.channels;
  const buf = await blob
    .slice(info.dataOffset + start * bytesPerFrame, info.dataOffset + end * bytesPerFrame)
    .arrayBuffer();
  const pcm = new Int16Array(buf);
  const offset = start - frame;
  if (info.channels === 1) {
    for (let i = 0; i < pcm.length; i++) out[offset + i] = pcm[i] / 0x8000;
  } else {
    const n = pcm.length / info.channels;
    for (let i = 0; i < n; i++) out[offset + i] = pcm[i * info.channels] / 0x8000;
  }
  return out;
}

/** Linear resampler for a block (good enough for 44.1k <-> 48k alignment). */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number, outLength: number): Float32Array {
  if (fromRate === toRate) return input.length === outLength ? input : input.slice(0, outLength);
  const out = new Float32Array(outLength);
  const ratio = fromRate / toRate;
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = input[i0] ?? 0;
    const b = input[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}
