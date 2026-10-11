// Small shared helpers.

/** High-resolution wall-clock time in ms (comparable across tabs on the same device). */
export function nowMs(): number {
  return performance.timeOrigin + performance.now();
}

export function randomId(len = 12): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Room codes: 3-4-3 lowercase, easy to dictate. */
export function newRoomCode(): string {
  const id = randomId(10);
  return `${id.slice(0, 3)}-${id.slice(3, 7)}-${id.slice(7)}`;
}

export function normalizeRoomCode(input: string): string {
  const raw = input.trim().toLowerCase();
  // Accept full links too.
  const m = raw.match(/[?&]c=([a-z0-9-]+)/);
  const code = (m ? m[1] : raw).replace(/[^a-z0-9]/g, "");
  if (code.length !== 10) return "";
  return `${code.slice(0, 3)}-${code.slice(3, 7)}-${code.slice(7)}`;
}

/** Distinct, accessible person colors (Apple system palette, light-mode values). */
export const PERSON_COLORS = [
  "#007AFF", // blue
  "#FF9500", // orange
  "#34C759", // green
  "#AF52DE", // purple
  "#FF2D55", // pink
  "#5AC8FA", // teal
  "#FFCC00", // yellow
  "#A2845E", // brown
];

export function colorFor(index: number): string {
  return PERSON_COLORS[index % PERSON_COLORS.length];
}

export function formatDuration(ms: number, withMs = false): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  let out = h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  if (withMs) out += "." + String(Math.floor(ms % 1000 / 100));
  return out;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "faixa"
  );
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
