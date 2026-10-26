"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { prescriptions } from "@/db/schema/prescribing";
import { asClinicalWriter } from "@/lib/emr/db";
import { EmrWriteError } from "@/lib/emr/write/context";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { pharmacyRefillsLiveFor } from "@/lib/pharmacy/feature";
import {
  CollectorInput,
  requestRefill,
  RequestRefillInput,
  saveCollector,
} from "@/lib/pharmacy/refill-store";

export type RefillAskState = { ok: boolean; error?: string };

const FAILED = "That could not be sent. Try again in a moment.";
const Input = RequestRefillInput.omit({ patientUserId: true, collector: true }).extend({
  collector: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("self") }),
    z.object({ kind: z.literal("named"), collectorId: z.uuid() }),
    // A new collector, saved first in the same transaction (5.4 "Save them for next time").
    z.object({ kind: z.literal("new"), ...CollectorInput.shape }),
  ]),
});

/**
 * `requestRefill` from the app (Section 8: Patient; 5.4): the patient's own session → their own lines at one hospital
 * where refills are live → one transaction. A line the repeats do not allow becomes a renewal request in the store
 * (RP-6), so "Ask my clinic to renew it" is this same action.
 */
export async function askForNextSupply(raw: unknown): Promise<RefillAskState> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: FAILED };
  try {
    const scope = await requirePatientScope();
    const rows = await db
      .select({ hospitalId: prescriptions.hospitalId, patientUserId: prescriptions.patientUserId })
      .from(prescriptions)
      .where(inArray(prescriptions.id, parsed.data.lineIds));
    const hospitalId = rows[0]?.hospitalId;
    if (
      !hospitalId ||
      rows.length !== new Set(parsed.data.lineIds).size ||
      rows.some((r) => r.patientUserId !== scope.userId || r.hospitalId !== hospitalId) ||
      !pharmacyRefillsLiveFor(hospitalId)
    )
      return { ok: false, error: "That medicine is not on your record here." };
    const { collector, ...rest } = parsed.data;
    await asClinicalWriter({ userId: scope.userId, hospitalId }, async (tx) => {
      const w = { tx, hospitalId, userId: scope.userId, cadre: null, now: new Date() };
      const c =
        collector.kind === "new"
          ? {
              kind: "named" as const,
              collectorId: (await saveCollector(w, scope.userId, collector)).id,
            }
          : collector;
      return requestRefill(w, { ...rest, patientUserId: scope.userId, collector: c }, "app");
    });
    revalidatePath("/patient/track/medications");
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof EmrWriteError) return { ok: false, error: e.message };
    logger.warn("patient.pharmacy.refill_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: FAILED };
  }
}
