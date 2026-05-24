"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * §03 — Floating quote.
 *
 * Honest substitute for Attio's customer testimonial. Now carries one
 * mission line from each cofounder, cross-fading on a slow cycle so
 * all three voices land before the reader scrolls past.
 *
 * Accessibility:
 *   - Auto-cycle pauses on hover/focus (WCAG 2.2.2 pause control).
 *   - Auto-cycle skipped entirely when prefers-reduced-motion is set
 *     (reader can still click the dots to switch).
 *   - aria-live="polite" on the quote region so screen readers
 *     announce the swap.
 *   - The inactive quote is aria-hidden so SRs don't read both at once.
 */

interface FounderQuote {
  body: React.ReactNode;
  author: string;
  role: string;
}

const QUOTES: FounderQuote[] = [
  {
    body: (
      <>
        A notebook in a clinical pocket can&rsquo;t call for help. Two good days at home
        shouldn&rsquo;t end a five-day course. Specialists shouldn&rsquo;t be playing telephone.
      </>
    ),
    author: "Dr. Usama Fadhul",
    role: "Co-founder & Clinical Safety Officer, MedSync",
  },
  {
    body: (
      <>
        The future of global chronic disease management isn&rsquo;t just digital &mdash; it is
        entirely synchronized.
      </>
    ),
    author: "Dr. Nelson Nuwagira",
    role: "Co-founder, MedSync",
  },
  {
    body: (
      <>
        Far too many Ugandans present late to healthcare facilities, often after preventable damage
        has already occurred.
      </>
    ),
    author: "Dr. Caroline Murizihiwe",
    role: "Co-founder, MedSync",
  },
  {
    body: (
      <>
        Healthcare was never meant to start at crisis or end at treatment. It was meant to stay
        connected to people &mdash; before disease, between visits, and throughout life.
      </>
    ),
    author: "Dr. Nayiga Joselyn Mirembe",
    role: "Co-founder, MedSync",
  },
];

const CYCLE_MS = 9000;

export function FloatingQuote() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    // Skip auto-cycle for reduced-motion readers; dots still work.
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mql.matches) return;

    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % QUOTES.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <section aria-label="Founders' voice" className="bg-background relative w-full">
      {/* Vertical hairline ticking down from the nav — kept as the visual
          rhyme that anchors trust + voices sections later. */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-8 w-px -translate-x-1/2 bg-linear-to-b from-transparent to-teal-400/40" />

      <figure
        className="mx-auto flex w-full max-w-200 flex-col items-center gap-5 px-6 pt-14 pb-12 text-center sm:pt-20 sm:pb-16"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
          <span className="bg-border h-px w-6" />
          Founders&rsquo; voice
          <span className="bg-border h-px w-6" />
        </span>

        {/* Grid-stacked quotes — both occupy the same cell so the parent
            sizes to the longer one, eliminating height jumps on swap. */}
        <div className="grid w-full" aria-live="polite" aria-atomic="true">
          {QUOTES.map((quote, i) => (
            <div
              key={quote.author}
              aria-hidden={active !== i}
              className={cn(
                "col-start-1 row-start-1 flex flex-col items-center gap-5",
                "transition-[opacity,transform] duration-700",
                "[transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
                "motion-reduce:transition-none",
                active === i
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-1 opacity-0",
              )}
            >
              <blockquote
                className={cn(
                  "font-display text-foreground text-balance",
                  "text-[26px] leading-[1.22] sm:text-[34px] sm:leading-[1.2]",
                  "font-light tracking-[-0.02em] italic",
                  "[font-feature-settings:'ss01']",
                )}
              >
                <span
                  aria-hidden
                  className="mr-0.5 text-teal-500/60 select-none dark:text-teal-400/60"
                >
                  &ldquo;
                </span>
                {quote.body}
                <span
                  aria-hidden
                  className="ml-0.5 text-teal-500/60 select-none dark:text-teal-400/60"
                >
                  &rdquo;
                </span>
              </blockquote>

              <figcaption className="text-muted-foreground flex flex-col items-center gap-1 text-[12.5px]">
                <span className="bg-border h-px w-8" />
                <span>
                  <span className="text-foreground font-medium">{quote.author}</span>
                  <span aria-hidden> &middot; </span>
                  <span>{quote.role}</span>
                </span>
              </figcaption>
            </div>
          ))}
        </div>

        {/* Dot navigation — keyboard-accessible, indicates active quote */}
        <div className="flex items-center gap-2" role="tablist" aria-label="Switch founder quote">
          {QUOTES.map((quote, i) => (
            <button
              key={quote.author}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={`Show quote by ${quote.author}`}
              onClick={() => setActive(i)}
              className={cn(
                "rounded-full transition-all duration-300",
                active === i
                  ? "h-1.5 w-6 bg-teal-500"
                  : "bg-border hover:bg-muted-foreground/40 h-1.5 w-1.5",
              )}
            />
          ))}
        </div>
      </figure>
    </section>
  );
}
