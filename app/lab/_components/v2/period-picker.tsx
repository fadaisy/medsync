"use client";

import type { PickOption } from "./fields";
import type { PeriodPreset } from "@/lib/lab/period";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarIcon, ChevronDownIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_REPORTS } from "@/content/lab-workspace-v2-reports";
import {
  dayShort,
  monthLong,
  PERIOD_PRESETS,
  periodHref,
  periodWords,
  pickedRange,
  presetOf,
  presetParams,
} from "@/lib/lab/period";
import { cn } from "@/lib/utils";
import { DateField, MonthCalendar, PickField } from "./fields";

/**
 * Lab Workspace v2 (prompt 5.9): one period picker and filter chips that apply at once, with no Show button.
 * Both write the same URL parameters the old filter forms posted (`month`, or `from` and `to`; and one key per
 * filter), so bookmarks, drill-downs and the CSV read the period exactly as before.
 */

const P = LABWS2_REPORTS.period;
const F = LABWS2_REPORTS.filters;
type Keep = Record<string, string | undefined>;

const CHIP =
  "focus-visible:shadow-focus inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] whitespace-nowrap outline-none";
const CHIP_OFF =
  "bg-card text-ink-700 shadow-[inset_0_0_0_1px_var(--color-ink-300)] hover:bg-ink-50 font-medium";
const CHIP_ON = "bg-tide-navy-900 text-tide-on-band font-semibold";
const OPT =
  "text-body-s hover:bg-muted focus-visible:shadow-focus rounded-[10px] px-3 py-1.5 text-left outline-none";

const hrefWith = (base: string, keep: Keep, param: string, v: string) => {
  const q = new URLSearchParams();
  for (const [k, x] of Object.entries({ ...keep, [param]: v })) if (x) q.set(k, x);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
};

export function PeriodPicker({
  base,
  keep,
  value,
  today,
  mode = "period",
  months = [],
}: {
  base: string;
  keep: Keep;
  value: { month: string; range: { from: string; to: string } | null };
  /** Hospital-local "YYYY-MM-DD" from the server. */
  today: string;
  /** "month": one month at a time, from `months` (HMIS 105). */
  mode?: "period" | "month";
  months?: readonly string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState<string | null>(null);
  const label = mode === "month" ? monthLong(value.month) : periodWords(value, today, P);
  const current = presetOf(value, today);
  const go = (href: string) => {
    setOpen(false);
    setFirst(null);
    router.push(href);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setFirst(null);
      }}
    >
      <PopoverTrigger className={cn(CHIP, CHIP_ON)} aria-label={`${P.label}: ${label}`}>
        <CalendarIcon aria-hidden className="size-4" />
        {label}
        <ChevronDownIcon aria-hidden className="size-3.5 opacity-80" />
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className={cn("rounded-tide-card p-2", mode === "month" ? "w-56" : "w-[30rem]")}
      >
        {mode === "month" ? (
          <ul aria-label={P.months} className="flex max-h-80 flex-col overflow-auto">
            {months.map((m) => (
              <li key={m}>
                <Link
                  href={periodHref(base, keep, { month: m })}
                  onClick={() => setOpen(false)}
                  aria-current={m === value.month ? "true" : undefined}
                  className={cn(OPT, "block", m === value.month && "bg-muted font-semibold")}
                >
                  {monthLong(m)}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <ul aria-label={P.label} className="flex w-40 shrink-0 flex-col">
              {PERIOD_PRESETS.map((k: PeriodPreset) => (
                <li key={k}>
                  {k === "custom" ? (
                    <button
                      type="button"
                      onClick={() => setFirst(null)}
                      aria-pressed={current === k}
                      className={cn(OPT, "w-full", current === k && "bg-muted font-semibold")}
                    >
                      {P.presets[k]}
                    </button>
                  ) : (
                    <Link
                      href={periodHref(base, keep, presetParams(k, today))}
                      onClick={() => setOpen(false)}
                      aria-current={current === k ? "true" : undefined}
                      className={cn(OPT, "block", current === k && "bg-muted font-semibold")}
                    >
                      {P.presets[k]}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex min-w-0 flex-1 flex-col gap-1 px-1">
              <p className="text-caption text-muted-foreground" aria-live="polite">
                {first ? fill(P.pickLast, { day: dayShort(first, today) }) : P.pickFirst}
              </p>
              <MonthCalendar
                value={first ?? value.range?.to ?? today}
                todayKey={today}
                max={today}
                onPick={(k) => {
                  if (!first) setFirst(k);
                  else go(periodHref(base, keep, pickedRange(first, k)));
                }}
              />
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * One filter as a chip ("Ward: all") that opens a short searchable list and applies the choice at once. The
 * first option is "All" (the parameter removed).
 */
export function PickChip({
  base,
  keep,
  param,
  name,
  value,
  options,
  all = true,
}: {
  base: string;
  keep: Keep;
  param: string;
  name: string;
  value: string | null;
  options: readonly PickOption[];
  /** Offer "All" (the parameter removed). Off where one value is always chosen. */
  all?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value);
  const label = fill(F.chip, { name, value: chosen?.label ?? F.all });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(CHIP, chosen ? CHIP_ON : CHIP_OFF)}>
        {label}
        <ChevronDownIcon aria-hidden className="size-3.5 opacity-80" />
      </PopoverTrigger>
      <PopoverContent align="center" className="rounded-tide-card w-72 p-3">
        <PickField
          label={fill(F.search, { name })}
          hideLabel
          forceList
          options={all ? [{ value: "", label: F.allOption }, ...options] : options}
          value={value ?? ""}
          onChange={(v) => {
            setOpen(false);
            router.push(hrefWith(base, keep, param, v));
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** One day (the daily register): the field kit's date field, applied at once. */
export function DayPicker({
  base,
  keep,
  param,
  label,
  value,
  now,
}: {
  base: string;
  keep: Keep;
  param: string;
  label: string;
  value: string;
  /** The server's time (ISO), the field's reference for "today". */
  now: string;
}) {
  const router = useRouter();
  return (
    <DateField
      label={label}
      hideLabel
      value={value}
      now={now}
      onChange={(v) => router.push(hrefWith(base, keep, param, v))}
    />
  );
}
