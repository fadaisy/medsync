import type { LabNavEntry } from "./lab-nav";
import type { LabTechScope } from "@/lib/lab-tech/scope";
import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheckIcon } from "lucide-react";

import { Avatar } from "@/components/medsync/avatar";
import {
  SIDEBAR_CLASS,
  SidebarGroupLabel,
  SidebarWorkspace,
} from "@/components/medsync/sidebar-nav";
import { LAB } from "@/content/lab";
import { LabCrumb, LabPhoneNav, LabSidebarNav } from "./lab-nav";

/**
 * The laboratory workspace shell (Lab Phase 0 §5.2): the shared 248 px sidebar with the facility
 * mark and the registered items, a 48 px top bar that says where you are and who you are (cadre and
 * section), and the main slot. Below the sidebar breakpoint the items become a row of links under
 * the top bar; nothing slides in from an edge (ADR 0161).
 */

/** "Laboratory Technologist" → "Laboratory technologist" (the copy's sentence case). */
export const sentenceCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function LabShell({
  scope,
  sectionName,
  nav,
  children,
}: {
  scope: LabTechScope;
  sectionName: string | null;
  nav: readonly LabNavEntry[];
  children: ReactNode;
}) {
  const who = [sentenceCase(scope.cadreName), sectionName].filter(Boolean).join(" · ");
  return (
    <div className="bg-background text-foreground flex min-h-svh w-full">
      <aside aria-label="Laboratory navigation" className={`${SIDEBAR_CLASS} print:hidden`}>
        <div className="flex flex-col gap-1.5 p-2">
          <SidebarWorkspace name={scope.hospitalName} sub={LAB.place} href="/lab" />
        </div>
        <nav aria-label="Laboratory" className="flex-1 overflow-y-auto px-2 pb-2">
          <SidebarGroupLabel>{LAB.nav.label}</SidebarGroupLabel>
          <LabSidebarNav items={nav.filter((i) => !i.group)} />
          {nav.some((i) => i.group === "setup") ? (
            <>
              <SidebarGroupLabel>{LAB.nav.setup}</SidebarGroupLabel>
              <LabSidebarNav items={nav.filter((i) => i.group === "setup")} />
            </>
          ) : null}
        </nav>
        <div className="border-sidebar-border border-t p-2">
          <div className="flex items-center gap-2 px-1.5 py-1.5">
            <Avatar name={scope.fullName ?? scope.userEmail} hue="grape" size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-label truncate">
                {scope.fullName ?? scope.userEmail}
              </p>
              <p className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                <ShieldCheckIcon className="size-3" aria-hidden />
                MFA · AAL2
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border glass sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b px-4 sm:px-6 print:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/lab"
              className="font-display text-foreground text-body-m font-semibold lg:hidden"
            >
              MedSync
            </Link>
            <div className="hidden min-w-0 lg:block">
              <LabCrumb items={nav} />
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-3">
            <span className="text-body-s text-ink-600 truncate" title={who}>
              {who}
            </span>
            <Link
              href="/sign-out"
              className="text-muted-foreground hover:text-foreground decoration-border shrink-0 text-[12px] underline-offset-4 transition-colors hover:underline"
            >
              Sign out
            </Link>
          </div>
        </header>
        <LabPhoneNav items={nav} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
