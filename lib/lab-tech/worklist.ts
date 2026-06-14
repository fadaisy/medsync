import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { encounterOrders, encounterResults } from "@/db/schema/encounter";
import { encounters } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";

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
}

/** Orders awaiting the lab — the statuses that belong on the incoming worklist. */
const INCOMING_STATUSES = ["ordered", "collected"] as const;

/**
 * Load the incoming worklist for a lab's hospital (oldest first — priority by age).
 * Service-role read; the caller (the /lab route) is already lab-scoped + MFA-gated.
 */
export async function loadLabWorklist(hospitalId: string): Promise<LabWorklistItem[]> {
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

  return rows.map((r) => ({
    orderId: r.orderId,
    encounterId: r.encounterId,
    patientUserId: r.patientUserId,
    patientName: r.patientName,
    test: r.test,
    kind: r.kind,
    loincCode: r.loincCode,
    status: r.status,
    orderedAt: r.orderedAt,
    hasResult: r.resultId != null,
  }));
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
