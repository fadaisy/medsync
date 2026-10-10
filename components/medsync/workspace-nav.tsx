"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidebarNavItem } from "@/components/medsync/sidebar-nav";
import { cn } from "@/lib/utils";

/**
 * A workspace's sidebar items, its narrow-screen link row and its "Place / Item" crumb (Lab Phase 0
 * §5.2, Pharmacy Phase 0 §5.2; ADR 0229). Items come from the workspace's registry; this only draws
 * them. The active item takes the "Pharmacy & lab" place colour (grape) through SidebarNavItem;
 * counts are neutral numbers. `also` lists sub-paths that light an exact item in the crumb and the
 * link row (a result screen lights Worklist; a prescription lights Queue).
 */
export interface WorkspaceNavEntry {
  id: string;
  label: string;
  href: string;
  exact: boolean;
  count: number;
  countLabel: string;
  icon: LucideIcon;
  also?: readonly string[];
  /** Light the sidebar item on its `also` paths too (the pharmacy's Queue); the lab's does not. */
  sidebarAlso?: boolean;
}

export const isActiveEntry = (
  pathname: string,
  item: Pick<WorkspaceNavEntry, "href" | "exact" | "also">,
) =>
  item.exact
    ? pathname === item.href || (item.also ?? []).some((p) => pathname.startsWith(p))
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

export function WorkspaceSidebarNav({ items }: { items: readonly WorkspaceNavEntry[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <SidebarNavItem
            href={item.href}
            label={item.label}
            icon={item.icon}
            domain="pharmacy"
            exact={item.exact && !(item.sidebarAlso && isActiveEntry(pathname, item))}
            count={item.count}
            countLabel={item.countLabel}
          />
        </li>
      ))}
    </ul>
  );
}

/** Below the sidebar breakpoint: the same items as a row of links under the top bar. */
export function WorkspacePhoneNav({
  label,
  items,
}: {
  label: string;
  items: readonly WorkspaceNavEntry[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="border-border border-b lg:hidden">
      <ul className="flex gap-1 overflow-x-auto px-4 py-2">
        {items.map((item) => {
          const active = isActiveEntry(pathname, item);
          return (
            <li key={item.id} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-label focus-visible:shadow-focus inline-flex min-h-11 items-center gap-2 rounded-md px-3 outline-none",
                  active
                    ? "bg-grape-tint text-grape-text shadow-[inset_0_0_0_1px_var(--grape-edge)]"
                    : "text-sidebar-foreground hover:bg-ink-100",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    active ? "text-ink-600" : "text-muted-foreground",
                  )}
                >
                  {item.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** "Laboratory / Worklist": where you are, for the top bar. */
export function WorkspaceCrumb({
  place,
  items,
}: {
  place: string;
  items: readonly Pick<WorkspaceNavEntry, "label" | "href" | "exact" | "also">[];
}) {
  const pathname = usePathname();
  const here = items.find((i) => isActiveEntry(pathname, i));
  return (
    <p className="text-body-s text-ink-600 truncate">
      {place}
      {here ? (
        <>
          {" / "}
          <span className="text-foreground font-medium">{here.label}</span>
        </>
      ) : null}
    </p>
  );
}
