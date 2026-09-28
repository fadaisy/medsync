/**
 * The clerking catalogue's ids ↔ the record's CHECK values (GATE A H1–H3), in one place. Pure.
 */

/** Allergy reactions (H2). `stomach_upset` is recorded as `other`; `not_known` records none. */
export const REACTION_TO_MANIFESTATION: Record<string, string | null> = {
  rash: "rash",
  hives_or_itch: "urticaria",
  swelling_of_face_or_lips: "angioedema",
  wheeze_or_breathing_difficulty: "bronchospasm",
  collapse_anaphylaxis: "anaphylaxis",
  severe_skin_peeling_or_blistering_sjs_ten: "sjs_ten",
  stomach_upset: "other",
  not_known: null,
};
export const MANIFESTATION_TO_REACTION: Record<string, string> = {
  rash: "rash",
  urticaria: "hives_or_itch",
  angioedema: "swelling_of_face_or_lips",
  bronchospasm: "wheeze_or_breathing_difficulty",
  anaphylaxis: "collapse_anaphylaxis",
  sjs_ten: "severe_skin_peeling_or_blistering_sjs_ten",
  other: "stomach_upset",
};

/** Allergy source → the record's informant. */
export const ALLERGY_SOURCE_TO_INFORMANT: Record<
  string,
  "patient" | "relative" | "record" | "clinician_observed"
> = {
  patient: "patient",
  relative: "relative",
  records: "record",
  clinician_observed: "clinician_observed",
};
export const INFORMANT_TO_ALLERGY_SOURCE: Record<string, string> = {
  patient: "patient",
  relative: "relative",
  record: "records",
  clinician_observed: "clinician_observed",
};

/** Who said so about a medicine (H1) → medication_source (the column keeps its meaning). */
export function medicationSourceFor(
  informant: string | null | undefined,
): "patient_reported" | "external_record" {
  return informant === "medicine_card" ||
    informant === "referral_letter" ||
    informant === "dispensing_record"
    ? "external_record"
    : "patient_reported";
}

/** Family relations (H3): never `self`, so a relative's condition never reaches the patient's list. */
export const RELATION_TO_SUBJECT: Record<
  string,
  "mother" | "father" | "sibling" | "child" | "other_first_degree" | "second_degree"
> = {
  mother: "mother",
  father: "father",
  sibling: "sibling",
  child: "child",
  grandparent: "second_degree",
  other_relative: "other_first_degree",
};
