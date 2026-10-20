import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { LinkPending } from "./link-pending";

/**
 * The space header (prompt 5.1): the place's views as pill tabs with counts, then filter chips, then the view's
 * one primary action. Tabs and chips are links (server-rendered, URL-driven) with `aria-current`.
 */
export interface PillTab {
  key: string;
  label: string;
  href: string;
  count?: number | null;
  /** Amber count: something here needs action (Quality). */
  attention?: boolean;
  /** How the count reads aloud ("21 to result"). */
  countLabel?: string;
}

export function PillTabs({
  tabs,
  current,
  label,
}: {
  tabs: readonly PillTab[];
  current: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="bg-tide-sunken flex w-fit max-w-full flex-wrap gap-1 rounded-full p-1"
    >
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            aria-label={t.count != null && t.countLabel ? `${t.label}, ${t.countLabel}` : undefined}
            className={cn(
              "focus-visible:shadow-focus relative isolate inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] whitespace-nowrap outline-none",
              on
                ? "bg-card text-foreground shadow-tide-card font-semibold"
                : "text-ink-600 hover:text-foreground font-medium",
            )}
          >
            <LinkPending className="bg-card" />
            {t.label}
            {t.count != null ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-[11.5px] leading-5 font-semibold tabular-nums",
                  t.attention && t.count > 0
                    ? "bg-status-caution-bg text-amber-800"
                    : on
                      ? "bg-tide-sunken text-ink-700"
                      : "bg-card/70 text-ink-700",
                )}
              >
                {t.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export interface Chip {
  key: string;
  label: string;
  href: string;
  count?: number | null;
}

export function FilterChips({
  chips,
  current,
  label,
}: {
  chips: readonly Chip[];
  current: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {chips.map((c) => {
        const on = c.key === current;
        return (
          <Link
            key={c.key}
            href={c.href}
            aria-current={on ? "true" : undefined}
            className={cn(
              "focus-visible:shadow-focus relative isolate inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] whitespace-nowrap outline-none",
              on
                ? "bg-tide-navy-900 text-tide-on-band font-semibold"
                : "bg-card text-ink-700 hover:bg-ink-50 font-medium shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
            )}
          >
            <LinkPending className="bg-tide-sunken" />
            {c.label}
            {c.count != null ? <span className="tabular-nums opacity-80">{c.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Tabs, chips and one primary action in one row that wraps. */
export function SpaceHeader({
  tabs,
  chips,
  action,
  note,
  className,
}: {
  tabs?: ReactNode;
  chips?: ReactNode;
  action?: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 print:hidden", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {tabs}
        <span className="flex-1" />
        {action}
      </div>
      {chips || note ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {chips}
          {note ? <span className="text-caption text-muted-foreground">{note}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A primary action as a link: lagoon fill, navy text, one per region (Law 9). */
export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="bg-tide-lagoon text-tide-on-lagoon hover:bg-tide-lagoon-pressed focus-visible:shadow-focus inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold whitespace-nowrap outline-none"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="bg-card text-foreground hover:bg-ink-50 focus-visible:shadow-focus inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium whitespace-nowrap shadow-[inset_0_0_0_1px_var(--color-ink-300)] outline-none"
    >
      {children}
    </Link>
  );
}
