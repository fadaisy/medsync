import type { PatientSex } from "./catalogue";
import type { Signoff } from "./flags";
import type { ConversionFlagDefs } from "./legacy";
import type { AdultVitals } from "@/lib/triage/types";

/**
 * What the v2 desk reads from the record, beside the v1 DeskPayload (lib/emr/read/desk.ts). The
 * catalogue itself is fetched once per session from `catalogueUrl` (immutable, keyed by its hash).
 */
export interface ClerkingDeskData {
  catalogueUrl: string;
  catalogueVersion: string;
  sex: PatientSex;
  ageYears: number | null;
  /** The newest reading of each NEWS2 input from the observation store (never copied). */
  vitals: AdultVitals;
  vitalsAt: string | null;
  vitalsFromTriage: boolean;
  medicines: {
    statementId: string;
    name: string;
    doseText: string | null;
    frequencyCode: string | null;
    adherence: string | null;
    informant: string | null;
    restricted: boolean;
    /** First recorded at this visit by this clinician: its X voids it (entered in error). */
    addedHere: boolean;
  }[];
  allergies: {
    status: "listed" | "no_known_drug_allergies" | "unable_to_assess" | "not_recorded";
    /** An NKDA or unable-to-assess assertion, or an allergy version, recorded at this encounter. */
    touchedThisVisit: boolean;
    items: {
      id: string;
      name: string;
      coded: boolean;
      reactions: string[];
      severity: string | null;
      source: string | null;
      restricted: boolean;
      /** First recorded at this visit by this clinician: its X voids it without a reason prompt. */
      addedHere: boolean;
    }[];
  };
  /** Catalogue symptoms whose token charts as a CFC finding at signing (token map ∘ concept), so
   *  the sign dialog can count what signing commits without shipping the fact catalogue. */
  chartable: string[];
  outbreakMode: boolean;
  canSeeRestricted: boolean;
  signoff: Signoff;
  /** The signed wording of the conversion flags (a v1 draft continued in the new format). */
  conversionFlags?: ConversionFlagDefs;
  /** The examination catalogue's immutable URL (keyed by its hash) and its signature. */
  exam: {
    catalogueUrl: string;
    catalogueVersion: string;
    signoff: {
      flagRules: "all" | string[];
      referenceEntries: "all" | string[];
      classifiers: "all" | string[];
      withheld: string[];
    };
    /** The newest reading of each vital and measurement on the chart (triage projected in). */
    latest: {
      sbp: number | null;
      dbp: number | null;
      pulse: number | null;
      rr: number | null;
      spo2: number | null;
      temp: number | null;
      glucose: number | null;
      weight: number | null;
      height: number | null;
      waist: number | null;
    };
    /** The newest set saved from an examination at this visit, with its qualifiers (D-EX-11). */
    set: null | {
      at: string;
      fields: string[];
      arm: string | null;
      position: string | null;
      rhythm: string | null;
      site: string | null;
      glucoseContext: string | null;
      oxygen: "air" | "oxygen" | null;
      oxygenModality: string | null;
      /** ACVPU as saved with the set (C lives only here until the CFC addendum, HX3). */
      acvpu: "A" | "C" | "V" | "P" | "U" | null;
      confirmed: string[];
    };
    /** An open pregnancy episode (BMI and IMAM rules); null when none is recorded. */
    pregnant: boolean | null;
  };
}
