import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { PharmacyActor, PharmacyNeed } from "@/lib/pharmacy/write";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { PRW } from "@/content/pharmacy-rework-patients";
import { pharmacyIpNotes, pharmacyRoundPickLines, pharmacyRoundPicks } from "@/db/schema/pharmacy-rework-patients";
import { runPatientsWrite } from "@/lib/pharmacy/epi/store";
import { issueStock, mayIssueFrom } from "@/lib/pharmacy/stores/issue-store";
import { fail, loadLocation } from "@/lib/pharmacy/stores/write";
import { q } from "@/lib/pharmacy/wards/sql";

/**
 * Inpatient picks (TECH-SPEC §4 Wards): a round or one patient's pick is one issue to the ward (`issueStock`, first
 * expiry first, the ward confirms on receipt) plus a line per prescription so each patient's journey can be followed.
 */
type Opts = { database?: EmrDb; now?: Date };
export const PICK_NEED: PharmacyNeed = { permission: ["pharmacy.store", "pharmacy.dispense"], point: "none" };
export const NOTE_NEED: PharmacyNeed = { permission: ["pharmacy.review", "pharmacy.dispense", "pharmacy.store"], point: "none" };

export const PickInput = z.object({
  clientKey: z.uuid(),
  wardId: z.uuid(),
  fromId: z.uuid(),
  windowH: z.union([z.literal(12), z.literal(24), z.literal(48)]).nullable(),
  lines: z
    .array(z.object({ rxId: z.uuid(), quantity: z.number().int().min(1).max(10_000) }))
    .min(1)
    .max(300),
});

export const sendPick = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(PickInput, raw, actor, PICK_NEED, async (ctx, i) => {
    const [again] = await ctx.tx.select({ id: pharmacyRoundPicks.id }).from(pharmacyRoundPicks).where(eq(pharmacyRoundPicks.id, i.clientKey));
    if (again) return { id: again.id };
    const h = ctx.actor.hospitalId;
    const from = await loadLocation(ctx.tx, h, i.fromId);
    const to = await loadLocation(ctx.tx, h, i.wardId);
    if (to.kind !== "ward") throw fail("invalid", PRW.inpatients.noWards);
    mayIssueFrom(ctx, from.id);
    // Each line's prescription, active, on a patient who has arrived on this ward; the product held at `from`.
    const rows = await q<{ id: string; patient: string; product: string | null }>(
      ctx.tx,
      sql`SELECT p.id, p.patient_user_id AS patient,
                 (SELECT pr.id FROM public.pharmacy_products pr
                    JOIN public.pharmacy_batches b ON b.product_id = pr.id
                    JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
                   WHERE pr.hospital_id = p.hospital_id AND pr.medicine_id = p.drug_id AND pr.active
                     AND coalesce(m.location_id, m.dispensing_point_id) = ${from.id}::uuid
                   GROUP BY pr.id ORDER BY sum(m.quantity) DESC LIMIT 1) AS product
            FROM public.prescriptions p
            JOIN public.admissions a ON a.patient_user_id = p.patient_user_id AND a.status = 'arrived'
            JOIN public.pharmacy_locations l ON l.ward_id = a.ward_id AND l.id = ${to.id}::uuid
           WHERE p.hospital_id = ${h}::uuid AND p.state = 'active'
             AND p.id IN (${sql.join(i.lines.map((l) => sql`${l.rxId}::uuid`), sql`, `)})`,
    );
    const of = new Map(rows.map((r) => [r.id, r]));
    const lines = i.lines.map((l) => {
      const r = of.get(l.rxId);
      if (!r) throw fail("not_found", PRW.inpatients.noPatients);
      if (!r.product) throw fail("conflict", PRW.inpatients.noSource);
      return { ...l, patient: r.patient, product: r.product };
    });
    const per = new Map<string, number>();
    for (const l of lines) per.set(l.product, (per.get(l.product) ?? 0) + l.quantity);
    const issue = await issueStock(ctx, {
      kind: "issue",
      from,
      to,
      requisitionId: null,
      lines: [...per].map(([productId, quantity]) => ({ productId, quantity })),
    });
    await ctx.tx.insert(pharmacyRoundPicks).values({
      id: i.clientKey,
      hospitalId: h,
      wardLocationId: to.id,
      kind: i.windowH ? "round" : "patient",
      windowH: i.windowH,
      issueId: issue.id,
      pickedBy: ctx.actor.userId,
      pickedAt: ctx.now,
    });
    await ctx.tx.insert(pharmacyRoundPickLines).values(
      lines.map((l) => ({
        roundId: i.clientKey,
        hospitalId: h,
        patientUserId: l.patient,
        prescriptionId: l.rxId,
        productId: l.product,
        quantity: l.quantity,
      })),
    );
    return { id: i.clientKey };
  }, o);

export const NoteInput = z.object({ patientId: z.uuid(), body: z.string().trim().min(2).max(500) });

export const addNote = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(NoteInput, raw, actor, NOTE_NEED, async (ctx, i) => {
    const [n] = await ctx.tx
      .insert(pharmacyIpNotes)
      .values({ hospitalId: ctx.actor.hospitalId, patientUserId: i.patientId, body: i.body, writtenBy: ctx.actor.userId, writtenAt: ctx.now })
      .returning({ id: pharmacyIpNotes.id });
    return { id: n!.id };
  }, o);
