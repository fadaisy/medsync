"use server";

import { z } from "zod";

import * as dx from "@/lib/emr/write/diagnoses";
import { runEmrWrite } from "@/lib/emr/write/orders";

/**
 * The Impression step's diagnosis actions (PROMPT-CLERKING-SUMMARY-IMPRESSION §9, gate-a-proposal
 * §3). Each: Zod → requireEmrActor(surface) (AAL2, scope) → EMR_V1 for the hospital → one
 * transaction with the access check → lib/emr/write/diagnoses.ts (cadre checks). Idempotent on the
 * client key; returns { id, serverTime }. Audited by the 0071 and 0030 triggers.
 *
 * Recording and status changes stay lib/emr/actions/facts.ts (recordEncounterDiagnosis raises the
 * co-signature itself for a junior's Final on a new diagnosis; updateProblemStatus is unchanged but
 * for the D-SI-21 guard). requestDiagnosisCosign is a junior's Final on a diagnosis already on the
 * visit.
 */

const surface = z.enum(["doctor", "nurse", "clinician"]);
const uuid = z.uuid();
// setLeadingDiagnosis derives `<key>:promote` for its second version: a client key may not
// contain ':' (the namespace the server derives in, as the notes actions).
const clientKey = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .refine((k) => !k.includes(":"), "That key is reserved.");
const base = { surface, patientUserId: uuid, clientKey };

const SetLeadingDiagnosis = z.object({ ...base, encounterId: uuid, id: uuid });
const MoveToDifferential = z.object({ ...base, id: uuid });
const RequestDiagnosisCosign = z.object({ ...base, id: uuid });
const DecideDiagnosisCosign = z.object({
  ...base,
  surface: z.enum(["doctor"]),
  requestId: uuid,
  decision: z.enum(["approve", "return"]),
  reviewNote: z.string().trim().max(1000).optional(),
});

/** Make a diagnosis on this visit the leading one: the old primary moves to the differential. */
export async function setLeadingDiagnosis(raw: unknown) {
  return runEmrWrite(SetLeadingDiagnosis, raw, dx.setLeadingDiagnosis);
}
/** Move a diagnosis (the leading one, usually) to the differential: no leading diagnosis. */
export async function moveToDifferential(raw: unknown) {
  return runEmrWrite(MoveToDifferential, raw, dx.moveToDifferential);
}
/** A junior's Final: stored Working, "Final · awaiting senior co-signature". */
export async function requestDiagnosisCosign(raw: unknown) {
  return runEmrWrite(RequestDiagnosisCosign, raw, dx.requestDiagnosisCosign);
}
/** The co-signature inbox: approve (the diagnosis becomes Final) or return with a note. */
export async function decideDiagnosisCosign(raw: unknown) {
  return runEmrWrite(DecideDiagnosisCosign, raw, dx.decideDiagnosisCosign);
}
