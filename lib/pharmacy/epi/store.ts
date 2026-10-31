import "server-only";

import type { Vaccine } from "@/db/schema/pharmacy-rework-patients";
import type { EmrDb } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { PRW, VACCINE_NAMES } from "@/content/pharmacy-rework-patients";
import { pharmacyStockMovements } from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyEpiAppointments,
  pharmacyEpiClients,
  pharmacyEpiDoses,
  pharmacyEpiOpenVials,
  pharmacyVvmReadings,
} from "@/db/schema/pharmacy-rework-patients";
import { EmrWriteError } from "@/lib/emr/write/context";
import { blindIndex, encrypt } from "@/lib/encryption";
import { epiPlan, vialHours } from "@/lib/pharmacy/epi/derive";
import { fail, loadLocation, placeCols, requireLive } from "@/lib/pharmacy/stores/write";
import { day0, HOUR } from "@/lib/pharmacy/wards/derive";
import { patientsRefusal, q } from "@/lib/pharmacy/wards/sql";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Immunisation writes (PRD §6.3; TECH-SPEC §4 EPI). A vaccination is a `ward_used` of one dose at the EPI clinic,
 * written in the same transaction as the dose row; 0268's guard refuses a dose without its own movement and any
 * expired, recalled or VVM 3–4 batch. Opened-vial leftovers leave as `adjusted` 'wastage:opened_vial'.
 */
export const EPI_NEED: PharmacyNeed = {
  permission: ["pharmacy.stock", "pharmacy.store"],
  point: "none",
};

type Opts = { database?: EmrDb; now?: Date };

/** runPharmacyWrite, with 0268's guard errors turned into words. */
export function runPatientsWrite<I, R extends { id: string }>(
  schema: z.ZodType<I>,
  raw: unknown,
  actor: PharmacyActor,
  need: PharmacyNeed,
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
  options?: Opts,
): Promise<ActionResult<R>> {
  return runPharmacyWrite(
    schema,
    raw,
    actor,
    need,
    async (ctx, i) => {
      try {
        return await write(ctx, i);
      } catch (e) {
        const w = patientsRefusal(e);
        if (w) throw new EmrWriteError("conflict", w);
        throw e;
      }
    },
    options,
  );
}

export async function epiClinic(ctx: Pick<PharmacyCtx, "tx" | "actor">) {
  const [c] = await q<{ location_id: string }>(
    ctx.tx,
    sql`SELECT location_id FROM public.pharmacy_epi_clinics WHERE hospital_id = ${ctx.actor.hospitalId}::uuid`,
  );
  if (!c) throw fail("config", PRW.epi.notSetUp);
  const l = await loadLocation(ctx.tx, ctx.actor.hospitalId, c.location_id);
  requireLive(l);
  return l;
}

/** Usable batches of a product at a place, earliest expiry first: in stock, not expired, recalled or VVM 3–4. */
export async function usableBatches(
  d: PharmacyCtx["tx"] | EmrDb,
  locationId: string,
  productId: string,
) {
  return q<{ id: string; batch_number: string; balance: number }>(
    d,
    sql`SELECT b.id, b.batch_number, sum(m.quantity)::int AS balance
          FROM public.pharmacy_batches b JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
         WHERE coalesce(b.location_id, b.dispensing_point_id) = ${locationId}::uuid AND b.product_id = ${productId}::uuid
           AND private.pharmacy_expires_on(b.expiry, b.expiry_month_only) >= private.pharmacy_local_date()
           AND NOT private.pharmacy_batch_recalled(b.id)
           AND coalesce((SELECT v.stage FROM public.pharmacy_vvm_readings v
                           JOIN public.pharmacy_batches b2 ON b2.id = v.batch_id
                          WHERE b2.hospital_id = b.hospital_id AND b2.product_id = b.product_id
                            AND b2.batch_number = b.batch_number
                          ORDER BY v.read_at DESC LIMIT 1), 1) < 3
         GROUP BY b.id HAVING sum(m.quantity) > 0
         ORDER BY b.expiry, b.created_at`,
  );
}

/* ─── Register a client ──────────────────────────────────────────────── */
export const RegisterInput = z
  .object({
    clientKey: z.uuid(),
    kind: z.enum(["child", "woman", "girl"]),
    name: z.string().trim().min(3).max(120),
    sex: z.enum(["F", "M"]),
    dob: z.iso.date(),
    cardNo: z.string().trim().min(3).max(30),
    carer: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?\d[\d ]{8,15}$/),
    village: z.string().trim().max(80).nullish(),
    note: z.string().trim().max(200).nullish(),
  })
  .refine((v) => v.kind === "child" || v.sex === "F", { path: ["sex"] });

/** Uganda numbers to E.164: 07xx… → +2567xx…. */
export const e164 = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("256") ? `+${d}` : d.startsWith("0") ? `+256${d.slice(1)}` : `+${d}`;
};

export const registerClient = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(
    RegisterInput,
    raw,
    actor,
    EPI_NEED,
    async (ctx, i) => {
      if (Date.parse(i.dob) > ctx.now.getTime()) throw fail("invalid", PRW.epi.dobFuture);
      const [had] = await ctx.tx
        .select({ id: pharmacyEpiClients.id })
        .from(pharmacyEpiClients)
        .where(eq(pharmacyEpiClients.id, i.clientKey));
      if (had) return { id: had.id };
      const phone = e164(i.phone);
      await ctx.tx.insert(pharmacyEpiClients).values({
        id: i.clientKey,
        hospitalId: ctx.actor.hospitalId,
        kind: i.kind,
        name: i.name,
        sex: i.sex,
        dob: i.dob,
        cardNo: i.cardNo,
        carer: i.carer,
        phoneEncrypted: encrypt(phone),
        phoneHmac: blindIndex(phone),
        village: i.village || null,
        note: i.note || null,
        createdBy: ctx.actor.userId,
      });
      return { id: i.clientKey };
    },
    o,
  );

/* ─── Vaccinate ──────────────────────────────────────────────────────── */
export const VaccinateInput = z.object({
  clientKey: z.uuid(),
  clientId: z.uuid(),
  doses: z
    .array(z.object({ antigen: z.string().min(2).max(8), site: z.string().min(2).max(80) }))
    .min(1)
    .max(8),
  aefi: z.enum(["none", "mild", "serious"]),
  /** VVM, expiry and diluent checked: the nurse's tick. */
  checked: z.literal(true),
  comeBackOn: z.iso.date().nullable(),
});

const kampalaDay = (t: number) => new Date(t + 3 * HOUR).toISOString().slice(0, 10);
export const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00+03:00`);

export const vaccinate = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(
    VaccinateInput,
    raw,
    actor,
    EPI_NEED,
    async (ctx, i) => {
      const h = ctx.actor.hospitalId;
      const [replay] = await ctx.tx
        .select({ id: pharmacyEpiDoses.id })
        .from(pharmacyEpiDoses)
        .where(eq(pharmacyEpiDoses.id, i.clientKey));
      if (replay) return { id: replay.id };
      const clinic = await epiClinic(ctx);
      const [c] = await ctx.tx
        .select()
        .from(pharmacyEpiClients)
        .where(and(eq(pharmacyEpiClients.id, i.clientId), eq(pharmacyEpiClients.hospitalId, h)))
        .for("update");
      if (!c) throw fail("not_found", PRW.epi.clientsNone);
      const given = await ctx.tx
        .select({
          lab: pharmacyEpiDoses.antigen,
          at: pharmacyEpiDoses.givenAt,
          batchId: pharmacyEpiDoses.batchId,
        })
        .from(pharmacyEpiDoses)
        .where(eq(pharmacyEpiDoses.clientId, c.id));
      const plan = epiPlan(
        { id: c.id, kind: c.kind, dob: dayMs(c.dob) },
        Object.fromEntries(given.map((g) => [g.lab, { at: g.at.getTime(), batchId: g.batchId }])),
        ctx.now.getTime(),
      );
      const vaccines = await q<{ vaccine: Vaccine; product_id: string; doses_per_vial: number }>(
        ctx.tx,
        sql`SELECT vaccine, product_id, doses_per_vial FROM public.pharmacy_epi_vaccines WHERE hospital_id = ${h}::uuid`,
      );
      let first = true;
      for (const d of i.doses) {
        const item = plan.find((x) => x.lab === d.antigen);
        if (!item || (item.s !== "due" && item.s !== "overdue"))
          throw fail("invalid", PRW.epi.notDue.replace("{lab}", d.antigen));
        const v = vaccines.find((x) => x.vaccine === item.vaccine);
        const name = PRW.epi.vaxNoStock.replace(
          "{vaccine}",
          VACCINE_NAMES[item.vaccine] ?? item.vaccine,
        );
        if (!v) throw fail("config", name);
        const [b] = await usableBatches(ctx.tx, clinic.id, v.product_id);
        if (!b) throw fail("conflict", name);
        let vialId: string | null = null;
        if (v.doses_per_vial > 1) {
          const hours = vialHours(item.vaccine, v.doses_per_vial)!;
          const [open] = await q<{ id: string }>(
            ctx.tx,
            sql`SELECT o.id FROM public.pharmacy_epi_open_vials o
               WHERE o.batch_id = ${b.id}::uuid AND o.discarded_at IS NULL
                 AND o.opened_at > ${new Date(ctx.now.getTime() - hours * HOUR).toISOString()}::timestamptz
                 AND (SELECT count(*) FROM public.pharmacy_epi_doses x WHERE x.vial_id = o.id) < o.doses_per_vial
               ORDER BY o.opened_at LIMIT 1 FOR UPDATE`,
          );
          vialId =
            open?.id ??
            (
              await ctx.tx
                .insert(pharmacyEpiOpenVials)
                .values({
                  hospitalId: h,
                  batchId: b.id,
                  dosesPerVial: v.doses_per_vial,
                  openedBy: ctx.actor.userId,
                  openedAt: ctx.now,
                })
                .returning({ id: pharmacyEpiOpenVials.id })
            )[0]!.id;
        }
        const doseId = first ? i.clientKey : crypto.randomUUID();
        first = false;
        const [m] = await ctx.tx
          .insert(pharmacyStockMovements)
          .values({
            hospitalId: h,
            ...placeCols(clinic),
            batchId: b.id,
            kind: "ward_used",
            quantity: -1,
            effectiveAt: ctx.now,
            actorUserId: ctx.actor.userId,
            reasonCode: "vaccinated",
            sourceKind: "adjustment",
            sourceId: doseId,
          })
          .returning({ id: pharmacyStockMovements.id });
        await ctx.tx.insert(pharmacyEpiDoses).values({
          id: doseId,
          hospitalId: h,
          clientId: c.id,
          antigen: d.antigen,
          vaccine: item.vaccine,
          batchId: b.id,
          movementId: m!.id,
          vialId,
          site: d.site,
          aefi: i.aefi,
          givenBy: ctx.actor.userId,
          givenAt: ctx.now,
        });
      }
      if (i.comeBackOn && dayMs(i.comeBackOn) > day0(ctx.now.getTime()))
        await ctx.tx.insert(pharmacyEpiAppointments).values({
          hospitalId: h,
          clientId: c.id,
          comeBackOn: i.comeBackOn,
          setBy: ctx.actor.userId,
        });
      return { id: i.clientKey, day: kampalaDay(ctx.now.getTime()) };
    },
    o,
  );

/* ─── Open vials ─────────────────────────────────────────────────────── */
export const DiscardVialInput = z.object({ vialId: z.uuid() });

/** The vial's leftover doses leave the clinic's stock as opened-vial wastage; the vial is closed. */
export const discardVial = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(
    DiscardVialInput,
    raw,
    actor,
    EPI_NEED,
    async (ctx, i) => {
      const clinic = await epiClinic(ctx);
      const [v] = await ctx.tx
        .select()
        .from(pharmacyEpiOpenVials)
        .where(
          and(
            eq(pharmacyEpiOpenVials.id, i.vialId),
            eq(pharmacyEpiOpenVials.hospitalId, ctx.actor.hospitalId),
          ),
        )
        .for("update");
      if (!v) throw fail("not_found", PRW.epi.noVials);
      if (v.discardedAt) return { id: v.id };
      const [{ n } = { n: 0 }] = await q<{ n: number }>(
        ctx.tx,
        sql`SELECT count(*)::int AS n FROM public.pharmacy_epi_doses WHERE vial_id = ${v.id}::uuid`,
      );
      const left = v.dosesPerVial - Number(n);
      let wasted: string | null = null;
      if (left > 0)
        wasted = (
          await ctx.tx
            .insert(pharmacyStockMovements)
            .values({
              hospitalId: ctx.actor.hospitalId,
              ...placeCols(clinic),
              batchId: v.batchId,
              kind: "adjusted",
              quantity: -left,
              effectiveAt: ctx.now,
              actorUserId: ctx.actor.userId,
              reasonCode: "wastage:opened_vial",
              sourceKind: "adjustment",
              sourceId: v.id,
            })
            .returning({ id: pharmacyStockMovements.id })
        )[0]!.id;
      await ctx.tx
        .update(pharmacyEpiOpenVials)
        .set({ discardedAt: ctx.now, discardedBy: ctx.actor.userId, wastedMovementId: wasted })
        .where(and(eq(pharmacyEpiOpenVials.id, v.id), isNull(pharmacyEpiOpenVials.discardedAt)));
      return { id: v.id };
    },
    o,
  );

/* ─── VVM ────────────────────────────────────────────────────────────── */
export const VvmInput = z.object({ batchId: z.uuid(), stage: z.number().int().min(1).max(4) });

export const recordVvm = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(
    VvmInput,
    raw,
    actor,
    EPI_NEED,
    async (ctx, i) => {
      const [b] = await q<{ id: string }>(
        ctx.tx,
        sql`SELECT id FROM public.pharmacy_batches WHERE id = ${i.batchId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`,
      );
      if (!b) throw fail("not_found", PRW.epi.noneUsable);
      const [r] = await ctx.tx
        .insert(pharmacyVvmReadings)
        .values({
          hospitalId: ctx.actor.hospitalId,
          batchId: b.id,
          stage: i.stage,
          readBy: ctx.actor.userId,
        })
        .returning({ id: pharmacyVvmReadings.id });
      return { id: r!.id };
    },
    o,
  );
