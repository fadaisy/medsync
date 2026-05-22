import { OnboardingCtaCluster } from "./_cta-cluster";

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
      className="relative w-full overflow-hidden bg-teal-950 text-teal-50 dark:bg-teal-50/[0.02] dark:text-teal-50"
    >
      {/* Atmosphere: faint angled gradient + grain */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_top_left,oklch(0.45_0.08_180/0.5),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.10] mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative mx-auto flex w-full max-w-300 flex-col items-center gap-9 px-5 py-20 text-center sm:gap-12 sm:px-8 sm:py-28">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-teal-200/80 uppercase">
          <span className="size-1 rounded-full bg-teal-300" />
          Care that doesn&rsquo;t stop at the gate
        </span>

        <h2
          id="cta-band-mid-headline"
          className="font-display max-w-[22ch] text-[36px] leading-[1.05] tracking-[-0.025em] text-balance sm:text-[56px]"
          style={{ fontWeight: 400 }}
        >
          Three audiences. <span className="text-teal-200 italic">One record.</span> Every step of
          care.
        </h2>

        <p className="max-w-[58ch] text-[15px] leading-[1.55] text-balance text-teal-100/75 sm:text-[17px]">
          Whether you&rsquo;re a patient looking for continuity, a clinician tired of writing the
          same note twice, or a hospital that needs to run the wards and the wards-at-home —
          there&rsquo;s a door for you.
        </p>

        <div className="w-full max-w-3xl">
          <OnboardingCtaCluster layout="doors" tone="dark" />
        </div>

        <p className="max-w-[44ch] text-[11px] text-teal-300/60 italic">
          No free trials, no pilot-with-strings. Express interest, we&rsquo;ll reply with a real
          conversation.
        </p>
      </div>
    </section>
  );
}
