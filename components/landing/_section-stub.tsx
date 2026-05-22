import type { ReactNode } from "react";

import { SectionNumber } from "@/components/medsync/section-number";
import { cn } from "@/lib/utils";

interface SectionStubProps {
  /** Spec section number (1-17). */
  n: number;
  /** Spec bracket number when the section has one in the spec, e.g. [01]-[04]. */
  bracket?: number;
  name: string;
  intent: string;
  surfaces?: ReactNode;
  runtime?: "server" | "client";
  buildAt?: string;
  /** What gets built here in later gates. */
  todo?: string[];
  /** When true, render full-bleed (e.g. announcement bar, footer). */
  fullBleed?: boolean;
}

/**
 * Placeholder wrapper used during GATE A scaffold. Every landing component
 * renders through this until its real content lands in GATE B–F. The page
 * stays readable for review without burning time on visual polish that the
 * spec defers to per-gate work.
 */
export function SectionStub({
  n,
  bracket,
  name,
  intent,
  surfaces,
  runtime = "server",
  buildAt = "GATE B+",
  todo,
  fullBleed = false,
}: SectionStubProps) {
  return (
    <section
      data-landing-section={n}
      aria-labelledby={`section-${n}-title`}
      className={cn("bg-card border-border w-full border-y", fullBleed ? "" : "py-12")}
    >
      <div
        className={cn(
          "flex flex-col gap-4",
          fullBleed ? "px-4 py-3" : "mx-auto w-full max-w-300 px-6 sm:px-8",
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          {bracket !== undefined ? <SectionNumber n={bracket} /> : null}
          <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
            §{String(n).padStart(2, "0")} · {runtime} · {buildAt}
          </span>
        </div>
        <h2 id={`section-${n}-title`} className="font-display text-heading-m text-foreground">
          {name}
        </h2>
        <p className="text-body-m text-muted-foreground max-w-2xl">{intent}</p>
        {todo && todo.length > 0 ? (
          <ul className="text-body-s text-muted-foreground list-disc pl-5">
            {todo.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : null}
        {surfaces ? <div className="mt-2">{surfaces}</div> : null}
      </div>
    </section>
  );
}
