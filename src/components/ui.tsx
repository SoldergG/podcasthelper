"use client";

import { AudioLines } from "lucide-react";
import Link from "next/link";
import { forwardRef, useImperativeHandle, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "accent" | "secondary" | "plain" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-label text-bg hover:opacity-90",
  accent: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-fill text-label hover:bg-fill-strong",
  plain: "text-accent-ink hover:bg-accent-soft",
  danger: "bg-red-soft text-red hover:brightness-95",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-9 px-3.5 text-[14px] gap-1.5",
    md: "h-11 px-5 text-[15px] gap-2",
    lg: "h-[52px] px-7 text-[16px] gap-2",
  };
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium transition-[background,opacity,filter,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Hardware-style transport key (rounded square that presses down). */
export function Key({
  label,
  pressed,
  tone = "default",
  showLabel = false,
  className = "",
  wrapperClassName = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; pressed?: boolean; tone?: "default" | "danger" | "accent"; showLabel?: boolean; wrapperClassName?: string }) {
  const toneClass = tone === "danger" ? "!bg-red !text-white" : tone === "accent" ? "!bg-accent !text-on-accent" : "";
  return (
    <span className={`${wrapperClassName || "inline-flex"} shrink-0 flex-col items-center gap-1`}>
      <button
        aria-label={label}
        title={label}
        aria-pressed={pressed}
        className={`key inline-flex h-11 w-11 items-center justify-center rounded-[13px] text-label disabled:opacity-35 sm:h-12 sm:w-12 sm:rounded-[14px] ${toneClass} ${className}`}
        {...rest}
      >
        {children}
      </button>
      {showLabel && <span className="font-mono text-[10px] uppercase tracking-wider text-label-3">{label}</span>}
    </span>
  );
}

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`console rounded-[18px] border border-separator shadow-[var(--shadow)] ${className}`}>{children}</div>;
}

/** Back-compat alias used across screens. */
export const Card = Panel;

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-[8px] bg-accent text-on-accent">
        <AudioLines className="h-4 w-4" strokeWidth={2.4} />
      </span>
      PodcastHelper
    </span>
  );
}

export function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="glass sticky top-0 z-30 border-b border-separator">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-[16px]">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-[14px]">
          {right ?? (
            <>
              <Link href="/episodios" className="rounded-full px-3 py-2 text-label-2 hover:text-label">
                Episódios
              </Link>
              <a href="https://github.com/SoldergG/podcasthelper" className="rounded-full px-3 py-2 text-label-2 hover:text-label" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex min-h-11 items-center justify-between gap-4 py-2 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span>
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-[13px] leading-snug text-label-3">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-[28px] w-[46px] rounded-full bg-fill-strong transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent" />
        <span className="pointer-events-none absolute left-[2px] top-[2px] h-[24px] w-[24px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-transform peer-checked:translate-x-[18px]" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex rounded-[12px] bg-fill p-[3px] ${disabled ? "opacity-50" : ""}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
          className={`relative min-h-8 flex-1 rounded-[9px] px-2 text-[13px] font-medium transition disabled:opacity-40 ${
            value === o.value ? "bg-elevated text-label shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-label-2 hover:text-label"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium text-label-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-snug text-label-3">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-[12px] border border-separator bg-elevated px-3.5 text-[16px] text-label placeholder:text-label-3 outline-none transition focus:border-accent focus:ring-3 focus:ring-accent/25";

export const selectClass =
  "h-11 w-full appearance-none rounded-[12px] border border-separator bg-elevated px-3 text-[15px] text-label outline-none focus:border-accent focus:ring-3 focus:ring-accent/25";

export function ProgressBar({ value, tone = "accent" }: { value: number; tone?: "accent" | "green" }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-[width] duration-300 ${tone === "green" ? "bg-green-bright" : "bg-accent"}`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export interface LedMeterHandle {
  /** 0..1 level (already scaled). */
  set(level: number): void;
}

/**
 * Segmented LED meter, updated imperatively (no React re-render per frame).
 * Green up to 70%, amber to 90%, red above.
 */
export const LedMeter = forwardRef<LedMeterHandle, { segments?: number; className?: string; vertical?: boolean }>(function LedMeter(
  { segments = 20, className = "", vertical = false },
  ref,
) {
  const wrap = useRef<HTMLDivElement>(null);
  const peak = useRef(0);
  const peakAt = useRef(0);
  useImperativeHandle(ref, () => ({
    set(level: number) {
      const el = wrap.current;
      if (!el) return;
      const lit = Math.round(Math.max(0, Math.min(1, level)) * segments);
      const now = performance.now();
      if (lit >= peak.current) {
        peak.current = lit;
        peakAt.current = now;
      } else if (now - peakAt.current > 900) {
        peak.current = Math.max(lit, peak.current - 1);
      }
      const kids = el.children;
      for (let i = 0; i < kids.length; i++) {
        const on = i < lit || i === peak.current - 1;
        (kids[i] as HTMLElement).style.background = on ? (kids[i] as HTMLElement).dataset.color! : "var(--led-off)";
      }
    },
  }));
  return (
    <div ref={wrap} aria-hidden className={`flex gap-[2px] ${vertical ? "flex-col-reverse" : ""} ${className}`}>
      {Array.from({ length: segments }, (_, i) => {
        const f = (i + 1) / segments;
        const color = f > 0.9 ? "var(--red)" : f > 0.7 ? "var(--amber)" : "var(--green-bright)";
        return <span key={i} data-color={color} className={`${vertical ? "h-full w-full" : "h-full flex-1"} rounded-[2px]`} style={{ background: "var(--led-off)" }} />;
      })}
    </div>
  );
});

export function Pill({ children, tone = "default", title }: { children: ReactNode; tone?: "default" | "good" | "warn" | "bad"; title?: string }) {
  const tones = {
    default: "bg-fill text-label-2",
    good: "bg-[color-mix(in_srgb,var(--green-bright)_16%,transparent)] text-green",
    warn: "bg-[color-mix(in_srgb,var(--amber)_22%,transparent)] text-orange",
    bad: "bg-red-soft text-red",
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tabular ${tones[tone]}`}>
      {children}
    </span>
  );
}
