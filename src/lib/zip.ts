// Streaming "stored" (uncompressed) ZIP writer. Media is already compressed, and
// this keeps multi-GB exports out of memory: the result is a Blob made of the
// original Blob slices plus small headers. Uses ZIP64 when needed.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

async function crc32Blob(blob: Blob, onBytes?: (n: number) => void): Promise<number> {
  let crc = 0xffffffff;
  const SLICE = 8 * 1024 * 1024;
  for (let off = 0; off < blob.size; off += SLICE) {
    const buf = new Uint8Array(await blob.slice(off, off + SLICE).arrayBuffer());
    for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    onBytes?.(buf.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  blob: Blob;
}

function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export async function buildZip(entries: ZipEntry[], onProgress?: (fraction: number) => void): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const totalBytes = entries.reduce((n, e) => n + e.blob.size, 0) || 1;
  let done = 0;
  const { time, date } = dosDateTime(new Date());

  for (const entry of entries) {
    const name = enc.encode(entry.name);
    const size = entry.blob.size;
    const crc = await crc32Blob(entry.blob, (n) => {
      done += n;
      onProgress?.(done / totalBytes);
    });
    const zip64 = size >= 0xffffffff || offset >= 0xffffffff;

    // Local header (with ZIP64 extra if needed)
    const localExtra = zip64 ? 20 : 0;
    const local = new DataView(new ArrayBuffer(30 + name.length + localExtra));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, zip64 ? 45 : 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, zip64 ? 0xffffffff : size, true);
    local.setUint32(22, zip64 ? 0xffffffff : size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, localExtra, true);
    new Uint8Array(local.buffer).set(name, 30);
    if (zip64) {
      const o = 30 + name.length;
      local.setUint16(o, 0x0001, true);
      local.setUint16(o + 2, 16, true);
      local.setBigUint64(o + 4, BigInt(size), true);
      local.setBigUint64(o + 12, BigInt(size), true);
    }
    parts.push(local.buffer, entry.blob);

    // Central directory record
    const cExtra = zip64 ? 28 : 0;
    const c = new DataView(new ArrayBuffer(46 + name.length + cExtra));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, zip64 ? 45 : 20, true);
    c.setUint16(6, zip64 ? 45 : 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, zip64 ? 0xffffffff : size, true);
    c.setUint32(24, zip64 ? 0xffffffff : size, true);
    c.setUint16(28, name.length, true);
    c.setUint16(30, cExtra, true);
    c.setUint32(42, zip64 ? 0xffffffff : offset, true);
    new Uint8Array(c.buffer).set(name, 46);
    if (zip64) {
      const o = 46 + name.length;
      c.setUint16(o, 0x0001, true);
      c.setUint16(o + 2, 24, true);
      c.setBigUint64(o + 4, BigInt(size), true);
      c.setBigUint64(o + 12, BigInt(size), true);
      c.setBigUint64(o + 20, BigInt(offset), true);
    }
    central.push(new Uint8Array(c.buffer));
    offset += local.byteLength + size;
  }

  const cdStart = offset;
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  parts.push(...(central as BlobPart[]));

  const needZip64 = cdStart >= 0xffffffff || entries.length >= 0xffff;
  if (needZip64) {
    const z = new DataView(new ArrayBuffer(56 + 20));
    z.setUint32(0, 0x06064b50, true);
    z.setBigUint64(4, BigInt(44), true);
    z.setUint16(12, 45, true);
    z.setUint16(14, 45, true);
    z.setBigUint64(24, BigInt(entries.length), true);
    z.setBigUint64(32, BigInt(entries.length), true);
    z.setBigUint64(40, BigInt(cdSize), true);
    z.setBigUint64(48, BigInt(cdStart), true);
    // locator
    z.setUint32(56, 0x07064b50, true);
    z.setBigUint64(64, BigInt(cdStart + cdSize), true);
    z.setUint32(72, 1, true);
    parts.push(z.buffer);
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Math.min(0xffff, entries.length), true);
  end.setUint16(10, Math.min(0xffff, entries.length), true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, needZip64 ? 0xffffffff : cdStart, true);
  parts.push(end.buffer);
  onProgress?.(1);
  return new Blob(parts, { type: "application/zip" });
}
