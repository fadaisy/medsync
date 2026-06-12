import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { encounterOrders, encounterResults } from "@/db/schema/encounter";

/**
 * Investigations ordered on an encounter + their results (W4 — pending /
 * results-callback visibility). Read-only over the existing encounter spine
 * (orders are written when a clerkship is finalised; results land via the
 * later results-entry seam). Honest states: ordered/collected = awaiting,
 * resulted = the value is shown, cancelled = struck. No new schema.
 */
export interface EncounterOrderRow {
  id: string;
  kind: string;
  text: string;
  loincCode: string | null;
  justification: string | null;
  status: "ordered" | "collected" | "resulted" | "cancelled" | string;
  createdAt: Date;
  result: {
    value: string;
    unit: string | null;
    abnormalFlag: string | null;
    resultedAt: Date;
  } | null;
}

export async function loadEncounterOrders(encounterId: string): Promise<EncounterOrderRow[]> {
  const rows = await db
    .select({
      id: encounterOrders.id,
      kind: encounterOrders.kind,
      text: encounterOrders.text,
      loincCode: encounterOrders.loincCode,
      justification: encounterOrders.justification,
      status: encounterOrders.status,
      createdAt: encounterOrders.createdAt,
      rValue: encounterResults.value,
      rUnit: encounterResults.unit,
      rFlag: encounterResults.abnormalFlag,
      rAt: encounterResults.resultedAt,
    })
    .from(encounterOrders)
    .leftJoin(encounterResults, eq(encounterResults.orderId, encounterOrders.id))
    .where(eq(encounterOrders.encounterId, encounterId))
    .orderBy(desc(encounterOrders.createdAt));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    text: r.text,
    loincCode: r.loincCode,
    justification: r.justification,
    status: r.status,
    createdAt: r.createdAt,
    result:
      r.rValue != null && r.rAt != null
        ? { value: r.rValue, unit: r.rUnit, abnormalFlag: r.rFlag, resultedAt: r.rAt }
        : null,
  }));
}
