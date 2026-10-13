"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { secondFactorFresh } from "@/lib/auth-fresh";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { saveConfigDraft, signConfig } from "./catalogue-v2";
import { labEqaLiveFor, labQcLiveFor } from "./feature";
import {
  authoriseResumption,
  closeNonconformity,
  decideLookbackItem,
  ncAction,
  openNonconformity,
  planKey,
  recordKitQc,
  recordQcRun,
  setLabTarget,
} from "./qc-store";
import { PAYLOADS } from "./signed-config";

/**
 * Quality control, look-back and nonconformity actions (Lab Phase 3 §8 "QC", "Look-back", "Nonconformities";
 * Step 6). The house contract: Zod with a client key → the lab actor (AAL2) → labQc → permission → one
 * transaction as the clinical writer, hospital-scoped (audited by trigger) → `{ id, serverTime }`. Runs, kit
 * checks, look-back decisions and actions need `lab.result.release` (or `lab.manage`); plans, rules, targets,
 * resumption and closure are the lead's (`lab.manage`), signing and closing with a fresh second factor. The
 * override is the release action itself (lib/emr/actions/results.ts, `qcOverride`), checked in the one release
 * path for `lab.qc.override`.
 */

type A = { userId: string; hospitalId: string };
const uuid = z.uuid();
const key = z.string().min(8).max(120);
const words = (min: number, max: number, m = "Say a little more.") =>
  z.string().trim().min(min, m).max(max);
const bad = (e?: z.ZodError): ActionResult => ({
  ok: false,
  code: "invalid",
  error: e?.issues[0]?.message ?? "Check the form.",
});
const REAUTH: ActionResult = {
  ok: false,
  code: "forbidden",
  error: "reauth: enter your authenticator code to sign.",
};

/** Nonconformities and their look-back come from QC or EQA (Step 7): either flag opens them. */
const ncLive = (h: string) => labQcLiveFor(h) || labEqaLiveFor(h);

async function run(
  need: "staff" | "lead",
  fn: (tx: EmrTx, a: A, now: Date) => Promise<string | void>,
  live: (hospitalId: string) => boolean = labQcLiveFor,
): Promise<ActionResult> {
  try {
    const actor = await requireEmrActor("lab");
    if (!live(actor.hospitalId))
      throw new EmrWriteError("config", "Quality control is not switched on here.");
    const p = new Set(actor.labPermissions ?? []);
    if (
      need === "lead" ? !p.has("lab.manage") : !p.has("lab.result.release") && !p.has("lab.manage")
    )
      throw new EmrWriteError(
        "forbidden",
        need === "lead" ? "Only the laboratory lead does this." : "You do not run QC in this lab.",
      );
    const a = { userId: actor.userId, hospitalId: actor.hospitalId };
    const r = await asClinicalWriter(a, (tx) => fn(tx, a, new Date()));
    return { ok: true, id: r ?? a.hospitalId, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}

/* ─── Runs (QR-*, QH-1) ──────────────────────────────────────────────── */

const Run = z.object({
  deviceId: uuid,
  conceptId: z.string().min(3).max(80),
  values: z
    .array(
      z.object({ level: z.number().int().min(1).max(6), lotId: uuid, value: z.number().finite() }),
    )
    .min(1)
    .max(6),
  expect: z.enum(["accepted", "warning", "rejected"]),
  firstStep: z.string().trim().max(300).nullable(),
  note: z.string().trim().max(1000).nullable(),
  runAt: z.coerce.date(),
  clientKey: key,
});
export async function recordQcRunAction(raw: unknown): Promise<ActionResult> {
  const p = Run.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("staff", async (tx, a, now) => (await recordQcRun(tx, a, p.data, now)).id);
}

/* ─── Plans, policy, kit rules: drafts and the lead's signature ─────────── */

export async function saveQcPlanAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ deviceId: uuid, conceptId: z.string().min(3).max(80), payload: PAYLOADS.qc_plan })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) =>
    saveConfigDraft(
      tx,
      a,
      { kind: "qc_plan", key: planKey(p.data.deviceId, p.data.conceptId), payload: p.data.payload },
      now,
    ),
  );
}

export async function saveQcPolicyAction(raw: unknown): Promise<ActionResult> {
  const p = PAYLOADS.qc_policy.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) =>
    saveConfigDraft(tx, a, { kind: "qc_policy", key: "hospital", payload: p.data }, now),
  );
}

export async function saveKitQcRuleAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ itemId: uuid, payload: PAYLOADS.kit_qc_rule }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) =>
    saveConfigDraft(
      tx,
      a,
      { kind: "kit_qc_rule", key: p.data.itemId, payload: p.data.payload },
      now,
    ),
  );
}

/**
 * The lead's signature on a QC plan, the QC policy or a kit rule (GATE A §3.1): a kit rule is in force on it; a
 * plan and the policy then wait for the CSO's countersignature in the sign-off console.
 */
export async function signQcConfigAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ configId: uuid, exceptionNote: z.string().trim().max(500).nullable() })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh())) return REAUTH;
  return run("lead", async (tx, a, now) => {
    await signConfig(tx, { ...a, as: "lead" }, p.data, now);
    return p.data.configId;
  });
}

/** QQ-3: "Set this lab's target" writes a new plan version (a draft to sign); nothing recalculates by itself. */
export async function setLabTargetAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      deviceId: uuid,
      conceptId: z.string().min(3).max(80),
      level: z.number().int().min(1).max(6),
      controlLotId: uuid,
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) => setLabTarget(tx, a, p.data, now));
}

/* ─── Kits and stains (KQ-*) ──────────────────────────────────────────── */

const Kit = z.object({
  lotId: uuid,
  trigger: z.enum([
    "each_day_of_use",
    "new_lot",
    "new_shipment",
    "new_operator",
    "schedule",
    "after_maintenance",
  ]),
  observed: z
    .array(
      z.union([
        z.object({ name: z.string().min(1).max(80), code: z.string().min(1).max(60) }),
        z.object({ name: z.string().min(1).max(80), met: z.array(z.string().max(200)).max(20) }),
      ]),
    )
    .min(1)
    .max(10),
  clientKey: key,
});
export async function recordKitQcAction(raw: unknown): Promise<ActionResult> {
  const p = Kit.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("staff", async (tx, a, now) => (await recordKitQc(tx, a, p.data, now)).id);
}

/* ─── Look-back and nonconformities (LB-3, NC-*) ─────────────────────── */

export async function decideLookbackItemAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ itemId: uuid, decision: z.enum(["stands", "repeat", "amend"]) })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("staff", (tx, a, now) => decideLookbackItem(tx, a, p.data, now), ncLive);
}

export async function openNonconformityAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      source: z.enum(["equipment", "complaint", "specimen", "other"]),
      title: words(3, 160, "Give it a title."),
      whatHappened: words(3, 2000, "Say what happened."),
      riskText: z.string().trim().min(3).max(2000).nullable(),
      deviceId: uuid.nullable(),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("staff", (tx, a, now) => openNonconformity(tx, a, p.data, now), ncLive);
}

export async function addNcActionAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      ncId: uuid,
      what: words(3, 300, "Say what will be done."),
      who: words(2, 120, "Say who does it."),
      by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date."),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  const { ncId, ...add } = p.data;
  return run("staff", (tx, a, now) => ncAction(tx, a, { ncId, add }, now), ncLive);
}

export async function updateNcActionAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      ncId: uuid,
      actionId: z.string().min(1).max(80),
      state: z.enum(["done", "cancelled"]),
      reason: z.string().trim().max(300).nullable(),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  const { ncId, ...update } = p.data;
  return run("staff", (tx, a, now) => ncAction(tx, a, { ncId, update }, now), ncLive);
}

export async function authoriseResumptionAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ ncId: uuid }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) => authoriseResumption(tx, a, p.data, now), ncLive);
}

/** NC-4: the lead's signature closes it (fresh second factor). */
export async function closeNonconformityAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      ncId: uuid,
      causeCategory: z.string().regex(/^[a-z_]{2,40}$/, "Choose the cause category."),
      effectivenessPlan: words(3, 1000, "Say how you will know it worked."),
      effectivenessMet: z.boolean(),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh())) return REAUTH;
  return run("lead", (tx, a, now) => closeNonconformity(tx, a, p.data, now), ncLive);
}
