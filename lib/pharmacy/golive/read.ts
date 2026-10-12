import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { ReadinessFacts, SignedSetKind } from "@/lib/pharmacy/readiness";
import type { PharmacyPoint } from "@/lib/pharmacy/write";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";

import { HAZARD_LOG_SIGNATURE } from "@/content/pharmacy-golive";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { downtimeDrills } from "@/db/schema/lab-safety";
import { pharmacyDispensingPoints } from "@/db/schema/pharmacy";
import {
  pharmacyBriefings,
  pharmacyCounts,
  pharmacyGolive,
  pharmacyHospitalSettings,
  pharmacyLegalAnswers,
  pharmacyPilotNotes,
  pharmacyProductPoints,
  pharmacyProducts,
  pharmacySignedSets,
} from "@/db/schema/pharmacy-dispensing";
import { cadres } from "@/db/schema/reference-data";
import { departmentHeads } from "@/db/schema/services-hub";
import { PHARMACY_MAP_V2 } from "@/lib/pharmacy/access";
import { pharmacyReadiness } from "@/lib/pharmacy/readiness";
import { countedProductsAt, openingCountMissing } from "@/lib/pharmacy/stock/read";
import { loadPoint } from "@/lib/pharmacy/write";

/**
 * Going live at a dispensing point, read (Pharmacy Phase 1, 5.13, RD-1 to RD-5). The hospital admin
 * is not pharmacy staff, so these facts are read as the owner, every query scoped to the hospital and
 * the point. Nothing here names a patient: the page carries no PHI (5.13).
 */

/** The role a signed set's second signer carries when a registered pharmacist co-signed it (RD-1). */
export const PHARMACIST_REVIEWER_ROLE = "pharmacist reviewer";

const isoDate = (d: string | Date) => (typeof d === "string" ? d : d.toISOString().slice(0, 10));

export interface GoLiveFacts {
  facts: ReadinessFacts;
  /** Who wrote each pilot note on an earlier point (RD-5 compares them with the requester). */
  pilotNoteWriters: string[];
  /** The earliest other point that has been live: the one a pilot note is about. */
  firstLivePointId: string | null;
}

/** RD-1's facts for one point, as they stand now. */
export async function goLiveFactsFor(
  tx: EmrTx,
  hospitalId: string,
  pointId: string,
  now: Date,
): Promise<GoLiveFacts> {
  const [
    signed,
    [settings],
    products,
    counts,
    legal,
    [drill],
    briefings,
    heads,
    [point],
    otherLive,
  ] = await Promise.all([
    tx
      .select({
        kind: pharmacySignedSets.kind,
        content: pharmacySignedSets.content,
        secondSignerRole: pharmacySignedSets.secondSignerRole,
      })
      .from(pharmacySignedSets)
      .where(
        and(eq(pharmacySignedSets.hospitalId, hospitalId), eq(pharmacySignedSets.status, "signed")),
      ),
    tx
      .select()
      .from(pharmacyHospitalSettings)
      .where(eq(pharmacyHospitalSettings.hospitalId, hospitalId)),
    tx
      .select({
        productId: pharmacyProducts.id,
        name: pharmacyProducts.name,
        medicineId: pharmacyProducts.medicineId,
        since: pharmacyProductPoints.startedAt,
      })
      .from(pharmacyProductPoints)
      .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyProductPoints.productId))
      .where(
        and(
          eq(pharmacyProductPoints.dispensingPointId, pointId),
          eq(pharmacyProductPoints.hospitalId, hospitalId),
          eq(pharmacyProductPoints.active, true),
          eq(pharmacyProducts.active, true),
        ),
      )
      .orderBy(asc(pharmacyProducts.name)),
    tx
      .select({
        medicineId: pharmacyCounts.medicineId,
        scope: pharmacyCounts.scope,
        countedAt: pharmacyCounts.countedAt,
      })
      .from(pharmacyCounts)
      .where(eq(pharmacyCounts.dispensingPointId, pointId)),
    tx
      .select()
      .from(pharmacyLegalAnswers)
      .where(
        or(
          isNull(pharmacyLegalAnswers.hospitalId),
          eq(pharmacyLegalAnswers.hospitalId, hospitalId),
        ),
      )
      .orderBy(asc(pharmacyLegalAnswers.question), desc(pharmacyLegalAnswers.recordedAt)),
    tx
      .select({ heldOn: downtimeDrills.heldOn })
      .from(downtimeDrills)
      .where(
        and(
          eq(downtimeDrills.hospitalId, hospitalId),
          eq(downtimeDrills.workspace, "pharmacy"),
          eq(downtimeDrills.dispensingPointId, pointId),
        ),
      )
      .orderBy(desc(downtimeDrills.heldOn))
      .limit(1),
    tx
      .select({ audience: pharmacyBriefings.audience, heldOn: pharmacyBriefings.heldOn })
      .from(pharmacyBriefings)
      .where(
        and(
          eq(pharmacyBriefings.hospitalId, hospitalId),
          or(
            isNull(pharmacyBriefings.dispensingPointId),
            eq(pharmacyBriefings.dispensingPointId, pointId),
          ),
        ),
      )
      .orderBy(desc(pharmacyBriefings.heldOn)),
    // The in-charge: an open hub head assignment on this point, or on the Pharmacy department.
    tx
      .select({
        departmentId: departmentHeads.departmentId,
        cadreCode: cadres.code,
        cadreName: cadres.name,
      })
      .from(departmentHeads)
      .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, departmentHeads.departmentId))
      .innerJoin(
        staffAffiliations,
        and(
          eq(staffAffiliations.userId, departmentHeads.userId),
          eq(staffAffiliations.hospitalId, hospitalId),
          inArray(staffAffiliations.state, ["active", "approved"]),
        ),
      )
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(
        and(
          eq(departmentHeads.hospitalId, hospitalId),
          lte(departmentHeads.startsAt, now),
          or(isNull(departmentHeads.endsAt), gt(departmentHeads.endsAt, now)),
          or(
            eq(departmentHeads.departmentId, pointId),
            eq(hospitalDepartments.catalogueCode, "PHARMACY"),
          ),
        ),
      ),
    tx
      .select({ phone: pharmacyDispensingPoints.phone })
      .from(pharmacyDispensingPoints)
      .where(eq(pharmacyDispensingPoints.departmentId, pointId)),
    tx
      .select({
        id: pharmacyDispensingPoints.departmentId,
        liveAt: pharmacyDispensingPoints.liveAt,
      })
      .from(pharmacyDispensingPoints)
      .where(
        and(
          eq(pharmacyDispensingPoints.hospitalId, hospitalId),
          ne(pharmacyDispensingPoints.departmentId, pointId),
          isNotNull(pharmacyDispensingPoints.liveAt),
        ),
      )
      .orderBy(asc(pharmacyDispensingPoints.liveAt)),
  ]);

  const otherIds = otherLive.map((p) => p.id);
  const notes = otherIds.length
    ? await tx
        .select({
          writtenBy: pharmacyPilotNotes.writtenBy,
          writtenAt: pharmacyPilotNotes.writtenAt,
        })
        .from(pharmacyPilotNotes)
        .where(
          and(
            eq(pharmacyPilotNotes.hospitalId, hospitalId),
            inArray(pharmacyPilotNotes.dispensingPointId, otherIds),
          ),
        )
        .orderBy(desc(pharmacyPilotNotes.writtenAt))
    : [];

  const counted = await countedProductsAt(tx, pointId);
  const controlled = signed.find((s) => s.kind === "controlled_classes")?.content;
  const head =
    heads.find((h) => h.departmentId === pointId && h.cadreCode === "PHARMACIST") ??
    heads.find((h) => h.departmentId === pointId) ??
    heads.find((h) => h.cadreCode === "PHARMACIST") ??
    heads[0];
  const q1 = legal.find((a) => a.question === 1);

  const facts: ReadinessFacts = {
    permissionMapSigned: PHARMACY_MAP_V2.status === "signed",
    signedSets: signed.map((s) => ({
      kind: s.kind as SignedSetKind,
      pharmacistCoSigned: s.secondSignerRole === PHARMACIST_REVIEWER_ROLE,
    })),
    supplyWithoutPharmacistOn: settings?.supplyWithoutPharmacist ?? false,
    usesPaymentStatus: settings?.paymentStatusRequired ?? false,
    hazardLogPharmacistCoSigned: HAZARD_LOG_SIGNATURE.pharmacistCoSignedBy !== null,
    stockedMedicineIds: [...new Set(products.map((p) => p.medicineId))],
    controlledDecisionIds:
      controlled && typeof controlled === "object" ? Object.keys(controlled) : [],
    legalAnswers: legal.map((a) => ({
      question: a.question,
      sourceRef: a.sourceRef,
      givenBy: a.givenBy,
      givenOn: isoDate(a.givenOn),
    })),
    // ponytail: the answer is free text, so a recorded Q1 keeps the stricter path (a pharmacist in
    // charge). A structured "a technician may be in charge" field would relax it; none exists yet.
    q1RequiresPharmacistInCharge: q1 ? true : null,
    activeProducts: products.map((p) => ({
      name: p.name,
      hasOpeningCount: openingCountMissing([p], counts, counted) === 0,
    })),
    drillOn: drill ? isoDate(drill.heldOn) : null,
    briefings: briefings.map((b) => ({ audience: b.audience, on: isoDate(b.heldOn) })),
    inCharge: head ? { name: head.cadreName, isPharmacist: head.cadreCode === "PHARMACIST" } : null,
    pointPhone: point?.phone ?? null,
    laterPoint: otherLive.length > 0,
    pilotNote: notes[0] ? { writtenBy: "a hospital admin", on: isoDate(notes[0].writtenAt) } : null,
  };
  return {
    facts,
    pilotNoteWriters: notes.map((n) => n.writtenBy),
    firstLivePointId: otherLive[0]?.id ?? null,
  };
}

export type GoLiveRequest = typeof pharmacyGolive.$inferSelect;

/** The open request (neither approved nor withdrawn) for a point, if any (0129 `pg_one_open`). */
export async function openRequest(tx: EmrTx | EmrDb, pointId: string) {
  const [row] = await tx
    .select()
    .from(pharmacyGolive)
    .where(
      and(
        eq(pharmacyGolive.dispensingPointId, pointId),
        isNull(pharmacyGolive.approvedAt),
        isNull(pharmacyGolive.withdrawnAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** `getPharmacyReadiness` (Section 8): the point, its six conditions, the pilot note and any open request. */
export async function getPharmacyReadiness(
  tx: EmrTx,
  hospitalId: string,
  pointId: string,
  now: Date = new Date(),
): Promise<{
  point: PharmacyPoint;
  readiness: ReturnType<typeof pharmacyReadiness>;
  pilotNoteWriters: string[];
  firstLivePointId: string | null;
  request: GoLiveRequest | null;
} | null> {
  const point = await loadPoint(tx, hospitalId, pointId);
  if (!point) return null;
  const [g, request] = await Promise.all([
    goLiveFactsFor(tx, hospitalId, pointId, now),
    openRequest(tx, pointId),
  ]);
  return {
    point,
    readiness: pharmacyReadiness(g.facts),
    pilotNoteWriters: g.pilotNoteWriters,
    firstLivePointId: g.firstLivePointId,
    request,
  };
}

/** The hospital's dispensing points, with their live state, for the Pharmacy settings page. */
export async function pointsWithState(tx: EmrTx | EmrDb, hospitalId: string) {
  return tx
    .select({
      id: pharmacyDispensingPoints.departmentId,
      name: hospitalDepartments.name,
      liveAt: pharmacyDispensingPoints.liveAt,
      switchedOffAt: pharmacyDispensingPoints.switchedOffAt,
    })
    .from(pharmacyDispensingPoints)
    .innerJoin(
      hospitalDepartments,
      eq(hospitalDepartments.id, pharmacyDispensingPoints.departmentId),
    )
    .where(
      and(
        eq(pharmacyDispensingPoints.hospitalId, hospitalId),
        isNull(hospitalDepartments.archivedAt),
      ),
    )
    .orderBy(asc(hospitalDepartments.name));
}

export async function hospitalSettings(tx: EmrTx | EmrDb, hospitalId: string) {
  const [row] = await tx
    .select()
    .from(pharmacyHospitalSettings)
    .where(eq(pharmacyHospitalSettings.hospitalId, hospitalId));
  return row ?? null;
}

/** The legal answers on record for this hospital (and those for every hospital), newest first per question. */
export async function legalAnswers(tx: EmrTx | EmrDb, hospitalId: string) {
  return tx
    .select({
      question: pharmacyLegalAnswers.question,
      sourceRef: pharmacyLegalAnswers.sourceRef,
      givenBy: pharmacyLegalAnswers.givenBy,
      givenOn: pharmacyLegalAnswers.givenOn,
      interim: pharmacyLegalAnswers.interim,
    })
    .from(pharmacyLegalAnswers)
    .where(
      or(isNull(pharmacyLegalAnswers.hospitalId), eq(pharmacyLegalAnswers.hospitalId, hospitalId)),
    )
    .orderBy(asc(pharmacyLegalAnswers.question), desc(pharmacyLegalAnswers.recordedAt));
}
