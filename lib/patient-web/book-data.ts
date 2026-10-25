import "server-only";

import type { FeeInputs } from "@/supabase/functions/_shared/fees";
import type {
  ClinicSession,
  DayOption,
  ServiceLineLite,
  SlotClinician,
} from "@patient-core/book-days";
import type { Fee } from "@patient-core/fees";
import {
  clinicDays,
  dayKeyOf,
  mergeDays,
  placesLeft,
  sessionTakeable,
  slotDays,
} from "@patient-core/book-days";
import { feeFor } from "@patient-core/fees";

import { callEdge } from "@/lib/supabase/edge";
import { createClient } from "@/lib/supabase/server";
import { PATIENT_BOOKING_HORIZON_DAYS } from "@/supabase/functions/_shared/booking-horizon";
import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "@/supabase/functions/_shared/slots";

/**
 * Book's reads, the phone's own (mobile/src/lib/booking.ts, data/visits.ts) on the server under the
 * patient's session: active hospitals, the walk-in clinics open now (open by default, a policy narrows it,
 * ADR 0084 §14), the price lists (`service_lines`), the published clinic days within the horizon with the
 * clinician's name from `clinician_directory`, and a named clinician's slots from `pt-bookable-clinicians`.
 * No count of people rides along anywhere (ADR 0084 §5).
 */

type Embed<T> = T | T[] | null;
const one = <T>(v: Embed<T> | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export interface HospitalOption {
  id: string;
  name: string;
  district: string | null;
}

export async function loadHospitals(): Promise<HospitalOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hospitals")
    .select("id, name, district")
    .eq("state", "active")
    .order("name");
  if (error) throw error;
  return (data ?? []) as HospitalOption[];
}

export interface WalkInDepartment {
  id: string;
  name: string;
  openNow: boolean;
}

export async function loadWalkIns(hospitalId: string): Promise<WalkInDepartment[]> {
  const { isoWeekday, minutesOfDay } = localWeekdayAndMinutes(new Date(), DEFAULT_TIME_ZONE);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hospital_departments")
    .select(
      "id, name, department_scheduling_policy(bookable_weekdays, bookable_start_minutes_local, bookable_end_minutes_local)",
    )
    .eq("hospital_id", hospitalId)
    .is("parent_id", null)
    .order("name")
    .overrideTypes<
      {
        id: string;
        name: string;
        department_scheduling_policy: Embed<{
          bookable_weekdays: number[] | null;
          bookable_start_minutes_local: number | null;
          bookable_end_minutes_local: number | null;
        }>;
      }[],
      { merge: false }
    >();
  if (error) throw error;
  return (data ?? []).map((d) => {
    const p = one(d.department_scheduling_policy);
    const openNow =
      !p ||
      ((p.bookable_weekdays ?? []).includes(isoWeekday) &&
        minutesOfDay >= (p.bookable_start_minutes_local ?? 0) &&
        minutesOfDay < (p.bookable_end_minutes_local ?? 0));
    return { id: d.id, name: d.name, openNow };
  });
}

export async function loadServiceLines(hospitalId: string): Promise<ServiceLineLite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_lines")
    .select(
      "id, name, department_id, reason_codes, payment_posture, fee_ugx, service_line_fees(cadre_id, fee_ugx, cadres(name)), hospital_departments!service_lines_department_id_fkey(name)",
    )
    .eq("hospital_id", hospitalId)
    .eq("active", true)
    .order("name")
    .overrideTypes<
      {
        id: string;
        name: string;
        department_id: string;
        reason_codes: string[] | null;
        payment_posture: string;
        fee_ugx: number | null;
        service_line_fees:
          | { cadre_id: string; fee_ugx: number; cadres: Embed<{ name: string }> }[]
          | null;
        hospital_departments: Embed<{ name: string }>;
      }[],
      { merge: false }
    >();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    departmentId: r.department_id,
    departmentName: one(r.hospital_departments)?.name ?? "Outpatients",
    reasonCodes: r.reason_codes ?? [],
    fee: {
      posture: r.payment_posture,
      baseFeeUgx: r.fee_ugx,
      lineName: r.name,
      cadreFees: (r.service_line_fees ?? []).map((f) => ({
        cadreId: f.cadre_id,
        cadreName: one(f.cadres)?.name ?? r.name,
        feeUgx: f.fee_ugx,
      })),
    } as FeeInputs,
  }));
}

/** Published, future clinic days within the horizon, soonest first; RLS shows published rows only. */
export async function loadSessions(hospitalId: string): Promise<ClinicSession[]> {
  const supabase = await createClient();
  const now = Date.now();
  const { data, error } = await supabase
    .from("clinic_sessions")
    .select(
      "id, service_line_id, starts_at, clinician_user_id, venue, capacity_booked, overbooking_factor, booked_count",
    )
    .eq("status", "published")
    .eq("hospital_id", hospitalId)
    .gt("starts_at", new Date(now).toISOString())
    .lt("starts_at", new Date(now + PATIENT_BOOKING_HORIZON_DAYS * 86_400_000).toISOString())
    .order("starts_at")
    .overrideTypes<
      {
        id: string;
        service_line_id: string;
        starts_at: string;
        clinician_user_id: string | null;
        venue: string | null;
        capacity_booked: number;
        overbooking_factor: number | string;
        booked_count: number;
      }[],
      { merge: false }
    >();
  if (error) throw error;
  const rows = data ?? [];
  const ids = [...new Set(rows.flatMap((r) => (r.clinician_user_id ? [r.clinician_user_id] : [])))];
  const names = new Map<string, string>();
  if (ids.length) {
    // The narrow view (migration 0057); failing to empty, the day says "Clinic team".
    const { data: dir } = await supabase
      .from("clinician_directory")
      .select("id, full_name")
      .in("id", ids)
      .overrideTypes<{ id: string; full_name: string | null }[], { merge: false }>();
    for (const d of dir ?? []) if (d.full_name?.trim()) names.set(d.id, d.full_name.trim());
  }
  return rows.map((r) => ({
    id: r.id,
    serviceLineId: r.service_line_id,
    startsAtIso: r.starts_at,
    clinicianUserId: r.clinician_user_id,
    clinicianName: (r.clinician_user_id && names.get(r.clinician_user_id)) || "Clinic team",
    venue: r.venue,
    placesLeft: placesLeft(r.capacity_booked, r.overbooking_factor, r.booked_count),
  }));
}

export interface PatientBits {
  patientCode: string | null;
  sex: string | null;
}

export async function loadPatientBits(userId: string): Promise<PatientBits> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("patient_profiles")
    .select("patient_code, sex")
    .eq("id", userId)
    .maybeSingle()
    .overrideTypes<{ patient_code: string | null; sex: string | null }, { merge: false }>();
  return { patientCode: data?.patient_code ?? null, sex: data?.sex ?? null };
}

/** Book's two doors: whether a clinic takes walk-ins now, and the next clinic day with a place. */
export async function loadBookGlance(
  hospitalId: string,
): Promise<{ openNow: boolean | null; nextDayKey: string | null }> {
  const [walkIns, sessions] = await Promise.all([
    loadWalkIns(hospitalId).catch(() => null),
    loadSessions(hospitalId).catch(() => null),
  ]);
  const next = sessions?.find(sessionTakeable);
  return {
    openNow: walkIns ? walkIns.some((d) => d.openNow) : null,
    nextDayKey: next ? dayKeyOf(next.startsAtIso) : null,
  };
}

export interface Clinic extends Fee {
  id: string;
  name: string;
}

/** Come today: the clinics taking walk-ins now, each with its fee range (one rule, ADR 0092). */
export async function loadClinicsOpenNow(hospitalId: string): Promise<Clinic[]> {
  const [departments, lines] = await Promise.all([
    loadWalkIns(hospitalId),
    loadServiceLines(hospitalId),
  ]);
  return departments
    .filter((d) => d.openNow)
    .map((d) => ({ id: d.id, name: d.name, ...feeFor(lines, d.id, null) }));
}

export interface Days {
  hospitalId: string;
  hospitalName: string;
  doctorName: string | null;
  days: DayOption[];
}

/**
 * Ask for a day: the published clinic days that take this reason; or, with `doctor`, that clinician's own
 * open slots and the clinic days they run (a doctor's hospital may not be the patient's own, ADR 0086).
 */
export async function loadDays(
  home: { id: string; name: string } | null,
  reason: string,
  doctor: { userId: string; departmentId?: string; hospitalId?: string } | null,
): Promise<Days | null> {
  const hospitalId = doctor?.hospitalId ?? home?.id;
  if (!hospitalId) return null;
  if (doctor) {
    const res = await callEdge<{ data?: DoctorRow[] } | DoctorRow[]>(
      "pt-bookable-clinicians",
      { hospital_id: hospitalId },
      "patient-web.book",
    );
    if (!res.ok) throw new Error(res.error);
    const rows = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    const c = rows.find(
      (x) =>
        x.userId === doctor.userId &&
        (!doctor.departmentId || x.departmentId === doctor.departmentId),
    );
    if (c) {
      const [lines, sessions] = await Promise.all([
        loadServiceLines(hospitalId),
        loadSessions(hospitalId).catch(() => [] as ClinicSession[]),
      ]);
      return {
        hospitalId,
        hospitalName: c.hospitalName,
        doctorName: c.fullName,
        days: mergeDays(slotDays(c, lines, reason), clinicDays(sessions, lines, reason, c.userId)),
      };
    }
  }
  if (!home) return null;
  const [lines, sessions] = await Promise.all([loadServiceLines(home.id), loadSessions(home.id)]);
  return {
    hospitalId: home.id,
    hospitalName: home.name,
    doctorName: null,
    days: clinicDays(sessions, lines, reason),
  };
}

type DoctorRow = SlotClinician & { hospitalId: string; hospitalName: string };

/** The line that takes this reason at the hospital, for "Tell me if a place opens" (pt-join-waitlist). */
export async function waitlistLineFor(hospitalId: string, reason: string): Promise<string | null> {
  const lines = await loadServiceLines(hospitalId).catch(() => []);
  return lines.find((l) => l.reasonCodes.includes(reason))?.id ?? null;
}
