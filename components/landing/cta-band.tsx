import { OnboardingCtaCluster } from "./_cta-cluster";
import { StaggerOnScroll } from "./_reveal-on-scroll";

/**
 * §08 — Mid-page CTA band.
 *
 * Dark teal surface, three equal doors, no free-trial language. Same three
 * routes as the hero. Sits between [01] platform showcase and [02] adaptive
 * model — the page's first conversion break.
 */
export function CtaBandMid() {
  return (
    <section
      aria-labelledby="cta-band-mid-headline"
      className="medsync-forced-dark bg-gradient-band text-brand-50 relative w-full overflow-hidden"
    >
      {/* Atmosphere — base linear sweep (lighter top → deeper bottom) so
          the surface reads with depth even before the radial glows on top. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:linear-gradient(180deg,oklch(0.32_0.08_286),oklch(0.18_0.05_286)_55%,oklch(0.14_0.04_286))]"
      />
      {/* Atmosphere — pronounced radial glow from top-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_top_left,oklch(0.55_0.13_286/0.55),transparent_55%),radial-gradient(ellipse_at_bottom_right,oklch(0.28_0.06_286/0.6),transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.10] mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <StaggerOnScroll className="relative mx-auto flex w-full max-w-300 flex-col items-center gap-9 px-5 py-20 text-center sm:gap-12 sm:px-8 sm:py-28">
        <span className="text-brand-200/80 inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="pulse-dot bg-brand-300 size-1 rounded-full" />
          Care that doesn&rsquo;t stop at the gate
        </span>

        <h2
          id="cta-band-mid-headline"
          className="font-display text-display-s sm:text-display-l max-w-[22ch] leading-[1.05] tracking-[-0.025em] text-balance"
          style={{ fontWeight: 400 }}
        >
          Three audiences. <span className="text-brand-200 italic">One record.</span> Every step of
          care.
        </h2>

        <p className="text-body-m text-brand-100/75 sm:text-body-l max-w-[58ch] leading-[1.55] text-balance">
          Whether you&rsquo;re a patient looking for continuity, a clinician tired of writing the
          same note twice, or a hospital that needs to run the wards and the wards-at-home —
          there&rsquo;s a door for you.
        </p>

        <div className="w-full max-w-3xl">
          <OnboardingCtaCluster layout="doors" tone="dark" />
        </div>

        <p className="text-caption text-brand-300/60 max-w-[44ch] italic">
          No free trials, no pilot-with-strings. Express interest, we&rsquo;ll reply with a real
          conversation.
        </p>
      </StaggerOnScroll>
    </section>
  );
}
