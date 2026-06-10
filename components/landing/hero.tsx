import { OnboardingCtaCluster } from "./_cta-cluster";

/**
 * §05a — Hero.
 *
 * Editorial-clinical aesthetic: Fraunces display H1 on a soft teal-radial
 * atmosphere with SVG-grain texture, three equal audience doors below. No
 * primary CTA — per GATE A all three doors are equal-weight.
 *
 * Staggered reveal on mount via animation-delay; motion-reduce users see
 * the final state instantly.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-headline" className="relative isolate w-full overflow-hidden">
      {/* Atmosphere layer 1 — soft radial teal glow behind the H1 */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-[120%] w-[140%] max-w-none -translate-x-1/2 [background:radial-gradient(closest-side,oklch(0.95_0.06_180/0.55),transparent_72%)] dark:[background:radial-gradient(closest-side,oklch(0.45_0.08_180/0.32),transparent_72%)]"
      />

      {/* Atmosphere layer 2 — grain (SVG turbulence, inlined data URL) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.18] mix-blend-multiply dark:opacity-[0.22] dark:mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Hairline frame at left + right edges of the content column */}
      <div className="relative mx-auto w-full max-w-300 px-5 sm:px-8">
        <div className="mx-auto flex max-w-220 flex-col items-center gap-7 pt-6 pb-14 text-center sm:gap-9 sm:pt-10 sm:pb-20">
          <h1
            id="hero-headline"
            className="font-display text-foreground motion-safe:reveal-up tracking-[-0.035em] text-balance"
            style={{
              fontSize: "clamp(40px, 7.4vw, 92px)",
              lineHeight: 1.02,
              fontWeight: 400,
              animationDelay: "60ms",
            }}
          >
            A digital hospital
            <br />
            that doesn&rsquo;t stop{" "}
            <span className="text-teal-700 italic dark:text-teal-300">at the gate</span>
            <span aria-hidden className="text-teal-500 dark:text-teal-400">
              .
            </span>
          </h1>

          <p
            className="text-muted-foreground motion-safe:reveal-up max-w-[58ch] text-[16px] leading-[1.55] text-balance sm:text-[18px]"
            style={{ animationDelay: "180ms" }}
          >
            MedSync is the operating system for Ugandan hospitals up to national-referral scale
            &mdash; running the wards, supporting the clinicians, and keeping a record open after
            patients go home.
          </p>

          <div className="motion-safe:reveal-up w-full pt-2" style={{ animationDelay: "300ms" }}>
            <OnboardingCtaCluster layout="doors" />
          </div>

          <p
            className="text-muted-foreground motion-safe:reveal-up inline-flex items-center gap-2 font-mono text-[10.5px] tracking-[0.18em] uppercase"
            style={{ animationDelay: "420ms" }}
          >
            <span className="size-1.5 rounded-full bg-teal-500/70" />
            Three audiences &middot; One record &middot; Every step of care
          </p>
        </div>
      </div>
    </section>
  );
}
