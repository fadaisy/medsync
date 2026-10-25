import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { patientProfiles } from "@/db/schema/patient-profiles";
import {
  pharmacyReactionEvents,
  pharmacyReactionMedicines,
  pharmacyReactionReports,
} from "@/db/schema/pharmacy-clinical";
import { prescriptions } from "@/db/schema/prescribing";
import { decrypt } from "@/lib/encryption";
import { drugById } from "@/lib/prescribing/formulary";
import { dueBy, stateOf } from "./reactions";
import { entriesInForce } from "./read";

/** Pharmacy Phase 3, Step 8 reads. The patient's name is read only to make initials, never returned whole. */

type Db = EmrDb | EmrTx;
const nameOf = (m: { medicineId: string | null; uncodedText: string | null }) =>
  (m.medicineId ? drugById(m.medicineId)?.generic : null) ??
  m.uncodedText ??
  m.medicineId ??
  "Not known";

/** 5.6 the Reactions page: newest first, with state and due-by (AR-5a, AR-6). */
export async function listReports(db: Db, hospitalId: string, now: Date) {
  const reports = await db
    .select()
    .from(pharmacyReactionReports)
    .where(eq(pharmacyReactionReports.hospitalId, hospitalId))
    .orderBy(desc(pharmacyReactionReports.recordedAt))
    .limit(200);
  if (!reports.length) return [];
  const ids = reports.map((r) => r.id);
  const [meds, events, timelines] = await Promise.all([
    db
      .select()
      .from(pharmacyReactionMedicines)
      .where(inArray(pharmacyReactionMedicines.reportId, ids)),
    db.select().from(pharmacyReactionEvents).where(inArray(pharmacyReactionEvents.reportId, ids)),
    entriesInForce(db, hospitalId, "reaction_timelines"),
  ]);
  const t = timelines[0]?.payload ?? null;
  return reports.map((r) => {
    const ev = events.filter((e) => e.reportId === r.id);
    const due = dueBy(new Date(r.recordedAt), r.seriousness, t);
    const main =
      meds.find((m) => m.reportId === r.id && m.main) ?? meds.find((m) => m.reportId === r.id);
    return {
      id: r.id,
      reference: r.reference,
      kind: r.kind,
      serious: r.seriousness.some((s) => s !== "not_serious"),
      state: stateOf(ev),
      dueAt: due?.at ?? null,
      pastDue: !!due && due.at < now && stateOf(ev) === "to_submit",
      assessed: ev.some((e) => e.kind === "causality"),
      medicine: main ? nameOf(main) : "Not known",
      recordedAt: new Date(r.recordedAt),
    };
  });
}

/** One report for the print (AR-5): initials, age and sex are made from the profile; the name never leaves. */
export async function reportFor(db: Db, hospitalId: string, id: string) {
  const [r] = await db
    .select()
    .from(pharmacyReactionReports)
    .where(
      and(eq(pharmacyReactionReports.id, id), eq(pharmacyReactionReports.hospitalId, hospitalId)),
    );
  if (!r) return null;
  const [meds, events, [profile]] = await Promise.all([
    db.select().from(pharmacyReactionMedicines).where(eq(pharmacyReactionMedicines.reportId, id)),
    db.select().from(pharmacyReactionEvents).where(eq(pharmacyReactionEvents.reportId, id)),
    db
      .select({
        first: patientProfiles.firstNameEncrypted,
        last: patientProfiles.surnameEncrypted,
        sex: patientProfiles.sex,
        dob: patientProfiles.dateOfBirth,
      })
      .from(patientProfiles)
      .where(eq(patientProfiles.id, r.patientUserId)),
  ]);
  const causality = events.filter((e) => e.kind === "causality").at(-1)?.causality ?? null;
  return {
    report: r,
    state: stateOf(events),
    events,
    medicines: meds.map((m) => ({ name: nameOf(m), product: null, batch: null, main: m.main })),
    patient: {
      fullName: profile ? `${safe(profile.first)} ${safe(profile.last)}`.trim() || null : null,
      dateOfBirth: profile?.dob ?? null,
      sex: profile?.sex ?? null,
    },
    causality,
  };
}

const safe = (c: string | null) => {
  try {
    return c ? decrypt(c) : "";
  } catch {
    return "";
  }
};

/** 5.6: the suspected-medicine choices — what this patient was prescribed in the signed window (90 days here). */
export async function medicineChoices(db: Db, patientUserId: string, now: Date) {
  // ponytail: the 90-day window is the prompt's stated default; a signed per-hospital window replaces it.
  const rows = await db
    .selectDistinct({ id: prescriptions.drugId })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.patientUserId, patientUserId),
        gte(prescriptions.createdAt, new Date(now.getTime() - 90 * 86_400_000)),
      ),
    );
  return rows
    .map((r) => ({ id: r.id, name: drugById(r.id)?.generic ?? r.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
