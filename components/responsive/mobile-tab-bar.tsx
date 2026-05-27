"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Bottom tab bar for patient surfaces on phones.
 *
 *   - Below `md:`: pinned to the viewport bottom, thumb-reachable.
 *   - `md:` and up: hidden — the desktop equivalent is a sidebar
 *     (which we render separately in the patient layout).
 *
 * Active state derives from pathname prefix. Safe-area-padded on
 * iOS so the bar sits above the home indicator.
 */

export interface MobileTabBarItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Optional badge count (small chip on top-right of the icon). */
  badgeCount?: number;
  /** Match the active state on exact href only, not prefix. Useful
   * for the index tab so /book doesn't light it up. */
  exact?: boolean;
}

export function MobileTabBar({
  items,
  className,
}: {
  items: ReadonlyArray<MobileTabBarItem>;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Patient navigation"
      className={cn(
        "border-border bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-0 z-30 border-t supports-backdrop-filter:backdrop-blur",
        "pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)]",
        "md:hidden",
        className,
      )}
    >
      <ul className="mx-auto flex w-full max-w-xl items-stretch justify-around gap-1 px-2">
        {items.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-teal-500/40",
                  isActive ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon
                    aria-hidden
                    className={cn("size-5 transition-transform", isActive && "scale-105")}
                  />
                  {item.badgeCount && item.badgeCount > 0 ? (
                    <span
                      aria-label={`${item.badgeCount} new`}
                      className="absolute -top-1 -right-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 font-mono text-[9.5px] font-semibold text-white tabular-nums"
                    >
                      {item.badgeCount > 9 ? "9+" : item.badgeCount}
                    </span>
                  ) : null}
                </span>
                <span className="text-[10.5px] font-medium tracking-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Spacer to drop into the page so its last row of content doesn't
 * land underneath the tab bar on mobile.
 */
export function MobileTabBarSpacer() {
  return <div className="h-16 md:hidden" aria-hidden />;
}
