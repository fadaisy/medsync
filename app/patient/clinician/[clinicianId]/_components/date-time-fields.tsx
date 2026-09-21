"use client";

import { useMemo } from "react";

import { formatTime } from "@/lib/patient/booking-format";
import { cn } from "@/lib/utils";
import { DEFAULT_TIME_ZONE, localDateKey } from "@/supabase/functions/_shared/slots";

/**
 * The reference's day strip: a pill per day with its number in a disc, the
 * weekday letter above, seven to a row from today — the chosen day raised
 * with the brand disc and a ▼ over it, a closed day sunk and grey. Rows wrap
 * so every day the horizon holds is on screen at once (ADR 0084 §10: a tile
 * off the edge is a day the patient never sees). Under it, the day's open
 * times as plain badges. Same component, same name, on the phone.
 */
export function DateTimeFields({
  slotsByDate,
  day,
  slot,
  onDay,
  onSlot,
}: {
  slotsByDate: Record<string, ReadonlyArray<{ startsAtIso: string; endsAtIso: string }>>;
  day: string | null;
  slot: string | null;
  onDay: (day: string) => void;
  onSlot: (startsAtIso: string) => void;
}) {
  const today = localDateKey(new Date(), DEFAULT_TIME_ZONE);
  const open = useMemo(() => Object.keys(slotsByDate).sort(), [slotsByDate]);
  const cells = useMemo(() => weekRows(today, open[open.length - 1] ?? today), [today, open]);
  const slots = day ? (slotsByDate[day] ?? []) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-7 gap-x-1.5 gap-y-3" role="radiogroup" aria-label="Day">
        {cells.map((key) => {
          const isOpen = key in slotsByDate;
          const chosen = key === day;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={!isOpen}
              aria-label={`${DAY_LONG.format(atNoon(key))}${key === today ? ", today" : ""}${isOpen ? "" : ", nothing open"}`}
              onClick={() => onDay(key)}
              className="group flex flex-col items-center gap-1 outline-none"
            >
              <span aria-hidden className="text-foreground h-3 text-[9px] leading-3">
                {chosen ? "▼" : ""}
              </span>
              <span aria-hidden className="text-caption text-muted-foreground font-medium">
                {WEEKDAY_LETTER.format(atNoon(key))}
              </span>
              <span
                className={cn(
                  "flex h-[4.5rem] w-11 flex-col items-center rounded-full pt-1 transition-[transform,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  "group-focus-visible:ring-ring group-focus-visible:ring-2 group-focus-visible:ring-offset-2",
                  chosen
                    ? "bg-card ring-foreground/5 -translate-y-0.5 shadow-[0_12px_24px_-10px_rgb(0_0_0/0.35)] ring-1"
                    : isOpen
                      ? "bg-card border-border group-hover:border-foreground/20 border"
                      : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-full font-mono text-[15px] tabular-nums",
                    chosen
                      ? "bg-primary text-primary-foreground font-medium"
                      : isOpen
                        ? "text-foreground ring-border ring-1"
                        : "bg-foreground/5 text-muted-foreground/60",
                  )}
                >
                  {Number(key.slice(8, 10))}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {day === null ? null : slots.length === 0 ? (
        <p className="text-body-s text-muted-foreground">Nothing open that day.</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Time">
          {slots.map((s) => {
            const chosen = s.startsAtIso === slot;
            return (
              <button
                key={s.startsAtIso}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={`${formatTime(s.startsAtIso)} to ${formatTime(s.endsAtIso)}`}
                onClick={() => onSlot(s.startsAtIso)}
                className={cn(
                  "focus-visible:ring-ring h-9 rounded-full border px-3.5 font-mono text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  chosen
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-foreground border-border hover:border-foreground/20",
                )}
              >
                {formatTime(s.startsAtIso)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const WEEKDAY_LETTER = new Intl.DateTimeFormat("en-GB", { weekday: "narrow", timeZone: "UTC" });
const DAY_LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function atNoon(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** Every day from `from` through `to`, padded to whole rows of seven. */
function weekRows(from: string, to: string): string[] {
  const out: string[] = [];
  const t = atNoon(from);
  const end = atNoon(to < from ? from : to).getTime();
  while (t.getTime() <= end || out.length % 7 !== 0) {
    out.push(t.toISOString().slice(0, 10));
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return out;
}
