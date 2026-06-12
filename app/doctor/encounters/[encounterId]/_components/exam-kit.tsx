"use client";

import type { ReactNode } from "react";
import { CheckIcon, CircleIcon, MinusIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Examination UI kit — the shared, crafted presentation primitives for the
 * reworked Examination workspace (ADR 0074). Presentation-only: these render the
 * SAME three-state / value-set / cycle data every exam already captures, with a
 * strong hierarchy, honest not-examined, and the MedSync motion vocabulary
 * (tap / scale-in / ease-expo-out). Clinical-red is reserved for emergencies —
 * the only red here is the "alarm" chip tone, used for genuine must-not-miss taps.
 */

/* ── Stage card — expresses a clinical sequence step (I/P/P/A …) ──
   A numbered stage with a connecting spine + a quiet completion check, so the
   clinician flows top-to-bottom the way they examine. */
export function StageCard({
  index,
  title,
  hint,
  complete,
  count,
  children,
}: {
  index: number;
  title: string;
  hint?: string;
  complete?: boolean;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="relative pl-9">
      {/* spine + node */}
      <span aria-hidden className="bg-border absolute top-7 bottom-0 left-[13px] w-px" />
      <span
        aria-hidden
        className={cn(
          "absolute top-1 left-0 inline-flex size-[26px] items-center justify-center rounded-full border text-[11px] font-semibold transition-colors duration-200",
          complete
            ? "border-teal-500 bg-teal-500 text-white"
            : "border-border bg-card text-muted-foreground",
        )}
      >
        {complete ? <CheckIcon className="size-3.5" /> : index}
      </span>
      <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
        <header className="border-border/60 flex items-center gap-2 border-b px-3.5 py-2">
          <h4 className="font-display text-foreground text-[13.5px] font-medium tracking-[-0.01em]">
            {title}
          </h4>
          {count ? (
            <span className="scale-in rounded-full bg-teal-100 px-1.5 text-[10px] font-semibold text-teal-800 tabular-nums dark:bg-teal-950/40 dark:text-teal-300">
              {count}
            </span>
          ) : null}
          {hint ? (
            <span className="text-muted-foreground ml-auto text-[10.5px]">{hint}</span>
          ) : null}
        </header>
        <div className="flex flex-col gap-2.5 p-3.5">{children}</div>
      </div>
    </section>
  );
}

/* ── Three-state — not-examined / normal / findings ──
   Honest: not-examined is a VISIBLY DISTINCT default (ghost/dashed), never the
   same as "normal". Treatment + icon + label, never colour alone. */
export type ThreeStateValue = "not_examined" | "absent" | "present";
export function ThreeState({
  value,
  onChange,
  findingsLabel = "Findings",
}: {
  value: ThreeStateValue;
  onChange: (v: ThreeStateValue) => void;
  findingsLabel?: string;
}) {
  const seg = (
    v: ThreeStateValue,
    label: string,
    Icon: typeof CheckIcon,
    tone: "ghost" | "normal" | "findings",
  ) => {
    const active = value === v;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onChange(v)}
        className={cn(
          "tap inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-colors duration-150 ring-inset first:rounded-l-md last:rounded-r-md",
          active &&
            tone === "findings" &&
            "bg-teal-50 text-teal-700 ring-1 ring-teal-500/50 dark:bg-teal-950/40 dark:text-teal-200",
          active &&
            tone === "normal" &&
            "bg-slate-100 text-slate-700 ring-1 ring-slate-400/50 dark:bg-slate-800 dark:text-slate-200",
          active &&
            tone === "ghost" &&
            "text-muted-foreground bg-muted ring-border ring-dashed ring-1",
          !active && "text-muted-foreground/70 hover:bg-muted/60",
        )}
      >
        <Icon className="size-3" aria-hidden />
        {label}
      </button>
    );
  };
  return (
    <div className="border-border inline-flex overflow-hidden rounded-md border">
      {seg("not_examined", "Not examined", CircleIcon, "ghost")}
      <span aria-hidden className="bg-border w-px" />
      {seg("absent", "Normal", MinusIcon, "normal")}
      <span aria-hidden className="bg-border w-px" />
      {seg("present", findingsLabel, CheckIcon, "findings")}
    </div>
  );
}

/* ── Value chip — selected / hover / press, with disciplined tones ── */
export type ChipTone = "default" | "teal" | "amber" | "alarm";
export function ValueChip({
  active,
  tone = "default",
  onClick,
  children,
}: {
  active: boolean;
  tone?: ChipTone;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "tap rounded-md px-2 py-0.5 text-[11.5px] ring-1 transition-colors duration-150 ring-inset",
        !active && "text-foreground/70 ring-border hover:bg-muted/60",
        active &&
          tone === "default" &&
          "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200",
        active &&
          tone === "teal" &&
          "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200",
        active &&
          tone === "amber" &&
          "bg-amber-50 text-amber-800 ring-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300",
        active &&
          tone === "alarm" &&
          "bg-red-100 text-red-700 ring-red-500/40 dark:bg-red-950/40 dark:text-red-300",
      )}
    >
      {children}
    </button>
  );
}

/* ── Labelled row of value chips ── */
export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-muted-foreground w-24 shrink-0 text-[11px]">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

/* ── Prominent "normal exam" fast-path action ── */
export function NormalExamButton({
  onClick,
  label = "Normal exam",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-[12px] font-medium text-white shadow-sm transition-colors duration-150 hover:bg-teal-700 active:bg-teal-800"
    >
      <CheckIcon className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

/* ── A small legend for tap-to-cycle controls ── */
export function CycleLegend({ steps }: { steps: string[] }) {
  return (
    <span className="text-muted-foreground text-[10px]">
      tap to cycle: {steps.join(" → ")} → unset
    </span>
  );
}
