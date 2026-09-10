import { ArrowDownIcon, CheckIcon, PlusIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { OnboardingCtaCluster } from "./_cta-cluster";
import { StaggerOnScroll } from "./_reveal-on-scroll";

/**
 * §16 — Final CTA.
 *
 * Closing band. Same three doors as the hero and §08, but the headline
 * is the page's emotional payoff. We deliberately keep the surface darker
 * than the mid-band so the visual rhythm reads: hero (light) → mid-CTA
 * (dark) → … → final CTA (deeper dark) → footer.
 *
 * Addendum Edit 6: a small "patient view, day one" preview sits between
 * the closer line and the doors, with an arrow pointing at the patient
 * door. Gives the patient route a concrete visual destination at the
 * moment of conversion without breaking the equal-doors cluster
 * symmetry (the preview is a sibling, not part of the cluster).
 */
export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-headline"
      className="medsync-forced-dark bg-gradient-hero text-brand-50 relative w-full overflow-hidden"
    >
      {/* Atmosphere — deeper than the mid-band. Base linear sweep
          (top→bottom) under a wide centered radial glow + a soft
          bottom-edge fade so the section eases into the footer. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:linear-gradient(180deg,oklch(0.22_0.06_286),oklch(0.12_0.04_286)_60%,oklch(0.08_0.03_286))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,oklch(0.55_0.12_286/0.55),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.10] mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <StaggerOnScroll className="relative mx-auto flex w-full max-w-300 flex-col items-center gap-10 px-5 py-24 text-center sm:gap-14 sm:px-8 sm:py-32">
        <span className="text-brand-200/80 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="pulse-dot bg-brand-300 size-1 rounded-full" />
          The page closes here. The work begins.
        </span>

        <h2
          id="final-cta-headline"
          className="font-display text-display-m max-w-[24ch] leading-[1.02] tracking-[-0.03em] text-balance sm:text-[80px]"
          style={{ fontWeight: 400 }}
        >
          The next era of Ugandan care{" "}
          <span className="text-brand-200 italic">doesn&rsquo;t stop</span> at the gate.
        </h2>

        <p className="text-brand-100/75 sm:text-heading-s max-w-[44ch] text-[16px] leading-[1.5] text-balance italic">
          And the patients are waiting.
        </p>

        <PatientGlimpse />

        <div className="w-full max-w-3xl">
          <OnboardingCtaCluster layout="doors" tone="dark" />
        </div>

        <div className="text-brand-300/60 inline-flex flex-wrap items-center justify-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="bg-brand-300/30 h-px w-8" />
          <span>Kampala &middot; Uganda</span>
          <span className="bg-brand-300/50 size-1 rounded-full" />
          <span>Open beta &middot; 2026</span>
          <span className="bg-brand-300/30 h-px w-8" />
        </div>
      </StaggerOnScroll>
    </section>
  );
}

/* ─── Patient glimpse (addendum Edit 6) ─────────────────────────────────
   Small "this is what a patient sees on day one" preview rendered just
   above the door cluster. The dark-on-dark frame uses bg-white/[0.04]
   so it reads as a panel without fighting the §16 atmosphere; teal
   numerals echo the rest of the page's clinical-data styling. */

function PatientGlimpse() {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-brand-200/80 inline-flex items-center gap-2 font-mono text-[9.5px] tracking-[0.18em] uppercase">
        <span className="bg-brand-300/40 h-px w-6" />
        Patient view, day one
        <span className="bg-brand-300/40 h-px w-6" />
      </span>

      <div
        className={cn(
          "float-slow border-brand-300/15 flex w-full max-w-sm flex-col gap-2 rounded-xl border bg-white/[0.04] p-3 text-left backdrop-blur",
        )}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-brand-200/70 font-mono text-[9.5px] tracking-[0.16em] uppercase">
            Fasting glucose
          </span>
          <span className="tabular text-brand-200/70 font-mono text-[9.5px]">mmol/L</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="font-display tabular text-heading-m leading-none font-medium text-white">
            11.6
          </p>
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px]",
              "bg-brand-300/15 text-brand-100",
            )}
          >
            <CheckIcon className="size-2.5" strokeWidth={2.5} />
            Logged from home
          </div>
        </div>
        <div className="border-brand-300/15 border-t" aria-hidden />
        <div
          className={cn(
            "text-caption inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium",
            "bg-brand-100 text-brand-900",
          )}
        >
          <PlusIcon className="size-3" strokeWidth={2} />
          Log this morning&rsquo;s reading
        </div>
      </div>

      <span className="text-brand-200/70 inline-flex items-center gap-1 text-[10.5px] italic">
        Sign up below as a patient and this is in your hand
        <ArrowDownIcon className="size-3" strokeWidth={1.75} />
      </span>
    </div>
  );
}
