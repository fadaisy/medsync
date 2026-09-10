import { CompassIcon, FlaskConicalIcon, NetworkIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { RevealOnScroll, StaggerOnScroll } from "./_reveal-on-scroll";

/**
 * §14 — Vision / horizon.
 *
 * Per spec: restrained. No invented launch dates. No "Q4 2026" promises.
 * No artificial-pancreas talk dressed up as a roadmap. Three horizons:
 * "Now" (what's actually built), "Soon" (what we're actively building),
 * and "Later" (clinical R&D explicitly labelled as research).
 *
 * Each horizon names what *we* will deliver, not what the market will
 * give us. Adoption claims (number of hospitals, number of patients) are
 * absent on purpose — they'll be added only when measured.
 */

interface Horizon {
  Icon: typeof CompassIcon;
  when: string;
  label: string;
  body: string;
  items: string[];
  badge?: string;
}

const HORIZONS: Horizon[] = [
  {
    Icon: CompassIcon,
    when: "Now",
    label: "Foundations · what ships first.",
    body: "The closed-loop record itself, the four Internal Medicine specialties, the SMS adherence loop, the hospital pilot programme.",
    items: [
      "Unified record · single audit log",
      "Diabetology · Cardiology · Nephrology · Pulmonology",
      "SMS · USSD adherence + reminders",
      "First hospital pilot · Mulago",
    ],
  },
  {
    Icon: NetworkIcon,
    when: "Soon",
    label: "Reach · the next year.",
    body: "Regional referral hospitals, more specialties, the Mobile-Money rails for self-pay collection, the home-monitoring SDK for low-cost devices.",
    items: [
      "Regional referral hospital onboarding",
      "Paediatrics · OB-GYN · Mental health",
      "MoMo + Airtel Money collection",
      "Home BP cuff & glucometer SDKs",
    ],
  },
  {
    Icon: FlaskConicalIcon,
    when: "Later",
    label: "Clinical research horizons.",
    body: "Closed-loop dosing algorithms (insulin first), AI-assisted triage in OPD, predictive admission models. Treated as research, not roadmap. Every clinical algorithm goes through ethics review and clinical validation before any patient sees it.",
    items: [
      "Closed-loop insulin dosing · research",
      "OPD triage decision-support · research",
      "Predictive admission models · research",
    ],
    badge: "Research only · subject to ethics + regulatory review",
  },
];

export function Vision() {
  return (
    <section
      id="vision"
      aria-labelledby="vision-headline"
      className="border-border bg-muted/30 relative w-full border-y"
    >
      <div className="mx-auto w-full max-w-300 px-5 py-20 sm:px-8 sm:py-28">
        <RevealOnScroll className="mb-10 flex flex-col gap-4">
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="pulse-dot bg-brand-500 size-1 rounded-full" />
            Where we&rsquo;re heading
          </span>
          <h2
            id="vision-headline"
            className="font-display text-foreground sm:text-display-m max-w-[24ch] text-[30px] leading-[1.1] tracking-[-0.025em] text-balance"
            style={{ fontWeight: 400 }}
          >
            Three horizons.{" "}
            <span className="text-brand-700 dark:text-brand-300 italic">
              No dates we can&rsquo;t keep
            </span>
            .
          </h2>
          <p className="text-muted-foreground text-body-m sm:text-body-l max-w-[68ch] leading-[1.55]">
            A roadmap is the easiest section on a healthcare landing page to over-promise. We named
            what is built today, what we&rsquo;re actively building, and what is genuinely research
            &mdash; not a product line.
          </p>
        </RevealOnScroll>

        <StaggerOnScroll as="ol" className="grid gap-3 md:grid-cols-3">
          {HORIZONS.map((h, i) => (
            <li key={h.when}>
              <HorizonCard horizon={h} index={i} />
            </li>
          ))}
        </StaggerOnScroll>
      </div>
    </section>
  );
}

function HorizonCard({ horizon, index }: { horizon: Horizon; index: number }) {
  return (
    <article
      className={cn(
        "border-border bg-card card-lift flex h-full flex-col gap-4 rounded-xl border p-5 sm:p-6",
        // The "Later" card gets a different tone — caution-bg accent so it reads as
        // visibly distinct from the committed work in Now/Soon.
        index === 2 ? "border-status-caution-bg/60" : "",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-md",
              index === 2
                ? "bg-status-caution-bg text-status-caution-fg"
                : "bg-brand-50 text-brand-700 dark:bg-brand-50/15 dark:text-brand-200",
            )}
          >
            <horizon.Icon className="size-4" strokeWidth={1.75} />
          </span>
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            {horizon.when}
          </span>
        </span>
        <span className="text-muted-foreground tabular font-mono text-[10px]">0{index + 1}</span>
      </div>

      <h3
        className="font-display text-foreground sm:text-heading-m text-[19px] leading-[1.2] tracking-[-0.018em] text-balance"
        style={{ fontWeight: 400 }}
      >
        {horizon.label}
      </h3>
      <p className="text-muted-foreground text-[13.5px] leading-[1.55]">{horizon.body}</p>

      <ul className="flex flex-col gap-1.5">
        {horizon.items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-[12.5px]">
            <span
              className={cn(
                "mt-1.5 size-1 shrink-0 rounded-full",
                index === 2 ? "bg-status-caution-fg/70" : "bg-brand-500",
              )}
            />
            <span className="text-foreground/85">{item}</span>
          </li>
        ))}
      </ul>

      {horizon.badge ? (
        <p className="border-status-caution-bg bg-status-caution-bg/40 text-status-caution-fg text-caption mt-auto rounded-md border px-3 py-2 italic">
          {horizon.badge}
        </p>
      ) : null}
    </article>
  );
}
