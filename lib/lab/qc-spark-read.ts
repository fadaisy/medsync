import "server-only";

import type { Spark } from "./qc-spark";
import type { RunValue } from "./qc-store";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray } from "drizzle-orm";

import { labQcRuns, labSignedConfigs } from "@/db/schema";
import { SPARK_RUNS, sparkSeries } from "./qc-spark";

/**
 * Quality mini charts, read (Lab Workspace v2, prompt 6.4): for each QC plan row, the last ten runs (accepted,
 * warning or rejected: every recorded decision) as stored, and the number of levels of the plan in force.
 * Read only; one query per plan row (a hospital has tens of plans, not thousands).
 */
export async function loadQcSparks(
  tx: EmrTx,
  hospitalId: string,
  rows: readonly { configId: string; deviceId: string; conceptId: string }[],
): Promise<Map<string, { levels: number; spark: Spark }>> {
  if (!rows.length) return new Map();
  const [configs, ...runs] = await Promise.all([
    tx
      .select({ id: labSignedConfigs.id, payload: labSignedConfigs.payload })
      .from(labSignedConfigs)
      .where(
        and(
          eq(labSignedConfigs.hospitalId, hospitalId),
          inArray(
            labSignedConfigs.id,
            rows.map((r) => r.configId),
          ),
        ),
      ),
    ...rows.map((r) =>
      tx
        .select({ id: labQcRuns.id, at: labQcRuns.runAt, values: labQcRuns.values })
        .from(labQcRuns)
        .where(
          and(
            eq(labQcRuns.hospitalId, hospitalId),
            eq(labQcRuns.deviceId, r.deviceId),
            eq(labQcRuns.conceptId, r.conceptId),
          ),
        )
        .orderBy(desc(labQcRuns.runAt))
        .limit(SPARK_RUNS),
    ),
  ]);
  const levels = new Map(
    configs.map((c) => [c.id, ((c.payload as { levels?: unknown[] }).levels ?? []).length]),
  );
  return new Map(
    rows.map((r, i) => [
      r.configId,
      {
        levels: levels.get(r.configId) ?? 0,
        spark: sparkSeries(
          (runs[i] ?? []).map((x) => ({ id: x.id, at: x.at, values: x.values as RunValue[] })),
        ),
      },
    ]),
  );
}
