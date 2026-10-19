import { notFound } from "next/navigation";

import { db } from "@/db";
import {
  loadAnalysersInService,
  loadControlLots,
  loadLabComponents,
} from "@/lib/lab/qc-plan-form-read";
import { loadQcPlans } from "@/lib/lab/qc-read";
import { PlanForm } from "../_components/plan-form";
import { requireQualityScope } from "../_lib/scope";
import { dayWords } from "../../_lib/days";

/** The New QC plan form's reads (prompt 5.11): analysers in service, tests by name, accepted control lots. */
export async function NewPlanView({ device }: { device?: string }) {
  const { scope, lead } = await requireQualityScope();
  if (!lead) notFound();
  const h = scope.hospitalId;
  const [analysers, components, lots, plans] = await db.transaction((t) => {
    const tx = t as never;
    return Promise.all([
      loadAnalysersInService(tx, h),
      loadLabComponents(tx, h, { quantityOnly: true }),
      loadControlLots(tx, h),
      loadQcPlans(tx, h, new Date()),
    ]);
  });
  return (
    <PlanForm
      analysers={analysers}
      components={components}
      lots={lots.map((l) => ({ ...l, useBy: l.useBy ? dayWords(l.useBy) : null }))}
      plans={[
        ...plans.rows.map((r) => ({
          deviceId: r.deviceId,
          analyte: r.analyte,
          state: "signed" as const,
        })),
        ...plans.drafts.map((d) => ({
          deviceId: d.key.split(":")[0]!,
          analyte: d.analyte,
          state: "draft" as const,
        })),
      ]}
      policySigned={
        plans.policy
          ? { runs: plans.policy.minRunsForTarget, days: plans.policy.minDaysForTarget }
          : null
      }
      initialAnalyser={device}
    />
  );
}
