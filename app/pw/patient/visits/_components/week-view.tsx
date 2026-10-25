"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useState } from "react";
import {
  addDays,
  dayNumberOf,
  monthGrid,
  monthShortOf,
  monthTitleOf,
  shiftMonth,
  shortDayOf,
  weekdayOf,
} from "@patient-core/visits-calendar";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  MapPinIcon,
} from "lucide-react";

import { ButtonLink, Card, ICON, Note, Overline } from "@/components/tide/kit";
import { VISITS_COPY as C } from "@/content/patient/visits";
import { cn } from "@/lib/utils";

/** A visit as the calendar and the week ahead show it: what it is for and its status word, no clinician. */
export interface WeekVisit {
  id: string;
  dayKey: string;
  title: string;
  status: string;
  forMember: string | null;
  hospitalName: string;
}

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pw-focus";

/**
 * The calendar and the week ahead (the phone's (tabs)/visits.tsx). The visits given are already the ones on
 * the calendar (cancelled, declined, missed and rescheduled have left). Picking a day says what is on it and
 * offers Open or Book; the week ahead shows two rows, then "N more this week".
 */
export function WeekView({
  todayKey,
  visits,
  openDays,
  meds,
  loaded,
}: {
  todayKey: string;
  visits: WeekVisit[];
  openDays: string[];
  meds: { taken: number; total: number };
  loaded: boolean;
}) {
  const [month, setMonth] = useState(todayKey);
  const [sel, setSel] = useState(todayKey);
  const [open, setOpen] = useState(false);
  const opens = new Set(openDays);
  const visitsOn = (key: string) => visits.filter((v) => v.dayKey === key);

  /* the selected-day line */
  const selVisit = visitsOn(sel)[0];
  const selOpen = opens.has(sel);
  let selTitle = shortDayOf(sel);
  let selLine: string = sel < todayKey ? C.pastDay : C.closedDay;
  if (sel === todayKey) {
    selTitle = C.today;
    selLine = meds.total > 0 ? C.medsWords(meds.taken, meds.total) : C.nothingPlanned;
  }
  if (selOpen) {
    selTitle = C.openDayTitle(shortDayOf(sel));
    selLine = C.placesLeft;
  }
  if (selVisit) {
    selTitle = C.visitDayTitle(shortDayOf(sel));
    selLine = `${selVisit.title} · ${selVisit.status}`;
  }

  /* the week ahead: today's medicines, then this week's visits */
  const end = addDays(todayKey, 6);
  const rows: { key: string; node: ReactNode }[] = [
    ...(meds.total > 0 ? [{ key: todayKey, node: <MedicinesCard {...meds} /> }] : []),
    ...visits
      .filter((v) => v.dayKey > todayKey && v.dayKey <= end)
      .map((v) => ({ key: v.dayKey, node: <VisitCard v={v} /> })),
  ].sort((a, b) => a.key.localeCompare(b.key));
  const shown = open ? rows : rows.slice(0, 2);
  const hidden = rows.length - 2;

  return (
    <>
      <Card className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <Overline>{C.calendar}</Overline>
            <h2 className="text-xl leading-[26px] font-semibold">{monthTitleOf(month)}</h2>
          </div>
          <div className="flex gap-1.5">
            {([-1, 1] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setMonth(shiftMonth(month, d))}
                aria-label={d < 0 ? C.prevMonth : C.nextMonth}
                className={cn("bg-pw-bg grid size-12 place-items-center rounded-full", FOCUS)}
              >
                {d < 0 ? (
                  <ChevronLeftIcon className="size-[18px]" {...ICON} />
                ) : (
                  <ChevronRightIcon className="size-[18px]" {...ICON} />
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-7" aria-hidden>
          {C.weekdays.map((w, i) => (
            <span key={i} className="text-pw-ink-3 text-center text-xs font-semibold">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthGrid(month).map((key, i) => {
            if (!key) return <span key={`b${i}`} className="h-12" />;
            const isToday = key === todayKey;
            const isVisit = visitsOn(key).length > 0;
            const isOpen = opens.has(key);
            const picked = key === sel;
            const label = [
              shortDayOf(key),
              isToday ? C.todayWord : null,
              isOpen ? C.clinicOpenWord : null,
              isVisit ? C.yourVisitWord : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSel(key)}
                aria-label={label}
                aria-pressed={picked}
                className={cn(
                  "flex h-12 flex-col items-center justify-center gap-0.5 rounded-full",
                  FOCUS,
                )}
              >
                <span
                  className={cn(
                    "grid h-[30px] w-[34px] place-items-center rounded-full text-sm",
                    isToday
                      ? "bg-pw-band text-pw-on-band font-bold"
                      : isOpen
                        ? "bg-pw-accent-tint text-pw-accent-text font-bold"
                        : key < todayKey
                          ? "text-pw-ink-4 font-medium"
                          : "font-medium",
                    isVisit && "ring-pw-ink font-bold ring-2",
                    picked && !isVisit && "ring-pw-accent ring-2",
                  )}
                >
                  {Number(key.slice(8))}
                </span>
                <span
                  aria-hidden
                  className={cn("size-[5px] rounded-full", isVisit && "bg-pw-area-visits")}
                />
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-1">
          <Legend swatch={<span className="bg-pw-accent-tint size-3.5 rounded-full" />}>
            {C.clinicOpen}
          </Legend>
          <Legend swatch={<span className="ring-pw-ink size-3.5 rounded-full ring-2 ring-inset" />}>
            {C.yourVisit}
          </Legend>
        </div>
        <div aria-live="polite" className="rounded-pw-field bg-pw-bg flex items-center gap-2.5 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{selTitle}</p>
            <p className="text-pw-ink-2 text-sm">{selLine}</p>
          </div>
          {selVisit ? (
            <ButtonLink size="s" href={`/patient/visits/${selVisit.id}`}>
              {C.open}
            </ButtonLink>
          ) : selOpen ? (
            <ButtonLink size="s" tone="accent" href={`/patient/book/day?day=${sel}`}>
              {C.book}
            </ButtonLink>
          ) : null}
        </div>
      </Card>

      <section aria-labelledby="week-ahead" className="flex flex-col gap-2.5">
        <div>
          <p className="text-pw-ink-2 text-sm font-medium">
            {C.weekRange(dayNumberOf(todayKey), dayNumberOf(end), monthShortOf(end))}
          </p>
          <h2 id="week-ahead" className="text-2xl leading-[30px] font-semibold tracking-[-0.02em]">
            {C.weekAhead}
          </h2>
        </div>
        {loaded && rows.length === 0 ? (
          <Note>{visits.length === 0 ? C.noVisitsYet : C.nothingThisWeek}</Note>
        ) : null}
        <ul className="flex flex-col gap-2.5">
          {shown.map((r, i) => (
            <li key={`${r.key}-${i}`} className="flex items-start gap-3.5">
              <span
                className={cn(
                  "rounded-pw-row flex w-14 shrink-0 flex-col items-center py-2",
                  r.key === todayKey
                    ? "bg-pw-band text-pw-on-band"
                    : "bg-pw-surface shadow-pw-card",
                )}
              >
                <span className="text-xl font-bold">{dayNumberOf(r.key)}</span>
                <span className="text-xs font-semibold">
                  {r.key === todayKey ? C.today : weekdayOf(r.key)}
                </span>
              </span>
              <div className="min-w-0 flex-1">{r.node}</div>
            </li>
          ))}
        </ul>
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={cn(
              "bg-pw-surface shadow-pw-card inline-flex min-h-12 items-center gap-1.5 self-center rounded-full px-4 text-sm font-semibold",
              FOCUS,
            )}
          >
            {open ? C.less : C.more(hidden)}
            {open ? (
              <ChevronUpIcon className="size-[18px]" {...ICON} />
            ) : (
              <ChevronDownIcon className="size-[18px]" {...ICON} />
            )}
          </button>
        ) : null}
      </section>
    </>
  );
}

function Legend({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="text-pw-ink-2 inline-flex items-center gap-1.5 text-[13px] font-medium">
      {swatch}
      {children}
    </span>
  );
}

function MedicinesCard({ taken, total }: { taken: number; total: number }) {
  return (
    <Link
      href="/patient/care/medicines"
      className={cn(
        "rounded-pw-card bg-pw-surface shadow-pw-card hover:bg-pw-surface-2 flex flex-col gap-1 p-3",
        FOCUS,
      )}
    >
      <Overline area="medicines">{C.medicines}</Overline>
      <span className="text-[17px] font-semibold">{C.medsWords(taken, total)}</span>
      <span aria-hidden className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn("h-1.5 flex-1 rounded-full", i < taken ? "bg-pw-act" : "bg-pw-line")}
          />
        ))}
      </span>
    </Link>
  );
}

function VisitCard({ v }: { v: WeekVisit }) {
  const href = `/patient/visits/${v.id}`;
  return (
    <div className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <Overline area="visits">{v.forMember ? C.visitFor(v.forMember) : C.visit}</Overline>
        <span className="text-pw-ink-2 text-sm font-semibold">{v.status}</span>
      </div>
      <Link
        href={href}
        className={cn(
          "inline-flex min-h-12 items-center self-start text-[17px] font-semibold hover:underline",
          FOCUS,
        )}
      >
        {v.title}
      </Link>
      <div className="flex items-center gap-2 pt-0.5">
        <span className="text-pw-ink-2 min-w-0 flex-1 truncate text-sm">{v.hospitalName}</span>
        <Link
          href={`${href}#getting-there`}
          aria-label={C.directions}
          className={cn(
            "bg-pw-accent text-pw-on-accent grid size-12 place-items-center rounded-full",
            FOCUS,
          )}
        >
          <MapPinIcon className="size-[18px]" {...ICON} />
        </Link>
      </div>
    </div>
  );
}
