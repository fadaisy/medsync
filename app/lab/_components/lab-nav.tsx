"use client";

import type { LabNavId } from "@/lib/lab/nav";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BanIcon, CheckCheckIcon, ListIcon } from "lucide-react";

import { SidebarNavItem } from "@/components/medsync/sidebar-nav";
import { cn } from "@/lib/utils";

/**
 * The lab sidebar items and the narrow-screen link row (Lab Phase 0 §5.2). Items come from the
 * registry in lib/lab/nav.ts; this only draws them. The active item takes the lab's place colour
 * (the "Pharmacy & lab" domain, grape) through SidebarNavItem; counts are neutral numbers.
 */

const ICON = { worklist: ListIcon, released: CheckCheckIcon, rejected: BanIcon } as const;

export interface LabNavEntry {
  id: LabNavId;
  label: string;
  href: string;
  exact: boolean;
  count: number;
  countLabel: string;
}

const isActive = (pathname: string, item: Pick<LabNavEntry, "href" | "exact">) =>
  item.exact
    ? pathname === item.href || pathname.startsWith(`${item.href}/results`)
    : pathname === item.href || pathname.startsWith(`${item.href}/`);

export function LabSidebarNav({ items }: { items: readonly LabNavEntry[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <SidebarNavItem
            href={item.href}
            label={item.label}
            icon={ICON[item.id]}
            domain="pharmacy"
            exact={item.exact}
            count={item.count}
            countLabel={item.countLabel}
          />
        </li>
      ))}
    </ul>
  );
}

/** Below the sidebar breakpoint: the same three items as a row of links under the top bar. */
export function LabPhoneNav({ items }: { items: readonly LabNavEntry[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Laboratory" className="border-border border-b lg:hidden">
      <ul className="flex gap-1 overflow-x-auto px-4 py-2">
        {items.map((item) => {
          const active = isActive(pathname, item);
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
export function LabCrumb({
  items,
}: {
  items: readonly Pick<LabNavEntry, "label" | "href" | "exact">[];
}) {
  const pathname = usePathname();
  const here = items.find((i) => isActive(pathname, i));
  return (
    <p className="text-body-s text-ink-600 truncate">
      Laboratory
      {here ? (
        <>
          {" / "}
          <span className="text-foreground font-medium">{here.label}</span>
        </>
      ) : null}
    </p>
  );
}
