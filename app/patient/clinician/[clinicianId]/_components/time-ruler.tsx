"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatTime } from "@/lib/patient/booking-format";
import { cn } from "@/lib/utils";
import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "@/supabase/functions/_shared/slots";

/**
 * The reference's "Select Time": a dense ruler — a mark every five minutes,
 * taller on the quarter and half hour, a label on the half hour — with the
 * chosen appointment sitting on it as a tinted block under a brand bar, its
 * marks inked. Every open time is a press target as wide as the visit it
 * books, so a thumb lands on it; the tick where it starts stands taller so
 * the open times can be seen before any is chosen.
 *
 * Underneath it is a control everyone can use: each open time is a `<button
 * aria-pressed>` named by its full range, arrow keys walk the open times, and
 * the chosen range is written out beside the ruler. Times are the hospital's.
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
  const scrollRef = useRef<HTMLDivElement>(null);
  // One hour fills the ruler's width; the day scrolls past it. Measured, so
  // the twelve five-minute marks of an hour sit exactly across the card.
  const [rulerWidth, setRulerWidth] = useState<number>(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setRulerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tickPx = rulerWidth > 0 ? rulerWidth / (60 / TICK_MINUTES) : 24;
  const model = useMemo(() => layout(slots, tickPx), [slots, tickPx]);

  // Keep the chosen block in view when the day or a seed changes it.
  useEffect(() => {
    if (!value || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLElement>(`[data-slot="${value}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [value]);

  if (!model) return null;
  const { ticks, spans, slotMinutes, width, tickPx: tw } = model;
  const chosen = spans.find((s) => s.startsAtIso === value) ?? null;

  const moveFocus = (fromIso: string, dir: 1 | -1) => {
    const i = spans.findIndex((s) => s.startsAtIso === fromIso);
    const next = spans[i + dir];
    if (!next) return;
    onChange(next.startsAtIso);
    scrollRef.current?.querySelector<HTMLElement>(`[data-slot="${next.startsAtIso}"]`)?.focus();
  };

  return (
    <div className="bg-card dark:shadow-card flex flex-col gap-3 rounded-2xl p-4 shadow-xs">
      <div ref={scrollRef} className="overflow-x-auto">
        <div
          role="group"
          aria-label="Available times"
          className="relative mx-auto"
          style={{ width }}
        >
          {/* The chosen visit: a tinted block the marks stand on, a brand bar over it. */}
          {chosen ? (
            <div
              aria-hidden
              className="ease-expo-out duration-fast absolute top-0 bottom-6 rounded-lg transition-[left]"
              style={{ left: chosen.left, width: chosen.width }}
            >
              <div className="bg-accent absolute inset-0 rounded-lg" />
              <div className="bg-primary absolute inset-x-1 top-0 h-1 rounded-full" />
            </div>
          ) : null}

          {/* The marks. */}
          <div aria-hidden className="flex h-12 items-end" style={{ width }}>
            {ticks.map((t) => {
              const inChosen = chosen !== null && t.min >= chosen.startMin && t.min < chosen.endMin;
              return (
                <div key={t.min} className="flex justify-center" style={{ width: tw }}>
                  <div
                    className={cn(
                      "rounded-full",
                      t.opens
                        ? "bg-brand-500 dark:bg-brand-400 h-7 w-[3px]"
                        : t.min % 30 === 0
                          ? "h-5 w-[3px]"
                          : t.min % 15 === 0
                            ? "h-4 w-0.5"
                            : "h-2.5 w-0.5",
                      inChosen
                        ? "bg-brand-700 dark:bg-brand-300"
                        : t.opens
                          ? ""
                          : "bg-gray-300 dark:bg-gray-600",
                    )}
                  />
                </div>
              );
            })}
          </div>

          {/* The labels, on the half hour. */}
          <div aria-hidden className="relative h-5" style={{ width }}>
            {ticks
              .filter((t) => t.label)
              .map((t) => (
                <span
                  key={t.min}
                  className={cn(
                    "text-caption absolute top-1 -translate-x-1/2 font-mono whitespace-nowrap tabular-nums",
                    chosen && t.min >= chosen.startMin && t.min <= chosen.endMin
                      ? "text-foreground font-medium"
                      : "text-muted-foreground",
                  )}
                  style={{ left: t.left + tw / 2 }}
                >
                  {t.label}
                </span>
              ))}
          </div>

          {/* The press targets: one per open time, as wide as the visit. */}
          {spans.map((s) => (
            <button
              key={s.startsAtIso}
              type="button"
              data-slot={s.startsAtIso}
              aria-pressed={s.startsAtIso === value}
              aria-label={`${formatTime(s.startsAtIso)} to ${formatTime(s.endsAtIso)}`}
              onClick={() => onChange(s.startsAtIso)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") moveFocus(s.startsAtIso, 1);
                if (e.key === "ArrowLeft") moveFocus(s.startsAtIso, -1);
              }}
              className="focus-visible:ring-ring hover:bg-brand-500/10 absolute top-0 bottom-6 rounded-lg outline-none focus-visible:ring-2"
              style={{ left: s.left, width: s.width }}
            />
          ))}
        </div>
      </div>

      {/* The choice in words, for everyone: the block alone is colour and shape. */}
      <p className="text-body-s text-muted-foreground" aria-live="polite">
        {chosen ? (
          <>
            <span className="text-foreground font-medium">
              {formatTime(chosen.startsAtIso)} – {formatTime(chosen.endsAtIso)}
            </span>{" "}
            · {slotMinutes} min
          </>
        ) : (
          `${slots.length} ${slots.length === 1 ? "time" : "times"} open — the tall marks. Tap one.`
        )}
      </p>
    </div>
  );
}

/* ─── The ruler's geometry ──────────────────────────────────────── */

/** A mark every five minutes; an hour of them fills the ruler. */
const TICK_MINUTES = 5;

interface Tick {
  /** Minutes since the hospital's midnight. */
  min: number;
  left: number;
  label: string | null;
  /** An open time starts on this mark. */
  opens: boolean;
}

interface Span {
  startsAtIso: string;
  endsAtIso: string;
  startMin: number;
  endMin: number;
  left: number;
  width: number;
}

/**
 * Lays the open times on a five-minute ruler from a half hour before the
 * first to a half hour after the last, in the hospital's clock.
 */
function layout(slots: ReadonlyArray<{ startsAtIso: string; endsAtIso: string }>, tickPx: number) {
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
  const startMin = Math.max(0, Math.floor(minutesOf(first.startsAtIso) / 30) * 30 - 30);
  const endMin = Math.min(24 * 60, Math.ceil(minutesOf(last.endsAtIso) / 30) * 30 + 30);
  const leftOf = (min: number) => ((min - startMin) / TICK_MINUTES) * tickPx;

  const spans: Span[] = sorted.map((s) => {
    const a = minutesOf(s.startsAtIso);
    const b = Math.max(a + TICK_MINUTES, minutesOf(s.endsAtIso) || a + slotMinutes);
    return {
      startsAtIso: s.startsAtIso,
      endsAtIso: s.endsAtIso,
      startMin: a,
      endMin: b,
      left: leftOf(a),
      width: leftOf(b) - leftOf(a),
    };
  });
  const opens = new Set(spans.map((s) => Math.round(s.startMin / TICK_MINUTES) * TICK_MINUTES));

  // Labels through the app's own clock format, built from the first open
  // time's instant so they say what the chosen range will say.
  const firstMs = new Date(first.startsAtIso).getTime();
  const firstMin = minutesOf(first.startsAtIso);
  const ticks: Tick[] = [];
  for (let m = startMin; m <= endMin; m += TICK_MINUTES) {
    ticks.push({
      min: m,
      left: leftOf(m),
      label:
        m % 30 === 0 ? formatTime(new Date(firstMs + (m - firstMin) * 60_000).toISOString()) : null,
      opens: opens.has(m),
    });
  }
  return { ticks, spans, slotMinutes, width: ticks.length * tickPx, tickPx };
}
