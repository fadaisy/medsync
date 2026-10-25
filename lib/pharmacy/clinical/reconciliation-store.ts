import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { z } from "zod";

import { pharmacyReconciliationEvents } from "@/db/schema/pharmacy-clinical";
import { EmrWriteError } from "@/lib/emr/write/context";
import { blockers, rowsOf } from "./reconciliation";
import { factsFor, medicineName, rulesFor } from "./reconciliation-read";

/** Pharmacy Phase 3, Step 9: the pharmacist's side (MR-3 explanations, MR-4 confirm, MR-6 close). Append-only. */

const base = { clientKey: z.uuid(), reconciliationId: z.uuid() };
export const EventInput = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("explained"),
    discrepancy: z.string().min(2).max(160),
    reason: z.string().trim().min(2).max(160),
  }),
  z.object({
    ...base,
    kind: z.literal("added"),
    reason: z.enum(["not_recorded", "dose_differs", "other"]),
    note: z.string().trim().min(2).max(1000),
  }),
  z.object({ ...base, kind: z.literal("confirmed") }),
  z.object({
    ...base,
    kind: z.literal("closed"),
    reason: z.enum(["confirmed_by_phone", "at_next_visit", "other"]),
    note: z.string().trim().min(2).max(1000),
  }),
  z.object({ ...base, kind: z.literal("printed") }),
]);

export async function reconciliationEvent(ctx: PharmacyCtx, input: z.infer<typeof EventInput>) {
  const f = await factsFor(ctx.tx, ctx.actor.hospitalId, input.reconciliationId, ctx.now);
  if (!f) throw new EmrWriteError("not_found", "That reconciliation is not at this hospital.");
  const rules = await rulesFor(ctx.tx, ctx.actor.hospitalId);
  let snapshot: unknown = null;
  if (input.kind === "explained" && !rules.explainReasons.includes(input.reason))
    throw new EmrWriteError("invalid", "Choose a reason from the signed list.");
  if (input.kind === "confirmed") {
    // MR-4, checked again on the server: the screen's button is only a convenience.
    const label = (r: ReturnType<typeof rowsOf>[number]) => medicineName(r.medicineId, r.text);
    const why = blockers(f.facts, rules.on, label);
    if (why.length) throw new EmrWriteError("invalid", why[0]!);
    snapshot = rowsOf(f.facts).map((r) => ({
      key: r.key,
      name: label(r),
      decision: r.decision?.decision ?? null,
      reason: r.decision?.reason ?? null,
    }));
  }
  const [e] = await ctx.tx
    .insert(pharmacyReconciliationEvents)
    .values({
      id: input.clientKey,
      reconciliationId: input.reconciliationId,
      hospitalId: ctx.actor.hospitalId,
      kind: input.kind,
      discrepancy: input.kind === "explained" ? input.discrepancy : null,
      reason: "reason" in input ? input.reason : null,
      note: "note" in input ? input.note : null,
      snapshot,
      actorUserId: ctx.actor.userId,
      at: ctx.now,
      clientKey: input.clientKey,
    })
    .returning({ id: pharmacyReconciliationEvents.id });
  return { id: e!.id };
}
