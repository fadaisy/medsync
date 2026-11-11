import "server-only";

import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { DEVICES, HANDOVER_SLOTS } from "@/content/pharmacy-setup";
import { EmrWriteError } from "@/lib/emr/write/context";
import { encrypt } from "@/lib/encryption";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { sensorKeyHash } from "@/lib/pharmacy/cold/store";
import { normalisePhoneUG } from "@/lib/pharmacy/derive/setup/messages";
import { kampalaNow, outOfRange, readingSlot } from "@/lib/pharmacy/derive/setup/places";
import { createLocation } from "@/lib/pharmacy/stores/location-store";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Set-up › Places, the server actions (SETUP-TABS §G). The database refuses a store supplied from itself, closing a
 * place with stock or an open handover (0274 `pl_setup_guard`), a typed reading outside 2–8 °C without a note
 * (`pfr_note`), and opens the excursion (`pfr_excursion`). Writes are audited by the tables' triggers.
 */
const NEED: PharmacyNeed = { permission: "pharmacy.view", point: "none" };
/** A uuid[] literal: drizzle spreads a JS array into a parameter list. */
const uuids = (xs: readonly string[]) => `{${xs.join(",")}}`;
const texts = (xs: readonly string[]) => `{${xs.join(",")}}`;
const must = (ok: unknown, msg: string) => {
  if (!ok) throw new EmrWriteError("forbidden", msg);
};
const IN_CHARGE = "Only the in-charge changes places.";
const can = (ctx: PharmacyCtx, p: string) => ctx.actor.access.permissions.has(p as never);
const storeKeeper = (ctx: PharmacyCtx) => ctx.manages || can(ctx, "pharmacy.store");

const Name = z.string().trim().max(120);
const Hours = z.enum(["24h", "day", "weekdays"]);
const Slots = z.array(z.enum(HANDOVER_SLOTS)).max(3);
const About = {
  name: Name,
  hours: Hours,
  suppliedFrom: z.uuid().nullable(),
  supplierIds: z.array(z.uuid()).max(6),
  device: z.enum(DEVICES),
};

async function nameFree(ctx: PharmacyCtx, name: string, except: string | null) {
  if (!name) throw new EmrWriteError("invalid", "Give the place a name.");
  const dup = rowsOf(
    await ctx.tx
      .execute(sql`SELECT 1 FROM public.pharmacy_locations WHERE hospital_id = ${ctx.actor.hospitalId}::uuid
      AND lower(name) = lower(${name}) AND id <> coalesce(${except}::uuid, '00000000-0000-0000-0000-000000000000')`),
  );
  if (dup.length) throw new EmrWriteError("conflict", "A place with this name already exists.");
}

export const AddPlaceInput = z.object({
  clientKey: z.uuid(),
  kind: z.enum(["store", "ward", "clinic", "theatre", "dispensing_point"]),
  ...About,
  /** A store is a hub unit; a ward is a hub ward. */
  departmentId: z.uuid().nullable(),
  wardId: z.uuid().nullable(),
});
export const addPlace = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(AddPlaceInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    await nameFree(ctx, i.name, null);
    if (i.kind === "dispensing_point")
      throw new EmrWriteError(
        "invalid",
        "Dispensing points are made on the hospital hub; they then show here.",
      );
    if (i.kind === "store" && i.suppliedFrom)
      throw new EmrWriteError(
        "invalid",
        "A store cannot be supplied from itself. Pick its supplier.",
      );
    if (i.kind === "store" || i.kind === "ward")
      await createLocation(ctx, {
        clientKey: i.clientKey,
        kind: i.kind,
        name: i.name,
        departmentId: i.departmentId,
        wardId: i.wardId,
      });
    else
      await ctx.tx
        .execute(sql`INSERT INTO public.pharmacy_locations (id, hospital_id, kind, name, created_by)
        VALUES (${i.clientKey}::uuid, ${ctx.actor.hospitalId}::uuid, ${i.kind}, ${i.name}, ${ctx.actor.userId}::uuid)
        ON CONFLICT (id) DO NOTHING`);
    await ctx.tx
      .execute(sql`UPDATE public.pharmacy_locations SET hours = ${i.hours}, supplied_from = ${i.suppliedFrom}::uuid,
        supplier_ids = ${uuids(i.supplierIds)}::uuid[], device_label = ${i.device},
        handover_slots = ${texts(i.hours === "24h" ? ["08:00", "17:00"] : ["08:00"])}::text[]
      WHERE id = ${i.clientKey}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`);
    return { id: i.clientKey };
  });

export const UpdatePlaceInput = z.object({
  id: z.uuid(),
  kind: z.enum(["store", "dispensing_point", "ward", "clinic", "theatre"]),
  ...About,
  slots: Slots,
});
export const updatePlace = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(UpdatePlaceInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    await nameFree(ctx, i.name, i.id);
    const cur = rowsOf<{ kind: string }>(
      await ctx.tx.execute(sql`SELECT kind FROM public.pharmacy_locations WHERE id = ${i.id}::uuid
        AND hospital_id = ${ctx.actor.hospitalId}::uuid FOR UPDATE`),
    )[0];
    if (!cur) throw new EmrWriteError("not_found", "That place is not at this hospital.");
    const kind = cur.kind === "clinic" || cur.kind === "theatre" ? i.kind : cur.kind;
    if (kind !== cur.kind && kind !== "clinic" && kind !== "theatre")
      throw new EmrWriteError("invalid", "This place's kind comes from the hospital hub.");
    if (kind === "store" && i.suppliedFrom)
      throw new EmrWriteError(
        "invalid",
        "A store cannot be supplied from itself. Pick its supplier.",
      );
    await ctx.tx
      .execute(sql`UPDATE public.pharmacy_locations SET name = ${i.name}, kind = ${kind}, hours = ${i.hours},
        supplied_from = ${i.suppliedFrom}::uuid, supplier_ids = ${uuids(i.supplierIds)}::uuid[], device_label = ${i.device},
        handover_slots = ${texts([...i.slots].sort())}::text[]
      WHERE id = ${i.id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`);
    return { id: i.id };
  });

export const SlotsInput = z.object({ id: z.uuid(), slots: Slots });
export const setHandoverSlots = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(SlotsInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    await ctx.tx
      .execute(sql`UPDATE public.pharmacy_locations SET handover_slots = ${texts([...i.slots].sort())}::text[]
      WHERE id = ${i.id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`);
    return { id: i.id };
  });

export const CloseInput = z.object({ id: z.uuid(), note: z.string().trim().max(200).nullable() });
/** Refused by the database while stock or an open handover is there; the history stays. */
export const closePlace = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(CloseInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    const r = rowsOf(
      await ctx.tx
        .execute(sql`UPDATE public.pharmacy_locations SET closed_at = ${ctx.now.toISOString()}::timestamptz,
          closed_by = ${ctx.actor.userId}::uuid, closed_note = ${i.note || null}
        WHERE id = ${i.id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid AND closed_at IS NULL RETURNING id`),
    );
    if (!r.length) throw new EmrWriteError("conflict", "That place is already closed.");
    return { id: i.id };
  });
export const reopenPlace = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(CloseInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    await ctx.tx
      .execute(sql`UPDATE public.pharmacy_locations SET closed_at = NULL, closed_by = NULL, closed_note = NULL
      WHERE id = ${i.id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`);
    return { id: i.id };
  });

export const AddFridgeInput = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,20}$/, "Give the fridge an ID and say what kind it is."),
  kind: z.string().trim().min(2, "Give the fridge an ID and say what kind it is.").max(120),
});
/** Starts unplaced; "Kept at" places it. */
export const addFridge = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(AddFridgeInput, raw, actor, NEED, async (ctx, i) => {
    must(storeKeeper(ctx), "Only the in-charge or the store keeper adds fridges.");
    const r = rowsOf<{ id: string }>(
      await ctx.tx
        .execute(sql`INSERT INTO public.pharmacy_fridges (hospital_id, location_id, code, name, created_by)
        VALUES (${ctx.actor.hospitalId}::uuid, NULL, ${i.code}, ${i.kind}, ${ctx.actor.userId}::uuid)
        ON CONFLICT (hospital_id, code) DO NOTHING RETURNING id`),
    );
    if (!r.length) throw new EmrWriteError("conflict", `${i.code} is already used.`);
    return { id: r[0]!.id };
  });

export const MoveFridgeInput = z.object({ id: z.uuid(), placeId: z.uuid().nullable() });
/** A fridge is at one place at most: the column itself. */
export const moveFridge = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(MoveFridgeInput, raw, actor, NEED, async (ctx, i) => {
    must(storeKeeper(ctx), "Only the in-charge or the store keeper moves fridges.");
    await ctx.tx.execute(sql`UPDATE public.pharmacy_fridges SET location_id = ${i.placeId}::uuid
      WHERE id = ${i.id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`);
    return { id: i.id };
  });

export const SensorInput = z.object({
  id: z.uuid(),
  sensorId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,40}$/, "Type the sensor ID.")
    .nullable(),
});
export const linkSensor = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(SensorInput, raw, actor, NEED, async (ctx, i) => {
    must(storeKeeper(ctx), "Only the in-charge or the store keeper links sensors.");
    // The sensor posts with this key (app/api/pharmacy/cold/reading); only its hash is kept, so it is shown once.
    const key = i.sensorId
      ? `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "")
      : null;
    await ctx.tx.execute(sql`UPDATE public.pharmacy_fridges SET sensor_id = ${i.sensorId},
        sensor_key_hash = ${key ? sensorKeyHash(key) : null}
      WHERE id = ${i.id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid`);
    return { id: i.id, key };
  });
export const unlinkSensor = (actor: PharmacyActor, raw: unknown) =>
  linkSensor(actor, { ...(raw as object), sensorId: null });

export const ReadingInput = z.object({
  fridgeId: z.uuid(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Type the time as HH:MM."),
  temp: z
    .number()
    .min(-30, "Type the temperature in °C, e.g. 5.2.")
    .max(40, "Type the temperature in °C, e.g. 5.2."),
  note: z.string().trim().max(300),
});
/** Anyone in the pharmacy records a reading. Outside 2–8 °C it needs a note and opens an excursion. */
export const recordReading = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(ReadingInput, raw, actor, NEED, async (ctx, i) => {
    const out = outOfRange(i.temp);
    if (out && i.note.length < 2)
      throw new EmrWriteError("invalid", "Outside 2–8 °C: say what you did.");
    const slot = readingSlot(i.time);
    const at = `${kampalaNow(ctx.now.getTime()).date}T${i.time}:00+03:00`;
    if (Date.parse(at) > ctx.now.getTime() + 5 * 60_000)
      throw new EmrWriteError("invalid", "That time is still to come.");
    const r = rowsOf<{ id: string }>(
      await ctx.tx
        .execute(sql`INSERT INTO public.pharmacy_fridge_readings (hospital_id, fridge_id, read_at, temp_c, source,
          slot, recorded_by, note)
        SELECT f.hospital_id, f.id, ${at}::timestamptz, ${i.temp}, 'chart', ${slot === "08:00" ? "am" : slot ? "pm" : null},
          ${ctx.actor.userId}::uuid, ${i.note || null}
          FROM public.pharmacy_fridges f WHERE f.id = ${i.fridgeId}::uuid AND f.hospital_id = ${ctx.actor.hospitalId}::uuid
        RETURNING id`),
    );
    if (!r.length) throw new EmrWriteError("not_found", "That fridge is not at this hospital.");
    return { id: r[0]!.id, excursion: out };
  });

export const SupplierInput = z
  .object({
    id: z.uuid().nullable(),
    name: z.string().trim().min(1, "Give the supplier a name.").max(80),
    what: z.string().trim().max(200),
    cycleMonths: z.number().int().min(0).max(24),
    nextCycleOn: z.iso.date().nullable(),
    leadDays: z.number().int().min(0).max(365),
    budgetUgx: z.number().int().min(0),
    usedUgx: z.number().int().min(0),
    period: z.string().trim().max(40),
    contact: z.string().trim().max(120),
    /** Never invented. Empty on an edit keeps the saved number. */
    phone: z.string().trim().max(20),
  })
  .refine((v) => !v.budgetUgx || v.usedUgx <= v.budgetUgx, {
    message: "Used so far is more than the budget.",
  });
export const upsertSupplier = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(SupplierInput, raw, actor, NEED, async (ctx, i) => {
    must(storeKeeper(ctx), "Only the in-charge or the store keeper edits suppliers.");
    const phone = i.phone ? normalisePhoneUG(i.phone) : null;
    if (i.phone && !phone)
      throw new EmrWriteError("invalid", "Type a Ugandan mobile number, e.g. +256 772 000 000.");
    const h = ctx.actor.hospitalId;
    const vals = sql`${i.name}, ${i.what || null}, ${i.cycleMonths}, ${i.nextCycleOn}::date, ${i.leadDays}, ${i.budgetUgx},
      ${i.usedUgx}, ${i.period || null}, ${i.contact || null},
      ${i.id ? sql`coalesce(${phone ? encrypt(phone) : null}, phone_encrypted)` : sql`${phone ? encrypt(phone) : null}`},
      ${ctx.actor.userId}::uuid`;
    const r = rowsOf<{ id: string }>(
      i.id
        ? await ctx.tx
            .execute(sql`UPDATE public.pharmacy_suppliers SET (name, what, cycle_months, next_cycle_on, lead_days,
              budget_ugx, used_ugx, budget_period, contact, phone_encrypted, updated_by) = (${vals}), updated_at = now()
            WHERE id = ${i.id}::uuid AND hospital_id = ${h}::uuid RETURNING id`)
        : await ctx.tx
            .execute(sql`INSERT INTO public.pharmacy_suppliers (hospital_id, name, what, cycle_months, next_cycle_on,
              lead_days, budget_ugx, used_ugx, budget_period, contact, phone_encrypted, updated_by)
            VALUES (${h}::uuid, ${vals}) RETURNING id`),
    );
    if (!r.length) throw new EmrWriteError("not_found", "That supplier is not at this hospital.");
    return { id: r[0]!.id };
  });

/** The device at a place was seen now (People › Sign in passes its place). Nothing before 0274. */
export async function deviceSeen(ctx: PharmacyCtx, placeId: string) {
  const [t] = rowsOf<{ ok: boolean }>(
    await ctx.tx.execute(sql`SELECT to_regclass('public.pharmacy_devices') IS NOT NULL AS ok`),
  );
  if (!t?.ok) return;
  await ctx.tx
    .execute(sql`INSERT INTO public.pharmacy_devices (hospital_id, location_id, last_seen_at)
    SELECT hospital_id, id, ${ctx.now.toISOString()}::timestamptz FROM public.pharmacy_locations
     WHERE id = ${placeId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid
    ON CONFLICT (location_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`);
}
