"use client";

import { useMemo } from "react";

import { formatTime } from "@/lib/patient/booking-format";
import { cn } from "@/lib/utils";

/**
 * The reference's picker: the chosen time large, its length under it, and
 * one slider whose knob steps through the day's open times — filled up to
 * the knob, hatched past the last open time. A native range input underneath
 * (arrow keys, Home/End, a screen reader hears the time it names), styled to
 * the shape; the track is a gradient so the fill and the hatching are CSS,
 * not elements.
 */
export function TimeSlider({
  slots,
  value,
  onChange,
}: {
  slots: ReadonlyArray<{ startsAtIso: string; endsAtIso: string }>;
  value: string | null;
  onChange: (startsAtIso: string) => void;
}) {
  const sorted = useMemo(
    () => [...slots].sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso)),
    [slots],
  );
  if (sorted.length === 0) return null;
  const index = Math.max(
    0,
    sorted.findIndex((s) => s.startsAtIso === value),
  );
  const chosen = value ? (sorted[index] ?? null) : null;
  const shown = chosen ?? sorted[0]!;
  const minutes = Math.round(
    (new Date(shown.endsAtIso).getTime() - new Date(shown.startsAtIso).getTime()) / 60_000,
  );
  const [hh, mm] = splitTime(shown.startsAtIso);
  // How far along the day's open times the knob sits, as the track's fill.
  const pct = sorted.length > 1 ? (index / (sorted.length - 1)) * 100 : 100;

  return (
    <div className="bg-card dark:shadow-card flex flex-col items-center gap-4 rounded-2xl p-5 shadow-xs">
      <div className="flex flex-col items-center gap-1" aria-live="polite">
        <div
          className={cn(
            "bg-muted flex items-baseline gap-2 rounded-xl px-5 py-2 font-mono text-[34px] leading-none font-medium tracking-tight tabular-nums",
            chosen ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span>{hh}</span>
          <span className="text-muted-foreground">:</span>
          <span>{mm}</span>
        </div>
        <span className="text-muted-foreground text-body-s">
          {chosen
            ? `${minutes} min · ${formatTime(chosen.startsAtIso)} – ${formatTime(chosen.endsAtIso)}`
            : `${sorted.length} ${sorted.length === 1 ? "time" : "times"} open — slide to choose`}
        </span>
      </div>

      <label className="flex w-full flex-col gap-1.5">
        <span className="sr-only">Time</span>
        <input
          type="range"
          min={0}
          max={sorted.length - 1}
          step={1}
          value={chosen ? index : 0}
          aria-valuetext={`${formatTime(shown.startsAtIso)} to ${formatTime(shown.endsAtIso)}`}
          onChange={(e) => onChange(sorted[Number(e.target.value)]!.startsAtIso)}
          className="time-slider w-full"
          style={{ ["--fill" as string]: `${chosen ? pct : 0}%` }}
        />
        <span className="text-caption text-muted-foreground flex justify-between font-mono tabular-nums">
          <span>{formatTime(sorted[0]!.startsAtIso)}</span>
          <span>{formatTime(sorted[sorted.length - 1]!.startsAtIso)}</span>
        </span>
      </label>
    </div>
  );
}

/** "09:30" → ["09", "30"], on the app's own clock. */
function splitTime(iso: string): [string, string] {
  const t = formatTime(iso);
  const m = /(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return [t, ""];
  return [m[1]!.padStart(2, "0"), m[2]!];
}
