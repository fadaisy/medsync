import { createStore, useStore } from "@/data/store";

/**
 * "See a doctor" on Home and the per-doctor lines in Come today.
 *
 * Contract between Home (Gate 3) and booking (Gate 4): `useDoctors()` returns
 * these cards. Until the booking repository fills them from the live intake
 * and session engines, they are demo data with placeholder names.
 *
 * Ratings and fees show only where the facility turns them on (PRD Q3, Q4);
 * public no-fee services always say "No fee".
 */
export type DoctorStatus =
  | { kind: "now"; ahead: number }
  | { kind: "next"; day: string; line: string };

export interface DoctorCard {
  id: string;
  name: string;
  role: string;
  place: string;
  initials: string;
  /** The patient's own doctor gets a "Your doctor" tag. */
  yours: boolean;
  /** Null when the facility has ratings off. */
  rating: { score: number; count: number } | null;
  /** UGX; null means no fee. */
  fee: number | null;
  status: DoctorStatus;
  tags: string[];
}

export interface DoctorsState {
  doctors: DoctorCard[];
  demo: boolean;
  /** Facility switch for ratings (default off until legal review, PRD Q3). */
  ratingsOn: boolean;
}

export const DOCTOR_FILTERS = ["Available now", "Diabetes", "General", "Children", "Eye"] as const;

const FIXTURE: DoctorCard[] = [
  {
    id: "na",
    name: "Dr [Name A]",
    role: "Specialist",
    place: "Kawempe HC IV",
    initials: "NA",
    yours: true,
    rating: { score: 4.9, count: 212 },
    fee: 30000,
    status: { kind: "now", ahead: 5 },
    tags: ["Diabetes"],
  },
  {
    id: "nb",
    name: "Dr [Name B]",
    role: "Diabetes",
    place: "Kawempe HC IV",
    initials: "NB",
    yours: false,
    rating: { score: 4.7, count: 98 },
    fee: null,
    status: { kind: "now", ahead: 2 },
    tags: ["Diabetes", "General"],
  },
  {
    id: "nh",
    name: "Dr [Name H]",
    role: "Physician",
    place: "Private wing",
    initials: "NH",
    yours: false,
    rating: { score: 4.8, count: 143 },
    fee: 50000,
    status: { kind: "next", day: "Tue 20 Oct", line: "Morning and afternoon open" },
    tags: ["General"],
  },
  {
    id: "ne",
    name: "Dr [Name E]",
    role: "Private wing",
    place: "OPD",
    initials: "NE",
    yours: false,
    rating: { score: 4.6, count: 310 },
    fee: 20000,
    status: { kind: "now", ahead: 4 },
    tags: ["General"],
  },
];

export const doctorsStore = createStore<DoctorsState>({
  doctors: FIXTURE,
  demo: true,
  ratingsOn: false,
});

export function useDoctors(): DoctorsState {
  return useStore(doctorsStore);
}

export function feeWords(fee: number | null): string {
  return fee ? `UGX ${fee.toLocaleString("en-US")}` : "No fee";
}
