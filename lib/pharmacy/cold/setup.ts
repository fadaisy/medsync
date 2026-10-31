import type { Vaccine } from "@/db/schema/pharmacy-rework-patients";
import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { VACCINE_NAMES } from "@/content/pharmacy-rework-patients";
import { pharmacyProducts } from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyEpiClinics,
  pharmacyEpiVaccines,
  pharmacyFridges,
} from "@/db/schema/pharmacy-rework-patients";
import { fail, loadLocation } from "@/lib/pharmacy/stores/write";
import { sensorKeyHash } from "./store";

/**
 * Set-up › Places (rework PRD §6.7): the in-charge adds a fridge (with its sensor's secret, stored hashed), names the
 * immunisation clinic's place and which product is which vaccine. Cold chain and Immunisation read these.
 */
export const SETUP_NEED: PharmacyNeed = { permission: "pharmacy.manage", point: "none" };

export const AddFridgeInput = z.object({
  clientKey: z.uuid(),
  locationId: z.uuid(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  model: z.string().trim().max(120).nullish(),
  /** The secret the sensor sends as `x-fridge-key`; shown once, never stored in clear. */
  sensorKey: z.string().min(16).max(200).nullish(),
});

export async function addFridge(ctx: PharmacyCtx, input: z.infer<typeof AddFridgeInput>) {
  const loc = await loadLocation(ctx.tx, ctx.actor.hospitalId, input.locationId);
  await ctx.tx
    .insert(pharmacyFridges)
    .values({
      id: input.clientKey,
      hospitalId: ctx.actor.hospitalId,
      locationId: loc.id,
      code: input.code,
      name: input.name,
      model: input.model || null,
      sensorKeyHash: input.sensorKey ? sensorKeyHash(input.sensorKey) : null,
      createdBy: ctx.actor.userId,
    })
    .onConflictDoNothing();
  return { id: input.clientKey };
}

export const EpiClinicInput = z.object({ locationId: z.uuid() });

export async function setEpiClinic(ctx: PharmacyCtx, input: z.infer<typeof EpiClinicInput>) {
  const loc = await loadLocation(ctx.tx, ctx.actor.hospitalId, input.locationId);
  const row = { locationId: loc.id, setBy: ctx.actor.userId, setAt: ctx.now };
  await ctx.tx
    .insert(pharmacyEpiClinics)
    .values({ hospitalId: ctx.actor.hospitalId, ...row })
    .onConflictDoUpdate({ target: pharmacyEpiClinics.hospitalId, set: row });
  return { id: loc.id };
}

export const EpiVaccineInput = z.object({
  vaccine: z.enum(Object.keys(VACCINE_NAMES) as [Vaccine, ...Vaccine[]]),
  productId: z.uuid(),
  dosesPerVial: z.number().int().min(1).max(50),
  maxLevel: z.number().int().positive().nullish(),
});

export async function setEpiVaccine(ctx: PharmacyCtx, input: z.infer<typeof EpiVaccineInput>) {
  const [own] = await ctx.tx
    .select({ id: pharmacyProducts.id })
    .from(pharmacyProducts)
    .where(
      and(
        eq(pharmacyProducts.id, input.productId),
        eq(pharmacyProducts.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!own) throw fail("not_found", "That medicine is not at your hospital.");
  const row = {
    productId: input.productId,
    dosesPerVial: input.dosesPerVial,
    maxLevel: input.maxLevel ?? null,
    setBy: ctx.actor.userId,
    setAt: ctx.now,
  };
  await ctx.tx
    .insert(pharmacyEpiVaccines)
    .values({ hospitalId: ctx.actor.hospitalId, vaccine: input.vaccine, ...row })
    .onConflictDoUpdate({
      target: [pharmacyEpiVaccines.hospitalId, pharmacyEpiVaccines.vaccine],
      set: row,
    });
  return { id: input.productId };
}
