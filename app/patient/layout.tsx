import type { MobileTabBarItem } from "@/components/responsive/mobile-tab-bar";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ActivityIcon, FileTextIcon, HomeIcon } from "lucide-react";

import { MobileTabBar } from "@/components/responsive/mobile-tab-bar";
import { requirePatientScope } from "@/lib/patient/scope";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// String iconKey on each row — lucide functions can't cross the
// server → client boundary, so we hand the bar string keys and let
// it resolve to the actual component internally.
const TAB_ITEMS: ReadonlyArray<MobileTabBarItem> = [
  { href: "/patient", label: "Home", iconKey: "home", exact: true },
  { href: "/patient/track", label: "Track", iconKey: "activity" },
  { href: "/patient/appointments", label: "Visits", iconKey: "file-text" },
  { href: "/patient/menu", label: "More", iconKey: "menu" },
];

// Lucide components used by the desktop nav stay here (this file is
// a Server Component but the icons render inline in JSX, so they
// aren't passed across a boundary).
const DESKTOP_NAV = [
  { href: "/patient", label: "Home", Icon: HomeIcon },
  { href: "/patient/track", label: "Track", Icon: ActivityIcon },
  { href: "/patient/appointments", label: "Visits", Icon: FileTextIcon },
];

/**
 * Patient workspace shell.
 *
 *   - Mobile (default): top brand bar + bottom tab bar. Thumb-reachable
 *     nav, no sidebar.
 *   - Desktop (md+): top brand bar + horizontal nav (the tab bar is
 *     hidden by its own breakpoint).
 *
 * Per ADR-to-land: patient surfaces are mobile-first. The same
 * components reflow at md+; we don't duplicate trees.
 */
export default async function PatientLayout({ children }: { children: ReactNode }) {
  const scope = await requirePatientScope();

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <header className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b px-4 supports-backdrop-filter:backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/patient"
            className="font-display text-foreground text-[15px] font-medium tracking-[-0.01em]"
          >
            MedSync
          </Link>
          {scope.primaryHospitalName ? (
            <span
              className="text-muted-foreground hidden truncate font-mono text-[10px] tracking-[0.12em] uppercase sm:inline"
              title={scope.primaryHospitalName}
            >
              <span
                aria-hidden
                className="mr-1.5 inline-block size-1 -translate-y-px rounded-full bg-teal-500 ring-2 ring-teal-500/20"
              />
              {scope.primaryHospitalName}
            </span>
          ) : null}
        </div>

        {/* Desktop nav — visible from md up. Tab bar handles mobile. */}
        <nav aria-label="Patient navigation" className="hidden items-center gap-1 md:flex">
          {DESKTOP_NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors"
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </Link>
          ))}
          <Link
            href="/sign-out"
            className="text-muted-foreground hover:text-foreground ml-2 text-[12px] transition-colors"
          >
            Sign out
          </Link>
        </nav>

        <Link
          href="/sign-out"
          className="text-muted-foreground hover:text-foreground text-[12px] transition-colors md:hidden"
        >
          Sign out
        </Link>
      </header>

      <main className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>

      <MobileTabBar items={TAB_ITEMS} />
    </div>
  );
}
