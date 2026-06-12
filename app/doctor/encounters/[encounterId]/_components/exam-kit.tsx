"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AlertTriangleIcon, CheckIcon, ChevronDownIcon, CircleIcon, MinusIcon } from "lucide-react";

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

/* ════════════════════════════════════════════════════════════════════════════
   Examination UI v2 — progressive disclosure (ADR supersedes the v1 StageCard).
   Sections collapse to a one-line summary by default; a fully-normal exam is a
   tidy stack of "All normal" cards. Compact-but-complete inside; long binary
   lists become "tap any present" clusters. Presentation only — the SAME records.
   ════════════════════════════════════════════════════════════════════════════ */

/* ── Status & emphasis language — one consistent vocabulary across the workspace ──
   normal = quiet/recedes · findings = teal accent · must-not-miss = reserved red ·
   not-examined = a distinct, honest "untouched" treatment. Never colour alone. */
export type SectionStatus = "normal" | "not_examined" | "findings" | "must_not_miss" | "partial";

export function StatusPill({ status, count }: { status: SectionStatus; count?: number }) {
  const base =
    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap";
  if (status === "must_not_miss")
    return (
      <span
        className={cn(
          base,
          "bg-red-50 text-red-700 ring-1 ring-red-500/30 ring-inset dark:bg-red-950/30 dark:text-red-300",
        )}
      >
        <AlertTriangleIcon className="size-3" aria-hidden />
        {count && count > 1 ? `${count} must-not-miss` : "must-not-miss"}
      </span>
    );
  if (status === "findings")
    return (
      <span className={cn(base, "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300")}>
        <span aria-hidden className="size-1.5 rounded-full bg-teal-500" />
        {count ?? 0} finding{(count ?? 0) > 1 ? "s" : ""}
      </span>
    );
  if (status === "not_examined")
    return (
      <span className={cn(base, "border-border text-muted-foreground border border-dashed")}>
        <CircleIcon className="size-2.5" aria-hidden />
        Not examined
      </span>
    );
  if (status === "partial")
    return (
      <span className={cn(base, "text-muted-foreground")}>
        <MinusIcon className="size-3" aria-hidden />
        Partly examined
      </span>
    );
  return (
    <span className={cn(base, "bg-muted text-muted-foreground")}>
      <CheckIcon className="size-3" aria-hidden />
      All normal
    </span>
  );
}

/* ── Collapsible section card — the signature surface ──
   Collapsed = one-line summary (status pill + inline positives + on-row "mark all
   normal"). Expanded = the compact capture. Children mount only when open (perf +
   reduced-motion-safe entrance). The toggle and the mark-normal are separate
   buttons (no nesting) for full keyboard + SR operation. */
export function SectionCard({
  index,
  title,
  status,
  count,
  summary,
  onMarkNormal,
  defaultOpen = false,
  children,
}: {
  index?: number;
  title: string;
  status: SectionStatus;
  count?: number;
  summary?: string;
  onMarkNormal?: () => void;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="tap flex min-w-0 flex-1 items-center gap-2.5 px-3.5 py-2.5 text-left"
        >
          {typeof index === "number" ? (
            <span
              aria-hidden
              className="text-muted-foreground/60 font-mono text-[11px] tabular-nums"
            >
              {index}
            </span>
          ) : null}
          <span className="font-display text-foreground shrink-0 text-[13px] font-medium tracking-[-0.01em]">
            {title}
          </span>
          <StatusPill status={status} count={count} />
          {!open && summary ? (
            <span className="text-muted-foreground truncate text-[11.5px]">{summary}</span>
          ) : null}
          <ChevronDownIcon
            className={cn(
              "text-muted-foreground ml-auto size-4 shrink-0 transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        {onMarkNormal && status !== "normal" ? (
          <button
            type="button"
            onClick={onMarkNormal}
            className="tap text-muted-foreground border-border mr-2 inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:text-teal-700 dark:hover:text-teal-300"
          >
            <CheckIcon className="size-3" aria-hidden /> normal
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="border-border/60 scale-in flex flex-col gap-3 border-t px-3.5 py-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/* ── Compact finding field — label + control on one line, multiple per row ──
   Detail (value chips) is passed only when the finding is abnormal/present, so
   normal rows stay short. Pair inside <FindingGrid> for a 2-col compact layout. */
export function CompactField({
  label,
  mustNotMiss,
  flag,
  control,
  detail,
}: {
  label: string;
  mustNotMiss?: boolean;
  /** small catalog hint badge (e.g. a Uganda "HIV" flag) */
  flag?: string;
  control: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-foreground flex min-w-0 items-center gap-1 text-[12px]">
          {mustNotMiss ? (
            <AlertTriangleIcon
              className="size-3 shrink-0 text-amber-500"
              aria-label="must-not-miss"
            />
          ) : null}
          <span className="truncate">{label}</span>
          {flag ? (
            <span className="text-muted-foreground bg-muted shrink-0 rounded px-1 text-[9px] uppercase">
              {flag}
            </span>
          ) : null}
        </span>
        <span className="shrink-0">{control}</span>
      </div>
      {detail ? <div className="scale-in flex flex-wrap gap-1 pl-1">{detail}</div> : null}
    </div>
  );
}

/* ── A responsive 2-column grid for compact finding rows ── */
export function FindingGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 sm:grid-cols-2">{children}</div>;
}

/* ── "Tap any present" cluster — long binary lists in one tidy block ──
   tap a chip → present (accent; reserved-red if a must-not-miss is present);
   an explicit Examined / Not-examined control keeps not-examined ≠ all-negative.
   Presentation only: the consumer maps each option to its finding state. */
export function PresentCluster({
  label,
  options,
  present,
  examined,
  onToggle,
  onSetExamined,
}: {
  label?: string;
  options: { value: string; label: string; mustNotMiss?: boolean }[];
  /** option values currently recorded present */
  present: string[];
  /** true once the cluster has been affirmed examined (untapped ⇒ absent) */
  examined: boolean;
  onToggle: (value: string) => void;
  onSetExamined: (examined: boolean) => void;
}) {
  const untouched = !examined && present.length === 0;
  return (
    <div className="flex flex-col gap-2">
      {label ? <span className="text-muted-foreground text-[11px]">{label}</span> : null}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = present.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={cn(
                "tap inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] ring-1 transition-colors duration-150 ring-inset",
                on &&
                  o.mustNotMiss &&
                  "bg-red-100 text-red-700 ring-red-500/40 dark:bg-red-950/40 dark:text-red-300",
                on &&
                  !o.mustNotMiss &&
                  "bg-teal-50 text-teal-700 ring-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200",
                !on && "text-foreground/70 ring-border hover:bg-muted/60",
              )}
            >
              {o.mustNotMiss ? <AlertTriangleIcon className="size-3" aria-hidden /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="border-border inline-flex w-fit overflow-hidden rounded-md border text-[11px]">
        <button
          type="button"
          aria-pressed={examined}
          onClick={() => onSetExamined(true)}
          className={cn(
            "tap px-2.5 py-1 font-medium transition-colors duration-150",
            examined
              ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              : "text-muted-foreground/70 hover:bg-muted/60",
          )}
        >
          Examined{examined && present.length === 0 ? " — none present" : ""}
        </button>
        <span aria-hidden className="bg-border w-px" />
        <button
          type="button"
          aria-pressed={untouched}
          onClick={() => onSetExamined(false)}
          className={cn(
            "tap px-2.5 py-1 font-medium transition-colors duration-150",
            untouched
              ? "text-muted-foreground bg-muted ring-border ring-dashed ring-1 ring-inset"
              : "text-muted-foreground/70 hover:bg-muted/60",
          )}
        >
          Not examined
        </button>
      </div>
    </div>
  );
}
