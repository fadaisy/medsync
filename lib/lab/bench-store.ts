import "server-only";

import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { conditions, diagnosisTerms, labLabels, specimenEvents, specimens } from "@/db/schema";
import { encounterOrders } from "@/db/schema/encounter";
import { users } from "@/db/schema/users";
import { decrypt } from "@/lib/encryption";
import { highRiskFor } from "./collection-store";

/**
 * The bench (Lab Phase 2 §6.9, §6.11; SR-*, CX-*; ADRs 0257, 0258): what a scanned label is at this hospital,
 * and the working diagnosis revealed on demand. Reads as the owner, scoped to the actor's hospital in every
 * query: another hospital's label is simply not found (SR-2, no disclosure).
 */

export interface LabelLookup {
  labelNo: string;
  voided: boolean;
  orderId: string;
  encounterId: string;
  patientUserId: string;
  test: string;
  restricted: boolean;
  specimenId: string | null;
  lastEvent: { id: string; kind: string; at: Date; cadre: string } | null;
  highRisk: boolean;
}

export async function lookupLabel(
  tx: EmrTx,
  hospitalId: string,
  labelNo: string,
): Promise<LabelLookup | null> {
  const [l] = await tx
    .select({
      labelNo: labLabels.labelNo,
      voidedAt: labLabels.voidedAt,
      orderId: labLabels.orderId,
      patientUserId: labLabels.patientUserId,
      encounterId: encounterOrders.encounterId,
      test: encounterOrders.text,
      sensitivity: encounterOrders.sensitivity,
    })
    .from(labLabels)
    .innerJoin(encounterOrders, eq(encounterOrders.id, labLabels.orderId))
    .where(and(eq(labLabels.labelNo, labelNo), eq(labLabels.hospitalId, hospitalId)));
  if (!l) return null;
  const [sp] = await tx
    .select({ id: specimens.id })
    .from(specimens)
    .where(eq(specimens.orderId, l.orderId))
    .orderBy(desc(specimens.recordedAt))
    .limit(1);
  const [ev] = sp
    ? await tx
        .select({
          id: specimenEvents.id,
          kind: specimenEvents.kind,
          at: specimenEvents.recordedAt,
          cadre: specimenEvents.actorCadre,
        })
        .from(specimenEvents)
        .where(eq(specimenEvents.specimenId, sp.id))
        .orderBy(desc(specimenEvents.recordedAt))
        .limit(1)
    : [];
  const risk = await highRiskFor(tx, [l.encounterId]);
  return {
    labelNo: l.labelNo,
    voided: l.voidedAt !== null,
    orderId: l.orderId,
    encounterId: l.encounterId,
    patientUserId: l.patientUserId,
    test: l.test,
    restricted: l.sensitivity === "restricted",
    specimenId: sp?.id ?? null,
    lastEvent: ev ?? null,
    highRisk: risk.has(l.encounterId),
  };
}

/** "Find a specimen" (§5.5): by label number or order number at this hospital. */
export async function findSpecimens(tx: EmrTx, hospitalId: string, q: string) {
  const t = q.trim().toUpperCase();
  if (t.length < 3) return [];
  return tx
    .select({
      labelNo: labLabels.labelNo,
      orderId: labLabels.orderId,
      patientUserId: labLabels.patientUserId,
      test: encounterOrders.text,
      voidedAt: labLabels.voidedAt,
    })
    .from(labLabels)
    .innerJoin(encounterOrders, eq(encounterOrders.id, labLabels.orderId))
    .where(
      and(
        eq(labLabels.hospitalId, hospitalId),
        or(eq(labLabels.labelNo, t), sql`${encounterOrders.id}::text = ${q.trim().toLowerCase()}`),
      ),
    )
    .limit(20);
}

export type WorkingDiagnosis =
  | { kind: "none" }
  | { kind: "masked" }
  | { kind: "shown"; text: string; author: string | null; at: Date };

/**
 * CX-3, CX-4, CX-5: the encounter's current leading diagnosis, read now (never cached on the specimen). A
 * restricted diagnosis is shown only when the order itself is restricted (it shares the class: D-LAB2-07).
 */
export async function workingDiagnosis(
  tx: EmrTx,
  encounterId: string,
  orderRestricted: boolean,
): Promise<WorkingDiagnosis> {
  const rows = await tx
    .select({
      id: conditions.id,
      supersedesId: conditions.supersedesId,
      status: conditions.status,
      verification: conditions.verification,
      rank: conditions.rank,
      sensitivity: conditions.sensitivity,
      termId: conditions.termId,
      textCiphertext: conditions.textCiphertext,
      recordedAt: conditions.recordedAt,
      author: users.fullName,
    })
    .from(conditions)
    .leftJoin(users, eq(users.id, conditions.recordedByUserId))
    .where(
      and(eq(conditions.encounterId, encounterId), eq(conditions.category, "encounter_diagnosis")),
    );
  const superseded = new Set(rows.map((r) => r.supersedesId).filter(Boolean));
  const current = rows
    .filter(
      (r) =>
        !superseded.has(r.id) &&
        r.rank === "primary" &&
        r.status !== "entered_in_error" &&
        r.verification !== "refuted",
    )
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
  if (!current) return { kind: "none" };
  if (current.sensitivity === "restricted" && !orderRestricted) return { kind: "masked" };
  const [term] = current.termId
    ? await tx
        .select({ display: diagnosisTerms.display })
        .from(diagnosisTerms)
        .where(eq(diagnosisTerms.id, current.termId))
    : [];
  const text =
    term?.display ??
    (current.textCiphertext ? decrypt(current.textCiphertext) : "Diagnosis recorded");
  return { kind: "shown", text, author: current.author ?? null, at: current.recordedAt };
}

/** The live label of each order, for the worklist and Find (ID-1). */
export async function liveLabels(tx: EmrTx, orderIds: string[]) {
  if (!orderIds.length) return new Map<string, string>();
  const rows = await tx
    .select({ orderId: labLabels.orderId, labelNo: labLabels.labelNo })
    .from(labLabels)
    .where(and(inArray(labLabels.orderId, orderIds), isNull(labLabels.voidedAt)));
  return new Map(rows.map((r) => [r.orderId, r.labelNo]));
}
