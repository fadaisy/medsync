"use server";

import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { encounters } from "@/db/schema/scheduling";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { ncdClerkshipLive } from "@/lib/encounter/feature";
import { DIABETES_CATALOG } from "@/lib/ncd/catalog/diabetes";
import { saveNcdDraft } from "@/lib/ncd/draft";

export type SaveDraftResult = { ok: true; at: number } | { ok: false; error: string };

/**
 * Autosave the in-progress clerkship.
 *
 * Writes to the mutable `clerkship_drafts` scratchpad, NOT to the append-only
 * clinical documentation — see lib/ncd/draft.ts for why that distinction is the
 * whole design. This is not a clinical save and does not put anything on the
 * audited timeline; it exists so that closing a laptop does not cost an hour of
 * clerking.
 *
 * The encounter is re-checked against the caller's hospital on every call. The
 * client is not trusted for that even though the page already checked it: an
 * action is a public endpoint, and the scope pin is what makes it one the
 * clinician's own hospital can rely on.
 */
export async function saveNcdDraftAction(
  encounterId: string,
  values: CaptureMap,
): Promise<SaveDraftResult> {
  if (!ncdClerkshipLive()) return { ok: false, error: "The clerkship surface is not active." };

  const scope = await requireDoctorScope();

  const [enc] = await db
    .select({ hospitalId: encounters.hospitalId })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!enc || enc.hospitalId !== scope.hospitalId) {
    return { ok: false, error: "That encounter is not yours to write to." };
  }

  const saved = await saveNcdDraft(encounterId, scope.userId, DIABETES_CATALOG, values);
  return saved
    ? { ok: true, at: Date.now() }
    : { ok: false, error: "Draft autosave is not switched on for this deployment." };
}
