"use server";

import { z } from "zod";

import { runEmrWrite } from "@/lib/emr/write/orders";
import * as rel from "@/lib/emr/write/relations";

/**
 * Relations between diagnoses (migration 0096, dx-relations-design §4). Each: Zod →
 * requireEmrActor(surface) (AAL2, scope) → EMR_V1 for the hospital → one transaction with the access
 * check → lib/emr/write/relations.ts (cadre, classes; the 0096 guard refuses loops, differentials,
 * a fifth level). Idempotent on the client key; audited by the 0096 trigger.
 */

const surface = z.enum(["doctor", "nurse", "clinician"]);
const uuid = z.uuid();
// activeThisVisit derives `<key>:episode`: a client key may not contain ':'.
const clientKey = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .refine((k) => !k.includes(":"), "That key is reserved.");
const base = { surface, patientUserId: uuid, clientKey };
const label = z.enum(["complication", "secondary", "precipitated_by"]);

const CreateRelation = z.object({
  ...base,
  encounterId: uuid,
  conditionId: uuid,
  relatedConditionId: uuid,
  relationType: z.enum(["due_to", "associated_with", "risk_factor_for", "episode_of"]),
  label: label.nullish(),
  qualifiers: z
    .array(
      z.enum([
        "cause.insulin_omission",
        "cause.new_medicine",
        "cause.treatment_interruption",
        "cause.alcohol",
        "cause.pregnancy",
        "cause.immobility",
      ]),
    )
    .max(6)
    .optional(),
  position: z.number().int().min(1).max(20).optional(),
  catalogueRef: z.string().trim().max(200).nullish(),
  origin: z.enum(["clinician", "backfill_confirmed"]).optional(),
});
const RetireRelation = z.object({
  ...base,
  id: uuid,
  reasonCode: z.string().trim().max(60).optional(),
  reasonText: z.string().trim().max(1000).optional(),
  enteredInError: z.boolean().optional(),
});
const MoveRelation = z.object({ ...base, id: uuid, position: z.number().int().min(1).max(20) });
const RelabelRelation = z.object({ ...base, id: uuid, label });
const ActiveThisVisit = z.object({
  ...base,
  encounterId: uuid,
  problemId: uuid,
  rank: z.enum(["primary", "secondary"]).optional(),
  verification: z.enum(["provisional", "confirmed"]).optional(),
});

/** Link two diagnoses: secondary to, complication of, precipitated by, associated with… */
export async function createRelation(raw: unknown) {
  return runEmrWrite(CreateRelation, raw, rel.createRelation);
}
/** Unlink (or mark the link entered in error), with a reason. */
export async function retireRelation(raw: unknown) {
  return runEmrWrite(RetireRelation, raw, rel.retireRelation);
}
/** Reorder a link under its parent. */
export async function moveRelation(raw: unknown) {
  return runEmrWrite(MoveRelation, raw, rel.moveRelation);
}
/** Change a cause link's wording. */
export async function relabelRelation(raw: unknown) {
  return runEmrWrite(RelabelRelation, raw, rel.relabelRelation);
}
/** A known condition is active this visit: its visit diagnosis and episode_of link, together. */
export async function activeThisVisit(raw: unknown) {
  return runEmrWrite(ActiveThisVisit, raw, rel.activeThisVisit);
}
