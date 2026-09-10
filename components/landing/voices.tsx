import { CheckCircle2Icon, MessageCircleIcon, PhoneIcon, SignalLowIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { RevealOnScroll } from "./_reveal-on-scroll";

/**
 * §09b — Voices sub-block.
 *
 * Spec rule #2: no fabricated testimonials. We substitute three
 * founders'-voice problem statements (the same three lines that show up
 * in the §03 floating quote), each paired with a small surface that
 * shows the matching MedSync answer.
 *
 * Server component — no interaction, every surface is static markup.
 */

interface Voice {
  short: string;
  body: string;
  pillar: string;
  Surface: () => React.ReactElement;
}

const VOICES: Voice[] = [
  {
    short: "A notebook in a clinical pocket can't call for help.",
    body: "Paper handovers are silent. A reading written down in a notebook never wakes anyone up at 2 a.m. We built MedSync so a worrying number — wherever it lands — has somewhere to go.",
    pillar: "Home monitoring & escalation",
    Surface: HomeMonitoringSurface,
  },
  {
    short: "Two good days at home shouldn't end a five-day course.",
    body: "Patients stop antibiotics, insulin, anti-TB drugs the moment they feel better. The hospital never finds out. MedSync routes adherence through SMS and USSD so the team sees the truth, not the wish.",
    pillar: "Adherence loop",
    Surface: AdherenceSurface,
  },
  {
    short: "Specialists shouldn't be playing telephone.",
    body: "Cardiology sends a fax. Diabetology calls. The chart catches up a week later. We built a shared record so the second specialist starts where the first one stopped — not at the patient's recollection.",
    pillar: "Care-team coordination",
    Surface: CoordinationSurface,
  },
];

export function Voices() {
  return (
    <section
      aria-labelledby="voices-headline"
      className="border-border bg-background relative w-full border-y"
    >
      <div className="mx-auto w-full max-w-300 px-5 py-20 sm:px-8 sm:py-28">
        <RevealOnScroll className="mb-10 flex flex-col gap-4">
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="pulse-dot bg-brand-500 size-1 rounded-full" />
            What we kept hearing
          </span>
          <h2
            id="voices-headline"
            className="font-display text-foreground sm:text-display-m text-[30px] leading-[1.1] tracking-[-0.025em] text-balance"
            style={{ fontWeight: 400 }}
          >
            Three problems we couldn&rsquo;t put down.
          </h2>
          <p className="text-muted-foreground text-body-m sm:text-body-l max-w-[64ch] leading-[1.55]">
            Said often enough, in wards, OPD clinics, and discharge lounges across Mulago and
            Wakiso, that MedSync exists in their answer. No testimonials — only the lines we wrote
            on the way home.
          </p>
        </RevealOnScroll>

        <ol className="flex flex-col gap-4">
          {VOICES.map((v) => (
            <li key={v.short}>
              <RevealOnScroll>
                <div className="border-border bg-card card-lift grid gap-0 overflow-hidden rounded-xl border md:grid-cols-12">
                  {/* Left: the voice */}
                  <div className="flex flex-col gap-4 p-6 sm:p-8 md:col-span-7">
                    <span
                      className={cn(
                        "inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1",
                        "border-border bg-muted/40 text-muted-foreground border font-mono text-[10px] tracking-[0.16em] uppercase",
                      )}
                    >
                      <span className="bg-brand-500 size-1 rounded-full" />
                      {v.pillar}
                    </span>
                    <blockquote
                      className="font-display text-foreground text-heading-m sm:text-heading-l leading-[1.18] tracking-[-0.02em] text-balance italic"
                      style={{ fontWeight: 400 }}
                    >
                      <span
                        aria-hidden
                        className="text-brand-500/60 dark:text-brand-400/60 select-none"
                      >
                        &ldquo;
                      </span>
                      {v.short}
                      <span
                        aria-hidden
                        className="text-brand-500/60 dark:text-brand-400/60 select-none"
                      >
                        &rdquo;
                      </span>
                    </blockquote>
                    <p className="text-muted-foreground max-w-[60ch] text-[14.5px] leading-[1.55]">
                      {v.body}
                    </p>
                    <p className="text-muted-foreground/80 mt-1 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] uppercase">
                      <span className="bg-border h-px w-4" />
                      MedSync founding team
                    </p>
                  </div>

                  {/* Right: the answer surface */}
                  <div className="border-border bg-muted/30 border-t p-5 md:col-span-5 md:border-t-0 md:border-l md:p-6">
                    <span className="text-muted-foreground mb-3 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
                      What it looks like
                      <span className="pulse-dot bg-brand-500 size-1 rounded-full" />
                    </span>
                    <v.Surface />
                  </div>
                </div>
              </RevealOnScroll>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─── Mini surfaces ─────────────────────────────────────────────────── */

function HomeMonitoringSurface() {
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <SignalLowIcon className="size-3" strokeWidth={1.75} />
          Home reading received
        </span>
        <span className="text-muted-foreground tabular font-mono text-[10px]">22:14</span>
      </div>
      <div className="bg-status-critical-bg/70 dark:bg-status-critical-bg/40 flex items-start gap-2 rounded-md p-2.5">
        <span className="bg-status-critical-fg/20 text-status-critical-fg mt-0.5 inline-flex size-4 items-center justify-center rounded-full">
          <span className="bg-status-critical-fg block size-1 rounded-full" />
        </span>
        <div className="flex flex-1 flex-col text-[11.5px]">
          <span className="text-status-critical-fg font-medium">
            Glucose <span className="tabular font-mono">14.2 mmol/L</span> &middot; Amina N.
          </span>
          <span className="text-status-critical-fg/80 text-[10.5px]">
            Above target. Routed to on-call diabetology.
          </span>
        </div>
      </div>
      <div className="border-border text-muted-foreground flex items-center justify-between border-t pt-2 text-[10.5px]">
        <span>Acknowledged by Dr. Usama Fadhul · 22:15</span>
        <span className="bg-status-stable-bg text-status-stable-fg inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono tracking-[0.15em] uppercase">
          <CheckCircle2Icon className="size-2.5" strokeWidth={2} />
          Closed
        </span>
      </div>
    </div>
  );
}

function AdherenceSurface() {
  const days: Array<{ d: string; took: boolean }> = [
    { d: "Mon", took: true },
    { d: "Tue", took: true },
    { d: "Wed", took: true },
    { d: "Thu", took: false },
    { d: "Fri", took: false },
    { d: "Sat", took: true },
    { d: "Sun", took: true },
  ];
  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <MessageCircleIcon className="size-3" strokeWidth={1.75} />
          SMS adherence log &middot; week 1
        </span>
        <span className="text-status-caution-fg tabular font-mono text-[10px]">71 %</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => (
          <div key={day.d} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "tabular flex size-7 items-center justify-center rounded-md font-mono text-[10px]",
                day.took
                  ? "bg-status-stable-bg text-status-stable-fg"
                  : "bg-status-critical-bg text-status-critical-fg",
              )}
            >
              {day.took ? "✓" : "—"}
            </span>
            <span className="text-muted-foreground font-mono text-[9.5px] tracking-wide uppercase">
              {day.d}
            </span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-[10.5px] italic">
        Two skipped doses Thu–Fri. Nurse called Sat morning. Course completed.
      </p>
    </div>
  );
}

function CoordinationSurface() {
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-md border p-3">
      <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
        <PhoneIcon className="size-3" strokeWidth={1.75} />
        Shared record &middot; one stream
      </span>
      <ol className="flex flex-col gap-1.5">
        {[
          {
            who: "Diabetology",
            note: "Up-titrated metformin, recheck HbA1c in 12w.",
            ts: "Mon 09:14",
            tone: "teal" as const,
          },
          {
            who: "Cardiology",
            note: "Echo confirms LVEF 32%. Add bisoprolol 2.5mg → 5mg.",
            ts: "Tue 11:30",
            tone: "violet" as const,
          },
          {
            who: "Pharmacy",
            note: "Glibenclamide hold flagged — metformin + bisoprolol dispensed.",
            ts: "Tue 12:42",
            tone: "neutral" as const,
          },
          {
            who: "Nursing",
            note: "Patient educated on BP log. Cuff supplied.",
            ts: "Tue 13:05",
            tone: "neutral" as const,
          },
        ].map((entry) => (
          <li key={entry.ts} className="flex items-start gap-2 text-[11.5px]">
            <span
              className={cn(
                "mt-1 size-1.5 shrink-0 rounded-full",
                entry.tone === "teal" && "bg-brand-500",
                entry.tone === "violet" && "bg-status-discharged-fg",
                entry.tone === "neutral" && "bg-muted-foreground/60",
              )}
            />
            <div className="flex flex-1 flex-col">
              <span className="text-foreground leading-snug">
                <span className="font-medium">{entry.who}.</span> {entry.note}
              </span>
              <span className="text-muted-foreground tabular font-mono text-[9.5px]">
                {entry.ts}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
