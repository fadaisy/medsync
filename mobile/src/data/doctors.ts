import type { ClinicianOption, ServiceLine, WalkInDepartment } from "@/lib/booking";

import { createStore, useStore } from "@/data/store";
import { feeFor, feeText } from "@/features/visits/logic";
import {
  fetchBookableClinicians,
  fetchPatientProfile,
  fetchServiceLines,
  fetchWalkInDepartments,
} from "@/lib/booking";

/**
 * "See a doctor" on Home: the real clinicians at every active hospital, from
 * `pt-bookable-clinicians` (with no hospital it returns them all: a patient
 * may book at any hospital, ADR 0086), one card per clinician listing each
 * hospital they work at, with that hospital's price list (`service_lines`,
 * ADR 0092). The rating is the server's summary of real patients' visit
 * ratings (ADR 0085 §2), shown since the owner asked for it (18 Oct 2026);
 * none yet reads "No ratings yet". Nothing is invented: no placeholder
 * doctor, no count of people in any line or of slots left (ADR 0084 §6).
 */
export interface DoctorPlace {
  hospitalId: string;
  hospitalName: string;
  departmentId: string;
  departmentName: string;
  /** The first day with an open slot here ("YYYY-MM-DD"), or null within the 14-day horizon. */
  nextDayKey: string | null;
  /** "UGX 30,000", a range in words, or "No fee". */
  feeWords: string;
  /** This clinic takes walk-ins right now. Known only at the patient's own hospital. */
  walkInToday: boolean;
  /** The patient's own hospital. */
  home: boolean;
}

export interface DoctorCard {
  /** The clinician's user id: one card per clinician, however many hospitals. */
  key: string;
  userId: string;
  name: string;
  /** Specialty, else the cadre ("Medical Officer"). */
  role: string;
  initials: string;
  photoUrl: string | null;
  /** Home hospital first, then the soonest open day. */
  places: DoctorPlace[];
  /** The soonest open day anywhere, or null. */
  nextDayKey: string | null;
  /** Real patients' ratings only; null until someone has rated them. */
  rating: { average: number; count: number } | null;
}

/** "4.8 (12 ratings)", or "No ratings yet". */
export function ratingWords(rating: DoctorCard["rating"]): string {
  if (!rating || rating.count === 0) return "No ratings yet";
  return `${rating.average.toFixed(1)} (${rating.count} ${rating.count === 1 ? "rating" : "ratings"})`;
}

/**
 * The card's availability line: "Available today" when a slot is open today
 * anywhere they work, else "Next open: Tue 20 Oct", else none in two weeks.
 */
export function availabilityWords(
  nextDayKey: string | null,
  todayKey: string,
  dayWords: (key: string) => string,
): { text: string; today: boolean } {
  if (!nextDayKey) return { text: "No open day in the next two weeks", today: false };
  if (nextDayKey === todayKey) return { text: "Available today", today: true };
  return { text: `Next open: ${dayWords(nextDayKey)}`, today: false };
}

export type DoctorsStatus = "loading" | "ready" | "error";

export interface DoctorsState {
  status: DoctorsStatus;
  doctors: DoctorCard[];
}

/** "Dr Jane Doe" → "JD". Initials stand in where the clinician gave no photo. */
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

/**
 * One card per clinician, in the server's order (open days first, soonest
 * first), each listing every hospital and department they book at.
 */
export function toDoctorCards(
  clinicians: readonly ClinicianOption[],
  linesByHospital: ReadonlyMap<string, readonly Pick<ServiceLine, "departmentId" | "fee">[]>,
  homeWalkIns: readonly WalkInDepartment[],
  homeHospitalId: string | null,
): DoctorCard[] {
  const openNow = new Set(homeWalkIns.filter((d) => d.openNow).map((d) => d.id));
  const cards = new Map<string, DoctorCard>();
  for (const c of clinicians) {
    const home = c.hospitalId === homeHospitalId;
    const { fee, feeLabel } = feeFor(
      linesByHospital.get(c.hospitalId) ?? [],
      c.departmentId,
      c.cadreId,
    );
    const place: DoctorPlace = {
      hospitalId: c.hospitalId,
      hospitalName: c.hospitalName,
      departmentId: c.departmentId,
      departmentName: c.departmentName,
      nextDayKey: Object.keys(c.slotsByDate).sort()[0] ?? null,
      feeWords: feeLabel ?? feeText(fee),
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

/** The walk-in chip's words. */
export const WALK_IN_FILTER = "Walk-ins today";

/**
 * The filter chips the data can answer: walk-ins when some cards have them
 * today and some do not, then each hospital when there are two or more, else
 * each department when there are two or more. No chip for a facet the cards
 * do not carry.
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

const store = createStore<DoctorsState>({ status: "loading", doctors: [] });

/** Read the doctors again (Home calls this on focus). A failure keeps a list already shown. */
export async function loadDoctors(): Promise<void> {
  if (store.get().status !== "ready") store.set((s) => ({ ...s, status: "loading" }));
  try {
    const [profile, clinicians] = await Promise.all([
      fetchPatientProfile().catch(() => null),
      fetchBookableClinicians(),
    ]);
    const home = profile?.hospitalId ?? null;
    const hospitalIds = [...new Set(clinicians.map((c) => c.hospitalId))];
    const [lines, walkIns] = await Promise.all([
      Promise.all(
        hospitalIds.map((hospitalId) =>
          fetchServiceLines({ hospitalId }).then(
            (l) => [hospitalId, l] as const,
            () => [hospitalId, [] as ServiceLine[]] as const,
          ),
        ),
      ),
      // Walk-in hours only decide "Come today", which joins the line at the patient's own hospital.
      home ? fetchWalkInDepartments(home).catch(() => [] as WalkInDepartment[]) : [],
    ]);
    store.set({
      status: "ready",
      doctors: toDoctorCards(clinicians, new Map(lines), walkIns, home),
    });
  } catch {
    store.set((s) => (s.status === "ready" ? s : { ...s, status: "error" }));
  }
}

export function useDoctors(): DoctorsState {
  return useStore(store);
}
