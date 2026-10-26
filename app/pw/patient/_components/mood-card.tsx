"use client";

import type { DayMood, Mood } from "@patient-core/log";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Toast } from "@/components/tide/controls";
import { Card } from "@/components/tide/kit";
import { MoodFace } from "@/components/tide/mood-face";
import { HOME_COPY as C } from "@/content/patient/home";
import { cn } from "@/lib/utils";
import { saveMoodAction } from "../_lib/day-actions";

const MOODS: DayMood[] = ["good", "okay", "low"];
const LINK =
  "focus-visible:outline-pw-focus inline-flex min-h-12 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * "How are you today?" (the phone's MoodCard): three faces, then the week strip. A not-well day offers
 * "Tell my team" while chat is on; with `mobileChat` off it offers "Book a visit", and Help is in the header.
 * A save that fails says so; a save that lands says nothing (as the phone).
 */
export function MoodCard({
  today,
  week,
  chat,
}: {
  today: DayMood | null;
  week: Mood[];
  chat: boolean;
}) {
  const [picked, setPicked] = useState<DayMood | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const shown = picked ?? today;
  // Today's face is the strip's last day, as soon as it is picked.
  const strip = shown ? [...week.slice(0, -1), shown] : week;

  const pick = (m: DayMood) => {
    setPicked(m);
    start(async () => {
      const r = await saveMoodAction(m);
      if (!r.ok) {
        setPicked(null);
        setError(r.error);
      }
    });
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-[17px] leading-[22px] font-semibold">{C.moodTitle}</h2>
      <div className="flex gap-2">
        {MOODS.map((m) => {
          const on = shown === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              aria-label={C.moodPick(C.moods[m])}
              onClick={() => pick(m)}
              className={cn(
                "rounded-pw-card flex min-h-[92px] flex-1 flex-col items-center justify-center gap-1.5 ring-2 ring-inset",
                "focus-visible:outline-pw-focus focus-visible:outline-2 focus-visible:outline-offset-2",
                on ? "bg-pw-accent-tint ring-pw-accent" : "bg-pw-surface-2 ring-transparent",
              )}
            >
              <MoodFace mood={m} size={44} pop={on} decorative />
              <span
                className={cn(
                  "text-[13px] font-semibold",
                  on ? "text-pw-accent-text" : "text-pw-ink-2",
                )}
              >
                {C.moods[m]}
              </span>
            </button>
          );
        })}
      </div>
      {shown ? (
        <div className="flex items-center gap-2">
          <Link
            href="/patient/mood"
            aria-label={C.moodWeekLink}
            className={cn(LINK, "flex-1 gap-1.5")}
          >
            <span className="text-pw-ink-3 text-xs font-semibold">{C.thisWeek}</span>
            {strip.map((m, i) => (
              <MoodFace key={i} mood={m} size={20} decorative />
            ))}
          </Link>
          {shown === "low" ? (
            <Link
              href={chat ? "/patient/care/messages" : "/patient/book"}
              className={cn(
                LINK,
                "bg-pw-accent-tint text-pw-accent-text px-3 text-[13px] font-semibold",
              )}
            >
              {chat ? C.tellTeam : C.bookVisit}
            </Link>
          ) : (
            <Link
              href="/patient/mood"
              className={cn(LINK, "text-pw-accent-text text-sm font-semibold")}
            >
              {C.seeAll}
            </Link>
          )}
        </div>
      ) : null}
      {error ? <Toast message={error} onClose={() => setError(null)} /> : null}
    </Card>
  );
}
