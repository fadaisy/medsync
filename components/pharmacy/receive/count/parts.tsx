"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { Check, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/** What the count view's parts share: a status line that always carries a word, and a chip group that is a radio group. */
export type Tone = "ok" | "warn" | "bad" | "";

const TONE: Record<Tone, string> = {
  ok: "text-ink-700",
  warn: "text-status-caution-fg-aa",
  bad: "text-status-critical-fg-aa",
  "": "text-ink-600",
};

/** A word with its mark: amber carries a triangle, a match a tick. Never colour alone. */
export function Said({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-start gap-1.5 text-[13px] leading-[18px] font-semibold",
        TONE[tone],
        className,
      )}
    >
      {tone === "warn" || tone === "bad" ? (
        <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
      ) : tone === "ok" ? (
        <Check aria-hidden className="mt-px size-3.5 shrink-0" />
      ) : null}
      <span>{children}</span>
    </span>
  );
}

export const labelCls = "text-foreground text-[13px] leading-[18px] font-semibold";

/** Chips that are one choice: native radios under the labels, so the arrow keys work. */
export function ChipRadio<V extends string>({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: V | "";
  onChange: (v: V) => void;
  options: readonly { value: V; label: string }[];
  error?: string | null;
}) {
  const name = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${name}-label`} className={labelCls}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${name}-label`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-err` : undefined}
        className="flex flex-wrap gap-2"
      >
        {options.map((o) => {
          const on = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "has-[:focus-visible]:ring-primary/30 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-[14px] leading-5 font-semibold has-[:focus-visible]:ring-2 sm:min-h-9 sm:text-[13px]",
                on
                  ? "border-primary bg-tide-lagoon-tint text-teal-900"
                  : "border-ink-300 bg-card text-foreground hover:bg-ink-50",
              )}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={on}
                onChange={() => onChange(o.value)}
              />
              {on ? <Check aria-hidden className="size-3.5" /> : null}
              {o.label}
            </label>
          );
        })}
      </div>
      {error ? (
        <p
          id={`${name}-err`}
          className="text-status-critical-fg-aa m-0 text-[12.5px] leading-[18px]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A small outlined pill that does something (the prototype's chip button). */
export const pillCls =
  "border-ink-300 bg-card text-foreground hover:bg-ink-50 focus-visible:ring-primary/30 inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-[14px] leading-5 font-semibold outline-none focus-visible:ring-2 disabled:opacity-60 sm:min-h-9 sm:text-[13px]";
