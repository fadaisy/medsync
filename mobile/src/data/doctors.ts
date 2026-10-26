import type { WalkInDepartment } from "@/lib/booking";
import type { DoctorCard } from "@patient-core/doctors";
import { firstClinicDays, isDoctor, toDoctorCards } from "@patient-core/doctors";

import { createStore, useStore } from "@/data/store";
import {
  fetchBookableClinicians,
  fetchPatientProfile,
  fetchServiceLines,
  fetchSessions,
  fetchWalkInDepartments,
} from "@/lib/booking";

export type { DoctorCard, DoctorPlace } from "@patient-core/doctors";
export {
  DOCTOR_CADRE_IDS,
  FEE_UNKNOWN,
  WALK_IN_FILTER,
  availabilityWords,
  clinicDayKey,
  doctorFilters,
  firstClinicDays,
  initialsOf,
  isDoctor,
  matchesFilter,
  ratingWords,
  toDoctorCards,
} from "@patient-core/doctors";

export type DoctorsStatus = "loading" | "ready" | "error";

export interface DoctorsState {
  status: DoctorsStatus;
  doctors: DoctorCard[];
}

const store = createStore<DoctorsState>({ status: "loading", doctors: [] });

/** Read the doctors again (Home calls this on focus). A failure keeps a list already shown. */
export async function loadDoctors(): Promise<void> {
  if (store.get().status !== "ready") store.set((s) => ({ ...s, status: "loading" }));
  try {
    const [profile, everyone] = await Promise.all([
      fetchPatientProfile().catch(() => null),
      fetchBookableClinicians(),
    ]);
    const clinicians = everyone.filter(isDoctor);
    const home = profile?.hospitalId ?? null;
    const hospitalIds = [...new Set(clinicians.map((c) => c.hospitalId))];
    const [lines, walkIns, sessions] = await Promise.all([
      Promise.all(
        hospitalIds.map((hospitalId) =>
          fetchServiceLines({ hospitalId }).then(
            (l) => [[hospitalId, l] as const],
            // Left out, so its cards say the fee is unknown rather than "No fee".
            () => [],
          ),
        ),
      ).then((pairs) => pairs.flat()),
      // Walk-in hours only decide "Come today", which joins the line at the patient's own hospital.
      home ? fetchWalkInDepartments(home).catch(() => [] as WalkInDepartment[]) : [],
      Promise.all(
        hospitalIds.map((hospitalId) =>
          fetchSessions({ hospitalId }).then(
            (s) => [[hospitalId, s] as const],
            () => [],
          ),
        ),
      ).then((pairs) => pairs.flat()),
    ]);
    store.set({
      status: "ready",
      doctors: toDoctorCards(
        clinicians,
        new Map(lines),
        walkIns,
        home,
        firstClinicDays(new Map(sessions)),
      ),
    });
  } catch {
    store.set((s) => (s.status === "ready" ? s : { ...s, status: "error" }));
  }
}

export function useDoctors(): DoctorsState {
  return useStore(store);
}
