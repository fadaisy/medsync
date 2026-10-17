"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError, withPatientWrite } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/exchange/store";
import { saveConfigDraft } from "./catalogue-v2";
import { DELTA_OUTCOMES, DeltaRulePayload, PanelRulePayload, PatternRulePayload } from "./delta";
import { trialOnHistory } from "./delta-read";
import { recordDeltaOutcome } from "./delta-store";
import { labDeltaChecksLiveFor } from "./feature";

/**
 * Delta checks (Lab Phase 5 §8): the house contract. A decision on a fired rule needs result entry or release; a
 * rule draft and the trial need `lab.manage`. Signing goes through signConfigAsLeadAction (the lead slot, fresh
 * second factor) and the CSO's console (signConfigAsCsoAction).
 */
const bad = (e?: z.ZodError): ActionResult<never> => ({
  ok: false,
  code: "invalid",
  error: e?.issues[0]?.message ?? "Check the form.",
});
const ok = <T>(id: string, data?: T): ActionResult<T> => ({
  ok: true,
  id,
  serverTime: new Date().toISOString(),
  ...(data === undefined ? {} : { data }),
});

async function lab(need: "decide" | "manage") {
  const actor = await requireEmrActor("lab");
  if (!labDeltaChecksLiveFor(actor.hospitalId))
    throw new EmrWriteError("config", "Delta checks are not switched on here.");
  const p = new Set(actor.labPermissions ?? []);
  if (need === "manage" && !p.has("lab.manage"))
    throw new EmrWriteError("forbidden", "Only the laboratory lead sets delta rules.");
  if (need === "decide" && !p.has("lab.result.enter") && !p.has("lab.result.release"))
    throw new EmrWriteError("forbidden", "You do not enter or release results.");
  return actor;
}

const Outcome = z.object({
  flagId: z.uuid(),
  outcome: z.enum(DELTA_OUTCOMES),
  withWhom: z.string().trim().min(2).max(120).nullable(),
  note: z.string().trim().min(3, "Say what you checked.").max(1000),
  clientKey: z.string().min(8).max(120),
});
/** DL-6: the technologist's decision on one fired rule (what was checked is required). */
export async function recordDeltaOutcomeAction(raw: unknown): Promise<ActionResult> {
  const p = Outcome.safeParse(raw);
  if (!p.success) return bad(p.error);
  try {
    const actor = await lab("decide");
    const patient = await asClinicalWriter(actor, async (tx) => {
      const [r] = rowsOf<{ p: string }>(
        await tx.execute(sql`SELECT patient_user_id AS p FROM delta_flags WHERE id = ${p.data.flagId}
          AND hospital_id = ${actor.hospitalId}`),
      );
      if (!r) throw new EmrWriteError("not_found", "That delta check was not found.");
      return r.p;
    });
    const id = await withPatientWrite(actor, patient, (ctx) => recordDeltaOutcome(ctx, p.data));
    return ok(id);
  } catch (e) {
    return actionError(e);
  }
}

const RuleDraft = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("delta_rule"),
    key: z.string().regex(/^[A-Z0-9-]{3,40}$/),
    payload: DeltaRulePayload,
  }),
  z.object({
    kind: z.literal("panel_rule"),
    key: z.string().regex(/^[A-Z0-9-]{3,40}$/),
    payload: PanelRulePayload,
  }),
  z.object({
    kind: z.literal("pattern_rule"),
    key: z.string().regex(/^[A-Z0-9-]{3,40}$/),
    payload: PatternRulePayload,
  }),
]);
/** §5.7: a draft rule (a new version when one is signed); it runs only once signed and countersigned. */
export async function saveDeltaRuleAction(raw: unknown): Promise<ActionResult> {
  const p = RuleDraft.safeParse(raw);
  if (!p.success) return bad(p.error);
  try {
    const actor = await lab("manage");
    const a = { userId: actor.userId, hospitalId: actor.hospitalId };
    const id = await asClinicalWriter(a, (tx: EmrTx) =>
      saveConfigDraft(
        tx,
        a,
        { kind: p.data.kind, key: p.data.key, payload: p.data.payload },
        new Date(),
      ),
    );
    return ok(id);
  } catch (e) {
    return actionError(e);
  }
}

/** DL-8: try a rule on the last 90 days of released results; reads only. */
export async function trialDeltaRuleAction(
  raw: unknown,
): Promise<
  ActionResult<{ pairs: number; flags: number; mislabels: number; mislabelsFlagged: number }>
> {
  const p = DeltaRulePayload.safeParse(raw);
  if (!p.success) return bad(p.error);
  try {
    const actor = await lab("manage");
    const a = { userId: actor.userId, hospitalId: actor.hospitalId };
    const r = await asClinicalWriter(a, (tx) =>
      trialOnHistory(tx, actor.hospitalId, p.data, new Date()),
    );
    return ok(actor.hospitalId, r);
  } catch (e) {
    return actionError(e);
  }
}
