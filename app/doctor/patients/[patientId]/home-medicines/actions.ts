"use server";

import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { resolveEmrAccess } from "@/lib/emr/access";
import { asClinicalWriter } from "@/lib/emr/db";
import { EmrWriteError } from "@/lib/emr/write/context";
import * as home from "@/lib/emr/write/home-medicines";
import { logger } from "@/lib/logger";
import { pharmacyReconciliationLiveFor } from "@/lib/pharmacy/feature";

type Result = { ok: true; id: string } | { ok: false; error: string };

/**
 * Pharmacy Phase 3, Step 9 (MR-1): the prescriber's side. Zod, the doctor's scope, the flag, then the patient's
 * access (`resolveEmrAccess`) and the write in one transaction.
 */
async function run<I>(
  schema: z.ZodType<I>,
  raw: unknown,
  patientUserId: string,
  write: (
    tx: Parameters<Parameters<typeof asClinicalWriter>[1]>[0],
    i: I,
    s: Awaited<ReturnType<typeof requireDoctorScope>>,
  ) => Promise<{ id: string }>,
): Promise<Result> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  try {
    const scope = await requireDoctorScope();
    if (!pharmacyReconciliationLiveFor(scope.hospitalId))
      return { ok: false, error: "Reconciliation is not switched on at this hospital." };
    const r = await asClinicalWriter(scope, async (tx) => {
      const access = await resolveEmrAccess(tx, {
        userId: scope.userId,
        patientUserId,
        hospitalId: scope.hospitalId,
      });
      if (!access.allowed)
        throw new EmrWriteError("forbidden", "This patient is not yours to write for.");
      return write(tx, parsed.data, scope);
    });
    revalidatePath(`/doctor/patients/${patientUserId}/home-medicines`);
    return { ok: true, id: r.id };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof EmrWriteError) return { ok: false, error: e.message };
    logger.error("doctor.home_medicines.failed", {
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, error: "That did not save. Try again." };
  }
}

export async function prepareMedicinesForHome(raw: { clientKey: string; patientUserId: string }) {
  return run(home.OpenInput, raw, raw.patientUserId, (tx, i, s) =>
    home.openReconciliation(tx, {
      ...i,
      hospitalId: s.hospitalId,
      actorUserId: s.userId,
      now: new Date(),
    }),
  );
}

export async function decideForHome(patientUserId: string, raw: unknown) {
  return run(home.DecideInput, raw, patientUserId, (tx, i, s) =>
    home.recordHomeDecision(tx, {
      ...i,
      hospitalId: s.hospitalId,
      actorUserId: s.userId,
      actorCadre: s.cadreCode,
      now: new Date(),
    }),
  );
}
