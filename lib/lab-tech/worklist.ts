import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { encounterOrders, encounterResults } from "@/db/schema/encounter";
import { encounters } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { labResultsLive } from "@/lib/encounter/feature";

/**
 * The lab incoming worklist — the READ side of the orders-out → results-in pipe.
 * Reads `encounterOrders` (what clinicians ordered) for this lab's hospital,
 * sharing the ONE data contract with the ordering UI — it does NOT fork a parallel
 * orders store. First pass is read-only (accept / specimen / result-entry +
 * verify-release land in the write-side slice with the GATED columns + Edge fn).
 *
 * Honest status: only the orders awaiting the lab (ordered / collected) are
 * surfaced; a resulted/cancelled order leaves the worklist. `hasResult` reflects
 * the real results join — never inferred.
 */

export interface LabWorklistItem {
  orderId: string;
  encounterId: string;
  patientUserId: string;
  patientName: string | null;
  test: string;
  kind: string;
  loincCode: string | null;
  /** The order's current pipe status (ordered | collected). */
  status: string;
  orderedAt: Date;
  /** Whether a result row already exists (read from the real results table). */
  hasResult: boolean;
  /** Lab workflow (gated): the entered/rejected result on this order, if any. */
  resultId?: string;
  resultStatus?: "entered" | "released" | "rejected";
  resultValue?: string;
  resultUnit?: string | null;
}

/** Orders awaiting the lab — the statuses that belong on the incoming worklist. */
const INCOMING_STATUSES = ["ordered", "collected"] as const;

/**
 * Load the incoming worklist for a lab's hospital (oldest first — priority by age).
 * Service-role read; the caller (the /lab route) is already lab-scoped + MFA-gated.
 */
export async function loadLabWorklist(hospitalId: string): Promise<LabWorklistItem[]> {
  // Gated: include the entered result's quality/value (a 0050 column) only when
  // the lab workflow is live — keeps the read safe before migration 0050.
  const live = labResultsLive();
  const rows = await db
    .select({
      orderId: encounterOrders.id,
      encounterId: encounterOrders.encounterId,
      patientUserId: encounterOrders.patientUserId,
      patientName: users.fullName,
      test: encounterOrders.text,
      kind: encounterOrders.kind,
      loincCode: encounterOrders.loincCode,
      status: encounterOrders.status,
      orderedAt: encounterOrders.createdAt,
      resultId: encounterResults.id,
      ...(live
        ? {
            resultStatus: encounterResults.qualityStatus,
            resultValue: encounterResults.value,
            resultUnit: encounterResults.unit,
          }
        : {}),
    })
    .from(encounterOrders)
    .innerJoin(encounters, eq(encounters.id, encounterOrders.encounterId))
    .leftJoin(users, eq(users.id, encounterOrders.patientUserId))
    .leftJoin(encounterResults, eq(encounterResults.orderId, encounterOrders.id))
    .where(
      and(
        eq(encounters.hospitalId, hospitalId),
        inArray(encounterOrders.status, INCOMING_STATUSES as unknown as string[]),
      ),
    )
    .orderBy(asc(encounterOrders.createdAt));

  // Collapse the 1:N orders→results join to one item per order, preferring the
  // row that carries a result (defensive: 0051's unique index guarantees one
  // result row per order, but never list an order twice if a stray exists).
  const byOrder = new Map<string, LabWorklistItem>();
  for (const r of rows) {
    const row = r as (typeof rows)[number] & {
      resultStatus?: string | null;
      resultValue?: string | null;
      resultUnit?: string | null;
    };
    const existing = byOrder.get(row.orderId);
    if (existing && (existing.resultId != null || row.resultId == null)) continue;
    byOrder.set(row.orderId, {
      orderId: row.orderId,
      encounterId: row.encounterId,
      patientUserId: row.patientUserId,
      patientName: row.patientName,
      test: row.test,
      kind: row.kind,
      loincCode: row.loincCode,
      status: row.status,
      orderedAt: row.orderedAt,
      hasResult: row.resultId != null,
      resultId: row.resultId ?? undefined,
      resultStatus: (row.resultStatus ?? undefined) as LabWorklistItem["resultStatus"],
      resultValue: row.resultValue ?? undefined,
      resultUnit: row.resultUnit ?? undefined,
    });
  }
  return [...byOrder.values()];
}

/** A compact, honest summary of the worklist (for the header). Pure. */
export function summariseWorklist(items: { status: string }[]): {
  total: number;
  ordered: number;
  collected: number;
} {
  return {
    total: items.length,
    ordered: items.filter((i) => i.status === "ordered").length,
    collected: items.filter((i) => i.status === "collected").length,
  };
}

/** Relative age of an order, for the worklist's priority-by-age display. Pure. */
export function worklistAgeLabel(orderedAt: Date, now: Date): string {
  const mins = Math.max(0, Math.floor((now.getTime() - orderedAt.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
