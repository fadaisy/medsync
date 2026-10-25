import "server-only";

import type { FeeInputs } from "@/supabase/functions/_shared/fees";
import type {
  ClinicianOption,
  ClinicSessionLite,
  DoctorCard,
  WalkInDepartment,
} from "@patient-core/doctors";
import { firstClinicDays, isDoctor, toDoctorCards } from "@patient-core/doctors";

import { callEdge } from "@/lib/supabase/edge";
import { createClient } from "@/lib/supabase/server";
import { PATIENT_BOOKING_HORIZON_DAYS } from "@/supabase/functions/_shared/booking-horizon";
import { DEFAULT_TIME_ZONE, localWeekdayAndMinutes } from "@/supabase/functions/_shared/slots";

/**
 * "See a doctor" on Home: the phone's `loadDoctors` (mobile/src/data/doctors.ts) on the server, the same
 * sources under the patient's own session: `pt-bookable-clinicians` (every hospital, ADR 0086), each
 * hospital's price list (`service_lines`), the walk-in hours at the patient's own hospital, and the clinic
 * days. A price list or clinic days that fail are left out (the card says the fee is unknown); the
 * clinicians failing throws, and Home shows "Couldn't load the doctors."
 */
type Embed<T> = T | T[] | null;
const one = <T>(v: Embed<T> | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export async function loadDoctors(homeHospitalId: string | null): Promise<DoctorCard[]> {
  const res = await callEdge<{ data?: ClinicianOption[] } | ClinicianOption[]>(
    "pt-bookable-clinicians",
    {},
    "patient-web.home",
  );
  if (!res.ok) throw new Error(res.error);
  const everyone = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  const clinicians = everyone.filter(isDoctor);
  const hospitalIds = [...new Set(clinicians.map((c) => c.hospitalId))];
  const supabase = await createClient();

  const lines = async (hospitalId: string) => {
    const { data, error } = await supabase
      .from("service_lines")
      .select(
        "name, department_id, payment_posture, fee_ugx, service_line_fees(cadre_id, fee_ugx, cadres(name))",
      )
      .eq("hospital_id", hospitalId)
      .eq("active", true)
      .overrideTypes<
        {
          name: string;
          department_id: string;
          payment_posture: string;
          fee_ugx: number | null;
          service_line_fees:
            | { cadre_id: string; fee_ugx: number; cadres: Embed<{ name: string }> }[]
            | null;
        }[],
        { merge: false }
      >();
    if (error) throw error;
    return (data ?? []).map((r) => ({
      departmentId: r.department_id,
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
  };

  const sessions = async (hospitalId: string): Promise<ClinicSessionLite[]> => {
    const now = Date.now();
    const { data, error } = await supabase
      .from("clinic_sessions")
      .select("starts_at, clinician_user_id, capacity_booked, overbooking_factor, booked_count")
      .eq("status", "published")
      .eq("hospital_id", hospitalId)
      .gt("starts_at", new Date(now).toISOString())
      .lt("starts_at", new Date(now + PATIENT_BOOKING_HORIZON_DAYS * 86_400_000).toISOString())
      .overrideTypes<
        {
          starts_at: string;
          clinician_user_id: string | null;
          capacity_booked: number;
          overbooking_factor: number | string;
          booked_count: number;
        }[],
        { merge: false }
      >();
    if (error) throw error;
    return (data ?? []).map((r) => ({
      startsAtIso: r.starts_at,
      clinicianUserId: r.clinician_user_id,
      placesLeft: Math.max(
        Math.ceil(r.capacity_booked * Number(r.overbooking_factor)) - r.booked_count,
        0,
      ),
    }));
  };

  // Walk-in hours only decide "Come today", which joins the line at the patient's own hospital.
  const walkIns = async (hospitalId: string): Promise<WalkInDepartment[]> => {
    const { isoWeekday, minutesOfDay } = localWeekdayAndMinutes(new Date(), DEFAULT_TIME_ZONE);
    const { data, error } = await supabase
      .from("hospital_departments")
      .select(
        "id, name, department_scheduling_policy(bookable_weekdays, bookable_start_minutes_local, bookable_end_minutes_local)",
      )
      .eq("hospital_id", hospitalId)
      .is("parent_id", null)
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
  };

  const settled = <T>(id: string, p: Promise<T>) =>
    p.then(
      (v) => [[id, v] as const],
      () => [],
    );
  const [lineList, homeWalkIns, sessionList] = await Promise.all([
    Promise.all(hospitalIds.map((h) => settled(h, lines(h)))).then((x) => x.flat()),
    homeHospitalId ? walkIns(homeHospitalId).catch(() => []) : Promise.resolve([]),
    Promise.all(hospitalIds.map((h) => settled(h, sessions(h)))).then((x) => x.flat()),
  ]);
  return toDoctorCards(
    clinicians,
    new Map(lineList),
    homeWalkIns,
    homeHospitalId,
    firstClinicDays(new Map(sessionList)),
  );
}
