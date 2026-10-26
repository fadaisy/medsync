import type { EmrTx } from "@/lib/emr/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { admissions } from "@/db/schema/admissions";
import {
  pharmacyReconciliationDecisions,
  pharmacyReconciliations,
} from "@/db/schema/pharmacy-clinical";
import { EmrWriteError } from "./context";

/**
 * Pharmacy Phase 3, Step 9 (MR-1, D-PH3-16 as found): the discharging prescriber opens the reconciliation with
 * "Prepare medicines for home" and decides every row. The caller has already run `resolveEmrAccess` for the patient.
 * Decisions are append-only; the latest per row wins, and one after a confirmation reopens that row (MR-5).
 */

export const OpenInput = z.object({ clientKey: z.uuid(), patientUserId: z.uuid() });

export async function openReconciliation(
  tx: EmrTx,
  input: z.infer<typeof OpenInput> & { hospitalId: string; actorUserId: string; now: Date },
) {
  const [adm] = await tx
    .select({ id: admissions.id })
    .from(admissions)
    .where(
      and(
        eq(admissions.hospitalId, input.hospitalId),
        eq(admissions.patientUserId, input.patientUserId),
        eq(admissions.status, "arrived"),
      ),
    )
    .limit(1);
  if (!adm) throw new EmrWriteError("not_found", "This patient has no admission at this hospital.");
  const [existing] = await tx
    .select({ id: pharmacyReconciliations.id })
    .from(pharmacyReconciliations)
    .where(eq(pharmacyReconciliations.admissionId, adm.id));
  if (existing) return { id: existing.id };
  const [r] = await tx
    .insert(pharmacyReconciliations)
    .values({
      id: input.clientKey,
      hospitalId: input.hospitalId,
      patientUserId: input.patientUserId,
      admissionId: adm.id,
      openedBy: input.actorUserId,
      openedAt: input.now,
      clientKey: input.clientKey,
    })
    .returning({ id: pharmacyReconciliations.id });
  return { id: r!.id };
}

const NEEDS_REASON = ["stay_stopped", "paused", "changed"];

export const DecideInput = z
  .object({
    clientKey: z.uuid(),
    reconciliationId: z.uuid(),
    rowKey: z.string().min(2).max(120),
    decision: z.enum([
      "continue",
      "restart",
      "changed",
      "stay_stopped",
      "paused",
      "ends_on_ward",
      "new_for_home",
    ]),
    reason: z.string().trim().min(2).max(500).nullable(),
  })
  .refine((d) => !NEEDS_REASON.includes(d.decision) || d.reason, {
    message: "Stopping, pausing or changing a medicine needs a reason.",
  });

export async function recordHomeDecision(
  tx: EmrTx,
  input: z.infer<typeof DecideInput> & {
    hospitalId: string;
    actorUserId: string;
    actorCadre: string | null;
    now: Date;
  },
) {
  const [rec] = await tx
    .select({ id: pharmacyReconciliations.id })
    .from(pharmacyReconciliations)
    .where(
      and(
        eq(pharmacyReconciliations.id, input.reconciliationId),
        eq(pharmacyReconciliations.hospitalId, input.hospitalId),
      ),
    );
  if (!rec) throw new EmrWriteError("not_found", "That reconciliation is not at this hospital.");
  const [d] = await tx
    .insert(pharmacyReconciliationDecisions)
    .values({
      id: input.clientKey,
      reconciliationId: rec.id,
      hospitalId: input.hospitalId,
      rowKey: input.rowKey,
      decision: input.decision,
      reason: input.reason,
      decidedBy: input.actorUserId,
      deciderCadre: input.actorCadre,
      decidedAt: input.now,
      clientKey: input.clientKey,
    })
    .returning({ id: pharmacyReconciliationDecisions.id });
  return { id: d!.id };
}
