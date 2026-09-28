import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MonitoringChartsView } from "@/components/emr/chart/monitoring/monitoring-charts-view";
import { monitoringFixture } from "./_lib/fixture";

/**
 * Development fixture (ADR 0189): the monitoring charts from fictional record rows, for screenshots
 * and axe. `?variant=noweight` (no urine reference line) and `?variant=empty` (the empty states).
 * Off unless MEDSYNC_FIXTURES=1; no database, no patient data.
 */
export const metadata: Metadata = { title: "Monitoring fixture", robots: { index: false } };

const VARIANTS = ["full", "noweight", "empty"] as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  if (process.env.MEDSYNC_FIXTURES !== "1") notFound();
  const { variant } = await searchParams;
  const v = VARIANTS.find((x) => x === variant) ?? "full";
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-8 md:px-8">
      <p className="text-caption text-muted-foreground">
        Fixture. Illustrative values, no real patient; drug doses are left out.
      </p>
      <h1 className="font-display text-display-s text-foreground">Monitoring charts</h1>
      <MonitoringChartsView payload={monitoringFixture(v)} defaultOpen="all" />
    </main>
  );
}
