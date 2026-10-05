/**
 * The facility dataset the indicator engine reads (§6, D-05): one record per person with everything
 * the definitions need and nothing identifying. Loaded in one transaction under
 * medsync_ncd_analytics, which is granted no identifier column at all.
 */
export type DVisit = {
  id: string;
  date: string;
  type: string;
  closed: boolean;
  invalid: boolean;
  historical: boolean;
  /** Facility-local date the visit was entered (closed, else created). */
  enteredDate: string;
  bp: readonly [number, number] | null;
  glucose: { value: number; type: "fasting" | "random" | "post_meal" } | null;
  hba1c: { percent: number; resultDate: string } | null;
  weightKg: number | null;
  medicines: readonly string[];
  medicinesRecorded: boolean;
  missedDoses: string | null;
  medicinesObtained: string | null;
  notObtainedReason: string | null;
  nextAppointment: string | null;
  disposition: string | null;
  /** registrationId → recorded control (core modules). */
  recordedControl: Readonly<Record<string, string>>;
};

export type DReview = {
  component: string;
  date: string;
  data: Readonly<Record<string, unknown>>;
  derived: Readonly<Record<string, unknown>>;
};

export type DPerson = {
  id: string;
  sex: "female" | "male";
  birthYear: number;
  isSynthetic: boolean;
  district: string | null;
  knownCvd: readonly string[];
  hasValidPhone: boolean;
  recallRemovedAt: string | null;
  registrations: readonly { id: string; condition: string; date: string }[];
  visits: readonly DVisit[];
  reviews: readonly DReview[];
  events: readonly { type: string; date: string; admissionReason: string | null }[];
  appointments: readonly {
    id: string;
    date: string;
    createdDate: string;
    status: string;
    updatedDate: string;
    reason: string | null;
  }[];
  calls: readonly { date: string; outcome: string }[];
};

export type Dataset = { facilityId: string; timeZone: string; persons: readonly DPerson[] };
