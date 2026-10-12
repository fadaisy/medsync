import "server-only";

import type { FixedComponent } from "@/components/emr/results/model";
import type { EmrDb } from "@/lib/emr/db";
import { eq } from "drizzle-orm";

import { db as appDb } from "@/db";
import { specimens } from "@/db/schema/emr";
import { encounterOrders } from "@/db/schema/encounter";
import { labResultSnapshots, ucumUnits } from "@/db/schema/lab-safety";
import { clinicalObservations } from "@/db/schema/nurse-workspace";
import { conceptDef } from "@/lib/facts/project/shared";
import { limitFor } from "./flags";
import { limitVersions } from "./limits";
import { resolveRange } from "./ranges";
import { currentMeasures, patientSexAge, rangeVersions } from "./units";

/**
 * The entry screen's fixed facts per component (Lab Phase 1 §5.1): the catalogue unit and its words,
 * decimals, entry check, and the range resolved for this patient at collection (RR-1, RR-4). The
 * write resolves it again on save; this is what the technologist sees while typing.
 */
export async function fixedForOrder(
  hospitalId: string,
  orderId: string,
  patientUserId: string,
  canFix: boolean,
  database: EmrDb = appDb as unknown as EmrDb,
  /** A released report: show each value as its snapshot holds it. */
  reportId?: string,
  /** Step 6: also resolve the signed critical limit (LAB_CRITICALS live). */
  withLimits = false,
): Promise<Record<string, FixedComponent>> {
  return database.transaction(async (tx) => {
    if (reportId) {
      const rows = await tx
        .select({ conceptId: clinicalObservations.conceptId, s: labResultSnapshots })
        .from(labResultSnapshots)
        .innerJoin(
          clinicalObservations,
          eq(clinicalObservations.id, labResultSnapshots.observationId),
        )
        .where(eq(labResultSnapshots.reportId, reportId));
      const units = await tx.select().from(ucumUnits);
      const words = new Map(units.map((u) => [u.code, u.words]));
      return Object.fromEntries(
        rows
          .filter((r) => r.conceptId)
          .map((r) => [
            r.conceptId!,
            {
              unitUcum: r.s.unitUcum,
              unitDisplay: r.s.unitDisplay,
              unitWords: words.get(r.s.unitUcum) ?? null,
              decimals: null,
              entryLow: null,
              entryHigh: null,
              range: {
                state: r.s.rangeState as FixedComponent["range"]["state"],
                low: r.s.rangeLow,
                high: r.s.rangeHigh,
              },
              canFix,
              released: {
                flagFinal: r.s.flagFinal as "low" | "high" | "normal" | null,
                reason: r.s.flagChangeReason,
              },
            } satisfies FixedComponent,
          ]),
      );
    }
    const [order] = await tx
      .select({ testId: encounterOrders.testId })
      .from(encounterOrders)
      .where(eq(encounterOrders.id, orderId));
    if (!order?.testId) return {};
    const [sp] = await tx
      .select({ collectedAt: specimens.collectedAt })
      .from(specimens)
      .where(eq(specimens.orderId, orderId))
      .limit(1);
    const at = sp?.collectedAt ?? new Date();
    const [measures, versions, who, units, limits] = await Promise.all([
      currentMeasures(tx, hospitalId, order.testId),
      rangeVersions(tx, hospitalId, order.testId),
      patientSexAge(tx, patientUserId, at),
      tx.select().from(ucumUnits),
      withLimits ? limitVersions(tx, hospitalId) : Promise.resolve(null),
    ]);
    const words = new Map(units.map((u) => [u.code, u.words]));
    const out: Record<string, FixedComponent> = {};
    const [test] = await tx.query.testCatalogue.findMany({
      where: (t, { eq: e }) => e(t.id, order.testId!),
      limit: 1,
    });
    for (const conceptId of test?.components ?? []) {
      if (conceptDef(conceptId)?.valueType !== "quantity") continue;
      const m = measures.get(conceptId);
      const unit = m?.resultType === "number" ? m.unitUcum : null;
      const r = unit
        ? resolveRange(
            {
              measure: { testId: order.testId, conceptId, resultType: "number", unitUcum: unit },
              hospitalId,
              sex: who.sex,
              ageDaysAtCollection: who.ageDays,
              at,
            },
            versions,
          )
        : null;
      out[conceptId] = {
        unitUcum: unit,
        unitDisplay: m?.unitDisplay ?? null,
        unitWords: unit ? (words.get(unit) ?? null) : null,
        decimals: m?.decimalPlaces ?? null,
        entryLow: m?.entryCheckLow ?? null,
        entryHigh: m?.entryCheckHigh ?? null,
        range:
          r?.kind === "band"
            ? { state: "signed", low: r.band.low, high: r.band.high }
            : {
                state:
                  r && r.kind === "none" && r.reason !== "not_numeric" && !r.conflict
                    ? r.reason
                    : "no_signed_range",
                low: null,
                high: null,
              },
        canFix,
        ...(limits && unit
          ? (() => {
              const l = limitFor(
                {
                  resultType: "number",
                  testId: order.testId!,
                  conceptId,
                  unitUcum: unit,
                  hospitalId,
                  ageDays: who.ageDays,
                  at,
                },
                limits,
              );
              return {
                limit:
                  l.kind === "limit"
                    ? { low: l.limit.low, high: l.limit.high }
                    : {
                        none:
                          l.reason === "not_numeric" ? ("no_limit_for_test" as const) : l.reason,
                      },
              };
            })()
          : {}),
      };
    }
    return out;
  });
}
