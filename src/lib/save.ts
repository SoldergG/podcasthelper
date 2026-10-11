// Saving exported files. In a browser this is a normal download; inside the
// Android/iOS app (Capacitor WebView) blob downloads don't work, so the file is
// written in chunks to Documents/PodcastHelper instead.
import { downloadBlob } from "./util";

type CapacitorGlobal = { isNativePlatform?: () => boolean };

export function isNativeApp(): boolean {
  const cap = (globalThis as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

/** Returns a short description of where the file went. */
export async function saveFile(blob: Blob, name: string, onProgress?: (f: number) => void): Promise<string> {
  if (!isNativeApp()) {
    downloadBlob(blob, name);
    return "Transferências";
  }
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const path = `PodcastHelper/${name}`;
  const SLICE = 3 * 1024 * 1024; // multiple of 3 so base64 chunks concatenate cleanly
  try {
    await Filesystem.requestPermissions().catch(() => {});
    for (let off = 0; off < blob.size || off === 0; off += SLICE) {
      const data = toBase64(await blob.slice(off, off + SLICE).arrayBuffer());
      if (off === 0) await Filesystem.writeFile({ path, data, directory: Directory.Documents, recursive: true });
      else await Filesystem.appendFile({ path, data, directory: Directory.Documents });
      onProgress?.(Math.min(1, (off + SLICE) / Math.max(1, blob.size)));
      if (blob.size === 0) break;
    }
  } catch (e) {
    throw new Error(`Não foi possível guardar o ficheiro: ${e instanceof Error ? e.message : String(e)}`);
  }
  return `Documentos/PodcastHelper/${name}`;
}
