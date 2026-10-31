import type { Who } from "@/lib/pharmacy/cd/store";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { pharmacyStockMovements } from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyControlResolutions,
  pharmacyShiftHandoverItems,
  pharmacyShiftHandoverLines,
  pharmacyShiftHandoverMisses,
  pharmacyShiftHandovers,
} from "@/db/schema/pharmacy-rework-controls";
import { q } from "@/lib/pharmacy/cd/sql";
import { balanceAt, isInCharge } from "@/lib/pharmacy/cd/store";
import { fail, loadLocation, placeCols } from "@/lib/pharmacy/stores/write";

/**
 * Shift handover, the writes (rework TECH-SPEC §4 "Handover"). Handing over is fixed to the signed-in person and to
 * their own station unless they are the in-charge (checked here against the place chip, and in SQL by 0267). The
 * incoming person accepts on their own screen; accepting writes the balance check for the controlled lines and opens
 * cases for other differences (0267 triggers).
 */
export const HandoverInput = z.object({
  clientKey: z.uuid(),
  locationId: z.uuid(),
  toUserId: z.uuid(),
  slotAt: z.coerce.date().nullable(),
  counts: z
    .array(
      z.object({
        medicineId: z.string().min(1).max(120),
        counted: z.number().int().min(0),
        highRisk: z.boolean(),
      }),
    )
    .max(60),
  keys: z.literal(true),
  sealNo: z.string().trim().min(2).max(40).nullable(),
  sealNew: z.boolean(),
  items: z.array(z.string().trim().min(2).max(300)).max(100),
  notes: z.string().trim().min(1).max(1000).nullable(),
});

export async function handOverStation(
  who: Who & { station: string | null },
  input: z.infer<typeof HandoverInput>,
) {
  const [done] = await who.tx
    .select({ id: pharmacyShiftHandovers.id })
    .from(pharmacyShiftHandovers)
    .where(eq(pharmacyShiftHandovers.id, input.clientKey));
  if (done) return { id: done.id };
  if (input.locationId !== who.station && !(await isInCharge(who.tx, who.userId, who.hospitalId)))
    throw fail("forbidden", "You hand over only the station you are working at.");
  if (input.toUserId === who.userId) throw fail("invalid", "Hand over to someone else.");
  const place = await loadLocation(who.tx, who.hospitalId, input.locationId);
  const [duty] = await q<{ ok: boolean }>(
    who.tx,
    sql`SELECT private.pharmacy_on_duty(${who.hospitalId}::uuid, ${input.toUserId}::uuid, ${place.id}::uuid,
          ${(input.slotAt ?? who.now).toISOString()}::timestamptz) AS ok`,
  );
  if (!duty?.ok)
    throw fail("forbidden", "That person is not on duty then. Choose someone on the roster.");
  await who.tx.insert(pharmacyShiftHandovers).values({
    id: input.clientKey,
    hospitalId: who.hospitalId,
    locationId: place.id,
    slotAt: input.slotAt,
    fromUserId: who.userId,
    toUserId: input.toUserId,
    keysHanded: input.keys,
    sealNo: input.sealNo,
    sealNew: input.sealNew,
    notes: input.notes,
  });
  if (input.counts.length)
    await who.tx.insert(pharmacyShiftHandoverLines).values(
      await Promise.all(
        input.counts.map(async (c) => ({
          handoverId: input.clientKey,
          hospitalId: who.hospitalId,
          medicineId: c.medicineId,
          highRisk: c.highRisk,
          expected: await balanceAt(who.tx, who.hospitalId, place.id, c.medicineId),
          counted: c.counted,
        })),
      ),
    );
  if (input.items.length)
    await who.tx
      .insert(pharmacyShiftHandoverItems)
      .values(
        input.items.map((text, n) => ({
          handoverId: input.clientKey,
          hospitalId: who.hospitalId,
          n,
          text,
          seenAt: who.now,
        })),
      );
  return { id: input.clientKey };
}

export const AcceptInput = z.object({ handoverId: z.uuid() });

/** The incoming person accepts on their own screen; only they can. */
export async function acceptHandover(who: Who, input: z.infer<typeof AcceptInput>) {
  const [h] = await who.tx
    .update(pharmacyShiftHandovers)
    .set({ acceptedAt: who.now })
    .where(
      and(
        eq(pharmacyShiftHandovers.id, input.handoverId),
        eq(pharmacyShiftHandovers.hospitalId, who.hospitalId),
        eq(pharmacyShiftHandovers.toUserId, who.userId),
        isNull(pharmacyShiftHandovers.acceptedAt),
      ),
    )
    .returning({ id: pharmacyShiftHandovers.id });
  if (!h) throw fail("not_found", "This handover is not waiting for you.");
  return { id: h.id };
}

export const MissInput = z
  .object({
    locationId: z.uuid(),
    slotAt: z.coerce.date(),
    why: z.enum(["paper", "covered", "not_done"]),
    note: z.string().trim().min(3).max(500).nullable(),
  })
  .refine((x) => x.why !== "not_done" || !!x.note, { message: "Add a note." });

export async function explainMissed(who: Who, input: z.infer<typeof MissInput>) {
  const [row] = await who.tx
    .insert(pharmacyShiftHandoverMisses)
    .values({
      hospitalId: who.hospitalId,
      locationId: input.locationId,
      slotAt: input.slotAt,
      why: input.why,
      note: input.note,
      createdBy: who.userId,
    })
    .onConflictDoNothing()
    .returning({ id: pharmacyShiftHandoverMisses.id });
  return { id: row?.id ?? input.locationId };
}

export const DiffInput = z.object({
  handoverId: z.uuid(),
  medicineId: z.string().min(1).max(120),
  how: z.enum(["recount", "late_entry", "loss", "excess"]),
  why: z.string().trim().min(2).max(200),
  incidentRef: z.string().trim().min(3).max(60).nullable(),
  given: z
    .object({
      patient: z.string().trim().min(3).max(160),
      givenByUserId: z.uuid().nullable(),
      at: z.coerce.date(),
      approx: z.string().max(80).nullable(),
    })
    .nullable(),
});

/**
 * A high-risk (not controlled) handover difference, tap-only: recounted, given and not recorded (a late `ward_used`
 * at the chosen time, the shift named when it is approximate), or a confirmed loss or excess (in-charge, incident).
 * Controlled differences are resolved in Controlled drugs.
 */
export async function resolveHandoverDiff(who: Who, input: z.infer<typeof DiffInput>) {
  const [l] = await q<{
    place: string;
    expected: number;
    counted: number;
    controlled: boolean;
    at: string;
  }>(
    who.tx,
    sql`SELECT h.location_id AS place, l.expected, l.counted, h.accepted_at AS at,
               private.pharmacy_medicine_controlled(h.hospital_id, l.medicine_id) AS controlled
          FROM public.pharmacy_shift_handovers h
          JOIN public.pharmacy_shift_handover_lines l ON l.handover_id = h.id AND l.medicine_id = ${input.medicineId}
         WHERE h.id = ${input.handoverId}::uuid AND h.hospital_id = ${who.hospitalId}::uuid`,
  );
  if (!l) throw fail("not_found", "That handover line is not at your hospital.");
  if (l.controlled) throw fail("invalid", "Resolve a controlled difference in Controlled drugs.");
  const diff = Number(l.counted) - Number(l.expected);
  const place = await loadLocation(who.tx, who.hospitalId, l.place);
  let movementId: string | null = null;
  const write = async (qty: number, kind: "ward_used" | "adjusted", at: Date, note: string) => {
    const [b] = await q<{ id: string }>(
      who.tx,
      sql`SELECT b.id FROM public.pharmacy_batches b JOIN public.pharmacy_products p ON p.id = b.product_id
           WHERE coalesce(b.location_id, b.dispensing_point_id) = ${place.id}::uuid AND p.medicine_id = ${input.medicineId}
             AND (${qty} > 0 OR coalesce((SELECT sum(quantity) FROM public.pharmacy_stock_movements WHERE batch_id = b.id), 0) >= ${-qty})
           ORDER BY b.expiry LIMIT 1`,
    );
    if (!b) throw fail("conflict", "No batch here holds that much.");
    const [m] = await who.tx
      .insert(pharmacyStockMovements)
      .values({
        hospitalId: who.hospitalId,
        ...placeCols(place),
        batchId: b.id,
        kind,
        quantity: qty,
        effectiveAt: at,
        actorUserId: who.userId,
        reasonCode:
          kind === "adjusted" ? (qty < 0 ? "handover_loss" : "handover_excess") : "handover_late",
        reasonNote: note,
        sourceKind: "adjustment",
        sourceId: input.handoverId,
        idempotencyKey: `ho-resolve:${input.handoverId}:${input.medicineId}`,
      })
      .returning({ id: pharmacyStockMovements.id });
    movementId = m!.id;
  };
  if (input.how === "late_entry") {
    if (!input.given || diff >= 0) throw fail("invalid", "A late entry explains a shortfall only.");
    if (input.given.at > new Date(l.at))
      throw fail("invalid", "Choose a time before the handover.");
    await write(
      diff,
      "ward_used",
      input.given.at,
      `${input.given.patient}${input.given.approx ? ` · ${input.given.approx}` : ""}`,
    );
  }
  if (input.how === "loss" || input.how === "excess") {
    if (!(await isInCharge(who.tx, who.userId, who.hospitalId)))
      throw fail("forbidden", "Only the in-charge pharmacist can sign a loss.");
    if (!input.incidentRef) throw fail("invalid", "Type the incident report number.");
    await write(diff, "adjusted", who.now, `${input.why} · Incident ${input.incidentRef}`);
  }
  await who.tx.insert(pharmacyControlResolutions).values({
    sourceType: "handover",
    sourceId: input.handoverId,
    medicineId: input.medicineId,
    hospitalId: who.hospitalId,
    how: input.how,
    why: input.why,
    incidentRef: input.incidentRef,
    movementId,
    resolvedBy: who.userId,
    resolvedAt: who.now,
  });
  return { id: input.handoverId };
}
