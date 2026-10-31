import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { PRW } from "@/content/pharmacy-rework-patients";
import { pharmacyOpCheckins, pharmacyOpPillCounts } from "@/db/schema/pharmacy-rework-patients";
import { prescriptions } from "@/db/schema/prescribing";
import { runPatientsWrite } from "@/lib/pharmacy/epi/store";
import { fail } from "@/lib/pharmacy/stores/write";

/** Outpatient follow-up: the pill count before a refill and the antibiotic course check-in. Both append-only. */
type Opts = { database?: EmrDb; now?: Date };
export const OP_NEED: PharmacyNeed = { permission: ["pharmacy.dispense", "pharmacy.review"], point: "none" };

async function lineAt(ctx: PharmacyCtx, rxId: string) {
  const [p] = await ctx.tx
    .select({ id: prescriptions.id })
    .from(prescriptions)
    .where(and(eq(prescriptions.id, rxId), eq(prescriptions.hospitalId, ctx.actor.hospitalId)));
  if (!p) throw fail("not_found", PRW.common.failed);
}

export const PillCountInput = z.object({
  clientKey: z.uuid(),
  rxId: z.uuid(),
  back: z.number().int().min(0).max(100_000).nullable(),
});

export const recordPillCount = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(PillCountInput, raw, actor, OP_NEED, async (ctx, i) => {
    await lineAt(ctx, i.rxId);
    await ctx.tx
      .insert(pharmacyOpPillCounts)
      .values({ id: i.clientKey, hospitalId: ctx.actor.hospitalId, prescriptionId: i.rxId, broughtBack: i.back, countedBy: ctx.actor.userId, countedAt: ctx.now })
      .onConflictDoNothing();
    return { id: i.clientKey };
  }, o);

export const CheckInInput = z
  .object({
    clientKey: z.uuid(),
    rxId: z.uuid(),
    how: z.enum(["call", "sms", "visit"]),
    status: z.enum(["taking", "missed_some", "stopped", "not_started"]),
    missed: z.number().int().min(0).max(200),
    sideEffects: z.array(z.string().min(2).max(40)).max(10),
  })
  .refine((v) => v.status !== "taking" || v.missed === 0);

export const recordCheckIn = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(CheckInInput, raw, actor, OP_NEED, async (ctx, i) => {
    await lineAt(ctx, i.rxId);
    await ctx.tx
      .insert(pharmacyOpCheckins)
      .values({
        id: i.clientKey,
        hospitalId: ctx.actor.hospitalId,
        prescriptionId: i.rxId,
        how: i.how,
        status: i.status,
        missed: i.missed,
        sideEffects: i.sideEffects.filter((s) => s !== "None"),
        checkedBy: ctx.actor.userId,
        checkedAt: ctx.now,
      })
      .onConflictDoNothing();
    return { id: i.clientKey };
  }, o);
