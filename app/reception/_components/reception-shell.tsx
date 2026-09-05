import type { ReceptionScope } from "@/lib/reception/scope";
import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheckIcon } from "lucide-react";

import { RECEPTION_FEATURE_AREAS, receptionFeaturePath } from "../_lib/features";
import { ReceptionSidebarItem } from "./reception-sidebar-item";

const LEVEL_LABEL: Record<string, string> = {
  national_referral: "National referral",
  regional: "Regional referral",
  district: "District / General",
  hc4: "Health Centre IV",
  hc3: "Health Centre III",
  private: "Private",
};

/**
 * Reception workspace shell. Mirrors the doctor + nurse shell shape
 * with one important visual difference: the cadre pill says
 * "Reception" in a muted neutral tone (NOT teal). The whole point of
 * this role is that it's non-clinical — the chrome reflects that.
 */
export function ReceptionShell({
  scope,
  children,
}: {
  scope: ReceptionScope;
  children: ReactNode;
}) {
  const navItems = RECEPTION_FEATURE_AREAS;
  const initial = (scope.fullName ?? scope.userEmail).slice(0, 1).toUpperCase();

  return (
    <div className="bg-background text-foreground flex min-h-svh w-full">
      <aside
        aria-label="Reception workspace navigation"
        className="bg-muted/40 border-border hidden w-[240px] shrink-0 flex-col border-r lg:flex"
      >
        <div className="border-border flex flex-col gap-0.5 border-b px-5 py-3">
          <Link
            href="/"
            className="font-display text-foreground text-body-m font-medium tracking-[-0.01em] transition-opacity hover:opacity-80"
          >
            MedSync
          </Link>
          <span
            className="text-muted-foreground truncate font-mono text-[10px] tracking-[0.12em] uppercase"
            title={scope.hospitalName}
          >
            {scope.hospitalName}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col gap-px">
            {navItems.map((item) => (
              <li key={item.slug}>
                <ReceptionSidebarItem
                  href={receptionFeaturePath(item.slug)}
                  label={item.label}
                  iconKey={item.iconKey}
                  exact={item.slug === ""}
                />
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-border border-t p-3">
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <div
              aria-hidden
              className="bg-muted text-foreground/80 text-caption flex size-7 shrink-0 items-center justify-center rounded-full font-mono font-semibold"
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-[12px] font-medium">
                {scope.fullName ?? scope.userEmail}
              </p>
              <p className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] uppercase">
                <ShieldCheckIcon
                  className="text-brand-600 dark:text-brand-400 size-3"
                  aria-hidden
                />
                MFA · AAL2
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border glass sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b px-4 sm:px-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <Link
              href="/reception"
              className="font-display text-foreground text-body-m font-medium tracking-[-0.01em]"
            >
              MedSync
            </Link>
          </div>

          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <span
              aria-label={`Signed into ${scope.hospitalName} as Reception`}
              className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase"
            >
              <span
                aria-hidden
                className="pulse-dot bg-brand-500 ring-brand-500/20 size-1.5 shrink-0 rounded-full ring-2"
              />
              <span className="truncate" title={scope.hospitalName}>
                {scope.hospitalName}
              </span>
              <span className="text-muted-foreground/70" aria-hidden>
                ·
              </span>
              <span className="text-muted-foreground/70">
                {LEVEL_LABEL[scope.hospitalLevel] ?? scope.hospitalLevel}
              </span>
              <span className="text-muted-foreground/70" aria-hidden>
                ·
              </span>
              <span>Front desk</span>
            </span>
            {/* Reception cadre pill — muted on purpose: this role is
                administrative, not clinical. The chrome carries that
                signal so the staff member knows their scope at a glance. */}
            <span
              className="bg-muted text-muted-foreground border-border scale-in ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase"
              title="Reception / Records — non-clinical scope"
            >
              Reception · non-clinical
            </span>
          </div>

          <div className="flex items-center justify-end gap-3">
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
    </div>
  );
}
