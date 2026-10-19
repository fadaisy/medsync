"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { getAuthState } from "@/lib/auth";
import { secondFactorFresh } from "@/lib/auth-fresh";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { labCriticalsLiveFor, labUnitsRangesLiveFor } from "@/lib/lab/feature";
import { saveLimitsDraft, signLimitsVersion } from "./limits";
import { unitDisplay } from "./measures-read";
import { saveMeasure, saveRangeDraft, signRangeVersion } from "./measures-setup";
import { fillMeasuresFromResearch } from "./research-measures";

/**
 * Test catalogue and reference-range set-up actions (Lab Phase 1 §5.6, §5.7). The laboratory lead
 * (`lab.manage`) edits measurement facts and drafts ranges, and signs first with a fresh second
 * factor; the CSO countersigns from the super-admin console (D-LAB1-11). Set-up follows the flag
 * alone, so a hospital can complete it before the production gate opens (S29).
 */

const uuid = z.uuid();
const ok = (id: string): ActionResult => ({ ok: true, id, serverTime: new Date().toISOString() });
const REAUTH: ActionResult = {
  ok: false,
  code: "forbidden",
  error: "reauth: enter your authenticator code to sign.",
};
const decimal = z
  .string()
  .trim()
  .regex(/^-?\d+([.,]\d+)?$/, "Type numbers.")
  .transform((s) => s.replace(",", "."));

async function asManager<T>(
  fn: (
    tx: Parameters<Parameters<typeof asClinicalWriter>[1]>[0],
    actor: { userId: string; hospitalId: string },
  ) => Promise<T>,
) {
  const actor = await requireEmrActor("lab");
  if (!labUnitsRangesLiveFor(actor.hospitalId))
    throw new EmrWriteError("config", "Units and ranges are not switched on here.");
  if (!actor.labPermissions?.includes("lab.manage"))
    throw new EmrWriteError("forbidden", "Only the laboratory lead changes the test catalogue.");
  return asClinicalWriter({ userId: actor.userId, hospitalId: actor.hospitalId }, (tx) =>
    fn(tx, actor),
  );
}

const Measure = z.object({
  testId: uuid,
  conceptId: z.string().trim().min(3).max(80),
  resultType: z.enum(["number", "coded", "text"]),
  unitUcum: z.string().trim().max(40).nullable(),
  decimalPlaces: z.number().int().min(0).max(6).nullable(),
  loincCode: z.string().trim().max(20).nullable(),
  entryCheckLow: decimal.nullable(),
  entryCheckHigh: decimal.nullable(),
  // Lab Phase 2 (ME-1, LD-10): the method register, versioned with the measure.
  methodCode: z
    .string()
    .regex(/^[a-z0-9_]{2,40}$/)
    .nullable()
    .optional(),
  idmsTraceable: z.boolean().nullable().optional(),
});

export async function saveMeasureAction(
  raw: unknown,
): Promise<ActionResult<{ version: number | null }>> {
  const p = Measure.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: p.error.issues[0]?.message ?? "Invalid input." };
  try {
    const out = await asManager(async (tx, a) => {
      // The display is the curated list's notation for the code: one store per fact.
      const display = p.data.unitUcum ? await unitDisplay(tx, p.data.unitUcum) : null;
      return saveMeasure(
        tx,
        a,
        {
          testId: p.data.testId,
          conceptId: p.data.conceptId,
          draft: {
            resultType: p.data.resultType,
            unitUcum: p.data.unitUcum || null,
            unitDisplay: display,
            decimalPlaces: p.data.decimalPlaces,
            loincCode: p.data.loincCode || null,
            entryCheckLow: p.data.entryCheckLow,
            entryCheckHigh: p.data.entryCheckHigh,
            methodCode: p.data.methodCode ?? null,
            idmsTraceable: p.data.idmsTraceable ?? null,
          },
        },
        new Date(),
      );
    });
    return {
      ...(ok(p.data.testId) as { ok: true; id: string; serverTime: string }),
      data: { version: out.kind === "same" ? null : out.version },
    };
  } catch (e) {
    return actionError(e);
  }
}

/**
 * "Fill from the catalogue research": units, decimals and verified LOINC codes for every component that has no
 * measure yet (lib/lab/research-measures.ts). Existing measures are never changed.
 */
export async function fillCatalogueFromResearchAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof fillMeasuresFromResearch>>>
> {
  try {
    const report = await asManager((tx, a) => fillMeasuresFromResearch(tx, a, new Date()));
    return {
      ...(ok("research") as { ok: true; id: string; serverTime: string }),
      data: report,
    };
  } catch (e) {
    return actionError(e);
  }
}

const Band = z.object({
  sex: z.enum(["female", "male", "any"]),
  ageFromDays: z.number().int().min(0).nullable(),
  ageToDays: z.number().int().min(1).nullable(),
  low: decimal.nullable(),
  high: decimal.nullable(),
  source: z.string().trim().min(3).max(500),
});
const Draft = z.object({
  testId: uuid,
  conceptId: z.string().trim().min(3).max(80),
  bands: z.array(Band).min(1).max(40),
});

export async function saveRangeDraftAction(raw: unknown): Promise<ActionResult> {
  const p = Draft.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      code: "invalid",
      error: p.error.issues[0]?.message ?? "Check each band: a source, and numbers.",
    };
  try {
    return ok(await asManager((tx, a) => saveRangeDraft(tx, a, p.data, new Date())));
  } catch (e) {
    return actionError(e);
  }
}

const Sign = z.object({ versionId: uuid, exceptionNote: z.string().trim().max(500).nullable() });

export async function signRangeAsLeadAction(raw: unknown): Promise<ActionResult> {
  const p = Sign.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  if (!(await secondFactorFresh())) return REAUTH;
  try {
    await asManager((tx, a) => signRangeVersion(tx, { ...a, as: "lead" }, p.data, new Date()));
    return ok(p.data.versionId);
  } catch (e) {
    return actionError(e);
  }
}

const CsoSign = Sign.extend({ hospitalId: uuid });

export async function signRangeAsCsoAction(raw: unknown): Promise<ActionResult> {
  const p = CsoSign.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  const state = await getAuthState();
  if (!state.user || state.aal !== "aal2" || !state.roles.includes("superadmin"))
    return { ok: false, code: "forbidden", error: "Only the clinical safety officer signs here." };
  if (!(await secondFactorFresh())) return REAUTH;
  const userId = state.user.id;
  try {
    await asClinicalWriter({ userId, hospitalId: p.data.hospitalId }, (tx) =>
      signRangeVersion(
        tx,
        { userId, hospitalId: p.data.hospitalId, as: "cso" },
        p.data,
        new Date(),
      ),
    );
    return ok(p.data.versionId);
  } catch (e) {
    return actionError(e);
  }
}

/* ─── Critical limits (§5.8; Step 6) ──────────────────────────────────── */

const LimitRow = z.object({
  testId: uuid,
  conceptId: z.string().trim().min(3).max(80),
  ageFromDays: z.number().int().min(0).nullable(),
  ageToDays: z.number().int().min(1).nullable(),
  low: decimal.nullable(),
  high: decimal.nullable(),
  referenceId: z.string().trim().min(1).max(60),
  source: z.string().trim().min(3).max(500),
});

export async function saveLimitsDraftAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ limits: z.array(LimitRow).min(1).max(200) }).safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      code: "invalid",
      error: "Each limit needs a test, a number, a reference id and a source.",
    };
  try {
    return ok(await asLimitsManager((tx, a) => saveLimitsDraft(tx, a, p.data, new Date())));
  } catch (e) {
    return actionError(e);
  }
}

export async function signLimitsAsLeadAction(raw: unknown): Promise<ActionResult> {
  const p = Sign.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  if (!(await secondFactorFresh())) return REAUTH;
  try {
    await asLimitsManager((tx, a) =>
      signLimitsVersion(tx, { ...a, as: "lead" }, p.data, new Date()),
    );
    return ok(p.data.versionId);
  } catch (e) {
    return actionError(e);
  }
}

export async function signLimitsAsCsoAction(raw: unknown): Promise<ActionResult> {
  const p = CsoSign.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  const state = await getAuthState();
  if (!state.user || state.aal !== "aal2" || !state.roles.includes("superadmin"))
    return { ok: false, code: "forbidden", error: "Only the clinical safety officer signs here." };
  if (!(await secondFactorFresh())) return REAUTH;
  const userId = state.user.id;
  try {
    await asClinicalWriter({ userId, hospitalId: p.data.hospitalId }, (tx) =>
      signLimitsVersion(
        tx,
        { userId, hospitalId: p.data.hospitalId, as: "cso" },
        p.data,
        new Date(),
      ),
    );
    return ok(p.data.versionId);
  } catch (e) {
    return actionError(e);
  }
}

/** Limits need both: the catalogue's units (LAB_UNITS_RANGES) and the alerts they raise (LAB_CRITICALS). */
async function asLimitsManager<T>(fn: Parameters<typeof asManager<T>>[0]) {
  const actor = await requireEmrActor("lab");
  if (!labCriticalsLiveFor(actor.hospitalId))
    throw new EmrWriteError("config", "Critical alerts are not switched on here.");
  return asManager(fn);
}
