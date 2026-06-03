import type { DoctorScope } from "@/lib/doctor/scope";
import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { DOCTOR_FEATURE_AREAS, doctorFeaturePath } from "../_lib/features";
import { DoctorSidebarItem } from "./doctor-sidebar-item";
import { FullBleedGate } from "./full-bleed-gate";

/**
 * Doctor workspace shell — sidebar + top bar + main slot.
 *
 * Modelled on the hospital-admin shell (same 240px sidebar + 52px
 * top bar). Differences worth noting:
 *
 *   - The top bar carries a CADRE pill alongside the hospital pill.
 *     A doctor must never be ambiguous about "who am I, where, and
 *     under what scope" — it gates every action they can take.
 *   - The sidebar filters features by cadre: the "Review queue" only
 *     appears for senior cadres (MO+); "Supervisees" only for
 *     consultant-level (MOSG / Consultant / Senior Consultant).
 *   - The shell stays server-rendered; only sidebar active-state is
 *     client (pathname).
 *
 * The mobile sidebar is intentionally NOT shipped in GATE B —
 * doctors work on desktops/laptops primarily. The responsive pass
 * adds a mobile drawer later if a doctor opens on a phone.
 */

const CADRE_LABEL: Record<string, string> = {
  INTERN_DOCTOR: "Intern Doctor",
  MEDICAL_OFFICER: "Medical Officer",
  MEDICAL_OFFICER_SG: "MO Special Grade",
  CONSULTANT: "Consultant",
  SENIOR_CONSULTANT: "Senior Consultant",
};

const LEVEL_LABEL: Record<string, string> = {
  national_referral: "National referral",
  regional: "Regional referral",
  district: "District / General",
  hc4: "Health Centre IV",
  hc3: "Health Centre III",
  private: "Private",
};

export function DoctorShell({ scope, children }: { scope: DoctorScope; children: ReactNode }) {
  const navItems = DOCTOR_FEATURE_AREAS.filter((f) => {
    if (f.visibleTo === "senior") return scope.isSenior;
    if (f.visibleTo === "consultant") return scope.isConsultantLevel;
    return true;
  });

  const initial = (scope.fullName ?? scope.userEmail).slice(0, 1).toUpperCase();

  return (
    <div className="bg-background text-foreground flex min-h-svh w-full">
      {/* ── Sidebar (hidden full-bleed on the bedside desks) ─────────── */}
      <FullBleedGate>
        <aside
          aria-label="Doctor workspace navigation"
          className="bg-muted/40 border-border hidden w-[240px] shrink-0 flex-col border-r lg:flex"
        >
          {/* Brand + hospital identity */}
          <div className="border-border flex flex-col gap-0.5 border-b px-5 py-3">
            <Link
              href="/"
              className="font-display text-foreground text-[15px] font-medium tracking-[-0.01em] transition-opacity hover:opacity-80"
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

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-2">
            <ul className="flex flex-col gap-px">
              {navItems.map((item) => (
                <li key={item.slug}>
                  <DoctorSidebarItem
                    href={doctorFeaturePath(item.slug)}
                    label={item.label}
                    iconKey={item.iconKey}
                    placeholder={item.placeholder}
                    exact={item.slug === ""}
                  />
                </li>
              ))}
            </ul>
          </nav>

          {/* Identity + cadre */}
          <div className="border-border border-t p-3">
            <div className="flex items-center gap-2.5 px-1 py-1.5">
              <div
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-100 font-mono text-[11px] font-semibold text-teal-800 dark:bg-teal-900/60 dark:text-teal-200"
              >
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-[12px] font-medium">
                  {scope.fullName ?? scope.userEmail}
                </p>
                <p className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] uppercase">
                  <ShieldCheckIcon
                    className="size-3 text-teal-600 dark:text-teal-400"
                    aria-hidden
                  />
                  MFA · AAL2
                </p>
              </div>
            </div>
          </div>
        </aside>
      </FullBleedGate>

      {/* ── Main column ──────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (hidden full-bleed on the bedside desks) */}
        <FullBleedGate>
          <header className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b px-4 supports-backdrop-filter:backdrop-blur sm:px-6">
            {/* Mobile: brand only (mobile drawer ships later) */}
            <div className="flex items-center gap-2.5 lg:hidden">
              <Link
                href="/doctor"
                className="font-display text-foreground text-[15px] font-medium tracking-[-0.01em]"
              >
                MedSync
              </Link>
            </div>

            {/* Desktop: hospital + cadre identity pills */}
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <span
                aria-label={`Signed into ${scope.hospitalName} as ${CADRE_LABEL[scope.cadreCode] ?? scope.cadreCode}`}
                className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase"
              >
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-teal-500 ring-2 ring-teal-500/20"
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
                <span className="truncate">{scope.departmentName}</span>
              </span>
              <span
                className={cn(
                  "ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase",
                  scope.isJunior
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
                )}
                title={`Cadre: ${CADRE_LABEL[scope.cadreCode] ?? scope.cadreCode}`}
              >
                {CADRE_LABEL[scope.cadreCode] ?? scope.cadreCode}
              </span>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Link
                href="/sign-out"
                className="text-muted-foreground hover:text-foreground text-[12px] transition-colors"
              >
                Sign out
              </Link>
            </div>
          </header>
        </FullBleedGate>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
