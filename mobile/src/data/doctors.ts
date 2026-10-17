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
 * "See a doctor" on Home: the real clinicians at the patient's own hospital,
 * from `pt-bookable-clinicians` (the server's slot engine) and the hospital's
 * price list (`service_lines`, ADR 0092). Nothing is invented: no placeholder
 * doctor, no rating (ratings stay off, PRD Q3), and no count of people in any
 * line (ADR 0084 §6). A fee shows only where the clinic priced one.
 */
export interface DoctorCard {
  /** User id and department: one clinician may work in two. */
  key: string;
  userId: string;
  name: string;
  /** Specialty, else the cadre ("Medical Officer"). */
  role: string;
  departmentId: string;
  place: string;
  initials: string;
  photoUrl: string | null;
  /** The first day with an open slot ("YYYY-MM-DD"), or null within the 14-day horizon. */
  nextDayKey: string | null;
  /** Their clinic takes walk-ins right now. A yes or no, never a queue length. */
  walkInToday: boolean;
  /** "UGX 30,000", a range in words, or "No fee". */
  feeWords: string;
}

export type DoctorsStatus = "loading" | "ready" | "error" | "no-hospital";

export interface DoctorsState {
  status: DoctorsStatus;
  doctors: DoctorCard[];
  hospitalName: string | null;
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

/** One card per clinician and department, in the server's order (open days first, soonest first). */
export function toDoctorCards(
  clinicians: readonly ClinicianOption[],
  lines: readonly Pick<ServiceLine, "departmentId" | "fee">[],
  departments: readonly WalkInDepartment[],
): DoctorCard[] {
  const openNow = new Set(departments.filter((d) => d.openNow).map((d) => d.id));
  return clinicians.map((c) => {
    const { fee, feeLabel } = feeFor(lines, c.departmentId, c.cadreId);
    return {
      key: `${c.userId}:${c.departmentId}`,
      userId: c.userId,
      name: c.fullName,
      role: c.specialty ?? c.cadre,
      departmentId: c.departmentId,
      place: c.departmentName,
      initials: initialsOf(c.fullName),
      photoUrl: c.photoUrl,
      nextDayKey: Object.keys(c.slotsByDate).sort()[0] ?? null,
      walkInToday: openNow.has(c.departmentId),
      feeWords: feeLabel ?? feeText(fee),
    };
  });
}

/** The walk-in chip's words. */
export const WALK_IN_FILTER = "Walk-ins today";

/**
 * The filter chips the data can answer: walk-ins when some clinics take them
 * today and some do not, and each department when there are two or more. No
 * chip for a facet the cards do not carry.
 */
export function doctorFilters(cards: readonly DoctorCard[]): string[] {
  const out: string[] = [];
  const walkIns = cards.filter((c) => c.walkInToday).length;
  if (walkIns > 0 && walkIns < cards.length) out.push(WALK_IN_FILTER);
  const places = [...new Set(cards.map((c) => c.place))];
  if (places.length > 1) out.push(...places.sort());
  return out;
}

export function matchesFilter(card: DoctorCard, filter: string | null): boolean {
  if (!filter) return true;
  return filter === WALK_IN_FILTER ? card.walkInToday : card.place === filter;
}

const store = createStore<DoctorsState>({ status: "loading", doctors: [], hospitalName: null });

/** Read the doctors again (Home calls this on focus). A failure keeps a list already shown. */
export async function loadDoctors(): Promise<void> {
  if (store.get().status !== "ready") store.set((s) => ({ ...s, status: "loading" }));
  try {
    const profile = await fetchPatientProfile();
    const hospitalId = profile?.hospitalId;
    if (!hospitalId) {
      store.set({ status: "no-hospital", doctors: [], hospitalName: null });
      return;
    }
    const [clinicians, lines, departments] = await Promise.all([
      fetchBookableClinicians(hospitalId),
      fetchServiceLines({ hospitalId }),
      // Walk-in hours only decide "Come today"; without them that button stays away.
      fetchWalkInDepartments(hospitalId).catch(() => [] as WalkInDepartment[]),
    ]);
    store.set({
      status: "ready",
      doctors: toDoctorCards(clinicians, lines, departments),
      hospitalName: profile.hospitalName,
    });
  } catch {
    store.set((s) => (s.status === "ready" ? s : { ...s, status: "error" }));
  }
}

export function useDoctors(): DoctorsState {
  return useStore(store);
}
