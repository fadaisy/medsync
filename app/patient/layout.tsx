import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { MobileTabBar } from "@/components/responsive/mobile-tab-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { resolvePatientScope } from "@/lib/patient/scope";
import { EmergencyNotice } from "./_components/emergency-notice";
import { PatientNavRail } from "./_components/patient-nav-rail";
import { RegisterServiceWorker } from "./_components/register-sw";
import { PATIENT_NAV } from "./_lib/nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Patient workspace shell.
 *
 *   - Below `md:`: sticky top bar + bottom tab bar. Thumb-reachable, no rail.
 *   - `md:` and up: the same top bar + a persistent left rail (the tab bar
 *     hides itself at that breakpoint). At `lg:` the rail grows labels.
 *
 * Both navs render `PATIENT_NAV`. They used to render two different arrays,
 * which is why /patient/menu and everything under it had no desktop entry.
 *
 * The top bar is kept at every width on purpose. Dropping it at `lg:` would
 * have invalidated every `sticky top-*` offset below it and the global
 * `[data-section-anchor] { scroll-margin-top: 80px }`; keeping the 52px bar
 * makes `top-13` the single sticky constant in the workspace.
 *
 * `@container/page` on the content wrapper is what pages size their second
 * column against (`@5xl/page:`) — a container query, because with the rail
 * and the gutters the content box is ~300px narrower than the viewport and
 * a viewport breakpoint would fire at the wrong moment.
 *
 * `resolvePatientScope`, not `require`: the pages carry the consent gate
 * (ADR 0094) and redirect to /patient/consent, which renders inside this
 * shell — a layout that redirected too would loop.
 */
export default async function PatientLayout({ children }: { children: ReactNode }) {
  const scope = await resolvePatientScope();
  // Names the emergency landmark when there is a hospital to name. The name
  // never reaches the block's copy itself (ADR 0084 §3).
  const hospitalName = scope.primaryHospitalId
    ? (scope.primaryHospitalName ?? "Your hospital")
    : null;

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <RegisterServiceWorker />
      <header className="border-border glass sticky top-0 z-30 flex h-13 items-center justify-between gap-3 border-b px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/patient"
            className="font-display text-foreground text-body-m font-medium tracking-[-0.01em]"
          >
            MedSync
          </Link>
          {scope.primaryHospitalName ? (
            <span
              className="text-muted-foreground text-caption hidden min-w-0 items-center gap-1.5 font-mono tracking-[0.16em] uppercase sm:inline-flex"
              title={scope.primaryHospitalName}
            >
              {/* Static dot: nothing on this surface is live, so it doesn't pulse. */}
              <span
                aria-hidden
                className="bg-brand-500 ring-brand-500/20 size-1 shrink-0 rounded-full ring-2"
              />
              <span className="truncate">{scope.primaryHospitalName}</span>
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* The shipped toggle is a 28px bordered box. The 44px touch floor
              is applied here rather than in the shared component, which five
              other workspaces render at their own density — and the chrome
              comes off with it, so a 44px target still reads as the bare
              glyph this header wants beside a plain text link. */}
          <ThemeToggle className="size-11 border-transparent bg-transparent" />
          <Link
            href="/sign-out"
            className="text-muted-foreground hover:text-foreground decoration-border text-body-s inline-flex min-h-11 items-center underline-offset-4 transition-colors hover:underline"
          >
            Sign out
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <PatientNavRail hospitalName={scope.primaryHospitalName} />

        <main className="bg-muted min-w-0 flex-1 pb-24 md:pb-0">
          <div className="@container/page mx-auto w-full max-w-300 px-4 py-6 md:px-6 md:py-8">
            {/* Once, here, on every patient screen (PRD §2.5, ADR 0088 C9):
                the pages used to render their own copies, and a screen that
                forgot was a screen with no emergency instruction. It takes
                the scope's verified number and shows the destination alone
                without one — never an invented number. */}
            <EmergencyNotice
              hospitalName={hospitalName}
              emergencyPhone={scope.emergencyEntrancePhone}
              className="mb-6"
            />
            {children}
          </div>
        </main>
      </div>

      <MobileTabBar items={PATIENT_NAV} />
    </div>
  );
}
