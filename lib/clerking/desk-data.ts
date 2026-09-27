import type { PatientSex } from "./catalogue";
import type { Signoff } from "./flags";
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
    }[];
  };
  outbreakMode: boolean;
  canSeeRestricted: boolean;
  signoff: Signoff;
}
