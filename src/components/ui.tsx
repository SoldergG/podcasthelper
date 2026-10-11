"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "plain" | "danger" | "rec";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "bg-fill text-label hover:bg-fill-strong",
  plain: "text-accent hover:bg-accent-soft",
  danger: "bg-red-soft text-red hover:brightness-95",
  rec: "bg-red text-white hover:brightness-110",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-9 px-3.5 text-[14px] rounded-full gap-1.5",
    md: "h-11 px-5 text-[15px] rounded-full gap-2",
    lg: "h-[52px] px-7 text-[17px] rounded-full gap-2",
  };
  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-[background,filter,transform] active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none select-none ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  active = false,
  tone = "default",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; tone?: "default" | "danger" | "rec" }) {
  const tones = {
    default: active ? "bg-label text-bg" : "bg-elevated text-label hover:bg-grouped",
    danger: "bg-red text-white hover:brightness-110",
    rec: "bg-red text-white hover:brightness-110",
  };
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-full shadow-[var(--shadow)] transition active:scale-95 disabled:opacity-40 ${tones[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-[22px] bg-elevated shadow-[var(--shadow)] ${className}`}>{children}</div>;
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span aria-hidden className="relative grid h-7 w-7 place-items-center rounded-[8px] bg-label text-bg">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2" />
        </svg>
      </span>
      PodcastHelper
    </span>
  );
}

export function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 glass border-b border-separator">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-[17px]">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-[14px]">
          {right ?? (
            <>
              <Link href="/episodios" className="rounded-full px-3 py-2 text-label-2 hover:text-label">
                Episódios
              </Link>
              <a
                href="https://github.com/SoldergG/podcasthelper"
                className="rounded-full px-3 py-2 text-label-2 hover:text-label"
                target="_blank"
                rel="noreferrer"
              >
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
        {hint && <span className="block text-[13px] text-label-3">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-[31px] w-[51px] rounded-full bg-fill-strong transition-colors peer-checked:bg-green-bright peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-accent/50" />
        <span className="pointer-events-none absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform peer-checked:translate-x-5" />
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
  options: { value: T; label: string; disabled?: boolean }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex rounded-[10px] bg-fill p-[2px] ${disabled ? "opacity-50" : ""}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
          className={`min-h-8 flex-1 rounded-[8px] px-2 text-[13px] font-medium transition disabled:opacity-40 ${
            value === o.value ? "bg-elevated shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)]" : "text-label-2"
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
      <span className="mb-1.5 block text-[13px] font-medium text-label-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-label-3">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-[12px] bg-fill px-3.5 text-[16px] text-label placeholder:text-label-3 outline-none focus:ring-3 focus:ring-accent/40 transition";

export const selectClass =
  "h-11 w-full rounded-[12px] bg-fill px-3 text-[15px] text-label outline-none focus:ring-3 focus:ring-accent/40 appearance-none";

export function ProgressBar({ value, tone = "accent" }: { value: number; tone?: "accent" | "green" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${tone === "green" ? "bg-green-bright" : "bg-accent"}`}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}
