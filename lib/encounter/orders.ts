import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { encounterOrders, encounterResults } from "@/db/schema/encounter";
import { labResultsLive } from "@/lib/encounter/feature";

/**
 * Investigations ordered on an encounter + their results (W4 — pending /
 * results-callback visibility). Read-only over the existing encounter spine.
 * Honest states: ordered/collected = awaiting, resulted = the value is shown,
 * cancelled = struck.
 *
 * Release-aware (gated): when the lab workflow is live a result is only shown to
 * the clinician once a lab tech DELIBERATELY releases it — an entered-but-
 * unreleased result reads as "in lab" (pending), a rejected one as "recollect".
 * When the workflow is OFF (or migration 0050 un-applied) the legacy path runs
 * and selects ONLY pre-0050 columns, so it is safe un-migrated.
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
  /** Lab workflow (gated): an entered-but-unreleased result exists (in lab). */
  resultPending?: boolean;
  /** Lab workflow (gated): the latest result was rejected (recollect). */
  resultRejected?: boolean;
}

export async function loadEncounterOrders(encounterId: string): Promise<EncounterOrderRow[]> {
  return labResultsLive() ? loadReleaseAware(encounterId) : loadLegacy(encounterId);
}

/** Pre-0050 read — selects only legacy columns; safe before the migration. */
async function loadLegacy(encounterId: string): Promise<EncounterOrderRow[]> {
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

  // Collapse the 1:N orders→results join to one row per order, keeping the
  // latest result (defensive: a unique index guarantees one result row per order
  // once 0051 is applied, but never double-render an order if a stray exists).
  const byOrder = new Map<string, EncounterOrderRow>();
  for (const r of rows) {
    let row = byOrder.get(r.id);
    if (!row) {
      row = {
        id: r.id,
        kind: r.kind,
        text: r.text,
        loincCode: r.loincCode,
        justification: r.justification,
        status: r.status,
        createdAt: r.createdAt,
        result: null,
      };
      byOrder.set(r.id, row);
    }
    if (r.rValue != null && r.rAt != null) {
      if (!row.result || r.rAt > row.result.resultedAt) {
        row.result = { value: r.rValue, unit: r.rUnit, abnormalFlag: r.rFlag, resultedAt: r.rAt };
      }
    }
  }
  return [...byOrder.values()];
}

/** Lab-workflow read — only RELEASED (or legacy null-quality) results show. */
async function loadReleaseAware(encounterId: string): Promise<EncounterOrderRow[]> {
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
      rQuality: encounterResults.qualityStatus,
      rReleasedAt: encounterResults.releasedAt,
    })
    .from(encounterOrders)
    .leftJoin(encounterResults, eq(encounterResults.orderId, encounterOrders.id))
    .where(eq(encounterOrders.encounterId, encounterId))
    .orderBy(desc(encounterOrders.createdAt));

  // Collapse the 1:N join to one row per order. A released result wins (shown as
  // final); else an entered result reads as pending; else a rejected one as
  // recollect. Defensive against any stray duplicate (0051 makes it impossible).
  const byOrder = new Map<string, EncounterOrderRow>();
  for (const r of rows) {
    let row = byOrder.get(r.id);
    if (!row) {
      row = {
        id: r.id,
        kind: r.kind,
        text: r.text,
        loincCode: r.loincCode,
        justification: r.justification,
        status: r.status,
        createdAt: r.createdAt,
        result: null,
        resultPending: false,
        resultRejected: false,
      };
      byOrder.set(r.id, row);
    }
    // A legacy result (no qualityStatus, pre-workflow) counts as final; otherwise
    // only a released result is shown to the clinician.
    const released = r.rReleasedAt != null || (r.rQuality == null && r.rValue != null);
    if (released && r.rValue != null && r.rAt != null) {
      if (!row.result || r.rAt > row.result.resultedAt) {
        row.result = { value: r.rValue, unit: r.rUnit, abnormalFlag: r.rFlag, resultedAt: r.rAt };
      }
    }
    if (r.rQuality === "entered") row.resultPending = true;
    if (r.rQuality === "rejected") row.resultRejected = true;
  }
  // A released (final) result supersedes the pending/recollect hints.
  return [...byOrder.values()].map((row) =>
    row.result ? { ...row, resultPending: false, resultRejected: false } : row,
  );
}
