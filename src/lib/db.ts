// Minimal IndexedDB layer. Everything recorded lives on the device until exported.
import type { Episode } from "./types";

const DB_NAME = "podcasthelper";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("episodes")) db.createObjectStore("episodes", { keyPath: "id" });
      // key: [trackId, index]
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks");
      // key: trackId -> Blob (assembled file)
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      // key: trackId -> { peaks: Float32Array, perSecond: number }
      if (!db.objectStoreNames.contains("peaks")) db.createObjectStore("peaks");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const req = fn(s);
        let result: T;
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

// ---------- episodes ----------

export function putEpisode(ep: Episode) {
  return tx("episodes", "readwrite", (s) => s.put(ep));
}

export function getEpisode(id: string) {
  return tx<Episode | undefined>("episodes", "readonly", (s) => s.get(id));
}

export async function listEpisodes(): Promise<Episode[]> {
  const all = await tx<Episode[]>("episodes", "readonly", (s) => s.getAll());
  return (all || []).sort((a, b) => b.createdAt - a.createdAt);
}

/** Read-modify-write an episode atomically-ish (single tab). */
const locks = new Map<string, Promise<unknown>>();
export function updateEpisode(id: string, fn: (ep: Episode | undefined) => Episode | undefined): Promise<Episode | undefined> {
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.then(async () => {
    const cur = await getEpisode(id);
    const updated = fn(cur ? structuredClone(cur) : undefined);
    if (updated) await putEpisode(updated);
    return updated;
  });
  locks.set(id, next.catch(() => {}));
  return next;
}

export async function deleteEpisode(ep: Episode) {
  for (const t of ep.tracks) await deleteTrackData(t.id);
  await tx("episodes", "readwrite", (s) => s.delete(ep.id));
}

// ---------- chunks (written while recording / receiving) ----------

export function putChunk(trackId: string, index: number, blob: Blob) {
  return tx("chunks", "readwrite", (s) => s.put(blob, [trackId, index]));
}

export async function getChunks(trackId: string): Promise<Blob[]> {
  const range = IDBKeyRange.bound([trackId, 0], [trackId, Number.MAX_SAFE_INTEGER]);
  const blobs = await tx<Blob[]>("chunks", "readonly", (s) => s.getAll(range));
  return blobs || [];
}

export async function countChunks(trackId: string): Promise<number> {
  const range = IDBKeyRange.bound([trackId, 0], [trackId, Number.MAX_SAFE_INTEGER]);
  return tx<number>("chunks", "readonly", (s) => s.count(range));
}

export function deleteChunks(trackId: string) {
  const range = IDBKeyRange.bound([trackId, 0], [trackId, Number.MAX_SAFE_INTEGER]);
  return tx("chunks", "readwrite", (s) => s.delete(range));
}

// ---------- assembled files ----------

export function putFile(trackId: string, blob: Blob) {
  return tx("files", "readwrite", (s) => s.put(blob, trackId));
}

export function getFile(trackId: string) {
  return tx<Blob | undefined>("files", "readonly", (s) => s.get(trackId));
}

// ---------- waveform peaks cache ----------

export interface PeaksRecord {
  peaks: Float32Array;
  perSecond: number;
}

export function putPeaks(trackId: string, rec: PeaksRecord) {
  return tx("peaks", "readwrite", (s) => s.put(rec, trackId));
}

export function getPeaks(trackId: string) {
  return tx<PeaksRecord | undefined>("peaks", "readonly", (s) => s.get(trackId));
}

export async function deleteTrackData(trackId: string) {
  await deleteChunks(trackId);
  await tx("files", "readwrite", (s) => s.delete(trackId));
  await tx("peaks", "readwrite", (s) => s.delete(trackId));
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage || 0, quota: e.quota || 0 };
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* ignore */
  }
}
