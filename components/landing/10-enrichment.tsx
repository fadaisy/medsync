import {
  CalendarRangeIcon,
  ClipboardListIcon,
  FlaskConicalIcon,
  HeartPulseIcon,
  PillIcon,
  SmartphoneIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * §10a — [03] Enrichment / data-sources visualisation.
 *
 * Attio analogue: source-logos on the left with curved flow lines
 * converging into a central enriched person card. Our version: 6
 * care-data sources (the six clinical object types from §09a, minus
 * Patient because the patient *is* the destination) flowing into the
 * single unified record. The big patient card itself renders below in
 * §10b.
 *
 * The flows are static SVG (no animation library) so this renders on the
 * server. Motion-safe users get a slow `fade-in-slow` pulse on the flow
 * gradients; reduced-motion users see plain static lines.
 *
 * Addendum Edit 4: the patient is now a NAMED source — Amina's MedSync
 * app contributes the readings and dose confirmations that the rest of
 * the record builds around. Subtle, not a new section — just a 6th row
 * in the existing sources list, with a "patient" tag so it reads as
 * "built WITH the patient, not just about them."
 */

const SOURCES = [
  { Icon: ClipboardListIcon, label: "Discharge summary", from: "Ward · IM-A", patient: false },
  { Icon: HeartPulseIcon, label: "Vitals", from: "Wards & home monitors", patient: false },
  { Icon: PillIcon, label: "Medications", from: "Pharmacy & OPD", patient: false },
  { Icon: FlaskConicalIcon, label: "Lab results", from: "Central lab + MBN", patient: false },
  { Icon: CalendarRangeIcon, label: "Appointments", from: "Booking system", patient: false },
  {
    Icon: SmartphoneIcon,
    label: "Patient logs & confirmations",
    from: "Amina's MedSync app",
    patient: true,
  },
] as const;

export function Enrichment() {
  return (
    <section
      id="enrichment"
      aria-labelledby="enrichment-headline"
      className="border-border bg-background relative w-full border-y"
    >
      <div className="mx-auto w-full max-w-300 px-5 pt-20 pb-12 sm:px-8 sm:pt-28">
        {/* Section header */}
        <div className="mb-12 flex flex-col gap-4">
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="size-1 rounded-full bg-teal-500" />
            [03] &nbsp; From day one, the record builds itself
          </span>
          <h2
            id="enrichment-headline"
            className="font-display text-foreground max-w-[22ch] text-[34px] leading-[1.08] tracking-[-0.025em] text-balance sm:text-[52px]"
            style={{ fontWeight: 400 }}
          >
            Five sources.{" "}
            <span className="text-teal-700 italic dark:text-teal-300">One record</span> that fills
            itself in.
          </h2>
          <p className="text-muted-foreground max-w-[64ch] text-[15px] leading-[1.55] sm:text-[17px]">
            The patient walks in once. The record opens once. From then on, every reading,
            prescription, lab, discharge note, and follow-up appointment posts itself into the same
            place &mdash; not into a second binder, not into a sticky note, not into a private
            spreadsheet.
          </p>
        </div>

        {/* The viz: 5 chips → flow lines → central destination */}
        <FlowViz />
      </div>
    </section>
  );
}

function FlowViz() {
  return (
    <div className="relative grid items-center gap-6 md:grid-cols-12 md:gap-0">
      {/* Left column — 6 source chips */}
      <ul role="list" className="z-10 flex flex-col gap-2.5 md:col-span-4">
        {SOURCES.map(({ Icon, label, from, patient }) => (
          <li
            key={label}
            className={cn(
              "border-border bg-card relative flex items-center gap-3 rounded-lg border p-3",
              "ease-expo-out transition-all duration-200",
              "hover:border-teal-300 hover:shadow-md",
              patient && "border-teal-300/70 dark:border-teal-700",
            )}
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700 dark:bg-teal-50/15 dark:text-teal-200">
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-foreground inline-flex items-center gap-1.5 text-[13px] font-medium">
                {label}
                {patient ? (
                  <span className="rounded-full bg-teal-100 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.16em] text-teal-800 uppercase dark:bg-teal-50/15 dark:text-teal-200">
                    Patient
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground text-[11px]">{from}</span>
            </div>
            <span className="text-muted-foreground/40 hidden font-mono text-[10px] md:inline">
              ─→
            </span>
          </li>
        ))}
      </ul>

      {/* Middle — SVG flow lines (desktop only) */}
      <div
        aria-hidden
        className="pointer-events-none relative hidden h-[280px] md:col-span-4 md:block"
      >
        <FlowLines />
      </div>

      {/* Right column — destination card */}
      <div className="z-10 md:col-span-4">
        <DestinationCard />
      </div>
    </div>
  );
}

function FlowLines() {
  // 6 curves from left edge (varied y) into right-middle.
  // viewBox is 100x100 normalized; we use percentage stroke-widths via vector-effect.
  const paths = [
    "M 4 6   C 50 6,   55 50, 96 50",
    "M 4 24  C 50 24,  55 50, 96 50",
    "M 4 42  C 50 42,  55 50, 96 50",
    "M 4 58  C 50 58,  55 50, 96 50",
    "M 4 76  C 50 76,  55 50, 96 50",
    "M 4 94  C 50 94,  55 50, 96 50",
  ];
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-full w-full overflow-visible"
    >
      <defs>
        <linearGradient id="medsync-flow" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="oklch(0.85 0.04 180)" stopOpacity="0.5" />
          <stop offset="55%" stopColor="oklch(0.75 0.08 180)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="oklch(0.55 0.13 180)" stopOpacity="1" />
        </linearGradient>
      </defs>
      {paths.map((d, i) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="url(#medsync-flow)"
          strokeWidth={0.6}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ animationDelay: `${i * 80}ms` }}
          className="motion-safe:fade-in-slow"
        />
      ))}
      {/* Convergence dot at the destination side */}
      <circle cx={96} cy={50} r={1.5} className="fill-teal-500" />
    </svg>
  );
}

function DestinationCard() {
  return (
    <div className="border-border bg-card relative overflow-hidden rounded-xl border shadow-lg dark:shadow-2xl">
      <div className="border-border bg-muted/50 flex items-center justify-between border-b px-3 py-1.5 text-[10.5px]">
        <span className="text-muted-foreground font-mono tracking-[0.15em] uppercase">
          One record
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.15em] text-teal-800 uppercase dark:bg-teal-50/10 dark:text-teal-200">
          <span className="size-1 rounded-full bg-teal-500" />
          Illustrative
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div>
          <p className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            MS-00184 &middot; IM-Cardiology
          </p>
          <p className="font-display text-foreground text-[18px] leading-tight font-medium">
            Amina N.
          </p>
          <p className="text-muted-foreground text-[11.5px]">
            47 &middot; F &middot; admitted day 3
          </p>
        </div>
        <ul className="flex flex-col gap-1.5 text-[11.5px]">
          {[
            { k: "Discharge summary", v: "Day-5 plan drafted" },
            { k: "Vitals", v: "Glucose 14.2 mmol/L · 3 min ago" },
            { k: "Medications", v: "5 active · 1 held" },
            { k: "Lab results", v: "HbA1c 9.8 %" },
            { k: "Appointments", v: "Today 14:30 · Dr. Okello" },
          ].map((row) => (
            <li
              key={row.k}
              className="border-border flex items-baseline justify-between gap-2 border-b pb-1 last:border-b-0 last:pb-0"
            >
              <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.15em] uppercase">
                {row.k}
              </span>
              <span className="text-foreground tabular text-right">{row.v}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-muted-foreground border-border bg-muted/30 border-t px-4 py-2 text-[11px] italic">
        Full record &darr; below.
      </p>
    </div>
  );
}
