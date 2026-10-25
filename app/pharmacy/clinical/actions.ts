"use server";

import type { PharmacyPermission } from "@/lib/pharmacy/access";
import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { CLINICAL_UI } from "@/content/pharmacy-clinical";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import * as reactions from "@/lib/pharmacy/clinical/reaction-store";
import * as store from "@/lib/pharmacy/clinical/store";
import { anyClinicalLiveFor, pharmacyReactionsLiveFor } from "@/lib/pharmacy/feature";
import * as packs from "@/lib/pharmacy/stores/packs";
import { attestResult } from "@/lib/pharmacy/stores/supply-action";
import { storeNeed } from "@/lib/pharmacy/stores/write";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Pharmacy Phase 3, Clinical content (5.2, Section 8): the house contract — Zod with a client key, the actor
 * (auth, AAL2, the pharmacy affiliation), a Phase 3 flag on, then the permission inside one transaction.
 * A signer's password and code reach the server once, in `attestSigner`, and are never logged or stored.
 */
async function act<I, R extends { id: string }>(
  name: string,
  schema: z.ZodType<I>,
  raw: unknown,
  permission: PharmacyPermission,
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
): Promise<ActionResult<R>> {
  try {
    const actor = await requirePharmacyActor();
    if (!anyClinicalLiveFor(actor.hospitalId))
      return { ok: false, code: "config", error: CLINICAL_UI.flagOff };
    const result = await runPharmacyWrite(schema, raw, actor, storeNeed(permission), write);
    if (result.ok) revalidatePath("/pharmacy/clinical", "layout");
    return result;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.clinical.action_failed", {
      action: name,
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, code: "conflict", error: CLINICAL_UI.failed };
  }
}

const bare = <R>(r: ActionResult<R>): ActionResult =>
  r.ok ? { ok: true, id: r.id, serverTime: r.serverTime } : r;

export async function saveContentDraft(raw: unknown) {
  return bare(
    await act("saveContentDraft", store.DraftInput, raw, "pharmacy.review", store.saveDraft),
  );
}
export async function signContentEntry(raw: unknown) {
  return bare(
    await act("signContentEntry", store.SignInput, raw, "pharmacy.manage", store.signEntry),
  );
}
export async function withdrawContentEntry(raw: unknown) {
  return bare(
    await act(
      "withdrawContentEntry",
      store.WithdrawInput,
      raw,
      "pharmacy.manage",
      store.withdrawEntry,
    ),
  );
}
export async function importCandidates(raw: unknown) {
  return bare(
    await act(
      "importCandidates",
      store.ImportInput,
      raw,
      "pharmacy.review",
      store.importCandidates,
    ),
  );
}
export async function importAware(raw: unknown) {
  return bare(
    await act("importAware", store.ImportInput, raw, "pharmacy.review", store.importAware),
  );
}
export async function attestSigner(raw: unknown) {
  return attestResult(
    await act("attestSigner", packs.AttestPersonInput, raw, "pharmacy.view", (ctx, i) =>
      packs.attestPerson(ctx, { ...i, action: "sign_pack" }),
    ),
  );
}

/* ─── Suspected reactions (5.6, Section 8), behind `pharmacyReactions` ─── */

const reactionsOn = async () => pharmacyReactionsLiveFor((await requirePharmacyActor()).hospitalId);

/** D-PH3-14: pharmacists and pharmacy technicians record (`pharmacy.dispense` or `pharmacy.review`). */
export async function recordSuspectedReaction(raw: unknown) {
  if (!(await reactionsOn()))
    return { ok: false as const, code: "config" as const, error: CLINICAL_UI.flagOff };
  return bare(
    await act(
      "recordSuspectedReaction",
      reactions.RecordInput,
      raw,
      "pharmacy.dispense",
      reactions.recordReaction,
    ),
  );
}
/** AR-6: causality, submission, close, and logged prints and copies (`pharmacy.review`). */
export async function recordReportEvent(raw: unknown) {
  if (!(await reactionsOn()))
    return { ok: false as const, code: "config" as const, error: CLINICAL_UI.flagOff };
  return bare(
    await act(
      "recordReportEvent",
      reactions.EventInput,
      raw,
      "pharmacy.review",
      reactions.reportEvent,
    ),
  );
}
