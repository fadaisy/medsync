"use server";

import type { EmrDb } from "@/lib/emr/db";
import { refresh } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { requireNurseScope } from "@/lib/nurse/scope";
import { nurseDoseContext, nurseRecordDose } from "@/lib/pharmacy/cd/nurse";

/** A controlled dose given on the ward (rework PRD §6.5): the nurse records it, a witness on duty approves it. */
export async function recordCdDoseAction(raw: unknown) {
  const scope = await requireNurseScope();
  const r = await nurseRecordDose({ userId: scope.userId, hospitalId: scope.hospitalId }, raw);
  if (r.ok) refresh();
  return r;
}

export async function cdDoseContextAction(raw: unknown) {
  const i = z.object({ locationId: z.uuid(), medicineId: z.string().min(1).max(120) }).parse(raw);
  const scope = await requireNurseScope();
  return nurseDoseContext(db as unknown as EmrDb, scope.hospitalId, i.locationId, i.medicineId);
}
