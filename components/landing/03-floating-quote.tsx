import { cn } from "@/lib/utils";

/**
 * §03 — Floating quote.
 *
 * Honest substitute for Attio's customer testimonial: a founders'-voice
 * mission line attributed to the MedSync founding team (rule per GATE A —
 * no fabricated quotes). The line is the editorial north-star for the
 * "doesn't stop at the gate" framing.
 */
export function FloatingQuote() {
  return (
    <section aria-label="Founders mission line" className="bg-background relative w-full">
      {/* Vertical hairline ticking down from the nav into the quote — a
          small visual rhyme that we repeat in trust + voices sections. */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-8 w-px -translate-x-1/2 bg-linear-to-b from-transparent to-teal-400/40" />

      <figure className="mx-auto flex w-full max-w-200 flex-col items-center gap-5 px-6 pt-14 pb-12 text-center sm:pt-20 sm:pb-16">
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="bg-border h-px w-6" />
          Founders&rsquo; voice
          <span className="bg-border h-px w-6" />
        </span>

        <blockquote
          className={cn(
            "font-display text-foreground text-balance",
            "text-[28px] leading-[1.2] sm:text-[36px] sm:leading-[1.18]",
            "font-light tracking-[-0.02em] italic",
            // Slight optical-size feel — Fraunces opsz axis kicks in at >36px.
            "[font-feature-settings:'ss01']",
          )}
        >
          <span aria-hidden className="mr-0.5 text-teal-500/60 select-none dark:text-teal-400/60">
            &ldquo;
          </span>
          A notebook in a clinical pocket can&rsquo;t call for help. Two good days at home
          shouldn&rsquo;t end a five-day course. Specialists shouldn&rsquo;t be playing telephone.
          <span aria-hidden className="ml-0.5 text-teal-500/60 select-none dark:text-teal-400/60">
            &rdquo;
          </span>
        </blockquote>

        <figcaption className="text-muted-foreground flex flex-col items-center gap-1 text-[12.5px]">
          <span className="bg-border h-px w-8" />
          <span>
            <span className="text-foreground font-medium">Usama Fadhul</span>
            <span aria-hidden> · </span>
            <span>Founder &amp; Clinical Safety Officer, MedSync</span>
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
