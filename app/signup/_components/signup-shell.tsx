import type { ReactNode } from "react";

import { ClinicalPath } from "@/components/medsync/clinical-path";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for every page under /signup/*.
 *
 * Provides the atmospheric teal radial behind the page header, the
 * MedSync brand-chrome eyebrow (`/ signup → <audience>`), a Fraunces
 * display H1 with an optional italic spotlight, and a max-width
 * container that matches the rest of the app.
 *
 * Pages compose this with `<SignupColumns>` when they need the
 * form + aside layout, or use it standalone for simpler surfaces
 * (verify, done, pending).
 */

interface SignupShellProps {
  /** Single trailing segment that names the active surface, e.g. "patient" or "verify". */
  pathSegments: string[];
  /** Tiny dot-prefixed eyebrow above the title — usually the audience. */
  eyebrow: string;
  /** Display title. Bold weight is intentional; pair with optional italic spotlight. */
  title: ReactNode;
  /** Standfirst paragraph rendered below the title. */
  subtitle: ReactNode;
  /** Page body — typically `<SignupColumns>` or a single column. */
  children: ReactNode;
  /** Max-width for the inner container. Default 300 for two-column, 200 for single. */
  maxWidth?: 150 | 200 | 300;
  /** Disable the atmospheric gradient when stacking pages (e.g. done page already brand-lit). */
  noAtmosphere?: boolean;
}

export function SignupShell({
  pathSegments,
  eyebrow,
  title,
  subtitle,
  children,
  maxWidth = 300,
  noAtmosphere,
}: SignupShellProps) {
  const maxWidthClass =
    maxWidth === 150 ? "max-w-150" : maxWidth === 200 ? "max-w-200" : "max-w-300";

  return (
    <div className="relative flex flex-col">
      {!noAtmosphere ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-1/2 -z-10 h-[55%] w-[140%] max-w-none -translate-x-1/2",
            "[background:radial-gradient(closest-side,oklch(0.95_0.06_180/0.40),transparent_72%)]",
            "dark:[background:radial-gradient(closest-side,oklch(0.45_0.08_180/0.22),transparent_72%)]",
          )}
        />
      ) : null}

      <main className={cn("mx-auto w-full px-5 py-12 sm:px-8 sm:py-16", maxWidthClass)}>
        <header className="mb-10 flex flex-col gap-3">
          <ClinicalPath segments={pathSegments} />
          <span className="text-muted-foreground inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase">
            <span className="size-1 rounded-full bg-teal-500" />
            {eyebrow}
          </span>
          <h1
            className={cn(
              "font-display text-foreground mt-1 text-[34px] leading-[1.05] tracking-[-0.025em] text-balance",
              "sm:text-[44px]",
            )}
            style={{ fontWeight: 400 }}
          >
            {title}
          </h1>
          <p className="text-muted-foreground max-w-[60ch] text-[15px] leading-[1.55] sm:text-[16.5px]">
            {subtitle}
          </p>
        </header>
        {children}
      </main>
    </div>
  );
}
