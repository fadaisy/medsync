"use client";

import type { Mood } from "@patient-core/log";
import { useState } from "react";
import { countMoods } from "@patient-core/log";

import { Segments } from "@/components/tide/controls";
import { Card } from "@/components/tide/kit";
import { MoodFace } from "@/components/tide/mood-face";
import { MOOD_COPY as M } from "@/content/patient/home";

type View3 = "week" | "month" | "year";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const OVERLINE = "text-pw-ink-3 text-xs leading-4 font-semibold tracking-[0.06em] uppercase";
/** The year bars take the faces' own fills, and each row says its numbers (never colour alone). */
const MIX = ["bg-pw-accent-soft", "bg-pw-info-tint", "bg-pw-ink-4"] as const;

export function MoodViews({
  week,
  weekdays,
  month,
  year,
  none,
}: {
  week: Mood[];
  /** `getDay()` of each of the week's days, oldest first. */
  weekdays: number[];
  month: Mood[];
  year: ([number, number, number] | null)[];
  none: boolean;
}) {
  const [view, setView] = useState<View3>("week");
  const w = countMoods(week);
  const m = countMoods(month);

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Segments
        label={M.viewsLabel}
        options={[
          { value: "week", label: M.views.week },
          { value: "month", label: M.views.month },
          { value: "year", label: M.views.year },
        ]}
        value={view}
        onChange={setView}
        className="self-start max-[760px]:w-full"
      />
      {none ? <p className="text-pw-ink-2 text-[17px]">{M.none}</p> : null}

      {view === "week" ? (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className={OVERLINE}>{M.thisWeek}</h2>
          <ol className="flex justify-between">
            {week.map((mood, i) => (
              <li key={i} className="flex flex-col items-center gap-1">
                <MoodFace mood={mood} size={38} />
                <span className="text-pw-ink-3 text-[11px] font-semibold">
                  {i === week.length - 1 ? M.today : WEEKDAYS[weekdays[i] ?? 0]}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-pw-ink-2 text-sm font-semibold">
            {M.weekCount(w.good, w.okay, w.low)}
          </p>
        </Card>
      ) : null}

      {view === "month" ? (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className={OVERLINE}>{M.thisMonth}</h2>
          <ol className="grid grid-cols-7 gap-y-2">
            {month.map((mood, i) => (
              <li key={i} className="flex flex-col items-center gap-0.5">
                <MoodFace mood={mood} size={32} />
                <span className="font-pw-mono text-pw-ink-3 text-[11px] font-semibold">
                  {i + 1}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-pw-ink-2 text-sm font-semibold">
            {M.monthCount(m.good, m.okay, m.low)}
          </p>
        </Card>
      ) : null}

      {view === "year" ? (
        <Card className="flex flex-col gap-2.5 p-4">
          <h2 className={OVERLINE}>{M.byMonth}</h2>
          <ol className="flex flex-col gap-2.5">
            {year.map((mix, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="sr-only">
                  {mix ? M.monthMix(MONTHS[i]!, mix[0], mix[1], mix[2]) : M.monthNone(MONTHS[i]!)}
                </span>
                <span aria-hidden className="text-pw-ink-2 w-8 text-xs font-semibold">
                  {MONTHS[i]}
                </span>
                {mix ? (
                  <span aria-hidden className="flex h-3 flex-1 overflow-hidden rounded-full">
                    {mix.map((pct, k) => (
                      <span key={k} className={MIX[k]} style={{ flexGrow: pct }} />
                    ))}
                  </span>
                ) : (
                  <span aria-hidden className="text-pw-ink-3 flex-1 text-[11px] font-semibold">
                    {M.nothingLogged}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-1 flex flex-wrap gap-3">
            {(["good", "okay", "low"] as const).map((k) => (
              <span key={k} className="text-pw-ink-2 flex items-center gap-1 text-xs font-semibold">
                <MoodFace mood={k} size={16} decorative />
                {M.faces[k]}
              </span>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
