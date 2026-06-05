"use server";

import type { CatalogProperty, CatalogSymptom } from "@/lib/clerkship/catalog";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { encounters } from "@/db/schema/scheduling";
import { loadPropertiesForSymptom, loadSymptomCatalog } from "@/lib/clerkship/catalog";
import { proposeCatalogItem } from "@/lib/clerkship/governance";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { ClerkshipInputSchema, clerkshipInputToClerkship } from "@/lib/encounter/clerkship-input";
import { encounterEngineLive } from "@/lib/encounter/feature";
import { recordClerkshipVersion } from "@/lib/encounter/record";
import { toEncounterScope } from "@/lib/encounter/workspace-scope";

export type SubmitClerkshipResult =
  | { ok: true; documentationId?: string }
  | { ok: false; error: string };

/**
 * Append a clerkship documentation version for an encounter (draft or final).
 * Validates the form input, resolves the doctor scope + the encounter's patient,
 * verifies the encounter is in the doctor's hospital, then delegates to the
 * engine (which enforces the cadre rules + legitimate-access basis + audit +
 * append-only versioning). Decision-support — records what the clinician writes.
 */
export async function submitClerkshipAction(
  encounterId: string,
  rawInput: unknown,
  finalise: boolean,
): Promise<SubmitClerkshipResult> {
  if (!encounterEngineLive()) {
    return { ok: false, error: "The clinical module is not active yet." };
  }

  const scope = await requireDoctorScope();

  const parsed = ClerkshipInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "Invalid clerkship input." };

  const [enc] = await db
    .select({ patientUserId: encounters.patientUserId, hospitalId: encounters.hospitalId })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);
  if (!enc) return { ok: false, error: "Encounter not found." };
  if (enc.hospitalId !== scope.hospitalId) {
    return { ok: false, error: "That encounter is outside your hospital." };
  }

  const res = await recordClerkshipVersion({
    encounterId,
    patientUserId: enc.patientUserId,
    scope: toEncounterScope(scope),
    clerkship: clerkshipInputToClerkship(parsed.data),
    finalise,
  });
  if (res.error) return { ok: false, error: res.error };

  revalidatePath(`/doctor/encounters/${encounterId}`);
  return { ok: true, documentationId: res.documentationId };
}

/** Tap-first capture: the symptom list (for search) + a symptom's properties. */
export async function loadSymptomCatalogAction(): Promise<CatalogSymptom[]> {
  await requireDoctorScope();
  return loadSymptomCatalog();
}

export async function loadSymptomPropertiesAction(symptomCode: string): Promise<CatalogProperty[]> {
  await requireDoctorScope();
  return loadPropertiesForSymptom(symptomCode);
}

export type ProposeResult = { ok: true } | { ok: false; error: string };

/**
 * Propose an ad-hoc symptom to the SHARED catalog (governed). Routes to CSO/SA
 * review — it does NOT mutate the shared catalog. The clinician keeps the symptom
 * locally on the encounter regardless.
 */
export async function proposeSymptomAction(
  payload: { code: string; display: string; system: string },
  note?: string,
): Promise<ProposeResult> {
  if (!encounterEngineLive()) return { ok: false, error: "The clinical module is not active yet." };
  const scope = await requireDoctorScope();
  const res = await proposeCatalogItem({
    proposerUserId: scope.userId,
    hospitalId: scope.hospitalId,
    kind: "symptom",
    payload,
    note,
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
