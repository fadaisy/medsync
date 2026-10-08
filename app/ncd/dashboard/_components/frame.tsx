import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * F7 layout contract: at xl the dashboard fills the viewport: header, headline strip and the four
 * cards keep their height and the conditions card takes the rest. That card has a floor (30rem) so
 * its list-and-detail view is never squeezed: at 1440×1000 everything fits one screen; on a shorter
 * screen the page scrolls past it instead (D-37, owner request). Below xl the regions stack.
 * The 3.5rem budget is the layout's notice banner (two lines at most); the shell has no top bar at lg+.
 */
export const DASHBOARD_LAYOUT = {
  frame:
    "mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-8 xl:min-h-[calc(100svh-3.5rem)]",
  header: "flex shrink-0 flex-col gap-2",
  strip: "shrink-0",
  // A floor height: on a short screen the page scrolls past the card rather than squeezing it.
  conditions: "flex min-h-[30rem] flex-col xl:flex-1",
  conditionsScroll: "flex min-h-0 flex-1 flex-col",
  cards: "shrink-0",
  table: "min-h-0 flex-1 overflow-y-auto",
} as const;

export function DashboardFrame({ children }: { children: ReactNode }) {
  return (
    <div data-region="frame" className={DASHBOARD_LAYOUT.frame}>
      {children}
    </div>
  );
}

/** The three chart bands: strip, conditions card (internal scroll), four compact cards. */
export function ChartBands({
  strip,
  conditionsTitle,
  conditions,
  cards,
}: {
  strip: ReactNode;
  conditionsTitle: ReactNode;
  conditions: ReactNode;
  cards: ReactNode;
}) {
  return (
    <>
      <section data-region="strip" aria-label="Headline figures" className={DASHBOARD_LAYOUT.strip}>
        {strip}
      </section>
      <section
        data-region="conditions"
        aria-labelledby="ncd-conditions-title"
        className={cn(
          DASHBOARD_LAYOUT.conditions,
          "bg-card border-border rounded-lg border shadow-xs",
        )}
      >
        <h2
          id="ncd-conditions-title"
          className="text-overline text-muted-foreground border-ink-150 shrink-0 border-b px-5 py-2 uppercase"
        >
          {conditionsTitle}
        </h2>
        <div data-region="conditions-scroll" className={DASHBOARD_LAYOUT.conditionsScroll}>
          {conditions}
        </div>
      </section>
      <section
        data-region="cards"
        aria-label="Hospital indicators"
        className={DASHBOARD_LAYOUT.cards}
      >
        {cards}
      </section>
    </>
  );
}
