import type { PatientReasonCode } from "@/supabase/functions/_shared/sessions-sql";
import type { Metadata } from "next";

import { PageHeader } from "@/components/tide/shell";
import { DAY_COPY as D } from "@/content/patient/book";
import {
  loadDays,
  loadHospitals,
  loadPatientBits,
  waitlistLineFor,
} from "@/lib/patient-web/book-data";
import { patientFlag } from "@/lib/patient-web/flags";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { fromSlot } from "@/lib/patient-web/opaque";
import { fetchHousehold } from "@/lib/patient/household";
import { requirePatientScope } from "@/lib/patient/scope";
import { PATIENT_REASON_CODES } from "@/supabase/functions/_shared/sessions-sql";
import { HospitalPicker } from "../_components/hospital-picker";
import { adultAreas, catalogueMode } from "../_lib/catalogue";
import { DayFailed, DayForm, ReasonFirst } from "./_components/day-form";

export const metadata: Metadata = { title: "Ask for a day" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: string | undefined) => (v && UUID.test(v) ? v : null);

/**
 * Ask for a day (the phone's (app)/book/day.tsx): the published clinic days that take this kind of visit or,
 * from a doctor's card on Home, that clinician's own open slots, and the request itself
 * (`pt-request-appointment`, one idempotency key per attempt). The reason sets the fee and which days take the
 * visit, so it comes first. Without a hospital the patient chooses one. No count of what is left (ADR 0084).
 */
export default async function DayPage({
  searchParams,
}: {
  searchParams: Promise<{
    r?: string;
    member?: string;
    doctor?: string;
    department?: string;
    hospital?: string;
    s?: string;
  }>;
}) {
  const scope = await requirePatientScope();
  const p = await searchParams;
  const reason: PatientReasonCode | null = fromSlot(PATIENT_REASON_CODES, p.r);
  const doctorId = id(p.doctor);
  const doctor = doctorId
    ? {
        userId: doctorId,
        ...(id(p.department) ? { departmentId: id(p.department)! } : {}),
        ...(id(p.hospital) ? { hospitalId: id(p.hospital)! } : {}),
      }
    : null;
  // Opaque ids only (W4); the doctor's ids ride on to the symptom steps and back.
  const carry = Object.fromEntries(
    (["doctor", "department", "hospital"] as const).flatMap((k) => (id(p[k]) ? [[k, p[k]!]] : [])),
  );
  const home = scope.primaryHospitalId
    ? { id: scope.primaryHospitalId, name: scope.primaryHospitalName ?? "Your hospital" }
    : null;
  const unseen = await countUnseenNotifications(scope.userId).catch(() => 0);
  const header = (
    <PageHeader back={{ href: "/patient/book", label: D.back }} title={D.title} unseen={unseen} />
  );

  if (!reason) {
    const mode = await catalogueMode();
    return (
      <ReasonFirst unseen={unseen} carry={carry} areas={mode === "off" ? null : adultAreas()} />
    );
  }

  if (!home && !doctor?.hospitalId) {
    const hospitals = await loadHospitals().catch(() => null);
    return (
      <>
        {header}
        <div className="max-w-2xl">
          <HospitalPicker hospitals={hospitals} />
        </div>
      </>
    );
  }

  const [days, household, bits] = await Promise.all([
    loadDays(home, reason, doctor).catch(() => undefined),
    fetchHousehold(scope.userId).catch(() => []),
    loadPatientBits(scope.userId).catch(() => ({ patientCode: null, sex: null })),
  ]);
  if (!days) {
    return (
      <>
        {header}
        <DayFailed />
      </>
    );
  }
  const member = id(p.member);
  const memberLabel = member
    ? (household.find((m) => m.provisionalPatientId === member)?.memberLabel ?? null)
    : null;
  const waitlistLine =
    !doctor && days.days.length === 0 ? await waitlistLineFor(days.hospitalId, reason) : null;

  return (
    <DayForm
      unseen={unseen}
      userId={scope.userId}
      days={days}
      reason={reason}
      member={memberLabel ? member : null}
      patient={memberLabel ?? (scope.fullName?.trim() || "[First name] [Surname]")}
      patientCode={bits.patientCode}
      submissionId={id(p.s)}
      paymentsOn={patientFlag("mobilePayments")}
      waitlistLine={waitlistLine}
      doctorBack={doctor !== null}
    />
  );
}
