"use server";

import type { AssignableDoctor } from "@/lib/encounter/assignment";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { listAssignableDoctors, reassignPlannedEncounter } from "@/lib/encounter/assignment";
import { encounterEngineLive } from "@/lib/encounter/feature";
import { openEncounterFromTriage } from "@/lib/encounter/handoff";
import { toEncounterScope } from "@/lib/encounter/workspace-scope";

/**
 * Doctor-initiated triage → encounter handoff. Opens (or links) the encounter
 * for a completed triage record, seeds the clerkship, and navigates to the
 * per-encounter clerking surface. On success this REDIRECTS (so it only returns
 * on failure). The engine enforces access + cadre + audit.
 *
 * Ready to wire to a "Start clerking" affordance on the triage desk; reachable
 * by any caller (incl. mobile) with the doctor scope.
 */
export type StartEncounterFromTriageResult = { ok: false; error: string };

export async function startEncounterFromTriageAction(
  triageRecordId: string,
): Promise<StartEncounterFromTriageResult> {
  if (!encounterEngineLive()) {
    return { ok: false, error: "The clinical module is not active yet." };
  }
  const scope = await requireDoctorScope();
  const res = await openEncounterFromTriage(triageRecordId, toEncounterScope(scope));
  if (!res.ok) return { ok: false, error: res.error };
  redirect(`/doctor/encounters/${res.encounterId}`);
}

/** Doctors a doctor can hand a planned encounter to (for the reassign picker). */
export async function listDoctorsForReassignAction(
  departmentId?: string | null,
): Promise<AssignableDoctor[]> {
  const scope = await requireDoctorScope();
  return listAssignableDoctors({
    hospitalId: scope.hospitalId,
    departmentId: departmentId ?? scope.departmentId ?? null,
  });
}

export type ReassignResult = { ok: true } | { ok: false; error: string };

/** Hand a still-planned (assigned, not started) encounter to another doctor. */
export async function reassignEncounterAction(
  encounterId: string,
  newDoctorUserId: string,
): Promise<ReassignResult> {
  if (!encounterEngineLive()) {
    return { ok: false, error: "The clinical module is not active yet." };
  }
  const scope = await requireDoctorScope();
  const res = await reassignPlannedEncounter({
    encounterId,
    newDoctorUserId,
    hospitalId: scope.hospitalId,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/doctor/assigned");
  return { ok: true };
}
