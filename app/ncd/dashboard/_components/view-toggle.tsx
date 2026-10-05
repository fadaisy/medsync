"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChartColumnIcon, TableIcon } from "lucide-react";

import { ViewSwitcher } from "@/components/medsync/view-switcher";
import { DASHBOARD_LAYOUT } from "./frame";

/** The Charts and Table switch (F7, §11.4 "always a table"): the table is the charts' text alternative. */
export function DashboardViews({
  title,
  actions,
  filters,
  charts,
  table,
}: {
  title: ReactNode;
  actions: ReactNode;
  filters: ReactNode;
  charts: ReactNode;
  table: ReactNode;
}) {
  const [view, setView] = useState<"charts" | "table">("charts");
  return (
    <>
      <header data-region="header" className={DASHBOARD_LAYOUT.header}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {title}
          <span className="flex-1" />
          <ViewSwitcher
            label="Dashboard view"
            value={view}
            onChange={setView}
            options={[
              { value: "charts", label: "Charts", icon: <ChartColumnIcon aria-hidden /> },
              { value: "table", label: "Table", icon: <TableIcon aria-hidden /> },
            ]}
          />
          {actions}
        </div>
        {filters}
      </header>
      {view === "charts" ? (
        charts
      ) : (
        <section
          data-region="table"
          aria-label="Every indicator with numerator and denominator"
          className={DASHBOARD_LAYOUT.table}
        >
          {table}
        </section>
      )}
    </>
  );
}
