import { OnboardingCtaCluster } from "./_cta-cluster";

/**
 * §16 — Final CTA.
 *
 * Closing band. Same three doors as the hero and §08, but the headline
 * is the page's emotional payoff. We deliberately keep the surface darker
 * than the mid-band so the visual rhythm reads: hero (light) → mid-CTA
 * (dark) → … → final CTA (deeper dark) → footer.
 */
export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-headline"
      className="relative w-full overflow-hidden bg-teal-950 text-teal-50 dark:bg-black dark:text-teal-50"
    >
      {/* Atmosphere — wider, softer than the mid-band */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,oklch(0.50_0.10_180/0.55),transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.10] mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-300 flex-col items-center gap-10 px-5 py-24 text-center sm:gap-14 sm:px-8 sm:py-32">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-teal-200/80 uppercase">
          <span className="size-1 rounded-full bg-teal-300" />
          The page closes here. The work begins.
        </span>

        <h2
          id="final-cta-headline"
          className="font-display max-w-[24ch] text-[44px] leading-[1.02] tracking-[-0.03em] text-balance sm:text-[80px]"
          style={{ fontWeight: 400 }}
        >
          The next era of Ugandan care{" "}
          <span className="text-teal-200 italic">doesn&rsquo;t stop</span> at the gate.
        </h2>

        <p className="max-w-[44ch] text-[16px] leading-[1.5] text-balance text-teal-100/75 italic sm:text-[18px]">
          And the patients are waiting.
        </p>

        <div className="w-full max-w-3xl">
          <OnboardingCtaCluster layout="doors" tone="dark" />
        </div>

        <div className="inline-flex flex-wrap items-center justify-center gap-2 font-mono text-[10px] tracking-[0.18em] text-teal-300/60 uppercase">
          <span className="h-px w-8 bg-teal-300/30" />
          <span>Kampala &middot; Uganda</span>
          <span className="size-1 rounded-full bg-teal-300/50" />
          <span>Open beta &middot; 2026</span>
          <span className="h-px w-8 bg-teal-300/30" />
        </div>
      </div>
    </section>
  );
}
