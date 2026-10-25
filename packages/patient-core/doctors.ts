import type { FeeInputs } from "../../supabase/functions/_shared/fees";

import { DEFAULT_TIME_ZONE, localDateKey } from "../../supabase/functions/_shared/slots";
import { feeFor, feeText } from "./fees";

/**
 * "See a doctor": the real clinicians from `pt-bookable-clinicians`, one ID badge each. Moved here verbatim
 * from the phone's pure half of `mobile/src/data/doctors.ts` (with `sessionTakeable` from `lib/booking.ts`
 * and `dayKeyOf`/`shortDayOf` from `features/visits/logic.ts`); the phone re-exports these once its files
 * switch over. No count of people anywhere (ADR 0084 §6), no placeholder doctor.
 */

/** The fields of a `pt-bookable-clinicians` row the cards read. */
export interface ClinicianOption {
  userId: string;
  fullName: string;
  hospitalId: string;
  hospitalName: string;
  cadre: string;
  cadreId: string | null;
  specialty: string | null;
  departmentId: string;
  departmentName: string;
  photoUrl: string | null;
  rating: { average: number; count: number } | null;
  slotsByDate: Record<string, unknown[]>;
}

export interface WalkInDepartment {
  id: string;
  name: string;
  openNow: boolean;
}

export interface ClinicSessionLite {
  startsAtIso: string;
  clinicianUserId: string | null;
  placesLeft: number;
}

/** A clinic day a patient can actually take: a place left AND a clinician named. */
export function sessionTakeable(
  s: Pick<ClinicSessionLite, "placesLeft" | "clinicianUserId">,
): boolean {
  return s.placesLeft > 0 && s.clinicianUserId !== null;
}

export const dayKeyOf = (at: Date | string) => localDateKey(at, DEFAULT_TIME_ZONE);
const DAY_SHORT = new Intl.DateTimeFormat("en-GB", {
  timeZone: DEFAULT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
export const shortDayOf = (key: string) => DAY_SHORT.format(new Date(`${key}T12:00:00Z`));

/** Where a clinician's clinic days are filed: their hospital and their user id. */
export const clinicDayKey = (hospitalId: string, userId: string) => `${hospitalId}|${userId}`;

/** The first clinic day each clinician runs with a place left, per hospital. */
export function firstClinicDays(
  byHospital: ReadonlyMap<string, readonly ClinicSessionLite[]>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [hospitalId, sessions] of byHospital)
    for (const s of sessions) {
      if (!sessionTakeable(s) || !s.clinicianUserId) continue;
      const k = clinicDayKey(hospitalId, s.clinicianUserId);
      const day = dayKeyOf(s.startsAtIso);
      const had = out.get(k);
      if (!had || day < had) out.set(k, day);
    }
  return out;
}

export interface DoctorPlace {
  hospitalId: string;
  hospitalName: string;
  departmentId: string;
  departmentName: string;
  /** The first day with an open slot here ("YYYY-MM-DD"), or null within the horizon. */
  nextDayKey: string | null;
  /** "UGX 30,000", a range in words, or "No fee". */
  feeWords: string;
  /** This clinic takes walk-ins right now. Known only at the patient's own hospital. */
  walkInToday: boolean;
  home: boolean;
}

export interface DoctorCard {
  key: string;
  userId: string;
  name: string;
  /** Specialty, else the cadre. */
  role: string;
  initials: string;
  photoUrl: string | null;
  /** Home hospital first, then the soonest open day. */
  places: DoctorPlace[];
  nextDayKey: string | null;
  rating: { average: number; count: number } | null;
}

/** "4.8 (12 ratings)", or "No ratings yet". */
export function ratingWords(rating: DoctorCard["rating"]): string {
  if (!rating || rating.count === 0) return "No ratings yet";
  return `${rating.average.toFixed(1)} (${rating.count} ${rating.count === 1 ? "rating" : "ratings"})`;
}

/** "Available today", "Next open: Tue 20 Oct", or none in the horizon. */
export function availabilityWords(
  nextDayKey: string | null,
  todayKey: string,
  dayWords: (key: string) => string,
): { text: string; today: boolean } {
  if (!nextDayKey) return { text: "No open day in the next two weeks", today: false };
  if (nextDayKey === todayKey) return { text: "Available today", today: true };
  return { text: `Next open: ${dayWords(nextDayKey)}`, today: false };
}

/**
 * The doctor cadres a patient books (ADR 0403): the UMDPC-registered cadres of the reference seed, less
 * intern doctors. ponytail: the seed's fixed ids; upgrade when the server returns the council code.
 */
export const DOCTOR_CADRE_IDS: ReadonlySet<string> = new Set([
  "00000000-0000-0000-0000-000000000d02", // Medical Officer
  "00000000-0000-0000-0000-000000000d03", // Medical Officer (Special Grade)
  "00000000-0000-0000-0000-000000000d04", // Consultant
  "00000000-0000-0000-0000-000000000d05", // Senior Consultant
  "00000000-0000-0000-0000-000000000d06", // Dental Officer
  "00000000-0000-0000-0000-000000000d07", // Dental Surgeon
]);

export function isDoctor(c: Pick<ClinicianOption, "cadreId">): boolean {
  return c.cadreId !== null && DOCTOR_CADRE_IDS.has(c.cadreId);
}

/** "Dr Jane Doe" → "JD". */
export function initialsOf(name: string): string {
  const words = name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "DR"
  );
}

const byPlace = (a: DoctorPlace, b: DoctorPlace) =>
  Number(b.home) - Number(a.home) ||
  (a.nextDayKey ?? "9999").localeCompare(b.nextDayKey ?? "9999") ||
  a.hospitalName.localeCompare(b.hospitalName);

/** When a hospital's price list could not be read. */
export const FEE_UNKNOWN = "Fee shown when you ask";

/** The walk-in chip's words. */
export const WALK_IN_FILTER = "Walk-ins today";

/** One card per clinician, in the server's order, each listing every hospital and department they book at. */
export function toDoctorCards(
  clinicians: readonly ClinicianOption[],
  linesByHospital: ReadonlyMap<string, readonly { departmentId: string; fee: FeeInputs }[]>,
  homeWalkIns: readonly WalkInDepartment[],
  homeHospitalId: string | null,
  clinicDays: ReadonlyMap<string, string> = new Map(),
): DoctorCard[] {
  const openNow = new Set(homeWalkIns.filter((d) => d.openNow).map((d) => d.id));
  const cards = new Map<string, DoctorCard>();
  for (const c of clinicians) {
    const home = c.hospitalId === homeHospitalId;
    const hospitalLines = linesByHospital.get(c.hospitalId);
    const { fee, feeLabel } = feeFor(hospitalLines ?? [], c.departmentId, c.cadreId);
    const place: DoctorPlace = {
      hospitalId: c.hospitalId,
      hospitalName: c.hospitalName,
      departmentId: c.departmentId,
      departmentName: c.departmentName,
      nextDayKey:
        [Object.keys(c.slotsByDate).sort()[0], clinicDays.get(clinicDayKey(c.hospitalId, c.userId))]
          .filter((d): d is string => !!d)
          .sort()[0] ?? null,
      // A price list that did not load is not "No fee": say so rather than guess.
      feeWords: hospitalLines ? (feeLabel ?? feeText(fee)) : FEE_UNKNOWN,
      walkInToday: home && openNow.has(c.departmentId),
      home,
    };
    const card = cards.get(c.userId);
    if (card) {
      if (
        !card.places.some(
          (p) => p.hospitalId === place.hospitalId && p.departmentId === place.departmentId,
        )
      )
        card.places.push(place);
    } else {
      cards.set(c.userId, {
        key: c.userId,
        userId: c.userId,
        name: c.fullName,
        role: c.specialty ?? c.cadre,
        initials: initialsOf(c.fullName),
        photoUrl: c.photoUrl,
        places: [place],
        nextDayKey: null,
        rating: c.rating,
      });
    }
  }
  return [...cards.values()].map((card) => {
    const places = [...card.places].sort(byPlace);
    const days = places
      .map((p) => p.nextDayKey)
      .filter((d): d is string => d !== null)
      .sort();
    return { ...card, places, nextDayKey: days[0] ?? null };
  });
}

/**
 * The filter chips the data can answer: walk-ins when some cards have them today and some do not, then
 * each hospital when there are two or more, else each department when there are two or more.
 */
export function doctorFilters(cards: readonly DoctorCard[]): string[] {
  const out: string[] = [];
  const walkIns = cards.filter((c) => c.places.some((p) => p.walkInToday)).length;
  if (walkIns > 0 && walkIns < cards.length) out.push(WALK_IN_FILTER);
  const hospitals = [...new Set(cards.flatMap((c) => c.places.map((p) => p.hospitalName)))];
  if (hospitals.length > 1) out.push(...hospitals.sort());
  else {
    const depts = [...new Set(cards.flatMap((c) => c.places.map((p) => p.departmentName)))];
    if (depts.length > 1) out.push(...depts.sort());
  }
  return out;
}

export function matchesFilter(card: DoctorCard, filter: string | null): boolean {
  if (!filter) return true;
  if (filter === WALK_IN_FILTER) return card.places.some((p) => p.walkInToday);
  return card.places.some((p) => p.hospitalName === filter || p.departmentName === filter);
}
