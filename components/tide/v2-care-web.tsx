"use client";

import type { DayReading } from "@/components/tide/v2-reading-card";
import type { PlanSlot, WeekMark } from "@patient-core/care-plan";
import type { FlowStep } from "@patient-core/danger-flow";
import type { CheckLine, TeamCard } from "@patient-core/my-care";
import type { Hero } from "@patient-core/today-hero";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { nextStep, startFlow, timerText } from "@patient-core/danger-flow";

import { buttonClass } from "@/components/tide/kit";
import { DayTimeline, DoseRow, HeroCard } from "@/components/tide/v2-care";
import { CheckStateTag } from "@/components/tide/v2-check-tag";
import { ReadingCard } from "@/components/tide/v2-reading-card";
import { CARE_V2_COPY } from "@/content/patient-app/care";
import { cn } from "@/lib/utils";

const C = CARE_V2_COPY;

/**
 * Care mode on the web, v2 (patient app v2 §5.6 to §5.8; Step 9), behind `careModeOn()` (off until Gate CG).
 * Today: the hero from the ladder, the plan as a 06:00–22:00 timeline with tickable points then the rows, and the
 * three working chart cards (hover or focus a day, gaps kept, a summary for screen readers, S21; + Log opens Add
 * a reading set to that measure, S22). The Plan page, My care with messages, and the danger flow shown in place
 * of the reading form (S23). Props-driven so the gallery renders them on fixtures.
 */

export interface WebSnippet {
  metric: "bp" | "sugar" | "weight";
  unit: string;
  days: DayReading[];
  weekAgo: number | null;
}

export interface WebWeekDot {
  label: string;
  mark: WeekMark;
}

const point = (s: PlanSlot) => ({
  key: s.key,
  label: s.name,
  at: s.at,
  done: s.state === "done",
  kind: s.kind,
  word: s.state === "later" ? C.plan.later : slotWord(s),
});

function slotWord(s: PlanSlot): string {
  return s.state === "done"
    ? C.plan.taken
    : s.state === "skipped"
      ? C.plan.skipped
      : s.state === "snoozed"
        ? C.plan.snoozed
        : s.state === "missed"
          ? C.plan.missed
          : s.state === "due"
            ? C.plan.due
            : s.at;
}

/** Ticks with a key made once per slot, so a retry is the same tick (S18). */
function useTicks(slots: PlanSlot[], tick: (s: PlanSlot, key: string) => Promise<{ ok: boolean }>) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [keys] = useState(() => new Map<string, string>());
  const [, start] = useTransition();
  const shown = slots.map((s) => (done.has(s.key) ? { ...s, state: "done" as const } : s));
  const onTick = (k: string) => {
    const s = slots.find((x) => x.key === k);
    if (!s || s.state === "done" || done.has(k)) return;
    if (!keys.has(k)) keys.set(k, crypto.randomUUID());
    setDone((d) => new Set(d).add(k));
    start(async () => {
      const r = await tick(s, keys.get(k)!);
      if (!r.ok)
        setDone((d) => {
          const n = new Set(d);
          n.delete(k);
          return n;
        });
    });
  };
  return { shown, onTick };
}

export function CareTodayWeb(p: {
  hero: Hero;
  slots: PlanSlot[];
  nowLabel: string;
  snippets: WebSnippet[];
  tick: (s: PlanSlot, key: string) => Promise<{ ok: boolean }>;
  logHref: (metric: WebSnippet["metric"]) => string;
  detailsHref: string;
  heroHref: string | null;
}) {
  const router = useRouter();
  const { shown, onTick } = useTicks(p.slots, p.tick);
  return (
    <div className="flex flex-col gap-8">
      <HeroCard
        hero={p.hero}
        onAction={
          p.hero.kind === "due"
            ? () => onTick((p.hero as Extract<Hero, { kind: "due" }>).due.key)
            : p.heroHref
              ? () => router.push(p.heroHref!)
              : undefined
        }
      />

      <section className="flex flex-col gap-4" aria-labelledby="plan-today">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="plan-today" className="text-[20px] font-semibold">
            {C.plan.title}
          </h2>
          <Link
            href="/patient/care/plan"
            className="text-pw-accent-text min-h-11 text-[14px] font-semibold"
          >
            {C.plan.seePlan}
          </Link>
        </div>
        {shown.length === 0 ? (
          <p className="text-pw-ink-2 text-[15px]">{C.plan.empty}</p>
        ) : (
          <DayTimeline points={shown.map(point)} now={p.nowLabel} onToggle={onTick} />
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="readings-today">
        <h2 id="readings-today" className="text-[20px] font-semibold">
          {C.plan.readings}
        </h2>
        <div className="grid grid-cols-1 gap-4 min-[834px]:grid-cols-2 min-[1200px]:grid-cols-3">
          {p.snippets.map((s) => (
            <ReadingCard
              key={s.metric}
              metric={s.metric}
              ctx="fasting"
              unit={s.unit}
              days={s.days}
              weekAgo={s.weekAgo}
              onLog={() => router.push(p.logHref(s.metric))}
              detailsHref={p.detailsHref}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export function WeekDotsWeb({ week }: { week: WebWeekDot[] }) {
  return (
    <section
      className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-3 p-5"
      aria-label={C.plan.week}
    >
      <h3 className="text-[15px] font-semibold">{C.plan.week}</h3>
      <ol className="flex justify-between gap-2">
        {week.map((d) => (
          <li key={d.label} className="flex flex-col items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "size-5 rounded-full",
                d.mark === "taken" && "bg-pw-accent",
                d.mark === "some" && "bg-pw-accent-tint ring-pw-accent ring-[1.5px] ring-inset",
                d.mark === "missed" && "ring-pw-ink-3 ring-[1.5px] ring-inset",
                d.mark === "due" && "border-pw-accent border-[1.5px] border-dashed",
                d.mark === "none" && "ring-pw-line ring-[1.5px] ring-inset",
              )}
            />
            <span className="text-pw-ink-3 text-[12px]">{d.label}</span>
            <span className="sr-only">{C.plan.weekMarks[d.mark]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The Plan page: a vertical timeline with times, connectors and ticks; then the week of medicines. */
export function PlanWeb(p: {
  slots: PlanSlot[];
  week: WebWeekDot[];
  tick: (s: PlanSlot, key: string) => Promise<{ ok: boolean }>;
}) {
  const { shown, onTick } = useTicks(p.slots, p.tick);
  return (
    <div className="grid grid-cols-1 gap-6 min-[1024px]:grid-cols-[1fr_340px]">
      <ol className="flex flex-col" aria-label={C.plan.title}>
        {shown.length === 0 ? <li className="text-pw-ink-2 text-[15px]">{C.plan.empty}</li> : null}
        {shown.map((s, i) => (
          <li key={s.key} className="flex gap-3">
            <span className="text-pw-ink-3 w-12 shrink-0 pt-4 text-[13px] tabular-nums">
              {s.at}
            </span>
            <span className="flex flex-col items-center pt-4" aria-hidden>
              <span
                className={cn(
                  "size-3 rounded-full",
                  s.state === "done" ? "bg-pw-accent" : "bg-pw-line",
                )}
              />
              {i < shown.length - 1 ? <span className="bg-pw-line my-1 w-0.5 flex-1" /> : null}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pb-3">
              <DoseRow point={point(s)} onToggle={() => onTick(s.key)} />
              <span className="text-pw-ink-3 pl-3 text-[13px]">
                {[s.kind === "dose" ? C.plan.label : null, s.why, slotWord(s)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {p.week.length ? <WeekDotsWeb week={p.week} /> : null}
    </div>
  );
}

export interface ThreadMessage {
  id: string;
  fromPatient: boolean;
  kind: "text" | "auto_reply" | "request";
  body: string;
  at: string;
}

/** My care: the team and the checks in one column, messages in the other (§5.8, web). */
export function MyCareWeb(p: {
  team: TeamCard[];
  checks: CheckLine[];
  messages: ThreadMessage[];
  send: (key: string, body: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const M = C.myCare;
  const G = C.messages;
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<ThreadMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const all = [...p.messages, ...sent];
  const lastMine = all.filter((m) => m.fromPatient).length;
  const ask =
    lastMine === p.messages.filter((m) => m.fromPatient).length
      ? p.messages.filter((m) => !m.fromPatient && m.kind === "request").at(-1)
      : undefined;
  const doSend = (body: string) => {
    const b = body.trim();
    if (!b) return;
    const key = crypto.randomUUID();
    const mine: ThreadMessage = { id: key, fromPatient: true, kind: "text", body: b, at: G.queued };
    setSent((s) => [...s, mine]);
    setDraft("");
    start(async () => {
      const r = await p.send(key, b);
      setError(r.ok ? null : (r.error ?? null));
      if (!r.ok) setSent((s) => s.filter((m) => m.id !== key));
    });
  };
  return (
    <div className="grid grid-cols-1 gap-8 min-[1024px]:grid-cols-2">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3" aria-labelledby="team">
          <h2 id="team" className="text-[20px] font-semibold">
            {M.team}
          </h2>
          {p.team.length === 0 ? <p className="text-pw-ink-2 text-[15px]">{M.noTeam}</p> : null}
          <ul className="grid grid-cols-1 gap-3 min-[600px]:grid-cols-2">
            {p.team.map((m) => (
              <li
                key={m.id}
                className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-1 p-4"
              >
                {m.firstContact ? (
                  <span className="text-pw-accent-text text-[12px] font-semibold">
                    {M.firstContact}
                  </span>
                ) : null}
                <span className="text-[15px] font-semibold">{m.name ?? m.role}</span>
                {m.name ? <span className="text-pw-ink-2 text-[13px]">{m.role}</span> : null}
                {m.nextStep ? (
                  <span className="text-pw-ink-3 text-[13px]">{m.nextStep}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        {p.checks.length ? (
          <section className="flex flex-col gap-3" aria-labelledby="checks">
            <h2 id="checks" className="text-[20px] font-semibold">
              {M.checks}
            </h2>
            <ul className="flex flex-col gap-2">
              {p.checks.map((c) => (
                <li
                  key={c.key}
                  className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-wrap items-center gap-3 p-4"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-semibold">
                      {M.checkNames[c.key] ?? c.key}
                    </span>
                    <span className="text-pw-ink-3 text-[13px]">
                      {c.lastIso
                        ? M.lastDone.replace("{date}", c.lastIso.slice(0, 10))
                        : M.neverRecorded}
                    </span>
                  </span>
                  <CheckStateTag state={c.state} />
                  {c.state !== "done" ? (
                    <Link href="/patient/book" className={buttonClass("outline", "s")}>
                      {M.bookIt}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="messages">
        <h2 id="messages" className="text-[20px] font-semibold">
          {G.title}
        </h2>
        <p className="text-pw-ink-2 text-[14px]">{G.hours}</p>
        <div className="rounded-pw-card bg-pw-surface-2 flex flex-wrap items-center gap-3 p-4">
          <p className="min-w-0 flex-1 text-[14px]">{G.notForEmergencies}</p>
          <Link href="/patient/help" className={buttonClass("danger", "s")}>
            Help
          </Link>
        </div>
        {ask ? (
          <div className="rounded-pw-card bg-pw-surface shadow-pw-card p-4">
            <p className="text-pw-accent-text text-[12px] font-semibold">{G.checkIn}</p>
            <p className="text-[15px]">{ask.body}</p>
          </div>
        ) : null}
        <ol className="flex flex-col gap-2" aria-live="polite">
          {all.length === 0 ? <li className="text-pw-ink-2 text-[15px]">{G.empty}</li> : null}
          {all.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-pw-card flex max-w-[85%] flex-col gap-1 p-3",
                m.fromPatient ? "bg-pw-accent-tint self-end" : "bg-pw-surface self-start",
              )}
            >
              <span className="text-[15px]">{m.body}</span>
              <span className="text-pw-ink-3 text-[12px]">{m.at}</span>
            </li>
          ))}
        </ol>
        {error ? (
          <p role="alert" className="text-pw-ink-2 text-[13px]">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {G.quick.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => doSend(q)}
              className={buttonClass("soft", "s")}
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            doSend(draft);
          }}
        >
          <label className="sr-only" htmlFor="care-msg">
            {G.placeholder}
          </label>
          <textarea
            id="care-msg"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder={G.placeholder}
            className="bg-pw-surface ring-pw-line focus-visible:ring-pw-focus min-h-11 flex-1 rounded-2xl p-3 text-[15px] ring-1 outline-none ring-inset"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            className={buttonClass("accent", "m", pending || !draft.trim())}
          >
            {G.send}
          </button>
        </form>
      </section>
    </div>
  );
}

/**
 * The danger flow on the web (§5.8), in place of the reading form, never a toast (S23). The same steps as the
 * phone; the recheck reading is saved through `saveReading` (the team is told, S19). Help is on every step.
 */
export function DangerFlowWeb({
  kind,
  saveReading,
}: {
  kind: "low_sugar" | "very_high_bp" | "low_bp" | "high_sugar" | "pulse";
  saveReading: (
    input:
      | { kind: "sugar"; value: number; context: "random" }
      | { kind: "bp"; top: number; bottom: number },
  ) => Promise<unknown>;
}) {
  const D = C.danger;
  const [step, setStep] = useState<FlowStep>(() => startFlow(kind));
  const [now, setNow] = useState(() => new Date());
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  useEffect(() => {
    if (step.step !== "wait") return;
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, [step.step]);
  const s = step;
  const title =
    s.flow === "low_sugar"
      ? D.lowSugar.title
      : s.flow === "very_high_bp"
        ? D.highBp.title
        : D.helpNow;
  const helpStep = s.step === "help" || s.step === "help_now";
  const line = helpStep
    ? s.flow === "low_sugar"
      ? D.lowSugar.stillLow
      : D.helpNow
    : s.flow === "low_sugar"
      ? ({
          sweet: D.lowSugar.sweet,
          sit: D.lowSugar.sit,
          recheck: D.lowSugar.recheck,
          better: D.lowSugar.better,
        }[s.step as "sweet"] ??
        (s.step === "wait" ? D.lowSugar.wait.replace("{time}", timerText(s.untilIso, now)) : ""))
      : ({
          rest: D.highBp.rest,
          second: D.highBp.second,
          call_nurse: D.highBp.callNurse,
          better: D.highBp.better,
        }[s.step as "rest"] ?? "");
  const next = () => setStep((x) => nextStep(x, { type: "next", now: new Date() }));
  const field = (v: string, set: (x: string) => void, label: string) => (
    <label className="flex flex-1 flex-col gap-1 text-[13px] font-semibold">
      {label}
      <input
        inputMode="decimal"
        value={v}
        onChange={(e) => set(e.target.value)}
        className="bg-pw-surface ring-pw-line focus-visible:ring-pw-focus min-h-12 rounded-2xl px-3 text-[20px] ring-1 outline-none ring-inset"
      />
    </label>
  );
  return (
    <section
      role="alertdialog"
      aria-labelledby="danger-title"
      aria-describedby="danger-line"
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-2">
        <h2 id="danger-title" className="text-[24px] font-semibold">
          {title}
        </h2>
        <p id="danger-line" className="text-[17px]" aria-live="polite">
          {line}
        </p>
        <p className="text-pw-ink-3 text-[12px]">{D.pending}</p>
      </div>
      {helpStep ? (
        <Link href="/patient/help" className={buttonClass("danger", "l")}>
          {D.helpNow}
        </Link>
      ) : null}
      {s.step === "sweet" ? (
        <button type="button" onClick={next} className={buttonClass("primary", "l")}>
          {D.lowSugar.sweetDone}
        </button>
      ) : null}
      {s.step === "sit" ? (
        <button type="button" onClick={next} className={buttonClass("primary", "l")}>
          {D.lowSugar.sitDone}
        </button>
      ) : null}
      {s.step === "wait" ? (
        <button
          type="button"
          onClick={next}
          disabled={timerText(s.untilIso, now) !== "0:00"}
          className={buttonClass("primary", "l", timerText(s.untilIso, now) !== "0:00")}
        >
          {D.lowSugar.recheck}
        </button>
      ) : null}
      {s.step === "rest" ? (
        <button type="button" onClick={next} className={buttonClass("primary", "l")}>
          {D.highBp.restDone}
        </button>
      ) : null}
      {s.step === "recheck" || s.step === "second" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const x = Number(a.replace(",", "."));
            const y = Number(b.replace(",", "."));
            if (!Number.isFinite(x) || (s.flow === "very_high_bp" && !Number.isFinite(y))) return;
            const input =
              s.flow === "very_high_bp"
                ? ({ kind: "bp", top: x, bottom: y } as const)
                : ({ kind: "sugar", value: x, context: "random" } as const);
            setStep((st) => nextStep(st, { type: "reading", input }));
            void saveReading(input);
          }}
        >
          <div className="flex gap-3">
            {s.flow === "very_high_bp" ? (
              <>
                {field(a, setA, "Top")}
                {field(b, setB, "Bottom")}
              </>
            ) : (
              field(a, setA, "mmol/L")
            )}
          </div>
          <button type="submit" className={buttonClass("primary", "l")}>
            {D.save}
          </button>
          <p className="text-pw-ink-3 text-[12px]">{D.teamTold}</p>
        </form>
      ) : null}
      {s.step === "better" || s.step === "call_nurse" ? (
        <Link href="/patient/care" className={buttonClass("outline", "l")}>
          Done
        </Link>
      ) : null}
      {!helpStep ? (
        <div className="rounded-pw-card bg-pw-surface-2 flex flex-col gap-2 p-4">
          <p className="text-[15px] font-semibold">{D.signs.title}</p>
          <ul className="list-disc pl-5 text-[15px]">
            {D.signs.list.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setStep((x) => nextStep(x, { type: "warning_sign" }))}
            className={cn(buttonClass("danger", "m"), "self-start")}
          >
            {D.signs.have}
          </button>
        </div>
      ) : null}
    </section>
  );
}
