"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { runEmrWrite } from "@/lib/emr/write/orders";
import { SmsTemplatePayload, templateErrors } from "@/lib/notify/results-ready";
import { saveConfigDraft } from "./catalogue-v2";
import { patientResultsLiveFor } from "./feature";
import { FloorAdditionsPayload, MinorsRulePayload, PatientReleasePayload } from "./patient-release";
import {
  holdFromPatient,
  recordPatientTold,
  releaseContext,
  releaseHold,
  writeNoteToPatient,
} from "./patient-release-store";
import { lint, PlainWordsPayload } from "./plain-words";

/**
 * Patient release (Lab Phase 5 §8, patient-release group). The clinician's writes go through the EMR's house contract
 * (`runEmrWrite`: the surface, AAL2, the patient-access basis) plus the result's responsible clinician (orderer,
 * department cover, or the clinician it was forwarded to). The release table, plain words, the minors rule, the SMS
 * template and floor additions are drafted by the laboratory lead and signed in the lead slot, then by the CSO.
 */

const surface = z.enum(["doctor", "clinician", "nurse"]);
const base = {
  patientUserId: z.uuid(),
  reportId: z.uuid(),
  surface,
  clientKey: z.string().min(8).max(120),
};
const live = async (hospitalId: string) => {
  if (!patientResultsLiveFor(hospitalId))
    throw new EmrWriteError("config", "Patient results are not switched on here.");
};

const Told = z.object({
  ...base,
  how: z.enum(["in_person", "phone", "guardian"]),
  toldAt: z.coerce.date(),
});
export async function recordPatientToldAction(raw: unknown) {
  return runEmrWrite(Told, raw, async (ctx, i) => {
    await live(ctx.actor.hospitalId);
    return { id: await recordPatientTold(ctx, i) };
  });
}

const Hold = z.object({
  ...base,
  reason: z.enum(["explain_in_person", "harm_to_patient"]),
  untilOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export async function holdFromPatientAction(raw: unknown) {
  return runEmrWrite(Hold, raw, async (ctx, i) => {
    await live(ctx.actor.hospitalId);
    const rel = await releaseContext(ctx.tx, ctx.actor.hospitalId, ctx.now);
    return { id: await holdFromPatient(ctx, i, rel.rules) };
  });
}

export async function releaseHoldAction(raw: unknown) {
  return runEmrWrite(z.object(base), raw, async (ctx, i) => {
    await live(ctx.actor.hospitalId);
    return { id: await releaseHold(ctx, i) };
  });
}

const Note = z.object({ ...base, text: z.string().trim().min(3, "Write the note.").max(600) });
export async function writeNoteToPatientAction(raw: unknown) {
  return runEmrWrite(Note, raw, async (ctx, i) => {
    await live(ctx.actor.hospitalId);
    return { id: await writeNoteToPatient(ctx, i) };
  });
}

/* ─── The laboratory lead's drafts (5.5) ─────────────────────────────── */

const Draft = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("patient_release"),
    key: z.literal("hospital"),
    payload: PatientReleasePayload,
  }),
  z.object({
    kind: z.literal("plain_words"),
    key: z.string().regex(/^obs\.[a-z0-9_]+:[a-z]{2,3}$/),
    payload: PlainWordsPayload,
  }),
  z.object({
    kind: z.literal("minors_rule"),
    key: z.literal("hospital"),
    payload: MinorsRulePayload,
  }),
  z.object({
    kind: z.literal("sms_template"),
    key: z.string().regex(/^[a-z]{2,3}$/),
    payload: SmsTemplatePayload,
  }),
  z.object({
    kind: z.literal("patient_floor_additions"),
    key: z.literal("hospital"),
    payload: FloorAdditionsPayload,
  }),
]);
export async function savePatientReleaseDraftAction(raw: unknown): Promise<ActionResult> {
  const p = Draft.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: p.error.issues[0]?.message ?? "Check the form." };
  // PW-3: the banned-phrase lint; PS-1: the template check. Both refuse before a draft exists.
  if (p.data.kind === "plain_words") {
    const hits = lint(p.data.payload, p.data.payload.bannedPhrases);
    if (hits.length) return { ok: false, code: "invalid", error: `Remove: ${hits.join(", ")}.` };
  }
  if (p.data.kind === "sms_template") {
    const e = templateErrors(p.data.payload);
    if (e.length)
      return {
        ok: false,
        code: "invalid",
        error: `The message ${e.map((x) => x.replace(/_/g, " ")).join("; ")}.`,
      };
  }
  try {
    const actor = await requireEmrActor("lab");
    await live(actor.hospitalId);
    if (!(actor.labPermissions ?? []).includes("lab.manage"))
      throw new EmrWriteError("forbidden", "Only the laboratory lead drafts what patients see.");
    const a = { userId: actor.userId, hospitalId: actor.hospitalId };
    const id = await asClinicalWriter(a, (tx) =>
      saveConfigDraft(
        tx,
        a,
        { kind: p.data.kind, key: p.data.key, payload: p.data.payload },
        new Date(),
      ),
    );
    return { ok: true, id, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}
