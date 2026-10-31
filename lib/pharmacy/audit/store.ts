import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { RC } from "@/content/pharmacy-rework-records";
import { EmrWriteError } from "@/lib/emr/write/context";
import { CORRECTABLE } from "./derive";
import { rowsOf } from "./read";

/**
 * Corrections (rework PRD S7, §6.6; TECH-SPEC §4 `correctMovement`): a reversal that mirrors the original exactly
 * (`reverses_id`, the 0265 guard enforces the mirror and one reversal per line) and, when needed, the right line
 * (`correction_of_id`, 0269). The original stays. A controlled correction needs a witness approval, which the guard
 * takes once for the whole correction. Own entries; the in-charge (`pharmacy.manage`) corrects anyone's.
 */
export const CORRECT_REASONS = [
  "wrong_quantity",
  "wrong_batch",
  "entered_twice",
  "did_not_happen",
  "wrong_patient_or_place",
] as const;
export type CorrectReason = (typeof CORRECT_REASONS)[number];

export const CORRECT_NEED: PharmacyNeed = {
  permission: ["pharmacy.dispense", "pharmacy.stock", "pharmacy.store", "pharmacy.manage"],
  point: "none",
};

export const CorrectInput = z
  .object({
    clientKey: z.uuid(),
    movementId: z.uuid(),
    reason: z.enum(CORRECT_REASONS),
    quantity: z.number().int().positive().max(1_000_000).nullish(),
    batchId: z.uuid().nullish(),
    witnessAttestationId: z.uuid().nullish(),
  })
  .refine((i) => i.reason !== "wrong_quantity" || !!i.quantity, { message: RC.correct.sameQty })
  .refine((i) => i.reason !== "wrong_batch" || !!i.batchId, { message: RC.correct.chooseBatch });

const fail = (code: "not_found" | "conflict" | "forbidden" | "invalid", m: string) =>
  new EmrWriteError(code, m);

interface Original {
  id: string;
  kind: string;
  quantity: number;
  batch_id: string;
  product_id: string;
  place_id: string;
  actor_user_id: string;
  source_kind: string;
  source_id: string | null;
  reverses_id: string | null;
  correction_of_id: string | null;
  controlled: boolean;
  reversal_id: string | null;
  reversal_key: string | null;
  window_closed: boolean;
}

export async function correctMovement(ctx: PharmacyCtx, input: z.infer<typeof CorrectInput>) {
  const hospitalId = ctx.actor.hospitalId;
  await ctx.tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-correct:${input.movementId}`}))`,
  );
  const [o] = rowsOf<Original>(
    await ctx.tx.execute(sql`
    SELECT m.id, m.kind, m.quantity, m.batch_id, b.product_id, coalesce(m.location_id, m.dispensing_point_id) AS place_id,
           m.actor_user_id, m.source_kind, m.source_id, m.reverses_id, m.correction_of_id,
           p.controlled_class IS NOT NULL OR private.pharmacy_batch_controlled(m.batch_id) AS controlled,
           r.id AS reversal_id, r.idempotency_key AS reversal_key,
           (m.kind = 'supplied' AND (EXISTS (SELECT 1 FROM public.pharmacy_supply_reversals x WHERE x.supply_id = m.source_id)
             OR EXISTS (SELECT 1 FROM public.pharmacy_supply_corrections x WHERE x.supply_id = m.source_id))) AS window_closed
      FROM public.pharmacy_stock_movements m
      JOIN public.pharmacy_batches b ON b.id = m.batch_id
      JOIN public.pharmacy_products p ON p.id = b.product_id
      LEFT JOIN public.pharmacy_stock_movements r ON r.reverses_id = m.id
     WHERE m.id = ${input.movementId}::uuid AND m.hospital_id = ${hospitalId}::uuid`),
  );
  if (!o) throw fail("not_found", RC.refused.notFound);
  // A replay of this same correction returns what it wrote.
  if (o.reversal_id) {
    if (o.reversal_key === `${input.clientKey}:rev`)
      return { id: o.reversal_id, replacementId: null };
    throw fail("conflict", RC.refused.already);
  }
  if (o.actor_user_id !== ctx.actor.userId && !ctx.manages)
    throw fail("forbidden", RC.refused.notYours);
  if (!(CORRECTABLE as readonly string[]).includes(o.kind) || o.reverses_id || o.correction_of_id)
    throw fail("invalid", RC.refused.notCorrectable);
  if (o.window_closed) throw fail("conflict", RC.refused.windowClosed);
  if (o.controlled && !input.witnessAttestationId) throw fail("invalid", RC.refused.witness);

  const sign = Math.sign(o.quantity);
  let replace: { batchId: string; quantity: number } | null = null;
  if (input.reason === "wrong_quantity") {
    if (input.quantity === Math.abs(o.quantity)) throw fail("invalid", RC.refused.quantity);
    replace = { batchId: o.batch_id, quantity: sign * input.quantity! };
  } else if (input.reason === "wrong_batch") {
    const [ok] = rowsOf<{ ok: boolean }>(
      await ctx.tx.execute(sql`
      SELECT true AS ok FROM public.pharmacy_batches b
       WHERE b.id = ${input.batchId!}::uuid AND b.id <> ${o.batch_id}::uuid AND b.hospital_id = ${hospitalId}::uuid
         AND b.product_id = ${o.product_id}::uuid AND coalesce(b.location_id, b.dispensing_point_id) = ${o.place_id}::uuid`),
    );
    if (!ok) throw fail("invalid", RC.refused.batch);
    replace = { batchId: input.batchId!, quantity: o.quantity };
  }

  const witness = input.witnessAttestationId ?? null;
  const [rev] = rowsOf<{ id: string }>(
    await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, location_id, batch_id, kind, quantity,
      effective_at, actor_user_id, reason_code, source_kind, source_id, reverses_id, witness_attestation_id, idempotency_key)
    SELECT hospital_id, dispensing_point_id, location_id, batch_id,
           CASE WHEN quantity < 0 THEN 'reversed' ELSE 'adjusted' END, -quantity, ${ctx.now.toISOString()}::timestamptz, ${ctx.actor.userId}::uuid,
           ${input.reason}, 'reversal', id, id, ${witness}::uuid, ${`${input.clientKey}:rev`}
      FROM public.pharmacy_stock_movements WHERE id = ${o.id}::uuid
    RETURNING id`),
  );

  // A hand-over keeps the window's own record in step: the supply counts as reversed, the replacement is a new supply.
  if (o.kind === "supplied" && o.source_id) {
    await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_supply_reversals (supply_id, hospital_id, dispensing_point_id, reason_code, pack_fit,
        returned_movement_id, witness_attestation_id, actor_user_id, actor_cadre)
      SELECT s.id, s.hospital_id, s.dispensing_point_id, ${input.reason}, true, ${rev!.id}::uuid, ${witness}::uuid,
             ${ctx.actor.userId}::uuid, ${ctx.actor.cadreName}
        FROM public.pharmacy_supplies s WHERE s.id = ${o.source_id}::uuid`);
  }

  let replacementId: string | null = null;
  if (replace) {
    let sourceId: string | null = o.source_id;
    if (o.kind === "supplied" && o.source_id) {
      const [s] = rowsOf<{ id: string }>(
        await ctx.tx.execute(sql`
        INSERT INTO public.pharmacy_supplies
        SELECT (jsonb_populate_record(s, jsonb_build_object('id', gen_random_uuid(), 'quantity', ${Math.abs(replace.quantity)}::int,
                 'batch_id', ${replace.batchId}::uuid))).*
          FROM public.pharmacy_supplies s WHERE s.id = ${o.source_id}::uuid
        RETURNING id`),
      );
      sourceId = s!.id;
    }
    const [rep] = rowsOf<{ id: string }>(
      await ctx.tx.execute(sql`
      INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, location_id, batch_id, kind, quantity,
        effective_at, actor_user_id, reason_code, reason_note, source_kind, source_id, delivery_from, delivery_ref,
        unit_cost, counterparty_id, witness_attestation_id, correction_of_id, idempotency_key)
      SELECT hospital_id, dispensing_point_id, location_id, ${replace.batchId}::uuid, kind, ${replace.quantity}::int,
             effective_at, ${ctx.actor.userId}::uuid, ${input.reason}, reason_note, source_kind, ${sourceId}::uuid,
             delivery_from, delivery_ref, unit_cost, counterparty_id, coalesce(${witness}::uuid, witness_attestation_id),
             id, ${`${input.clientKey}:rep`}
        FROM public.pharmacy_stock_movements WHERE id = ${o.id}::uuid
      RETURNING id`),
    );
    replacementId = rep!.id;
  }
  return { id: rev!.id, replacementId };
}

/* ─── Stock at risk: what was done (PRD §6.6 "each is recorded with who") ─── */

export const RiskInput = z.object({
  clientKey: z.uuid(),
  productId: z.uuid(),
  batchNumber: z.string().trim().min(1).max(60),
  action: z.enum(["offer", "swap", "use_first"]),
  valueUgx: z.number().int().min(0).max(2_000_000_000),
});

export const RISK_NEED: PharmacyNeed = {
  permission: ["pharmacy.stock", "pharmacy.store", "pharmacy.manage"],
  point: "none",
};

export async function riskAction(ctx: PharmacyCtx, input: z.infer<typeof RiskInput>) {
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_risk_actions (id, hospital_id, product_id, batch_number, action, value_ugx, created_by)
    SELECT ${input.clientKey}::uuid, ${ctx.actor.hospitalId}::uuid, p.id, ${input.batchNumber}, ${input.action},
           ${input.valueUgx}::int, ${ctx.actor.userId}::uuid
      FROM public.pharmacy_products p WHERE p.id = ${input.productId}::uuid AND p.hospital_id = ${ctx.actor.hospitalId}::uuid
    ON CONFLICT (id) DO NOTHING`);
  return { id: input.clientKey };
}
