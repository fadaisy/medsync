import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import { and, desc, eq, inArray, isNull, max } from "drizzle-orm";

import { pharmacySupplies } from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyRepeatInstanceEvents,
  pharmacyRepeatInstances,
  prescriptionRenewalEvents,
  prescriptionRenewalRequests,
  prescriptionRepeatAuthorisations,
} from "@/db/schema/pharmacy-network";
import { prescriptions } from "@/db/schema/prescribing";
import { identitiesFor } from "@/lib/emr/read/results";
import { localDate } from "@/lib/pharmacy/stock/ledger";

/**
 * Renewal requests for the doctor (Pharmacy Phase 4, 5.3; RN-1, RN-4): every open request at the hospital, oldest
 * first, with the patient's two identifiers. Open means no answer yet, however long ago (nothing closes by itself).
 * Scoped like 0230's prescriber policy: the viewer's hospital; the page runs only for a prescriber.
 */

export interface RenewalRow {
  id: string;
  patientUserId: string;
  name: string;
  mrn: string;
  medicine: string;
  prescriptionId: string;
  drugId: string;
  conditionId: string | null;
  /** The source line's visit; null for a line placed outside one. */
  encounterId: string | null;
  reason: string;
  note: string | null;
  lastSuppliedOn: string | null;
  used: number | null;
  authorised: number | null;
  reviewBy: string | null;
  waitingSince: string;
}

const appDb = async (database?: EmrDb): Promise<EmrDb> =>
  database ?? ((await import("@/db")).db as unknown as EmrDb);

export async function openRenewals(
  viewer: { userId: string; hospitalId: string },
  database?: EmrDb,
): Promise<RenewalRow[]> {
  const db = await appDb(database);
  const rows = await db
    .select({
      id: prescriptionRenewalRequests.id,
      patientUserId: prescriptionRenewalRequests.patientUserId,
      prescriptionId: prescriptionRenewalRequests.prescriptionId,
      reason: prescriptionRenewalRequests.reason,
      note: prescriptionRenewalRequests.note,
      askedAt: prescriptionRenewalRequests.askedAt,
      medicine: prescriptions.drugName,
      drugId: prescriptions.drugId,
      conditionId: prescriptions.conditionId,
      encounterId: prescriptions.encounterId,
      authorised: prescriptionRepeatAuthorisations.furtherSupplies,
      reviewBy: prescriptionRepeatAuthorisations.reviewBy,
      authorisationId: prescriptionRepeatAuthorisations.id,
    })
    .from(prescriptionRenewalRequests)
    .innerJoin(prescriptions, eq(prescriptions.id, prescriptionRenewalRequests.prescriptionId))
    .leftJoin(
      prescriptionRenewalEvents,
      eq(prescriptionRenewalEvents.renewalId, prescriptionRenewalRequests.id),
    )
    .leftJoin(
      prescriptionRepeatAuthorisations,
      eq(
        prescriptionRepeatAuthorisations.prescriptionId,
        prescriptionRenewalRequests.prescriptionId,
      ),
    )
    .where(
      and(
        eq(prescriptionRenewalRequests.hospitalId, viewer.hospitalId),
        isNull(prescriptionRenewalEvents.id),
      ),
    )
    .orderBy(prescriptionRenewalRequests.askedAt);
  if (!rows.length) return [];
  const lineIds = [...new Set(rows.map((r) => r.prescriptionId))];
  const [last, used, who] = await Promise.all([
    db
      .select({ id: pharmacySupplies.prescriptionId, at: max(pharmacySupplies.suppliedAt) })
      .from(pharmacySupplies)
      .where(inArray(pharmacySupplies.prescriptionId, lineIds))
      .groupBy(pharmacySupplies.prescriptionId),
    // RP-4: instances closed by a hand-over (the latest supplied/reopened event decides).
    db
      .select({
        id: pharmacyRepeatInstances.prescriptionId,
        instance: pharmacyRepeatInstances.id,
        kind: pharmacyRepeatInstanceEvents.kind,
      })
      .from(pharmacyRepeatInstances)
      .innerJoin(
        pharmacyRepeatInstanceEvents,
        eq(pharmacyRepeatInstanceEvents.instanceId, pharmacyRepeatInstances.id),
      )
      .where(
        and(
          inArray(pharmacyRepeatInstances.prescriptionId, lineIds),
          inArray(pharmacyRepeatInstanceEvents.kind, ["supplied", "reopened"]),
        ),
      )
      .orderBy(desc(pharmacyRepeatInstanceEvents.at)),
    identitiesFor(viewer, [...new Set(rows.map((r) => r.patientUserId))], "doctor_renewals", db),
  ]);
  const lastOf = new Map(last.map((l) => [l.id, l.at ? localDate(l.at) : null]));
  const latest = new Map<string, { line: string; kind: string }>();
  for (const u of used)
    if (!latest.has(u.instance)) latest.set(u.instance, { line: u.id, kind: u.kind });
  const usedOf = new Map<string, number>();
  for (const { line, kind } of latest.values())
    if (kind === "supplied") usedOf.set(line, (usedOf.get(line) ?? 0) + 1);
  return rows.map((r) => {
    const id = who.get(r.patientUserId);
    return {
      id: r.id,
      patientUserId: r.patientUserId,
      name: id?.name ?? "",
      mrn: id?.mrn ?? "",
      medicine: r.medicine,
      prescriptionId: r.prescriptionId,
      drugId: r.drugId,
      conditionId: r.conditionId,
      encounterId: r.encounterId,
      reason: r.reason,
      note: r.note,
      lastSuppliedOn: lastOf.get(r.prescriptionId) ?? null,
      used: r.authorisationId ? (usedOf.get(r.prescriptionId) ?? 0) : null,
      authorised: r.authorised,
      reviewBy: r.reviewBy,
      waitingSince: r.askedAt.toISOString(),
    };
  });
}
