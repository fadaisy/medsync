import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Superadmin / hospital-admin workspace nav.
 *
 * Six capability areas, ordered by frequency of use:
 *   1. Approvals (act daily — the landing surface)
 *   2. Tenants (manage occasionally)
 *   3. People (manage occasionally)
 *   4. Catalog (maintain rarely; MVP read-only)
 *   5. Audit (oversee deliberately — first-class per the kickoff)
 *   6. Health (glance)
 *
 * Item visibility:
 *   - All admin roles see Approvals, Audit, Health.
 *   - Superadmin-only items (Tenants, People, Catalog) are hidden
 *     for plain hospital_admins. The gate is rendered here, not
 *     enforced by it — every page still re-checks the role
 *     server-side.
 *
 * Server component — pure markup, no client interaction. The active
 * link state can't use scroll-spy here (each section is its own
 * route); we read the current pathname via a thin client wrapper
 * `<AdminNavActiveMarker>` placed in the layout when we want it.
 * For GATE A the highlight is route-prefix based via CSS
 * `:has` once the route lands — keeping the markup static for now.
 */
export interface AdminNavItem {
  href: string;
  label: string;
  /** Hidden from non-superadmins (hospital_admin lite view). */
  superadminOnly?: boolean;
  /** Surface a small chip beside the label — used to mark MVP/deferred sections. */
  badge?: "MVP" | "Read-only" | "Coming soon";
}

export const ADMIN_NAV_ITEMS: ReadonlyArray<AdminNavItem> = [
  { href: "/admin", label: "Approvals" },
  { href: "/admin/tenants", label: "Tenants", superadminOnly: true, badge: "MVP" },
  { href: "/admin/people", label: "People", superadminOnly: true, badge: "MVP" },
  {
    href: "/admin/catalog",
    label: "Catalog",
    superadminOnly: true,
    badge: "Read-only",
  },
  { href: "/admin/audit", label: "Audit", superadminOnly: true },
  { href: "/admin/health", label: "Health" },
];

export interface AdminNavProps {
  isSuperadmin: boolean;
  /** Used to derive the active link. Pass the page's pathname. */
  pathname: string;
}

export function AdminNav({ isSuperadmin, pathname }: AdminNavProps) {
  const items = ADMIN_NAV_ITEMS.filter((item) => !item.superadminOnly || isSuperadmin);

  return (
    <nav aria-label="Admin sections" className="flex items-center gap-1 overflow-x-auto">
      {items.map((item) => {
        // Exact match for /admin (landing); prefix match for the rest
        // so /admin/tenants/<id> highlights /admin/tenants.
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[12.5px] tracking-[0.01em] transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/90",
            )}
          >
            <span>{item.label}</span>
            {item.badge ? (
              <span
                className={cn(
                  "border-border rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em] uppercase",
                  item.badge === "MVP" && "text-muted-foreground",
                  item.badge === "Read-only" &&
                    "border-amber-300/60 text-amber-700 dark:border-amber-400/30 dark:text-amber-300",
                  item.badge === "Coming soon" && "text-muted-foreground/70",
                )}
              >
                {item.badge}
              </span>
            ) : null}
            <span
              aria-hidden
              className={cn(
                "absolute right-3 bottom-0 left-3 h-[1.5px] rounded-full bg-teal-500 transition-opacity duration-200 dark:bg-teal-400",
                isActive ? "opacity-100" : "opacity-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
