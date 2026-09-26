"use server";

import { z } from "zod";

import * as intents from "@/lib/emr/write/intents";
import { runEmrWrite } from "@/lib/emr/write/orders";

/** Triage suggestions in Plan: accept places a real order; dismiss orders nothing (PROMPT §8). */

const uuid = z.uuid();
const Suggestion = {
  surface: z.enum(["doctor", "clinician"]),
  patientUserId: uuid,
  encounterId: uuid,
  triageRecordId: uuid,
  /** A lib/triage/recommend.ts code, e.g. "invx_glucose". */
  recommendationKey: z.string().regex(/^[a-z0-9_]{1,60}$/),
};

const Accept = z.object({
  ...Suggestion,
  order: z.object({
    clientKey: z.string().trim().min(8).max(120),
    testId: uuid,
    priority: z.enum(["routine", "urgent", "immediate"]),
    reasonConditionIds: z.array(uuid).max(10).optional(),
    reasonText: z.string().trim().max(500).optional(),
  }),
});
const Dismiss = z.object(Suggestion);

export async function acceptSuggestedOrder(raw: unknown) {
  return runEmrWrite(Accept, raw, intents.acceptSuggestedOrder);
}

export async function dismissSuggestedOrder(raw: unknown) {
  return runEmrWrite(Dismiss, raw, intents.dismissSuggestedOrder);
}
