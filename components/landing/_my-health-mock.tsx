import {
  CheckIcon,
  ClockIcon,
  LockIcon,
  MessageSquareIcon,
  PauseIcon,
  PlusIcon,
  ShieldIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * MedSync — My Health (patient surfaces, floating-card composition).
 *
 * Patient-end twin of the §05b ClinicianHomeMock. Same fictional patient
 * (Amina N.), same date/time, same medications and glucose values — so
 * the two surfaces visibly describe ONE shared loop.
 *
 * Renders as a vertical stack of floating cards (matching the page's
 * Attio "feature card" rhythm). Earlier iteration framed the cards
 * inside a phone bezel — dropped because the bezel competed visually
 * with the clinician dashboard and made the patient surfaces feel
 * grafted on rather than belonging.
 *
 * Static composition. No interactivity, no client JS, single
 * motion-safe pulse on the "due now" med icon (Lighthouse-perf-safe).
 *
 * Tone rules (addendum §C): encouraging never shaming, calm never
 * alarming, no diagnosis, no overpromised privacy. Adherence text is
 * "X days on track" — not "X% compliant"; the held medication is
 * shown as a care-team decision, not a patient failure.
 */

export type MyHealthFragment =
  | "full"
  | "log-reading"
  | "today-meds"
  | "report-concern"
  | "sms-offline";

interface MyHealthMockProps {
  /** Default `full` shows every card. Fragment variants render only one
   * card for embedding in narrower contexts (e.g. inline in §07 scenes
   * or the new patient chapter sub-points). */
  fragment?: MyHealthFragment;
  /** When true (default `full` only), shows the "Patient view · Amina N."
   * header label above the cards. Set false to drop the header when the
   * embedding context already labels the surface. */
  withHeader?: boolean;
  className?: string;
}

export function MyHealthMock({ fragment = "full", withHeader, className }: MyHealthMockProps) {
  const showHeader = withHeader ?? fragment === "full";
  return (
    <div className={cn("mx-auto flex w-full max-w-[320px] flex-col gap-3", className)}>
      {showHeader ? <PatientHeader /> : null}
      {fragment === "full" || fragment === "log-reading" ? <LogReadingCard /> : null}
      {fragment === "full" || fragment === "today-meds" ? <TodayMedsCard /> : null}
      {fragment === "full" ? <AdherenceStrip /> : null}
      {fragment === "full" || fragment === "sms-offline" ? <SmsReminderChip /> : null}
      {fragment === "full" || fragment === "report-concern" ? <ReportConcernCard /> : null}
      {fragment === "full" || fragment === "report-concern" ? <ReassuranceLine /> : null}
    </div>
  );
}

/* ─── Patient view header (replaces the old phone-bezel + status bar) ── */

function PatientHeader() {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col">
        <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.18em] uppercase">
          Patient view &middot; Amina N.
        </span>
        <span className="font-display text-foreground text-[14px] leading-tight font-medium">
          Good morning, Amina.
        </span>
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
          "border border-teal-300 bg-teal-50 font-mono text-[8.5px] tracking-[0.15em] text-teal-800 uppercase",
          "dark:border-teal-700 dark:bg-teal-50/10 dark:text-teal-200",
        )}
      >
        <span className="size-1 rounded-full bg-teal-500" />
        Illustrative
      </span>
    </div>
  );
}

/* ─── Log a reading ───────────────────────────────────────────────────── */

function LogReadingCard() {
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
          Fasting glucose
        </span>
        <span className="text-muted-foreground tabular font-mono text-[9.5px]">mmol/L</span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="font-display text-foreground tabular text-[26px] leading-none font-medium">
            11.6
          </p>
          <p className="text-muted-foreground mt-0.5 text-[10px]">Yesterday &middot; 06:08</p>
        </div>
        <ReadingSparkline />
      </div>

      <div className="border-border my-1 border-t" aria-hidden />

      <button
        type="button"
        tabIndex={-1}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-[12px] font-medium",
          "bg-teal-600 text-white",
          "dark:bg-teal-500 dark:text-teal-950",
        )}
      >
        <PlusIcon className="size-3.5" strokeWidth={2} />
        Log this morning&rsquo;s reading
      </button>
    </div>
  );
}

function ReadingSparkline() {
  const values = [6.1, 7.4, 8.0, 9.3, 11.6];
  const min = 4;
  const max = 14;
  const width = 80;
  const height = 28;
  const step = width / (values.length - 1);
  const pts = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / (max - min)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height + 2}`}
      className="text-foreground/70 h-7 w-20"
      role="img"
      aria-label="Glucose trend, last 5 readings, climbing."
    >
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width}
        cy={height - ((11.6 - min) / (max - min)) * height}
        r={2.5}
        className="fill-teal-500"
      />
    </svg>
  );
}

/* ─── Today's medications ──────────────────────────────────────────────── */

function TodayMedsCard() {
  const meds = [
    { name: "Metformin", dose: "1 g", at: "06:00", state: "taken" as const, takenAt: "06:12" },
    { name: "Lisinopril", dose: "10 mg", at: "06:00", state: "taken" as const, takenAt: "06:14" },
    { name: "Glibenclamide", dose: "5 mg", at: "06:00", state: "held" as const },
    { name: "Insulin Actrapid", dose: "pre-meal", at: "11:00", state: "due" as const },
  ];
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
          Today&rsquo;s medications
        </span>
        <span className="text-muted-foreground tabular font-mono text-[9.5px]">2 / 4</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {meds.map((med) => (
          <li
            key={med.name}
            className={cn(
              "border-border bg-muted/30 flex items-start gap-2 rounded-md border p-2",
              med.state === "due" &&
                "border-teal-300 bg-teal-50/40 dark:border-teal-700 dark:bg-teal-50/[0.04]",
              med.state === "held" && "border-status-caution-bg",
            )}
          >
            <MedStateIcon state={med.state} />
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-foreground text-[11.5px] leading-tight font-medium">
                  {med.name}
                </span>
                <span className="text-muted-foreground tabular font-mono text-[9.5px]">
                  {med.at}
                </span>
              </div>
              <span className="text-muted-foreground text-[10px] leading-tight">
                {med.dose}
                {med.state === "taken" ? (
                  <span> &middot; taken at {med.takenAt}</span>
                ) : med.state === "held" ? (
                  <span className="text-status-caution-fg"> &middot; held by your care team</span>
                ) : (
                  <span className="text-teal-700 dark:text-teal-300"> &middot; due now</span>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground/80 text-[10px] italic">Tap a card to confirm a dose.</p>
    </div>
  );
}

function MedStateIcon({ state }: { state: "taken" | "due" | "held" }) {
  const cls = "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full";
  if (state === "taken") {
    return (
      <span className={cn(cls, "bg-status-stable-bg text-status-stable-fg")} aria-label="Taken">
        <CheckIcon className="size-2.5" strokeWidth={2.5} />
      </span>
    );
  }
  if (state === "due") {
    return (
      <span
        className={cn(cls, "bg-teal-100 text-teal-800 dark:bg-teal-50/15 dark:text-teal-200")}
        aria-label="Due now"
      >
        <ClockIcon
          className="size-2.5 motion-safe:animate-pulse motion-reduce:animate-none"
          strokeWidth={2}
        />
      </span>
    );
  }
  return (
    <span
      className={cn(cls, "bg-status-caution-bg text-status-caution-fg")}
      aria-label="Held by care team"
    >
      <PauseIcon className="size-2.5" strokeWidth={2.5} />
    </span>
  );
}

/* ─── Adherence streak ────────────────────────────────────────────────── */

function AdherenceStrip() {
  const days: Array<{ label: string; state: "done" | "today" | "future" }> = [
    { label: "T", state: "done" },
    { label: "F", state: "done" },
    { label: "S", state: "done" },
    { label: "S", state: "done" },
    { label: "M", state: "done" },
    { label: "T", state: "today" },
    { label: "W", state: "future" },
  ];
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-foreground text-[12px] font-medium">5 days on track</span>
        <span className="text-muted-foreground text-[10.5px]">Keep going.</span>
      </div>
      <div className="flex items-center justify-between">
        {days.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span
              aria-hidden
              className={cn(
                "inline-flex size-3.5 items-center justify-center rounded-full text-[8px]",
                d.state === "done" && "bg-teal-500 text-white",
                d.state === "today" && "bg-background text-foreground ring-2 ring-teal-500",
                d.state === "future" && "bg-muted text-muted-foreground",
              )}
            >
              {d.state === "done" ? "✓" : null}
            </span>
            <span className="text-muted-foreground font-mono text-[8.5px] tracking-wide">
              {d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── SMS reminder chip ───────────────────────────────────────────────── */

function SmsReminderChip() {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-2.5",
        "border-border bg-card border shadow-sm",
      )}
    >
      <span className="inline-flex size-7 items-center justify-center rounded-full bg-teal-50 text-teal-700 dark:bg-teal-50/15 dark:text-teal-200">
        <MessageSquareIcon className="size-3.5" strokeWidth={1.75} />
      </span>
      <div className="flex flex-1 flex-col">
        <span className="text-foreground text-[11.5px] leading-tight">
          We&rsquo;ll text you at <span className="tabular font-mono">11:00</span> too.
        </span>
        <span className="text-muted-foreground text-[10px] leading-tight">
          Reply <span className="font-mono">1</span> to confirm &middot; works on basic phones.
        </span>
      </div>
    </div>
  );
}

/* ─── Report a concern ────────────────────────────────────────────────── */

function ReportConcernCard() {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={cn(
        "border-border bg-card flex w-full items-start gap-2.5 rounded-xl border p-3 text-left shadow-sm",
        "transition-colors duration-150 hover:border-teal-300",
      )}
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700 dark:bg-teal-50/15 dark:text-teal-200">
        <ShieldIcon className="size-3.5" strokeWidth={1.75} />
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-foreground text-[12.5px] leading-tight font-medium">
          Something feels off?
        </span>
        <span className="text-muted-foreground text-[10.5px] leading-tight">
          Tell your care team &mdash; they&rsquo;ll review and reply.
        </span>
      </div>
    </button>
  );
}

/* ─── Reassurance line (privacy + named clinician) ────────────────────── */

function ReassuranceLine() {
  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-1">
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-[10px]">
        <LockIcon className="size-2.5" strokeWidth={1.75} />
        Your care team can see this.
      </span>
      <span className="text-muted-foreground tabular font-mono text-[9.5px]">Dr. M. Okello</span>
    </div>
  );
}
