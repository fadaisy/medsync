"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { labReferralLiveFor } from "./feature";
import { resolveMatch } from "./match-store";

/**
 * Waiting for a match (Lab Phase 4 §5.7; MA-6, MA-7): the house contract, `lab.match.resolve` (or the lab lead's
 * `lab.manage`). Values are never shown here; a decision is a resolution with its reason, kept for good.
 */
const Resolve = z.object({
  itemId: z.uuid(),
  action: z.enum([
    "file_after_confirming",
    "not_ours",
    "set_aside",
    "keep_unordered",
    "asked_partner",
  ]),
  method: z.enum(["corrected_report", "phone_call"]).nullable(),
  spokeTo: z.string().trim().max(120).nullable(),
  secondUserId: z.uuid().nullable(),
  reason: z.string().trim().min(3, "Say why.").max(1000),
});

export async function resolveMatchAction(raw: unknown): Promise<ActionResult> {
  const p = Resolve.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: p.error.issues[0]?.message ?? "Check the form." };
  try {
    const actor = await requireEmrActor("lab");
    if (!labReferralLiveFor(actor.hospitalId))
      throw new EmrWriteError("config", "Referrals are not switched on here.");
    const perms = new Set(actor.labPermissions ?? []);
    const a = {
      userId: actor.userId,
      hospitalId: actor.hospitalId,
      canResolve: perms.has("lab.match.resolve") || perms.has("lab.manage"),
    };
    const id = await asClinicalWriter(a, (tx) => resolveMatch(tx, a, p.data, new Date()));
    return { ok: true, id, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}
