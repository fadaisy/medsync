/**
 * The golden dataset's shape (§6). Patients are written into a PGlite test database through the
 * engine's own commands (tests/ncdreg-db/golden/harness.ts), each record on its own date, then the
 * real loader and indicator engine run for the reporting month and every result is compared with a
 * hand-written expectation (expected.ts).
 */
export type GVisit = {
  date: string; // ISO, the visit day (also its entry day)
  type?: "scheduled" | "unscheduled" | "refill_only" | "remote"; // default scheduled
  bp?: [number, number][]; // readings; visit BP = rounded mean
  weightKg?: number;
  glucose?: { value: number; type: "fasting" | "random" | "post_meal" };
  hba1c?: { percent: number; resultDate: string };
  medicines?: string[]; // medicine codes from the standard's list
  missedDoses?: "none" | "1_to_2_days" | "3_or_more_days" | "not_asked"; // default "none"
  obtained?: "full" | "partial" | "none" | "not_applicable"; // default "full"
  notObtainedReason?: "stock_out" | "cost" | "other";
  next?: string; // next appointment date (required unless disposition)
  disposition?: "transfer_out" | "discharged_to_primary_care";
  /** Core registrations: condition code → recorded control. */
  control?: Record<string, "controlled" | "partly_controlled" | "not_controlled" | "not_assessed">;
  /** Entered later than the visit day (H11): the entry date. */
  enteredOn?: string;
  /** Back-entered (A6): excluded from H10/H11. */
  historical?: boolean;
};

export type GReview =
  | {
      component: "kidney";
      date: string;
      creatinineUmol?: number;
      acr?: number;
      dipstick?: "negative" | "trace" | "1+" | "2+" | "3+";
    }
  | {
      component: "eyes";
      date: string;
      examined: boolean;
      grade?: string;
      macularOedema?: "absent" | "present" | "not_assessed";
    }
  | {
      component: "feet";
      date: string;
      lops?: boolean;
      absentPulses?: boolean;
      deformity?: boolean;
      currentUlcer?: boolean;
      previousUlcer?: boolean;
      amputation?: "none" | "minor" | "major";
    }
  | { component: "lipids"; date: string; total?: number; ldl?: number };

export type GEvent = {
  type: string;
  date: string;
  admissionReason?: string;
};

export type GCall = {
  date: string;
  outcome:
    | "will_return"
    | "call_later"
    | "no_answer"
    | "moved_or_transferred"
    | "died"
    | "wrong_number"
    | "declined";
  newDate?: string;
};

export type GPatient = {
  id: string; // short label, e.g. "H01"; the harness maps it to a uuid
  sex: "female" | "male";
  dateOfBirth: string; // exact
  district?: string;
  phone: boolean; // has a (valid) phone number
  registrations: { condition: string; date: string; subtype?: string }[];
  knownCvd?: (
    | "stroke"
    | "ischaemic_heart_disease"
    | "heart_failure"
    | "peripheral_arterial_disease"
  )[];
  visits?: GVisit[];
  reviews?: GReview[];
  events?: GEvent[];
  calls?: GCall[];
};

/** One expectation: numerator/denominator, or named parts. `who` lists the patient ids behind each number. */
export type GExpect = {
  num?: number;
  den?: number;
  parts?: Record<string, number>;
  who: Record<string, string[]>;
};
