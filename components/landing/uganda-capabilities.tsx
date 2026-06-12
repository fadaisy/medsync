import {
  CheckIcon,
  CloudOffIcon,
  GaugeIcon,
  MapPinIcon,
  MessageSquareIcon,
  SmartphoneIcon,
  WifiOffIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { MyHealthSmsReminderChip } from "./_my-health-mock";
import { RevealOnScroll, StaggerOnScroll } from "./_reveal-on-scroll";

/**
 * §12a — [04] Built for the realities of Ugandan care.
 *
 * Attio analogue: their stats band ("1M API calls/wk, sub-50ms..."). Per
 * spec we don't invent metrics. Instead this section is *design
 * commitments* — concrete capabilities baked into the product because the
 * Uganda care context demands them.
 *
 * 5 capability cards. Each one names the real-world constraint it solves
 * and the technical commitment we make in response. No fake uptime
 * numbers, no fabricated traffic stats.
 */

interface Capability {
  Icon: typeof CloudOffIcon;
  pillar: string;
  headline: string;
  body: string;
  detail: string;
  /** Optional patient-side surface — grounds the capability in a concrete
   * patient experience (addendum Edit 5). Currently used by the offline
   * + SMS tiles so the Uganda-fit claims aren't just a spec list. */
  patientSurface?: React.ReactNode;
}

const CAPABILITIES: Capability[] = [
  {
    Icon: CloudOffIcon,
    pillar: "Offline-first wards",
    headline: "Works when the network doesn't.",
    body: "Ward power flickers, fibre breaks. The clinician keeps prescribing, keeps charting, keeps reading the record. MedSync writes locally first, syncs on reconnect.",
    detail: "Local-first cache · conflict-free sync · last-write-wins per object",
    patientSurface: <OfflineSavedReadingCard />,
  },
  {
    Icon: MessageSquareIcon,
    pillar: "SMS · USSD reach",
    headline: "Reaches the phone the patient actually has.",
    body: "Most patients don't have a smartphone. Adherence pings, glucose-reading requests, and appointment reminders travel as plain SMS or *256# USSD menus on basic handsets.",
    detail: "MTN · Airtel · Africa's Talking aggregator",
    patientSurface: <MyHealthSmsReminderChip />,
  },
  {
    Icon: SmartphoneIcon,
    pillar: "Low-bandwidth UI",
    headline: "Built for 3G as the default — not the fallback.",
    body: "First paint under 1.5 s on throttled 3G. Server-rendered. Lazy-loaded only where it must be. Mock surfaces ship as inline SVG, not 4K screenshots.",
    detail: "Next.js App Router · streaming SSR · no client-only sections on the critical path",
  },
  {
    Icon: GaugeIcon,
    pillar: "Mobile-Money payments",
    headline: "Pay for care with the wallet on the phone.",
    body: "Self-pay patients top up MoMo, MedSync collects, pharmacy dispenses. The same flow handles insurance claims when the patient is covered.",
    detail: "MTN MoMo · Airtel Money · NHIS-ready",
  },
  {
    Icon: MapPinIcon,
    pillar: "Local data residency",
    headline: "Patient data stays inside Uganda.",
    body: "MedSync runs against Uganda-resident Supabase / Postgres infrastructure. Cross-border replication only with explicit hospital authorisation, per the Data Protection Act.",
    detail: "Region-pinned database · Uganda DPA 2019 · encryption in transit & at rest",
  },
];

export function UgandaCapabilities() {
  return (
    <section
      id="uganda"
      aria-labelledby="uganda-headline"
      className="border-border bg-background relative w-full border-y"
    >
      <div className="mx-auto w-full max-w-300 px-5 py-20 sm:px-8 sm:py-28">
        {/* Section header */}
        <RevealOnScroll className="mb-10 flex flex-col gap-4">
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="pulse-dot size-1 rounded-full bg-teal-500" />
            <span className="tabular text-teal-700/80 dark:text-teal-300/80">04</span>
            <span aria-hidden className="bg-border h-px w-4" />
            Built for the realities of Ugandan care
          </span>
          <h2
            id="uganda-headline"
            className="font-display text-foreground max-w-[24ch] text-[30px] leading-[1.1] tracking-[-0.025em] text-balance sm:text-[44px]"
            style={{ fontWeight: 400 }}
          >
            Designed for the wards{" "}
            <span className="text-teal-700 italic dark:text-teal-300">we actually work in</span>{" "}
            &mdash; not a perfect demo room.
          </h2>
          <p className="text-muted-foreground max-w-[68ch] text-[15px] leading-[1.55] sm:text-[17px]">
            We won&rsquo;t quote uptime numbers we haven&rsquo;t measured. What we will show is what
            we&rsquo;ve committed to engineer against: load-shedding, 3G, basic phones,
            mobile-money, cross-region replication rules.
          </p>
        </RevealOnScroll>

        <StaggerOnScroll as="ul" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((cap, i) => (
            <li
              key={cap.pillar}
              className={cn(
                // Make the first card span 2 columns on lg for visual rhythm.
                i === 0 ? "lg:col-span-2" : "",
              )}
            >
              <CapabilityCard cap={cap} large={i === 0} />
            </li>
          ))}
        </StaggerOnScroll>
      </div>
    </section>
  );
}

function CapabilityCard({ cap, large }: { cap: Capability; large: boolean }) {
  return (
    <div
      className={cn(
        "border-border bg-card card-lift relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border p-5 sm:p-6",
        large ? "lg:grid lg:grid-cols-5 lg:items-start lg:gap-6" : "",
      )}
    >
      {/* Faint atmosphere on the large card only */}
      {large ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_top_right,oklch(0.94_0.05_180/0.5),transparent_50%)] dark:[background:radial-gradient(ellipse_at_top_right,oklch(0.45_0.08_180/0.18),transparent_55%)]"
        />
      ) : null}

      <div className={cn("relative flex flex-col gap-3", large ? "lg:col-span-3" : "")}>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-md bg-teal-50 text-teal-700 dark:bg-teal-50/15 dark:text-teal-200">
            <cap.Icon className="size-4" strokeWidth={1.75} />
          </span>
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
            {cap.pillar}
          </span>
        </span>
        <h3
          className={cn(
            "font-display text-foreground leading-[1.18] tracking-[-0.018em] text-balance",
            large ? "text-[24px] sm:text-[28px]" : "text-[19px] sm:text-[21px]",
          )}
          style={{ fontWeight: 400 }}
        >
          {cap.headline}
        </h3>
        <p className="text-muted-foreground max-w-[52ch] text-[13.5px] leading-[1.55] sm:text-[14.5px]">
          {cap.body}
        </p>
      </div>

      {/* Right column on the large card / below on the rest: technical
          strip stacked with the optional patient-side surface. */}
      <div
        className={cn(
          "border-border relative flex flex-col gap-3 border-t pt-3",
          large ? "lg:col-span-2 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6" : "",
        )}
      >
        {cap.patientSurface ? (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[9.5px] tracking-[0.18em] uppercase">
              <span className="bg-border h-px w-5" />
              On Amina&rsquo;s phone
            </span>
            {cap.patientSurface}
          </div>
        ) : null}
        <div
          className={cn(
            "flex items-center gap-2 text-[11px]",
            cap.patientSurface ? "border-border border-t pt-2" : "",
          )}
        >
          <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.18em] uppercase">
            Technical
          </span>
          <span className="text-foreground/85 tabular flex-1 font-mono text-[10.5px] leading-snug">
            {cap.detail}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Offline saved reading card (addendum Edit 5) ──────────────────────
   Small concrete illustration of the "saved offline · will sync" state
   that the patient sees when they log a reading without connectivity.
   Lives here (not in the mock) because it's specific to the offline
   capability tile in §12a. */

function OfflineSavedReadingCard() {
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-2.5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
          Fasting glucose
        </span>
        <span className="text-muted-foreground inline-flex items-center gap-1 text-[9.5px]">
          <WifiOffIcon className="size-2.5" strokeWidth={1.75} />
          Offline
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-foreground tabular text-[18px] leading-none font-medium">
          11.6
        </span>
        <span className="text-muted-foreground tabular font-mono text-[9.5px]">mmol/L</span>
      </div>
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1",
          "bg-status-stable-bg text-status-stable-fg text-[10px]",
        )}
      >
        <CheckIcon className="size-2.5" strokeWidth={2.5} />
        Saved &middot; will sync when you&rsquo;re back online
      </div>
    </div>
  );
}
