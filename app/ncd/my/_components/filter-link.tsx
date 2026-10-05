import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** A filter chip that is a link (the list lives in the URL, so the sidebar entries land on it). */
export function FilterChipLink({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-caption focus-visible:shadow-focus inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 font-medium outline-none",
        active
          ? "bg-teal-tint text-teal-text border-teal-edge"
          : "bg-card text-ink-600 border-ink-300 shadow-control hover:bg-ink-50 hover:text-foreground",
      )}
    >
      {children}
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          active ? "text-teal-text" : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </Link>
  );
}
