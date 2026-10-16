"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import {
  recordAltAssessment,
  recordEqaResults,
  recordEqaScores,
  recordRound,
  saveScheme,
} from "./eqa-store";
import { labEqaLiveFor } from "./feature";
import { setQualitySettings } from "./stock-store";

/**
 * External quality assessment actions (Lab Phase 3 §8 "EQA"; Step 7). The house contract: Zod → the lab actor
 * (AAL2) → labEqa → permission → one transaction as the clinical writer, hospital-scoped (audited by trigger) →
 * `{ id, serverTime }`. Schemes, scores, alternative assessments and the operational settings need
 * `lab.eqa.manage` (with `lab.manage`); a round's receipt and our results also take `lab.result.release` (the
 * staff who run patient samples test the panel). `enrol` is part of `saveScheme` (covers = enrolment, P8).
 */

type A = { userId: string; hospitalId: string };
const uuid = z.uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date.");
const testCode = z.string().regex(/^test\.[a-z0-9_]{2,60}$/);
const bad = (e?: z.ZodError): ActionResult => ({
  ok: false,
  code: "invalid",
  error: e?.issues[0]?.message ?? "Check the form.",
});

async function run(
  need: "manage" | "staff",
  fn: (tx: EmrTx, a: A, now: Date) => Promise<string | void>,
): Promise<ActionResult> {
  try {
    const actor = await requireEmrActor("lab");
    if (!labEqaLiveFor(actor.hospitalId))
      throw new EmrWriteError("config", "External quality assessment is not switched on here.");
    const p = new Set(actor.labPermissions ?? []);
    const manage = p.has("lab.eqa.manage") || p.has("lab.manage");
    if (need === "manage" ? !manage : !manage && !p.has("lab.result.release"))
      throw new EmrWriteError(
        "forbidden",
        need === "manage"
          ? "Only the laboratory lead manages EQA."
          : "You do not run patient samples in this lab.",
      );
    const a = { userId: actor.userId, hospitalId: actor.hospitalId };
    const r = await asClinicalWriter(a, (tx) => fn(tx, a, new Date()));
    return { ok: true, id: r ?? a.hospitalId, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}

/** EA-1: a scheme and the tests it covers (the enrolment). */
export async function saveSchemeAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      id: uuid.nullable(),
      name: z.string().trim().min(2, "Name the scheme.").max(160),
      provider: z.string().trim().min(2, "Name the provider.").max(160),
      covers: z.array(testCode).min(1, "Choose the tests it covers.").max(80),
      roundsPerYear: z.number().int().min(1).max(52).nullable(),
      active: z.boolean(),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("manage", (tx, a) => saveScheme(tx, a, p.data));
}

/** EA-2: a panel received, with its samples (scheme ids and analytes; the kit name for HIV panels). */
export async function recordRoundAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      schemeId: uuid,
      label: z.string().trim().min(1, "Give the round its label.").max(60),
      receivedOn: day,
      dueOn: day.nullable(),
      samples: z
        .array(
          z.object({
            sampleId: z.string().trim().min(1).max(40),
            conceptId: z.string().regex(/^obs\.[a-z0-9_]{2,80}$/, "Choose the analyte."),
            kit: z.string().trim().min(2).max(80).nullable(),
          }),
        )
        .min(1, "Add the samples.")
        .max(40),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("staff", (tx, a) => recordRound(tx, a, p.data));
}

/** EA-2: our results, who tested the panel, and the date submitted (the tester check only warns). */
export async function recordEqaResultsAction(
  raw: unknown,
): Promise<ActionResult & { warnings?: string[] }> {
  const p = z
    .object({
      roundId: uuid,
      results: z
        .array(z.object({ sampleId: z.string().min(1).max(40), ours: z.string().trim().max(40) }))
        .min(1)
        .max(40),
      testedBy: z.array(uuid).min(1, "Say who tested the panel.").max(10),
      submittedOn: day,
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  let warnings: string[] = [];
  const r = await run("staff", async (tx, a) => {
    warnings = await recordEqaResults(tx, a, p.data);
    return p.data.roundId;
  });
  return r.ok ? { ...r, warnings } : r;
}

/** EA-3, EA-4: the provider's scores, as reported (never re-scored), once; its report as a reference. */
export async function recordEqaScoresAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      roundId: uuid,
      scoredOn: day,
      reportPath: z.string().trim().min(3).max(300).nullable(),
      scores: z
        .array(
          z.object({
            sampleId: z.string().min(1).max(40),
            target: z.string().trim().max(40).nullable(),
            score: z.enum(["acceptable", "unacceptable"], { error: "Choose each sample's score." }),
            scoreKind: z.enum(["percent", "sdi", "z"]).nullable(),
            scoreValue: z.number().finite().nullable(),
            limit: z.string().trim().max(80).nullable(),
            bias: z.number().finite().nullable(),
          }),
        )
        .min(1)
        .max(40),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("manage", async (tx, a, now) => {
    const r = await recordEqaScores(tx, a, p.data, now);
    return r.ncId ?? p.data.roundId;
  });
}

/** EA-5: split samples, an interlaboratory comparison or retained samples, with results and a conclusion. */
export async function recordAltAssessmentAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      testCode,
      method: z.enum(["split_sample", "interlab", "retained_samples"]),
      partner: z.string().trim().min(2).max(160).nullable(),
      doneOn: day,
      results: z.string().trim().min(3, "Record the results.").max(2000),
      conclusion: z.string().trim().min(3, "Write the conclusion.").max(1000),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("manage", (tx, a, now) => recordAltAssessment(tx, a, p.data, now));
}

/** EA-2's tester window and EA-5's period: operational settings, set by the lead (never clinical). */
export async function saveEqaSettingsAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      eqaTesterWindowDays: z.number().int().min(1).max(365).nullable(),
      altPeriodDays: z.number().int().min(1).max(1095).nullable(),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("manage", (tx, a, now) => setQualitySettings(tx, a, p.data, now));
}
