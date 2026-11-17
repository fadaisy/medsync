"use client";

import type { PaymentChip } from "@patient-core/payments";
import type { TicketView } from "@patient-core/ticket-view";
import type { StageView } from "@patient-core/visit-stages";
import { useState, useTransition } from "react";
import {
  CalendarPlusIcon,
  CheckIcon,
  MessageSquareIcon,
  NavigationIcon,
  Share2Icon,
  XIcon,
} from "lucide-react";

import { buttonClass, ICON, SectionHead } from "@/components/tide/kit";
import { StageList } from "@/components/tide/v2-stages";
import { TicketV2 } from "@/components/tide/v2-ticket";
import { PAYMENTS_COPY } from "@/content/patient-app/payments";
import { VISIT_COPY } from "@/content/patient-app/visit";
import { cn } from "@/lib/utils";

const Q = VISIT_COPY.questions;
const A = VISIT_COPY.actions;

export interface WebQuestion {
  id: string;
  body: string;
  suggested: boolean;
  asked: boolean;
}

/**
 * The day of the visit on the web (patient app v2 §5.5, W3, board 18): the ticket laid out sideways, quick
 * actions, where you are (five named steps, MR4), and Questions for the doctor beside them. No floor map (W3).
 * The calendar entry says "Clinic visit" (neutral for confidential clinics, MR7). Writes go through the actions
 * passed in, so the same component renders on fixtures.
 */
export function VisitDayWeb({
  ticket,
  stage,
  stageTimes,
  questions,
  nurseNote,
  directionsHref,
  smsText,
  addQuestion,
  markQuestion,
  onPayNow,
}: {
  ticket: TicketView;
  stage: StageView;
  stageTimes: (string | null)[];
  questions: WebQuestion[];
  nurseNote: string | null;
  directionsHref: string | null;
  smsText: string;
  addQuestion: (body: string, suggested: boolean) => Promise<unknown>;
  markQuestion: (id: string, change: "asked" | "not_asked" | "remove") => Promise<unknown>;
  onPayNow?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [showText, setShowText] = useState(false);
  const run = (fn: () => Promise<unknown>) => start(async () => void (await fn()));
  const listed = new Set(questions.map((q) => q.body));
  const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(
    `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${A.calendarNeutral}\nDESCRIPTION:Code ${ticket.code}\nEND:VEVENT\nEND:VCALENDAR`,
  )}`;
  const action =
    "rounded-pw-row bg-pw-surface shadow-pw-card focus-visible:outline-pw-focus flex min-h-12 items-center gap-2 px-4 text-[14px] font-semibold focus-visible:outline-2";

  return (
    <div className="flex flex-col gap-6">
      <TicketV2 {...ticket} onPayNow={onPayNow} />
      <div className="grid grid-cols-2 gap-2 min-[761px]:grid-cols-4">
        <a href={ics} download="clinic-visit.ics" className={action}>
          <CalendarPlusIcon className="size-4" {...ICON} />
          {A.calendar}
        </a>
        {directionsHref ? (
          <a href={directionsHref} target="_blank" rel="noreferrer" className={action}>
            <NavigationIcon className="size-4" {...ICON} />
            {A.directions}
          </a>
        ) : null}
        <button
          type="button"
          className={action}
          onClick={() => {
            const text = `${ticket.dayLine} ${ticket.day}, ${ticket.window}. Code ${ticket.code}.`;
            if (navigator.share) void navigator.share({ text }).catch(() => undefined);
            else void navigator.clipboard?.writeText(text).catch(() => undefined);
          }}
        >
          <Share2Icon className="size-4" {...ICON} />
          {A.share}
        </button>
        <button
          type="button"
          className={action}
          aria-expanded={showText}
          onClick={() => setShowText((s) => !s)}
        >
          <MessageSquareIcon className="size-4" {...ICON} />
          {A.text}
        </button>
      </div>
      {showText ? (
        <p className="rounded-pw-row bg-pw-surface-2 p-4 text-[14px]">{smsText}</p>
      ) : null}

      <div className="grid gap-6 min-[1100px]:grid-cols-[1fr_1.2fr]">
        <section className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-3 p-5">
          <SectionHead title="Where you are" />
          <StageList view={stage} times={stageTimes} />
        </section>
        <section
          className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-3 p-5"
          aria-busy={pending}
        >
          <SectionHead title={Q.title} />
          <p className="text-pw-ink-3 text-[13px]">{Q.note}</p>
          <ul className="flex flex-col gap-2">
            {questions.map((q) => (
              <li
                key={q.id}
                className="rounded-pw-row bg-pw-surface-2 flex items-center gap-3 px-3 py-2"
              >
                <button
                  type="button"
                  aria-pressed={q.asked}
                  aria-label={`${Q.asked}: ${q.body}`}
                  onClick={() => run(() => markQuestion(q.id, q.asked ? "not_asked" : "asked"))}
                  className={cn(
                    "focus-visible:outline-pw-focus grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full ring-2",
                      q.asked
                        ? "bg-pw-accent text-pw-on-accent ring-pw-accent"
                        : "ring-pw-line-strong",
                    )}
                  >
                    {q.asked ? <CheckIcon className="size-3.5" {...ICON} /> : null}
                  </span>
                </button>
                <span className={cn("flex-1 text-[15px]", q.asked && "text-pw-ink-3 line-through")}>
                  {q.body}
                </span>
                <button
                  type="button"
                  aria-label={`${Q.remove}: ${q.body}`}
                  onClick={() => run(() => markQuestion(q.id, "remove"))}
                  className="text-pw-ink-3 focus-visible:outline-pw-focus grid size-11 place-items-center rounded-full focus-visible:outline-2"
                >
                  <XIcon className="size-4" {...ICON} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            {Q.suggestions
              .filter((s) => !listed.has(s))
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => run(() => addQuestion(s, true))}
                  className={cn(buttonClass("outline", "s"), "min-h-11")}
                >
                  {s}
                </button>
              ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (!text) return;
              setDraft("");
              run(() => addQuestion(text, false));
            }}
          >
            <label htmlFor="v2-question" className="sr-only">
              {Q.add}
            </label>
            <input
              id="v2-question"
              value={draft}
              maxLength={280}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={Q.add}
              className="rounded-pw-field bg-pw-surface-2 focus-visible:outline-pw-focus min-h-12 flex-1 px-4 text-[15px] focus-visible:outline-2"
            />
            <button type="submit" className={buttonClass("primary", "m")} disabled={!draft.trim()}>
              Add
            </button>
          </form>
          {nurseNote ? (
            <div className="rounded-pw-row bg-pw-surface-2 flex flex-col gap-1 p-4">
              <span className="text-pw-ink-3 text-[11px] font-semibold tracking-[0.08em] uppercase">
                {Q.nurseNote}
              </span>
              <span className="text-[15px]">{nurseNote}</span>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export interface WebVisitRow {
  id: string;
  href: string;
  dateIso: string;
  day: string;
  dayLabel: string;
  clinic: string;
  who: string;
  window: string;
  code: string;
  chip: PaymentChip;
}

const CHIP: Record<PaymentChip, string | null> = {
  paid_app: PAYMENTS_COPY.chip.paidApp,
  paid_counter: PAYMENTS_COPY.chip.paidCounter,
  at_hospital: PAYMENTS_COPY.chip.atHospital,
  none: null,
};
/** People's colours on the calendar: the navy-to-teal cascade, never a clinical colour (MR5). */
const PERSON = ["bg-pw-cascade-1", "bg-pw-cascade-2", "bg-pw-cascade-3", "bg-pw-cascade-4"];

/**
 * Visits on the web (patient app v2 §5.2, W4, board 19): offers that need an answer first (neutral and
 * labelled: amber stays clinical), upcoming visits for the household with the code and how each is paid, past
 * visits, and a month calendar coloured by person.
 */
export function VisitsWeb({
  offers,
  upcoming,
  past,
  month,
  onOffer,
}: {
  offers: { id: string; title: string; line: string }[];
  upcoming: WebVisitRow[];
  past: WebVisitRow[];
  /** "2026-11": the month the calendar shows. */
  month: string;
  onOffer: (id: string, answer: "keep" | "pick" | "cancel") => void;
}) {
  const people = [...new Set(upcoming.map((v) => v.who))];
  const colour = (who: string) => PERSON[people.indexOf(who) % PERSON.length]!;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const byDay = new Map<number, WebVisitRow[]>();
  for (const v of upcoming) {
    const d = new Date(v.dateIso);
    if (d.getUTCFullYear() === y && d.getUTCMonth() === m - 1)
      byDay.set(d.getUTCDate(), [...(byDay.get(d.getUTCDate()) ?? []), v]);
  }
  const row = (v: WebVisitRow, dim = false) => {
    const chip = CHIP[v.chip];
    const paid = v.chip === "paid_app" || v.chip === "paid_counter";
    return (
      <li key={v.id}>
        <a
          href={v.href}
          className="rounded-pw-card bg-pw-surface shadow-pw-card focus-visible:outline-pw-focus flex items-center gap-4 p-4 focus-visible:outline-2"
        >
          <span
            className={cn(
              "grid w-14 shrink-0 place-items-center rounded-2xl py-2",
              dim ? "bg-pw-surface-2 text-pw-ink-3" : "bg-pw-band text-pw-on-band",
            )}
          >
            <span className="font-pw text-[22px] leading-none font-semibold">{v.day}</span>
            <span className="text-[11px] font-semibold tracking-[0.06em]">{v.dayLabel}</span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] font-semibold">{v.clinic}</span>
            <span className="text-pw-ink-3 flex items-center gap-2 text-[13px]">
              <span aria-hidden className={cn("size-2.5 rounded-full", colour(v.who))} />
              {v.who} · {v.window}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-pw-mono text-pw-ink-2 text-[13px] tracking-[0.14em]">
                {v.code}
              </span>
              {chip ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[12px] font-semibold",
                    paid
                      ? "bg-pw-accent-tint text-pw-accent-text"
                      : "bg-pw-surface-3 text-pw-ink-2",
                  )}
                >
                  {chip}
                </span>
              ) : null}
            </span>
          </span>
        </a>
      </li>
    );
  };
  return (
    <div className="grid gap-6 min-[1100px]:grid-cols-[1.55fr_1fr]">
      <div className="flex min-w-0 flex-col gap-6">
        {offers.length ? (
          <section className="flex flex-col gap-3">
            <SectionHead title="Needs your answer" />
            {offers.map((o) => (
              <div
                key={o.id}
                className="rounded-pw-card bg-pw-surface ring-pw-line-strong flex flex-col gap-3 p-5 ring-[1.5px] ring-inset"
              >
                <p className="text-[15px] font-semibold">{o.title}</p>
                <p className="text-pw-ink-2 text-[14px]">{o.line}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOffer(o.id, "keep")}
                    className={buttonClass("primary", "m")}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => onOffer(o.id, "pick")}
                    className={buttonClass("outline", "m")}
                  >
                    Pick another day
                  </button>
                  <button
                    type="button"
                    onClick={() => onOffer(o.id, "cancel")}
                    className={buttonClass("soft", "m")}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </section>
        ) : null}
        <section className="flex flex-col gap-3">
          <SectionHead title="Coming up" />
          <ul className="flex flex-col gap-3">{upcoming.map((v) => row(v))}</ul>
        </section>
        {past.length ? (
          <section className="flex flex-col gap-3">
            <SectionHead title="Past visits" />
            <ul className="flex flex-col gap-3">{past.map((v) => row(v, true))}</ul>
          </section>
        ) : null}
      </div>
      <section
        className="rounded-pw-card bg-pw-surface shadow-pw-card flex h-fit flex-col gap-3 p-5"
        aria-label="This month"
      >
        <SectionHead
          title={first.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
        />
        <div
          className="text-pw-ink-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold"
          aria-hidden
        >
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <ol className="grid grid-cols-7 gap-1">
          {Array.from({ length: lead }, (_, i) => (
            <li key={`l${i}`} aria-hidden />
          ))}
          {Array.from({ length: daysIn }, (_, i) => {
            const n = i + 1;
            const visits = byDay.get(n) ?? [];
            return (
              <li
                key={n}
                aria-label={
                  visits.length
                    ? `${n}: ${visits.map((v) => `${v.who}, ${v.clinic}`).join("; ")}`
                    : undefined
                }
                className={cn(
                  "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-[13px]",
                  visits.length ? "bg-pw-surface-2 font-semibold" : "text-pw-ink-3",
                )}
              >
                {n}
                {visits.length ? (
                  <span className="flex gap-0.5" aria-hidden>
                    {visits.map((v) => (
                      <span key={v.id} className={cn("size-1.5 rounded-full", colour(v.who))} />
                    ))}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        <ul className="flex flex-wrap gap-3 text-[12px]">
          {people.map((p) => (
            <li key={p} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2.5 rounded-full", colour(p))} />
              {p}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
