"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { RC } from "@/content/pharmacy-rework-records";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import * as cold from "@/lib/pharmacy/cold/setup";
import * as receiving from "@/lib/pharmacy/stores/receiving-store";
import { storeAct } from "@/lib/pharmacy/stores/store-action";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/** Every Set-up action: a refusal comes back in words; success refreshes the page. */
async function guarded<T extends { ok: boolean }>(fn: () => Promise<T>) {
  try {
    const r = await fn();
    if (r.ok) revalidatePath("/pharmacy/setup");
    return r;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.setup.action_failed", {
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false as const, code: "conflict", error: RC.refused.failed };
  }
}

/** Set-up › Places: the immunisation clinic and its vaccines. */
export async function setEpiClinicAction(raw: unknown) {
  return guarded(async () =>
    runPharmacyWrite(
      cold.EpiClinicInput,
      raw,
      await requirePharmacyActor(),
      cold.SETUP_NEED,
      cold.setEpiClinic,
    ),
  );
}

export async function setEpiVaccineAction(raw: unknown) {
  return guarded(async () =>
    runPharmacyWrite(
      cold.EpiVaccineInput,
      raw,
      await requirePharmacyActor(),
      cold.SETUP_NEED,
      cold.setEpiVaccine,
    ),
  );
}

/** Set-up › Medicines: picks from MedSync's catalogue become the hospital's products. */
export async function addFromCatalogueAction(raw: unknown) {
  const r = await storeAct(
    "addFromCatalogue",
    receiving.CataloguePicksInput,
    raw,
    "pharmacy.store",
    receiving.addFromCatalogue,
  );
  if (r.ok) revalidatePath("/pharmacy/setup");
  return r;
}
