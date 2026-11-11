import type { ReactNode } from "react";

import { sectionTitle } from "@/components/pharmacy/medicines/shared";
import { cn } from "@/lib/utils";

/** What the store's places and bring-in sections share: a card, a row, a table that scrolls inside its card. */
export function Card({
  title,
  note,
  aside,
  children,
}: {
  title: ReactNode;
  note?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-card shadow-card flex min-w-0 flex-col gap-1.5 rounded-2xl p-4">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="flex max-w-[64ch] min-w-0 flex-col gap-1">
          <h2 className="text-heading-s text-foreground m-0">{title}</h2>
          {note ? <p className="text-caption text-ink-600 m-0">{note}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export const rowCls =
  "border-ink-200 flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2 border-t py-2.5";
export const rowTitle = "text-foreground text-[14px] leading-5 font-semibold";
export const rowSub = "text-ink-600 text-[12px] leading-4";
export const emptyCls = "border-ink-200 text-ink-600 m-0 border-t py-2.5 text-[14px]";
export const thCls = cn(sectionTitle, "py-1.5 pr-3 text-left align-bottom");
export const tdCls = "border-ink-200 border-t py-2 pr-3 align-top tabular-nums";

/**
 * Wide tables scroll here, never the page. Focusable, so a keyboard can scroll it too. `relative`, or an `sr-only` in
 * a far column escapes the overflow and widens the page.
 */
export function Scroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="focus-visible:ring-primary relative overflow-x-auto rounded outline-none focus-visible:ring-2"
    >
      {children}
    </div>
  );
}

/** Workflow words in a neutral square tag that may wrap. */
export const wrapTag = "h-auto min-h-[22px] max-w-full whitespace-normal py-0.5";
