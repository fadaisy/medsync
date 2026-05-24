import type { ReactNode } from "react";
import Link from "next/link";
import {
  BoxesIcon,
  ClipboardCheckIcon,
  GaugeIcon,
  KeyIcon,
  ScrollTextIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UserCogIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AdminSidebarActiveMarker } from "./admin-sidebar-active";
import { CommandPaletteRoot } from "./command-palette";

/**
 * Admin shell — persistent sidebar + top bar + main region.
 *
 * Layout primitives (per DESIGN-medsync.md):
 *   - Sidebar width 240px (collapses to icons < lg)
 *   - Top bar 52px
 *   - Page padding 32px desktop, 16px mobile
 *
 * The shell is server-rendered; only the active-state highlight and
 * the command palette are client. The palette listens for ⌘K globally
 * once mounted, so it must be present on every admin route.
 *
 * Sidebar items mirror the kickoff's six capability areas plus
 * Break-glass (the single PHI-bearing path — surfaced directly so
 * it's never invoked by accident from a routine flow).
 */

interface AdminShellProps {
  isSuperadmin: boolean;
  operatorEmail: string;
  mfaActive: boolean;
  /** Live count of items waiting for the operator. Rendered as a chip on Approvals. */
  approvalsCount: number;
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof ClipboardCheckIcon;
  /** Hidden from non-superadmins (hospital_admin lite view). */
  superadminOnly?: boolean;
  /** Marks the item as a sensitive surface — distinct chip + colour. */
  sensitive?: boolean;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/admin", label: "Approvals", icon: ClipboardCheckIcon },
  { href: "/admin/tenants", label: "Tenants", icon: BoxesIcon, superadminOnly: true },
  { href: "/admin/people", label: "People", icon: UserCogIcon, superadminOnly: true },
  { href: "/admin/catalog", label: "Catalog", icon: KeyIcon, superadminOnly: true },
  { href: "/admin/audit", label: "Audit", icon: ScrollTextIcon, superadminOnly: true },
  { href: "/admin/health", label: "Health", icon: GaugeIcon },
  {
    href: "/admin/break-glass",
    label: "Break-glass",
    icon: ShieldAlertIcon,
    superadminOnly: true,
    sensitive: true,
  },
];

export function AdminShell({
  isSuperadmin,
  operatorEmail,
  mfaActive,
  approvalsCount,
  children,
}: AdminShellProps) {
  const items = NAV_ITEMS.filter((item) => !item.superadminOnly || isSuperadmin);

  return (
    <div className="bg-background text-foreground flex min-h-svh w-full">
      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside
        aria-label="Workspace navigation"
        className="bg-muted/40 border-border hidden w-[240px] shrink-0 flex-col border-r lg:flex"
      >
        {/* Brand */}
        <div className="border-border flex h-[52px] items-center gap-2.5 border-b px-5">
          <Link
            href="/"
            className="font-display text-foreground text-[15px] font-medium tracking-[-0.01em] transition-opacity hover:opacity-80"
          >
            MedSync
          </Link>
          <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.16em] uppercase">
            Console
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col gap-px">
            {items.map((item) => (
              <li key={item.href}>
                <AdminSidebarActiveMarker href={item.href}>
                  {(isActive) => (
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors outline-none",
                        "focus-visible:ring-2 focus-visible:ring-teal-500/40",
                        isActive
                          ? "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        item.sensitive &&
                          !isActive &&
                          "text-amber-700/90 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/30",
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-4 shrink-0",
                          isActive
                            ? "text-teal-600 dark:text-teal-400"
                            : "text-muted-foreground/80 group-hover:text-foreground",
                          item.sensitive && !isActive && "text-amber-700 dark:text-amber-400",
                        )}
                        aria-hidden
                      />
                      <span className="flex-1 truncate font-medium">{item.label}</span>

                      {item.href === "/admin" && approvalsCount > 0 ? (
                        <span
                          aria-label={`${approvalsCount} pending`}
                          className={cn(
                            "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums",
                            isActive
                              ? "bg-teal-600 text-white"
                              : "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200",
                          )}
                        >
                          {approvalsCount}
                        </span>
                      ) : null}
                    </Link>
                  )}
                </AdminSidebarActiveMarker>
              </li>
            ))}
          </ul>
        </nav>

        {/* Operator identity + secure-session marker */}
        <div className="border-border border-t p-3">
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <div
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-100 font-mono text-[11px] font-semibold text-teal-800 dark:bg-teal-900/60 dark:text-teal-200"
            >
              {operatorEmail.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground truncate text-[12px] font-medium">{operatorEmail}</p>
              <p
                className={cn(
                  "inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.1em] uppercase",
                  mfaActive
                    ? "text-teal-700 dark:text-teal-300"
                    : "text-amber-700 dark:text-amber-400",
                )}
              >
                <ShieldCheckIcon
                  className={cn(
                    "size-3",
                    mfaActive
                      ? "text-teal-600 dark:text-teal-400"
                      : "text-amber-600 dark:text-amber-400",
                  )}
                  aria-hidden
                />
                {mfaActive ? "MFA · AAL2" : "MFA inactive"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main column ──────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 flex h-[52px] items-center justify-between gap-4 border-b px-4 supports-backdrop-filter:backdrop-blur sm:px-6">
          {/* Mobile brand (sidebar is hidden < lg) */}
          <Link
            href="/admin"
            className="font-display text-foreground text-[15px] font-medium tracking-[-0.01em] lg:hidden"
          >
            MedSync
          </Link>

          {/* Environment / god-mode indicator — operator always knows */}
          <div className="hidden items-center gap-2 lg:flex">
            <span
              aria-label="You are signed into the superadmin console"
              className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase"
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-teal-500 ring-2 ring-teal-500/20"
              />
              {isSuperadmin ? "Superadmin console" : "Admin console"} · Production
            </span>
          </div>

          {/* ⌘K trigger + palette (single root — owns its open state) */}
          <div className="flex flex-1 items-center justify-end gap-3">
            <CommandPaletteRoot isSuperadmin={isSuperadmin} />
            <Link
              href="/sign-out"
              className="text-muted-foreground hover:text-foreground text-[12px] transition-colors"
            >
              Sign out
            </Link>
          </div>
        </header>

        {/* Main region */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
