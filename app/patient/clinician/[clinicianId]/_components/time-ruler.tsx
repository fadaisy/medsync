"use client";

import { useEffect, useMemo, useRef } from "react";

import { formatTime } from "@/lib/patient/booking-format";
import { cn } from "@/lib/utils";
import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "@/supabase/functions/_shared/slots";

/**
 * The reference's "Select Time": a ruler of tick marks with a label every
 * half hour and a raised bracket over the chosen appointment. Every open
 * time is a tick you can press; the marks between them are only the ruler.
 *
 * It is a radio group underneath — each open time is a `<button
 * aria-pressed>` with its full time as its name, arrow keys walk the open
 * times, and the chosen range is read out in words under the ruler — so the
 * shape is the mock-up's and the control is still one a screen reader and a
 * keyboard can use. Times are the hospital's, 24-hour.
 */
export function TimeRuler({
  slots,
  value,
  onChange,
}: {
  slots: ReadonlyArray<{ startsAtIso: string; endsAtIso: string }>;
  value: string | null;
  onChange: (startsAtIso: string) => void;
}) {
  const model = useMemo(() => layout(slots), [slots]);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the chosen tick in view when it changes from outside (a seed from
  // the provider's Book link, a day change).
  useEffect(() => {
    if (!value || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-slot="${value}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [value]);

  if (!model) return null;
  const { ticks, tickPx, slotMinutes } = model;
  const chosen = slots.find((s) => s.startsAtIso === value) ?? null;

  const moveFocus = (from: number, dir: 1 | -1) => {
    const open = ticks.filter((t) => t.slot);
    const i = open.findIndex((t) => t.index === from);
    const next = open[i + dir];
    if (!next) return;
    onChange(next.slot!.startsAtIso);
    listRef.current?.querySelector<HTMLElement>(`[data-slot="${next.slot!.startsAtIso}"]`)?.focus();
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={listRef}
        role="group"
        aria-label="Available times"
        className="-mx-1 overflow-x-auto px-1 pt-4 pb-1"
      >
        <div className="relative flex h-14 items-end" style={{ width: ticks.length * tickPx }}>
          {/* The bracket over the chosen appointment: its whole length, so a
              30-minute visit reads as 30 minutes of the ruler. */}
          {chosen ? (
            <div
              aria-hidden
              className="bg-primary ease-expo-out duration-fast absolute -top-3 h-1.5 rounded-full transition-[left]"
              style={{
                left: ticks.findIndex((t) => t.slot?.startsAtIso === chosen.startsAtIso) * tickPx,
                width: Math.max(tickPx, (slotMinutes / TICK_MINUTES) * tickPx),
              }}
            />
          ) : null}

          {ticks.map((t) => {
            if (t.slot) {
              const selected = t.slot.startsAtIso === value;
              return (
                <button
                  key={t.index}
                  type="button"
                  data-slot={t.slot.startsAtIso}
                  aria-pressed={selected}
                  aria-label={`${formatTime(t.slot.startsAtIso)} to ${formatTime(t.slot.endsAtIso)}`}
                  onClick={() => onChange(t.slot!.startsAtIso)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight") moveFocus(t.index, 1);
                    if (e.key === "ArrowLeft") moveFocus(t.index, -1);
                  }}
                  className="group focus-visible:ring-ring flex h-full shrink-0 flex-col items-center justify-end rounded-sm outline-none focus-visible:ring-2"
                  style={{ width: tickPx }}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "ease-expo-out duration-fast w-0.5 rounded-full transition-[height,background-color]",
                      selected
                        ? "bg-primary h-8"
                        : "bg-brand-400 group-hover:bg-brand-600 dark:bg-brand-600 h-6 group-hover:h-8",
                    )}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "text-caption mt-1.5 h-4 font-mono tabular-nums",
                      t.label ? "" : "invisible",
                      selected ? "text-foreground font-medium" : "text-muted-foreground",
                    )}
                  >
                    {t.label ?? "·"}
                  </span>
                </button>
              );
            }
            // A mark between open times: only the ruler.
            return (
              <div
                key={t.index}
                aria-hidden
                className="flex h-full shrink-0 flex-col items-center justify-end"
                style={{ width: tickPx }}
              >
                <span
                  className={cn("bg-border w-px rounded-full", t.label !== null ? "h-4" : "h-2.5")}
                />
                <span
                  className={cn(
                    "text-caption text-muted-foreground mt-1.5 h-4 font-mono tabular-nums",
                    t.label ? "" : "invisible",
                  )}
                >
                  {t.label ?? "·"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* The choice in words, for everyone: the bracket alone is colour and shape. */}
      <p className="text-body-s text-muted-foreground" aria-live="polite">
        {chosen ? (
          <>
            <span className="text-foreground font-medium">
              {formatTime(chosen.startsAtIso)} – {formatTime(chosen.endsAtIso)}
            </span>{" "}
            · {slotMinutes} min
          </>
        ) : (
          `${slots.length} ${slots.length === 1 ? "time" : "times"} open — tap a mark`
        )}
      </p>
    </div>
  );
}

/* ─── The ruler's geometry ──────────────────────────────────────── */

/** One mark every quarter hour; a label on the half hour. */
const TICK_MINUTES = 15;
const TICK_PX = 22;

interface Tick {
  index: number;
  /** "07:30" on the half hour, else null. */
  label: string | null;
  /** The open time that starts on this mark, if any. */
  slot: { startsAtIso: string; endsAtIso: string } | null;
}

/**
 * Lays the open times on a quarter-hour ruler from the first open time to
 * the end of the last, in the hospital's clock. A time that does not sit
 * on a quarter hour is snapped to the nearest mark for its position only —
 * its own name still says the exact minute.
 */
function layout(slots: ReadonlyArray<{ startsAtIso: string; endsAtIso: string }>) {
  if (slots.length === 0) return null;
  const minutesOf = (iso: string) =>
    localWeekdayAndMinutes(new Date(iso), DEFAULT_TIME_ZONE).minutesOfDay;
  const sorted = [...slots].sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const slotMinutes = Math.max(
    TICK_MINUTES,
    Math.round(
      (new Date(first.endsAtIso).getTime() - new Date(first.startsAtIso).getTime()) / 60_000,
    ),
  );
  const startMin = Math.floor(minutesOf(first.startsAtIso) / TICK_MINUTES) * TICK_MINUTES;
  const endMin = Math.ceil(minutesOf(last.endsAtIso) / TICK_MINUTES) * TICK_MINUTES;
  const byMark = new Map<number, { startsAtIso: string; endsAtIso: string }>();
  for (const s of sorted) {
    const mark = Math.round(minutesOf(s.startsAtIso) / TICK_MINUTES) * TICK_MINUTES;
    if (!byMark.has(mark)) byMark.set(mark, s);
  }
  // Labels through the patient app's own clock format (the same words the
  // chosen range prints), built from the first open time's instant.
  const firstMs = new Date(first.startsAtIso).getTime();
  const firstMin = minutesOf(first.startsAtIso);
  const ticks: Tick[] = [];
  for (let m = startMin, i = 0; m <= endMin; m += TICK_MINUTES, i++) {
    ticks.push({
      index: i,
      label:
        m % 30 === 0 ? formatTime(new Date(firstMs + (m - firstMin) * 60_000).toISOString()) : null,
      slot: byMark.get(m) ?? null,
    });
  }
  return { ticks, tickPx: TICK_PX, slotMinutes };
}
