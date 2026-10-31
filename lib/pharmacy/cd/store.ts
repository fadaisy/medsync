import type { EmrTx } from "@/lib/emr/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { pharmacyStockMovements } from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyCdCheckLines,
  pharmacyCdChecks,
  pharmacyCdDoses,
  pharmacyCdEvents,
  pharmacyControlResolutions,
} from "@/db/schema/pharmacy-rework-controls";
import { cdUnit, doseUnits, inWindow, missingWindow } from "@/lib/pharmacy/cd/derive";
import { loadCd } from "@/lib/pharmacy/cd/read";
import { q } from "@/lib/pharmacy/cd/sql";
import { fail, loadLocation, placeCols } from "@/lib/pharmacy/stores/write";

/**
 * Controlled drugs, the writes (rework TECH-SPEC §4 "CD"). Every controlled line goes through the ledger with a
 * witness approval (S3, enforced by 0265's guard); the dose detail, the balance check and the resolution sit beside
 * it (0267). A mismatched check opens its case in the database. Pure of Next.js: the actions pass the transaction.
 */
export interface Who {
  tx: EmrTx;
  userId: string;
  hospitalId: string;
  now: Date;
}

export const Witness = z.union([
  z.object({ attestationId: z.uuid() }),
  z.object({ paper: z.string().trim().min(3).max(120) }),
]);
type W = z.infer<typeof Witness>;
const attestation = (w: W) => ("attestationId" in w ? w.attestationId : null);
const paper = (w: W) => ("paper" in w ? w.paper : null);

const one = async <T>(tx: EmrTx, query: ReturnType<typeof sql>) => (await q<T>(tx, query))[0];

export async function isInCharge(tx: EmrTx | Parameters<typeof q>[0], userId: string, hospitalId: string) {
  const r = await one<{ ok: boolean }>(
    tx as EmrTx,
    sql`SELECT private.pharmacy_is_in_charge(${userId}::uuid, ${hospitalId}::uuid) AS ok`,
  );
  return r?.ok === true;
}

async function medicine(tx: EmrTx, hospitalId: string, medicineId: string) {
  const m = await one<{ name: string; controlled: boolean }>(
    tx,
    sql`SELECT p.name, private.pharmacy_medicine_controlled(p.hospital_id, p.medicine_id) AS controlled
          FROM public.pharmacy_products p WHERE p.hospital_id = ${hospitalId}::uuid AND p.medicine_id = ${medicineId}
         ORDER BY p.active DESC, p.created_at LIMIT 1`,
  );
  if (!m) throw fail("not_found", "That medicine is not stocked here.");
  return m;
}

/** First expiry first: the batches of a medicine at a place, with what each holds. */
async function batchesFor(tx: EmrTx, hospitalId: string, locationId: string, medicineId: string) {
  return q<{ id: string; bal: number }>(
    tx,
    sql`SELECT b.id, coalesce((SELECT sum(m.quantity) FROM public.pharmacy_stock_movements m WHERE m.batch_id = b.id), 0)::int AS bal
          FROM public.pharmacy_batches b JOIN public.pharmacy_products p ON p.id = b.product_id
         WHERE b.hospital_id = ${hospitalId}::uuid AND coalesce(b.location_id, b.dispensing_point_id) = ${locationId}::uuid
           AND p.medicine_id = ${medicineId}
         ORDER BY b.expiry, b.created_at`,
  );
}

function allocate(batches: { id: string; bal: number }[], n: number) {
  const out: { batchId: string; qty: number }[] = [];
  let left = n;
  for (const b of batches) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, Number(b.bal)));
    if (take > 0) out.push({ batchId: b.id, qty: take });
    left -= take;
  }
  if (left > 0) throw fail("conflict", "Not enough in this register.");
  return out;
}

/** The ledger figure of a medicine at a place (Law 2: summed, never stored). */
export async function balanceAt(tx: EmrTx, hospitalId: string, locationId: string, medicineId: string) {
  return (await batchesFor(tx, hospitalId, locationId, medicineId)).reduce((a, b) => a + Number(b.bal), 0);
}

async function prescriberAllowed(tx: EmrTx, hospitalId: string, userId: string, medicineId: string) {
  const r = await one<{ ok: boolean }>(
    tx,
    sql`SELECT coalesce((SELECT cd_allowed AND (cardinality(only_medicines) = 0 OR ${medicineId} = ANY (only_medicines))
                           FROM public.pharmacy_cd_prescribers
                          WHERE hospital_id = ${hospitalId}::uuid AND user_id = ${userId}::uuid
                          ORDER BY created_at DESC LIMIT 1), false) AS ok`,
  );
  return r?.ok === true;
}

export const DoseInput = z.object({
  clientKey: z.uuid(),
  locationId: z.uuid(),
  medicineId: z.string().min(1).max(120),
  patientUserId: z.uuid().nullable(),
  patientLabel: z.string().trim().min(3).max(160),
  bed: z.string().trim().min(1).max(40).nullable(),
  prescriberUserId: z.uuid(),
  doseMg: z.number().positive().max(10_000),
  route: z.string().min(1).max(20),
  residueDisposed: z.boolean(),
  witness: Witness,
});

/**
 * A controlled dose given (PRD §6.5 "Record a dose"): ampoules = ceil(dose ÷ mg per ampoule), the residue shown and
 * its disposal ticked in front of the witness, the register down by the ampoules. One dose row, one ledger line per
 * batch (`ward_used`), each carrying the witness approval. The client key is the dose's id, so a replay writes once.
 */
export async function recordDose(
  who: Who,
  input: z.infer<typeof DoseInput> & { effectiveAt?: Date; givenByUserId?: string | null; lateEntry?: boolean; units?: number },
) {
  const done = await one<{ id: string }>(who.tx, sql`SELECT id FROM public.pharmacy_cd_doses WHERE id = ${input.clientKey}::uuid`);
  if (done) return { id: done.id, units: 0 };
  const place = await loadLocation(who.tx, who.hospitalId, input.locationId);
  const med = await medicine(who.tx, who.hospitalId, input.medicineId);
  if (!med.controlled) throw fail("invalid", "That medicine is not controlled here.");
  const unit = cdUnit(med.name);
  if (!unit) throw fail("config", "The strength of this medicine is not set, so the ampoules cannot be worked out.");
  const { units, residueMg } = doseUnits(input.doseMg, unit);
  if (input.units !== undefined && input.units !== units)
    throw fail("invalid", "That dose does not account for the units missing.");
  if (residueMg > 0 && !input.residueDisposed && !input.lateEntry)
    throw fail("invalid", "Tick that the residue was discarded in front of the witness.");
  if (!(await prescriberAllowed(who.tx, who.hospitalId, input.prescriberUserId, input.medicineId)))
    throw fail("forbidden", "That person is not on the list of controlled-drug prescribers for this medicine.");
  const parts = allocate(await batchesFor(who.tx, who.hospitalId, place.id, input.medicineId), units);
  await who.tx.insert(pharmacyCdDoses).values({
    id: input.clientKey,
    hospitalId: who.hospitalId,
    locationId: place.id,
    medicineId: input.medicineId,
    patientUserId: input.patientUserId,
    patientLabel: input.patientLabel,
    bed: input.bed,
    prescriberUserId: input.prescriberUserId,
    givenByUserId: input.givenByUserId ?? null,
    doseMg: String(input.doseMg),
    route: input.route,
    units,
    residueMg: String(residueMg),
    residueDisposed: residueMg === 0 || input.residueDisposed,
    lateEntry: input.lateEntry ?? false,
    createdBy: who.userId,
  });
  for (const p of parts)
    await who.tx.insert(pharmacyStockMovements).values({
      hospitalId: who.hospitalId,
      ...placeCols(place),
      batchId: p.batchId,
      kind: "ward_used",
      quantity: -p.qty,
      effectiveAt: input.effectiveAt ?? who.now,
      actorUserId: who.userId,
      reasonCode: "cd_dose",
      sourceKind: "adjustment",
      sourceId: input.clientKey,
      witnessAttestationId: attestation(input.witness),
      downtime: !!paper(input.witness),
      paperWitnessName: paper(input.witness),
      idempotencyKey: `cd-dose:${input.clientKey}`,
    });
  return { id: input.clientKey, units };
}

export const CheckInput = z.object({
  clientKey: z.uuid(),
  locationId: z.uuid(),
  counts: z.array(z.object({ medicineId: z.string().min(1).max(120), counted: z.number().int().min(0) })).min(1),
  witness: Witness,
});

/**
 * A blind balance check (PRD §6.5): the expected figures are read from the ledger here, never sent by the screen.
 * A line that does not match opens a High case in the database (0267). The client key is the check's id.
 */
export async function cdBalanceCheck(who: Who, input: z.infer<typeof CheckInput>) {
  const done = await one<{ id: string }>(who.tx, sql`SELECT id FROM public.pharmacy_cd_checks WHERE id = ${input.clientKey}::uuid`);
  if (done) return { id: done.id, mismatches: 0 };
  const place = await loadLocation(who.tx, who.hospitalId, input.locationId);
  const lines = [];
  for (const c of input.counts) {
    lines.push({ ...c, expected: await balanceAt(who.tx, who.hospitalId, place.id, c.medicineId) });
  }
  await who.tx.insert(pharmacyCdChecks).values({
    id: input.clientKey,
    hospitalId: who.hospitalId,
    locationId: place.id,
    checkedBy: who.userId,
    witnessAttestationId: attestation(input.witness),
    paperWitnessName: paper(input.witness),
  });
  await who.tx.insert(pharmacyCdCheckLines).values(
    lines.map((l) => ({
      checkId: input.clientKey,
      hospitalId: who.hospitalId,
      medicineId: l.medicineId,
      expected: l.expected,
      counted: l.counted,
    })),
  );
  return { id: input.clientKey, mismatches: lines.filter((l) => l.counted !== l.expected).length };
}

export const ResolveInput = z.object({
  checkId: z.uuid(),
  medicineId: z.string().min(1).max(120),
  how: z.enum(["recount", "late_entry", "loss", "excess"]),
  note: z.string().trim().min(1).max(500).nullable(),
  incidentRef: z.string().trim().min(3).max(60).nullable(),
  attestationId: z.uuid(),
  late: z
    .object({
      clientKey: z.uuid(),
      patientUserId: z.uuid().nullable(),
      patientLabel: z.string().trim().min(3).max(160),
      bed: z.string().trim().min(1).max(40).nullable(),
      prescriberUserId: z.uuid(),
      givenByUserId: z.uuid().nullable(),
      doseMg: z.number().positive().max(10_000),
      route: z.string().min(1).max(20),
      residueDisposed: z.boolean(),
      at: z.coerce.date(),
    })
    .nullable(),
});

/**
 * Close a count that does not match (PRD §6.5 "resolve a count"). Recounted; a dose given but not entered, saved as a
 * late entry at its time inside the window, with units equal to the shortfall; or a confirmed loss or excess (the
 * in-charge, with an incident number), which adjusts the register. Always witnessed. The case's number is then fixed.
 */
export async function resolveCdCheck(who: Who, input: z.infer<typeof ResolveInput>) {
  const data = await loadCd(who.tx, who.hospitalId);
  const check = data.checks.find((c) => c.id === input.checkId);
  const line = check?.lines.find((l) => l.medicineId === input.medicineId);
  if (!check || !line) throw fail("not_found", "That check is not at your hospital.");
  if (line.resolution) return { id: input.checkId };
  const diff = line.counted - line.expected;
  let doseId: string | null = null;
  let movementId: string | null = null;
  if (input.how === "late_entry") {
    if (!input.late || diff >= 0) throw fail("invalid", "A late entry explains a shortfall only.");
    const w = missingWindow({ check, medicineId: input.medicineId, checks: data.checks, moves: data.moves });
    if (!inWindow(input.late.at, w)) throw fail("invalid", "Set when it was given, inside the window.");
    const r = await recordDose(who, {
      ...input.late,
      locationId: check.placeId,
      medicineId: input.medicineId,
      witness: { attestationId: input.attestationId },
      effectiveAt: input.late.at,
      lateEntry: true,
      units: -diff,
    });
    doseId = r.id;
  }
  if (input.how === "loss" || input.how === "excess") {
    if (!(await isInCharge(who.tx, who.userId, who.hospitalId)))
      throw fail("forbidden", "Only the in-charge pharmacist can sign a loss.");
    if (!input.incidentRef) throw fail("invalid", "Type the incident report number.");
    if ((input.how === "loss") !== diff < 0) throw fail("invalid", "That does not explain this difference.");
    const place = await loadLocation(who.tx, who.hospitalId, check.placeId);
    const batches = await batchesFor(who.tx, who.hospitalId, place.id, input.medicineId);
    const parts =
      diff < 0 ? allocate(batches, -diff).map((p) => ({ ...p, qty: -p.qty })) : [{ batchId: batches[0]!.id, qty: diff }];
    for (const p of parts) {
      const [m] = await who.tx
        .insert(pharmacyStockMovements)
        .values({
          hospitalId: who.hospitalId,
          ...placeCols(place),
          batchId: p.batchId,
          kind: "adjusted",
          quantity: p.qty,
          effectiveAt: who.now,
          actorUserId: who.userId,
          reasonCode: diff < 0 ? "cd_loss" : "cd_excess",
          reasonNote: `Incident ${input.incidentRef}`,
          sourceKind: "adjustment",
          sourceId: check.id,
          witnessAttestationId: input.attestationId,
          idempotencyKey: `cd-resolve:${check.id}:${input.medicineId}`,
        })
        .returning({ id: pharmacyStockMovements.id });
      movementId ??= m!.id;
    }
  }
  await who.tx.insert(pharmacyControlResolutions).values({
    sourceType: "cd_check",
    sourceId: check.id,
    medicineId: input.medicineId,
    hospitalId: who.hospitalId,
    how: input.how,
    note: input.note,
    incidentRef: input.incidentRef,
    doseId,
    movementId,
    witnessAttestationId: input.attestationId,
    resolvedBy: who.userId,
    resolvedAt: who.now,
  });
  return { id: check.id };
}

export const EventInput = z.object({
  movementId: z.uuid(),
  kind: z.enum(["witness_added", "residue_recorded", "early_reviewed", "paper_checked"]),
  attestationId: z.uuid().nullable(),
  reason: z.string().trim().min(2).max(200).nullable(),
});

/** A witness added late, a residue disposal recorded late, an early dose reviewed, a paper witness checked. */
export async function addCdEvent(who: Who, input: z.infer<typeof EventInput>) {
  const [row] = await who.tx
    .insert(pharmacyCdEvents)
    .values({
      hospitalId: who.hospitalId,
      movementId: input.movementId,
      kind: input.kind,
      witnessAttestationId: input.attestationId,
      reason: input.reason,
      actorUserId: who.userId,
    })
    .onConflictDoNothing()
    .returning({ id: pharmacyCdEvents.id });
  return { id: row?.id ?? input.movementId };
}
