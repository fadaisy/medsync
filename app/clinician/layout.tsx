import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { requireClinicianScope } from "@/lib/clinician/scope";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Minimal clinician workspace shell.
 *
 * GATE B of scheduling lands the first clinician-facing surface
 * (availability editor). When more clinician features ship, this
 * grows into a full Attio shell — sidebar, ⌘K, etc. — modelled on
 * the hospital-admin shell. For now: top bar + main slot is enough,
 * keeps the chrome out of the way while we ship the first feature.
 *
 * Auth: `requireClinicianScope()` enforces auth + AAL2 + an active
 * clinician affiliation. No scope = bounce to `/onboarding/clinical-
 * pending` (where the rejected / pending / approved-no-MFA flows
 * already live).
 */
export default async function ClinicianLayout({ children }: { children: ReactNode }) {
  const scope = await requireClinicianScope();

  return (
    <div className="bg-background text-foreground flex min-h-svh w-full flex-col">
      <header className="border-border glass sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="font-display text-foreground text-body-m font-medium tracking-[-0.01em]"
          >
            MedSync
          </Link>
          <span
            className="text-muted-foreground hidden truncate font-mono text-[10px] tracking-[0.12em] uppercase sm:inline"
            title={`${scope.hospitalName} · ${scope.departmentName}`}
          >
            <span
              aria-hidden
              className="pulse-dot bg-brand-500 ring-brand-500/20 mr-1.5 inline-block size-1 -translate-y-px rounded-full ring-2"
            />
            Clinician · {scope.hospitalName}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={cn("text-muted-foreground truncate text-[12px]", "hidden sm:inline")}
            title={scope.userEmail}
          >
            {scope.fullName ?? scope.userEmail}
          </span>
          <Link
            href="/sign-out"
            className="text-muted-foreground hover:text-foreground text-[12px] underline-offset-4 transition-colors hover:underline"
          >
            Sign out
          </Link>
        </div>
      </header>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
