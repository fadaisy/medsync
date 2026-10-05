import "server-only";

import type { EmrTx } from "@/lib/emr/db";
import type { SummaryInput, SummaryOutcome } from "@/lib/patient/visit-summary";
import { and, eq, isNull } from "drizzle-orm";

import { routeWord } from "@/components/emr/prescribing/views";
import { admissions } from "@/db/schema/admissions";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { encounterOrders } from "@/db/schema/encounter";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitalWards } from "@/db/schema/hospital-wards";
import { hospitals } from "@/db/schema/hospitals";
import { prescriptions } from "@/db/schema/prescribing";
import { cadres } from "@/db/schema/reference-data";
import { appointments, encounters } from "@/db/schema/scheduling";
import { hospitalBeds } from "@/db/schema/services-hub";
import { users } from "@/db/schema/users";
import { bedAssignments } from "@/db/schema/ward-builder";
import { stoppedRxIds } from "@/lib/emr/closure";
import { loadEncounterDiagnoses } from "@/lib/emr/write/diagnoses";
import { decrypt } from "@/lib/encryption";

/*
 * The record a visit's patient copy is composed from (ADR 0203), read in the clinician's transaction after the
 * access check. Everything the composer needs and nothing more: it decides what the patient sees.
 */

const when = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(d);

export async function loadSummaryInput(
  tx: EmrTx,
  scope: { hospitalId: string; patientUserId: string; encounterId: string; timeZone: string },
): Promise<SummaryInput | null> {
  const [enc] = await tx
    .select({
      state: encounters.state,
      closureKind: encounters.closureKind,
      disposition: encounters.disposition,
      detail: encounters.dispositionDetail,
      followUp: encounters.followUp,
      startedAt: encounters.startedAt,
      clinicianUserId: encounters.clinicianUserId,
      hospitalName: hospitals.name,
    })
    .from(encounters)
    .innerJoin(hospitals, eq(hospitals.id, encounters.hospitalId))
    .where(
      and(
        eq(encounters.id, scope.encounterId),
        eq(encounters.patientUserId, scope.patientUserId),
        eq(encounters.hospitalId, scope.hospitalId),
      ),
    );
  if (!enc) return null;
  const detail = (enc.detail as Record<string, string> | null) ?? {};

  const [who] = await tx
    .select({ name: users.fullName, cadre: cadres.name })
    .from(users)
    .leftJoin(
      staffAffiliations,
      and(
        eq(staffAffiliations.userId, users.id),
        eq(staffAffiliations.hospitalId, scope.hospitalId),
      ),
    )
    .leftJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .where(eq(users.id, enc.clinicianUserId))
    .limit(1);

  const [dx, rx, orders] = await Promise.all([
    loadEncounterDiagnoses(tx, scope),
    tx
      .select({
        id: prescriptions.id,
        name: prescriptions.drugName,
        dose: prescriptions.dose,
        route: prescriptions.route,
        frequency: prescriptions.frequency,
        duration: prescriptions.duration,
        instructions: prescriptions.instructionsCiphertext,
        state: prescriptions.state,
        kind: prescriptions.kind,
        sensitivity: prescriptions.sensitivity,
      })
      .from(prescriptions)
      .where(
        and(
          eq(prescriptions.encounterId, scope.encounterId),
          eq(prescriptions.patientUserId, scope.patientUserId),
          eq(prescriptions.hospitalId, scope.hospitalId),
          eq(prescriptions.isEmergency, false),
        ),
      ),
    tx
      .select({
        id: encounterOrders.id,
        text: encounterOrders.text,
        sensitivity: encounterOrders.sensitivity,
      })
      .from(encounterOrders)
      .where(
        and(
          eq(encounterOrders.encounterId, scope.encounterId),
          eq(encounterOrders.lifecycle, "events"),
        ),
      ),
  ]);

  // The outcome, read from the admission (its bed may have been given since) or the close's detail.
  let outcome: SummaryOutcome | null = null;
  const d = enc.disposition;
  if (d === "home" || d === "discharge") outcome = { kind: "home" };
  else if (d === "referred_out" || d === "refer")
    outcome = { kind: "referred_out", to: detail.destination ?? null };
  else if (d === "transferred" || d === "transfer")
    outcome = { kind: "transferred", to: detail.destination ?? null };
  else if (d === "left_before_completion" || d === "left_against_advice") outcome = { kind: d };
  else if (d === "admitted" || d === "admit") {
    const [adm] = await tx
      .select({ id: admissions.id, ward: hospitalWards.name, status: admissions.status })
      .from(admissions)
      .innerJoin(hospitalWards, eq(hospitalWards.id, admissions.wardId))
      .where(eq(admissions.sourceEncounterId, scope.encounterId));
    const [bed] = adm
      ? await tx
          .select({ label: hospitalBeds.label })
          .from(bedAssignments)
          .innerJoin(hospitalBeds, eq(hospitalBeds.id, bedAssignments.bedId))
          .where(and(eq(bedAssignments.admissionId, adm.id), isNull(bedAssignments.endedAt)))
      : [];
    // No admission row: a hospital that doesn't track beds on MedSync, so no "waiting" claim either.
    outcome = adm
      ? { kind: "admitted", ward: adm.ward, bed: bed?.label ?? null }
      : { kind: "admitted", ward: detail.ward ?? "the ward" };
  }

  // The next visit in words: the booked appointment, or the review date.
  const f = enc.followUp as {
    kind?: string;
    date?: string;
    appointment_id?: string;
    appointmentId?: string;
  } | null;
  let next: string | null = null;
  const apptId = f?.appointment_id ?? f?.appointmentId;
  if (f?.kind === "booked" && apptId) {
    const [a] = await tx
      .select({ startsAt: appointments.startsAt, department: hospitalDepartments.name })
      .from(appointments)
      .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
      .where(eq(appointments.id, apptId));
    if (a)
      next = `Booked: ${when(a.startsAt, scope.timeZone)}${a.department ? `, ${a.department}` : ""}.`;
  } else if (f?.kind === "review_date" && f.date) {
    next = `Come back for a review on ${new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${f.date}T12:00:00Z`))}.`;
  } else if (f?.kind === "as_needed") next = "Come back if you need to.";

  const stopped = new Set(stoppedRxIds(detail));
  const plain = (c: string | null) => {
    if (!c) return null;
    try {
      return decrypt(c);
    } catch {
      return null;
    }
  };

  return {
    encounter: { state: enc.state, closureKind: enc.closureKind, disposition: enc.disposition },
    visit: {
      startedAt: enc.startedAt.toISOString(),
      hospitalName: enc.hospitalName,
      clinicianName: who?.name ?? null,
      clinicianCadre: who?.cadre ?? null,
    },
    outcome,
    diagnoses: dx.map((x) => ({
      id: x.id,
      display: x.display,
      verification: x.verification,
      rank: x.rank,
      restricted: x.restricted,
    })),
    medicines: rx
      .filter((r) => r.state === "active" && r.kind === "drug")
      .map((r) => ({
        id: r.id,
        name: r.name,
        dose: r.dose,
        route: routeWord(r.route),
        frequency: r.frequency,
        duration: r.duration,
        instructions: plain(r.instructions),
        restricted: r.sensitivity === "restricted",
      })),
    stopped: rx
      .filter((r) => stopped.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, restricted: r.sensitivity === "restricted" })),
    tests: orders.map((o) => ({
      id: o.id,
      display: o.text,
      restricted: o.sensitivity === "restricted",
    })),
    next,
    comeBackIf: detail.come_back_if ?? null,
  };
}
