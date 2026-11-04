"use client";

import type { ReactNode } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The form parts of Receive (RECEIVE §B): fields at least 44 px, 13 px semibold labels, 16 px text on phones, the teal
 * focus ring, errors on their own field with `aria-invalid`, option cards as radio groups, the switch as a switch.
 */
export const inputCls = (bad?: boolean) =>
  cn(
    "bg-card text-foreground border-ink-300 placeholder:text-ink-500 h-11 w-full rounded-xl border px-3 text-base outline-none sm:text-[14px]",
    "focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-2",
    bad && "border-status-critical-fg-aa",
  );
export const selectCls = (bad?: boolean) =>
  cn(
    inputCls(bad),
    "appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9",
    "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2364748b' stroke-width='1.5'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")]",
  );

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Gets the wiring: pass it to the control. */
  children: (a: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const say = `${id}-say`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="text-foreground text-[13px] leading-[18px] font-semibold">
        {label}
      </label>
      {children({
        id,
        ...(error ? { "aria-invalid": true as const } : {}),
        ...(error || hint ? { "aria-describedby": say } : {}),
      })}
      {error ? (
        <p id={say} className="text-status-critical-fg-aa m-0 text-[12.5px] leading-[18px]">
          {error}
        </p>
      ) : hint ? (
        <p id={say} className="text-ink-600 m-0 text-[12.5px] leading-[18px]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function OptionCards<V extends string>({
  label,
  value,
  onChange,
  options,
  error,
  disabled,
  className,
}: {
  label: string;
  value: V | "";
  onChange: (v: V) => void;
  options: readonly {
    value: V;
    title: string;
    line?: ReactNode;
    icon?: ReactNode;
    aside?: ReactNode;
  }[];
  error?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const name = useId();
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn("grid gap-2 sm:grid-cols-2", className)}
      >
        {options.map((o) => {
          const on = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "bg-card has-[:focus-visible]:ring-primary/30 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 has-[:focus-visible]:ring-2",
                on ? "border-primary bg-tide-lagoon-tint" : "border-ink-300 hover:bg-ink-50",
                disabled && "cursor-not-allowed opacity-70",
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={on}
                disabled={disabled}
                onChange={() => onChange(o.value)}
              />
              {o.icon ? <span className="text-ink-700 mt-0.5 shrink-0">{o.icon}</span> : null}
              <span className="min-w-0 flex-1">
                <span className="text-foreground flex flex-wrap items-center gap-2 text-[14px] leading-5 font-semibold">
                  {o.title}
                  {o.aside}
                </span>
                {o.line ? (
                  <span className="text-ink-600 block text-[12.5px] leading-[18px]">{o.line}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p className="text-status-critical-fg-aa m-0 mt-1 text-[12.5px] leading-[18px]">{error}</p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "focus-visible:ring-primary/30 relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 outline-none focus-visible:ring-2",
        checked ? "bg-primary" : "bg-ink-300",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform duration-150",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

/** White card, as the Main store's. */
export function Panel({
  title,
  aside,
  children,
  className,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-card shadow-card rounded-2xl p-4 sm:p-5", className)}>
      {title ? (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-foreground m-0 text-[15px] leading-[22px] font-semibold">{title}</h3>
          {aside}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** Square-ish status word: never colour alone. */
export const tagTone = (t: "bad" | "warn" | "info" | "ok" | "teal" | "") =>
  t === "" ? "neutral" : t;
