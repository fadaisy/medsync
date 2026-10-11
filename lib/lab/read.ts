import "server-only";

import type { Target } from "./turnaround";
import type { LabStage, WorklistInput } from "./worklist";
import type { EmrDb } from "@/lib/emr/db";
import { and, desc, eq, gte, inArray, isNull, max, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { loadEmrLabWorklist } from "@/app/lab/_lib/emr";
import { db as appDb } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { diagnosticReports, specimenEvents, specimens, testCatalogue } from "@/db/schema/emr";
import { encounterOrders } from "@/db/schema/encounter";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { cadres } from "@/db/schema/reference-data";
import { encounters } from "@/db/schema/scheduling";
import { diagnosticOfferings } from "@/db/schema/services-hub";
import { startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { releasedTurnaround, targetFor } from "./turnaround";

/**
 * Lab Phase 0 reads (ADR 0224). Each takes the hospital and a database (the app's by default, a
 * PGlite one in tests) and runs a fixed number of round trips whatever the row count. Hospital
 * scope is in every query. Patient identities are revealed by the page through identitiesFor, once
 * per page load (LW-11), so nothing here touches names.
 */

const STAGE: Record<string, LabStage> = {
  awaiting_receipt: "to_receive",
  received: "to_result",
  preliminary: "preliminary",
};
const parent = alias(hospitalDepartments, "lab_parent");
const fromDept = alias(hospitalDepartments, "from_dept");
const defaultDb = () => appDb as unknown as EmrDb;

/** The hospital's lab sections: live, unarchived units of its LABORATORY department. */
export async function loadLabSections(hospitalId: string, database: EmrDb = defaultDb()) {
  return database
    .select({ id: hospitalDepartments.id, name: hospitalDepartments.name })
    .from(hospitalDepartments)
    .innerJoin(parent, eq(parent.id, hospitalDepartments.parentId))
    .where(
      and(
        eq(hospitalDepartments.hospitalId, hospitalId),
        eq(parent.catalogueCode, "LABORATORY"),
        isNull(hospitalDepartments.archivedAt),
      ),
    )
    .orderBy(hospitalDepartments.name);
}

interface Sources {
  /** order id → its LOINC code and the ordering department. */
  orders: Map<string, { loinc: string | null; from: { id: string; name: string } | null }>;
  /** LOINC code → the hub offering's section and stated turnaround. */
  offerings: Map<string, { sectionId: string | null; statedTat: string | null }>;
  /** test id → the catalogue's target minutes. */
  catalogue: Map<string, number | null>;
}

/** Two or three round trips: orders + departments, catalogue, then offerings if any LOINC code. */
async function loadSources(
  database: EmrDb,
  hospitalId: string,
  orderIds: string[],
  testIds: string[],
): Promise<Sources> {
  const [orderRows, catalogueRows] = await Promise.all([
    orderIds.length
      ? database
          .select({
            id: encounterOrders.id,
            loinc: encounterOrders.loincCode,
            fromId: fromDept.id,
            fromName: fromDept.name,
          })
          .from(encounterOrders)
          .innerJoin(encounters, eq(encounters.id, encounterOrders.encounterId))
          .leftJoin(fromDept, eq(fromDept.id, encounters.departmentId))
          .where(
            and(eq(encounterOrders.hospitalId, hospitalId), inArray(encounterOrders.id, orderIds)),
          )
      : Promise.resolve([]),
    testIds.length
      ? database
          .select({ id: testCatalogue.id, minutes: testCatalogue.turnaroundTargetMinutes })
          .from(testCatalogue)
          .where(inArray(testCatalogue.id, testIds))
      : Promise.resolve([]),
  ]);
  const loincs = [...new Set(orderRows.map((r) => r.loinc).filter((c): c is string => !!c))];
  const offeringRows = loincs.length
    ? await database
        .select({
          code: diagnosticOfferings.code,
          sectionId: diagnosticOfferings.sectionId,
          statedTat: diagnosticOfferings.statedTat,
        })
        .from(diagnosticOfferings)
        .where(
          and(
            eq(diagnosticOfferings.hospitalId, hospitalId),
            eq(diagnosticOfferings.kind, "lab"),
            inArray(diagnosticOfferings.code, loincs),
          ),
        )
    : [];
  return {
    orders: new Map(
      orderRows.map((r) => [
        r.id,
        {
          loinc: r.loinc,
          from: r.fromId && r.fromName ? { id: r.fromId, name: r.fromName } : null,
        },
      ]),
    ),
    offerings: new Map(
      offeringRows.map((o) => [o.code, { sectionId: o.sectionId, statedTat: o.statedTat }]),
    ),
    catalogue: new Map(catalogueRows.map((c) => [c.id, c.minutes])),
  };
}

function targetFrom(sources: Sources, orderId: string, testId: string | null): Target | null {
  const loinc = sources.orders.get(orderId)?.loinc;
  const offering = loinc ? sources.offerings.get(loinc) : undefined;
  return targetFor(
    offering?.statedTat ?? null,
    testId ? (sources.catalogue.get(testId) ?? null) : null,
  );
}

/** When each specimen was collected and, if it was, received (one round trip). */
async function specimenTimes(database: EmrDb, specimenIds: string[]) {
  if (specimenIds.length === 0)
    return new Map<string, { collectedAt: Date; receivedAt: Date | null }>();
  const rows = await database
    .select({
      id: specimens.id,
      collectedAt: specimens.collectedAt,
      receivedAt: max(specimenEvents.recordedAt),
    })
    .from(specimens)
    .leftJoin(
      specimenEvents,
      and(eq(specimenEvents.specimenId, specimens.id), eq(specimenEvents.kind, "received")),
    )
    .where(inArray(specimens.id, specimenIds))
    .groupBy(specimens.id, specimens.collectedAt);
  return new Map(rows.map((r) => [r.id, { collectedAt: r.collectedAt, receivedAt: r.receivedAt }]));
}

/* ─── The worklist ────────────────────────────────────────────────── */

export interface LabWorklistData {
  inputs: WorklistInput[];
  sections: { id: string; name: string }[];
  /** Restricted orders, for the mark beside the test (never the reason). */
  restricted: Set<string>;
}

export async function loadLabWorklist(
  hospitalId: string,
  database: EmrDb = defaultDb(),
): Promise<LabWorklistData> {
  const [base, sections] = await Promise.all([
    loadEmrLabWorklist(hospitalId, database),
    loadLabSections(hospitalId, database),
  ]);
  const orderIds = base.map((b) => b.orderId);
  const testIds = [...new Set(base.map((b) => b.testId).filter((t): t is string => !!t))];
  const specimenIds = base.map((b) => b.specimenId).filter((s): s is string => !!s);
  const [sources, times] = await Promise.all([
    loadSources(database, hospitalId, orderIds, testIds),
    specimenTimes(database, specimenIds),
  ]);
  const inputs: WorklistInput[] = [];
  for (const b of base) {
    const time = b.specimenId ? times.get(b.specimenId) : undefined;
    const stage = STAGE[b.stage];
    // A row with no specimen time cannot be on the lab's list; the loader only returns ones with.
    if (!time || !stage) continue;
    const order = sources.orders.get(b.orderId);
    const offering = order?.loinc ? sources.offerings.get(order.loinc) : undefined;
    inputs.push({
      orderId: b.orderId,
      hospitalId,
      patientUserId: b.patientUserId,
      testId: b.testId,
      test: b.test,
      priority: b.priority,
      stage,
      specimenId: b.specimenId,
      reportId: b.reportId,
      collectedAt: time.collectedAt,
      // A specimen is "received" by its stage; the event time starts the clock.
      receivedAt: stage === "to_receive" ? null : time.receivedAt,
      from: order?.from ?? null,
      offeringSectionId: offering?.sectionId ?? null,
      // E-LAB0-04: the catalogue has no section column yet (one test menu, HARMONISATION §9).
      catalogueSectionId: null,
      statedTat: offering?.statedTat ?? null,
      catalogueTargetMinutes: b.testId ? (sources.catalogue.get(b.testId) ?? null) : null,
    });
  }
  const restricted = new Set(
    base.filter((b) => b.sensitivity === "restricted").map((b) => b.orderId),
  );
  return { inputs, sections, restricted };
}

/* ─── Released today ──────────────────────────────────────────────── */

export interface ReleasedRow {
  orderId: string;
  patientUserId: string;
  test: string;
  releasedAt: Date;
  releasedByCadre: string | null;
  turnaround: { minutes: number; lateBy: number | null } | null;
  target: Target | null;
  state: "final" | "amended";
}

/** Final reports released since 00:00 at the hospital, newest first (§5.5). */
export async function loadReleasedToday(
  hospitalId: string,
  serverNow: Date,
  timeZone: string,
  database: EmrDb = defaultDb(),
): Promise<ReleasedRow[]> {
  const since = startOfLocalDay(serverNow, timeZone);
  const finals = await database
    .select({
      logicalId: diagnosticReports.logicalId,
      orderId: diagnosticReports.orderId,
      specimenId: diagnosticReports.specimenId,
      patientUserId: diagnosticReports.patientUserId,
      testId: diagnosticReports.testId,
      releasedAt: diagnosticReports.recordedAt,
      verifier: diagnosticReports.verifiedByUserId,
      test: encounterOrders.text,
    })
    .from(diagnosticReports)
    .innerJoin(encounterOrders, eq(encounterOrders.id, diagnosticReports.orderId))
    .where(
      and(
        eq(diagnosticReports.hospitalId, hospitalId),
        eq(diagnosticReports.status, "final"),
        eq(encounterOrders.kind, "lab"),
        gte(diagnosticReports.recordedAt, since),
      ),
    )
    .orderBy(desc(diagnosticReports.recordedAt));
  if (finals.length === 0) return [];
  const orderIds = finals.map((f) => f.orderId).filter((o): o is string => !!o);
  const testIds = [...new Set(finals.map((f) => f.testId).filter((t): t is string => !!t))];
  const verifiers = [...new Set(finals.map((f) => f.verifier).filter((v): v is string => !!v))];
  const specimenIds = finals.map((f) => f.specimenId).filter((s): s is string => !!s);
  const [sources, times, latest, cadreRows] = await Promise.all([
    loadSources(database, hospitalId, orderIds, testIds),
    specimenTimes(database, specimenIds),
    database
      .select({ logicalId: diagnosticReports.logicalId, status: diagnosticReports.status })
      .from(diagnosticReports)
      .where(
        and(
          eq(diagnosticReports.hospitalId, hospitalId),
          inArray(
            diagnosticReports.logicalId,
            finals.map((f) => f.logicalId),
          ),
        ),
      )
      .orderBy(desc(diagnosticReports.version)),
    verifiers.length
      ? database
          .select({ userId: staffAffiliations.userId, cadre: cadres.name })
          .from(staffAffiliations)
          .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
          .where(
            and(
              eq(staffAffiliations.hospitalId, hospitalId),
              inArray(staffAffiliations.userId, verifiers),
            ),
          )
      : Promise.resolve([]),
  ]);
  const newest = new Map<string, string>();
  for (const r of latest) if (!newest.has(r.logicalId)) newest.set(r.logicalId, r.status);
  const cadreOf = new Map(cadreRows.map((c) => [c.userId, c.cadre]));
  return finals.map((f) => {
    const target = f.orderId ? targetFrom(sources, f.orderId, f.testId) : null;
    const receivedAt = f.specimenId ? (times.get(f.specimenId)?.receivedAt ?? null) : null;
    const status = newest.get(f.logicalId);
    return {
      orderId: f.orderId ?? "",
      patientUserId: f.patientUserId,
      test: f.test,
      releasedAt: f.releasedAt,
      releasedByCadre: f.verifier ? (cadreOf.get(f.verifier) ?? null) : null,
      turnaround: releasedTurnaround(receivedAt, f.releasedAt, target),
      target,
      state: status === "amended" || status === "corrected" ? "amended" : "final",
    };
  });
}

/* ─── Rejected, last 7 days ───────────────────────────────────────── */

export interface RejectedRow {
  orderId: string;
  patientUserId: string;
  test: string;
  rejectedAt: Date;
  rejectedByCadre: string | null;
  reasonCode: string | null;
  recollectedAt: Date | null;
}

export async function loadRejected(
  hospitalId: string,
  serverNow: Date,
  database: EmrDb = defaultDb(),
): Promise<RejectedRow[]> {
  const since = new Date(serverNow.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rows = await database
    .select({
      orderId: specimens.orderId,
      specimenId: specimens.id,
      patientUserId: specimenEvents.patientUserId,
      test: encounterOrders.text,
      rejectedAt: specimenEvents.recordedAt,
      cadreCode: specimenEvents.actorCadre,
      reasonCode: specimenEvents.reasonCode,
    })
    .from(specimenEvents)
    .innerJoin(specimens, eq(specimens.id, specimenEvents.specimenId))
    .innerJoin(encounterOrders, eq(encounterOrders.id, specimens.orderId))
    .where(
      and(
        eq(specimenEvents.hospitalId, hospitalId),
        eq(specimenEvents.kind, "rejected"),
        eq(encounterOrders.kind, "lab"),
        gte(specimenEvents.recordedAt, since),
      ),
    )
    .orderBy(desc(specimenEvents.recordedAt));
  if (rows.length === 0) return [];
  const orderIds = [...new Set(rows.map((r) => r.orderId))];
  const codes = [...new Set(rows.map((r) => r.cadreCode))];
  const [later, cadreRows] = await Promise.all([
    database
      .select({ orderId: specimens.orderId, collectedAt: specimens.collectedAt })
      .from(specimens)
      .where(and(eq(specimens.hospitalId, hospitalId), inArray(specimens.orderId, orderIds))),
    database
      .select({ code: cadres.code, name: cadres.name })
      .from(cadres)
      .where(inArray(cadres.code, codes)),
  ]);
  const cadreName = new Map(cadreRows.map((c) => [c.code, c.name]));
  return rows.map((r) => {
    // Re-collected: the order's first specimen collected after this rejection.
    const next = later
      .filter((s) => s.orderId === r.orderId && s.collectedAt > r.rejectedAt)
      .sort((a, b) => a.collectedAt.getTime() - b.collectedAt.getTime())[0];
    return {
      orderId: r.orderId,
      patientUserId: r.patientUserId,
      test: r.test,
      rejectedAt: r.rejectedAt,
      rejectedByCadre: cadreName.get(r.cadreCode) ?? null,
      reasonCode: r.reasonCode,
      recollectedAt: next?.collectedAt ?? null,
    };
  });
}

/* ─── The specimen a result screen may reject ─────────────────────── */

/**
 * The order's newest specimen, if the lab may still reject it: no rejection on it and no released
 * report on the order (one round trip). Rejection moved from the worklist row to the result screen
 * so each row keeps one control (§4 budget); the action and its reasons are unchanged.
 */
export async function loadRejectableSpecimen(
  hospitalId: string,
  orderId: string,
  database: EmrDb = defaultDb(),
): Promise<string | null> {
  // The query builder qualifies every column, so each subquery is correlated to its own specimen.
  const [row] = await database
    .select({ id: specimens.id })
    .from(specimens)
    .where(
      and(
        eq(specimens.hospitalId, hospitalId),
        eq(specimens.orderId, orderId),
        notExists(
          database
            .select({ one: sql`1` })
            .from(specimenEvents)
            .where(
              and(eq(specimenEvents.specimenId, specimens.id), eq(specimenEvents.kind, "rejected")),
            ),
        ),
        notExists(
          database
            .select({ one: sql`1` })
            .from(diagnosticReports)
            .where(
              and(
                eq(diagnosticReports.orderId, specimens.orderId),
                inArray(diagnosticReports.status, ["final", "amended", "corrected"]),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(specimens.recordedAt))
    .limit(1);
  return row?.id ?? null;
}
