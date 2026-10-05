import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * F7 layout contract: at xl (the 1440×1000 target) the dashboard is a fixed-height column that never
 * scrolls. Header, headline strip and the four cards keep their height; the conditions card takes
 * what is left and scrolls inside itself. Below xl the regions stack and the page may scroll.
 * The 3.5rem budget is the layout's notice banner (two lines at most); the shell has no top bar at lg+.
 */
export const DASHBOARD_LAYOUT = {
  frame:
    "mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-8 xl:h-[calc(100svh-3.5rem)] xl:overflow-hidden",
  header: "flex shrink-0 flex-col gap-2",
  strip: "shrink-0",
  conditions: "flex min-h-0 flex-col xl:flex-1",
  conditionsScroll: "min-h-0 flex-1 overflow-y-auto overscroll-contain",
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
