// MediaRecorder WebM files have no Duration, which breaks seeking in players and
// editors. This patches the Segment > Info element in the first bytes only, so it
// works on multi-GB recordings without reading the whole file.

const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;

function readVint(b: Uint8Array, pos: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null {
  const first = b[pos];
  if (first === undefined || first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while (!(first & mask)) {
    mask >>= 1;
    length++;
  }
  if (pos + length > b.length) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[pos + i];
    if (b[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function encodeSize8(size: number): Uint8Array {
  const out = new Uint8Array(8);
  out[0] = 0x01;
  let v = size;
  for (let i = 7; i >= 1; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

export async function fixWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
  const HEAD = Math.min(blob.size, 256 * 1024);
  const b = new Uint8Array(await blob.slice(0, HEAD).arrayBuffer());
  let pos = 0;
  // Skip EBML header
  const ebmlId = readVint(b, pos, true);
  if (!ebmlId) return blob;
  const ebmlSize = readVint(b, pos + ebmlId.length, false);
  if (!ebmlSize) return blob;
  pos += ebmlId.length + ebmlSize.length + ebmlSize.value;

  const segId = readVint(b, pos, true);
  if (!segId || segId.value !== ID_SEGMENT) return blob;
  const segSizePos = pos + segId.length;
  const segSize = readVint(b, segSizePos, false);
  if (!segSize) return blob;
  let p = segSizePos + segSize.length;

  while (p < b.length) {
    const id = readVint(b, p, true);
    if (!id) return blob;
    const size = readVint(b, p + id.length, false);
    if (!size) return blob;
    const dataStart = p + id.length + size.length;
    if (id.value === ID_INFO) {
      const dataEnd = dataStart + size.value;
      if (dataEnd > b.length) return blob;
      let timecodeScale = 1_000_000;
      let q = dataStart;
      const children: Uint8Array[] = [];
      while (q < dataEnd) {
        const cid = readVint(b, q, true);
        const csize = cid && readVint(b, q + cid.length, false);
        if (!cid || !csize) return blob;
        const cEnd = q + cid.length + csize.length + csize.value;
        if (cid.value === ID_DURATION) return blob; // already has one
        if (cid.value === ID_TIMECODE_SCALE) {
          let v = 0;
          for (let i = q + cid.length + csize.length; i < cEnd; i++) v = v * 256 + b[i];
          if (v > 0) timecodeScale = v;
        }
        children.push(b.slice(q, cEnd));
        q = cEnd;
      }
      const dur = new Uint8Array(11);
      dur[0] = 0x44;
      dur[1] = 0x89;
      dur[2] = 0x88; // size = 8
      new DataView(dur.buffer).setFloat64(3, durationMs * (1_000_000 / timecodeScale), false);
      children.push(dur);
      const bodyLen = children.reduce((n, c) => n + c.length, 0);
      const newInfo = new Uint8Array(4 + 8 + bodyLen);
      newInfo.set([0x15, 0x49, 0xa9, 0x66], 0);
      newInfo.set(encodeSize8(bodyLen), 4);
      let o = 12;
      for (const c of children) {
        newInfo.set(c, o);
        o += c.length;
      }
      const before = b.slice(0, p);
      const delta = newInfo.length - (dataEnd - p);
      if (!segSize.unknown) {
        // Re-encode the segment size in place with the same byte length.
        const newSeg = segSize.value + delta;
        const len = segSize.length;
        const bytes = new Uint8Array(len);
        let v = newSeg;
        for (let i = len - 1; i >= 0; i--) {
          bytes[i] = v % 256;
          v = Math.floor(v / 256);
        }
        bytes[0] |= 0x80 >> (len - 1);
        before.set(bytes, segSizePos);
      }
      return new Blob([before, newInfo, blob.slice(dataEnd)], { type: blob.type });
    }
    if (size.unknown) return blob;
    p = dataStart + size.value;
  }
  return blob;
}
