"use server";

import { z } from "zod";

import { EmrWriteError } from "@/lib/emr/write/context";
import { runEmrWrite } from "@/lib/emr/write/orders";
import * as write from "@/lib/emr/write/repeats";
import { pharmacyRepeatsLiveFor } from "@/lib/pharmacy/feature";

/**
 * Pharmacy Phase 4, Step 4 (Section 8): `stopRepeats` and `answerRenewal`, behind `PHARMACY_REPEATS`. The house
 * contract via runEmrWrite: Zod → getUser → AAL2 → the record's access check → one transaction → audit.
 * `authoriseRepeats` has no action of its own: it runs inside placePlan's transaction (Law 2).
 */

const surface = z.enum(["doctor", "clinician"]);
const OFF = "Repeats are not switched on here.";

const StopRepeats = z.object({
  surface,
  patientUserId: z.uuid(),
  prescriptionId: z.uuid(),
  reason: z.string().trim().min(2, "Say why the repeats stop.").max(500),
});

export async function stopRepeats(raw: unknown) {
  return runEmrWrite(StopRepeats, raw, (ctx, input) => {
    if (!pharmacyRepeatsLiveFor(ctx.actor.hospitalId)) throw new EmrWriteError("config", OFF);
    return write.stopRepeats(ctx, input);
  });
}

const AnswerRenewal = z.object({
  surface,
  patientUserId: z.uuid(),
  renewalId: z.uuid(),
  answer: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("visit_needed") }),
    z.object({ kind: z.literal("declined"), reasonCode: z.string().trim().min(2).max(60) }),
  ]),
  note: z.string().trim().max(500).nullable(),
});

export async function answerRenewal(raw: unknown) {
  return runEmrWrite(AnswerRenewal, raw, (ctx, input) => {
    if (!pharmacyRepeatsLiveFor(ctx.actor.hospitalId)) throw new EmrWriteError("config", OFF);
    return write.answerRenewal(ctx, input);
  });
}
