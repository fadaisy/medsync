import type { MonitoringPayload } from "@/lib/emr/charts/payload";

import { MonitoringChartsView } from "@/components/emr/chart/monitoring/monitoring-charts-view";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalReader } from "@/lib/emr/db";
import { clerkingPlanV2LiveFor } from "@/lib/emr/feature";
import { loadMonitoring } from "@/lib/emr/read/monitoring";
import { FluidBalanceEntry } from "./fluid-balance-entry";

/** Postgres 42P01 (undefined table), bare or wrapped in Drizzle's error (`cause`). */
const isMissingTable = (e: unknown): boolean =>
  typeof e === "object" &&
  e !== null &&
  (("code" in e && e.code === "42P01") || ("cause" in e && isMissingTable(e.cause)));

/**
 * The open visit's monitoring charts on the nurse's chart (ADR 0189 §8): the charts the plan
 * opened, and the fluid balance entry while a fluid balance chart is open. Read under the clinical
 * reader (RLS decides); before migration 0089 is applied the tables do not exist and nothing shows.
 * After a recorded death the entry form is withheld with the chart's other actions.
 */
export async function NurseMonitoring({
  patientUserId,
  encounterId,
  actionsAllowed,
}: {
  patientUserId: string;
  encounterId: string;
  actionsAllowed: boolean;
}) {
  const actor = await requireEmrActor("nurse");
  // Off with the Plan by problem (CLERKING_PLAN_V2): the plan is what opens these charts.
  if (!clerkingPlanV2LiveFor(actor.hospitalId)) return null;
  let payload: MonitoringPayload | null;
  try {
    payload = await asClinicalReader({ userId: actor.userId, hospitalId: actor.hospitalId }, (tx) =>
      loadMonitoring(tx, {
        hospitalId: actor.hospitalId,
        patientUserId,
        encounterId,
        now: new Date(),
      }),
    );
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
  if (!payload || payload.charts.length === 0) return null;
  const fluid = payload.charts.find((c) => c.kind === "fluid_balance" && c.closedAt === null);

  return (
    <section
      aria-labelledby="monitoring-heading"
      className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pb-10 md:px-8"
    >
      <h2 id="monitoring-heading" className="text-heading-m text-foreground">
        Monitoring charts
      </h2>
      {fluid?.kind === "fluid_balance" && actionsAllowed ? (
        <FluidBalanceEntry
          patientUserId={patientUserId}
          encounterId={encounterId}
          ivLines={fluid.body.ivLines
            .filter((l) => l.key !== "other" && l.mlPerHour !== null)
            .map((l) => ({ key: l.key, label: l.label }))}
          entries={fluid.body.entries}
          stepHours={fluid.body.stepHours}
        />
      ) : null}
      <MonitoringChartsView payload={payload} />
    </section>
  );
}
