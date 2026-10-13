"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { secondFactorFresh } from "@/lib/auth-fresh";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import {
  grandfatherOperators,
  recordCompetency,
  recordDeviceCheck,
  recordDeviceError,
  setStripLotRanges,
} from "./bedside-quality-store";
import { saveConfigDraft, signConfig } from "./catalogue-v2";
import { labPoctQualityLiveFor } from "./feature";
import { PAYLOADS } from "./signed-config";

/**
 * Bedside quality actions (Lab Phase 3 §8 "Bedside quality"; Step 8). The house contract: Zod with a client key →
 * the actor (AAL2 through the workspace scope) → labPoctQuality → permission → one transaction as the clinical
 * writer, hospital-scoped (audited by trigger) → `{ id, serverTime }`. Device checks and incidents are the bedside
 * operator's (nurse workspace; the store checks the grant and the competency). Device rules and competency
 * validity are the laboratory lead's, signed alone with a fresh second factor (E-LAB3-12); strip-lot ranges take
 * `lab.stock.manage` or `lab.manage`; a competency assessment takes `poct.assess` or `lab.manage` (map 2.0.0 is
 * unsigned, so until then only the lead assesses, as Step 4 did for stock).
 */

type A = { userId: string; hospitalId: string };
type Need = "operator" | "lead" | "stock" | "assess";
const uuid = z.uuid();
const key = z.string().min(8).max(120);
const testCode = z.string().regex(/^test\.[a-z0-9_]{2,60}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date.");
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
const NEEDS: Record<Exclude<Need, "operator">, [string[], string]> = {
  lead: [["lab.manage"], "Only the laboratory lead does this."],
  stock: [["lab.stock.manage", "lab.manage"], "You do not manage stock in this lab."],
  assess: [["poct.assess", "lab.manage"], "You do not assess bedside testing in this lab."],
};

async function run(
  need: Need,
  fn: (tx: EmrTx, a: A, now: Date) => Promise<string | number | void>,
): Promise<ActionResult> {
  try {
    const actor = await requireEmrActor(need === "operator" ? "nurse" : "lab");
    if (!labPoctQualityLiveFor(actor.hospitalId))
      throw new EmrWriteError("config", "Bedside quality is not switched on here.");
    if (need !== "operator") {
      const [perms, words] = NEEDS[need];
      if (!perms.some((p) => actor.labPermissions?.includes(p)))
        throw new EmrWriteError("forbidden", words);
    }
    const a = { userId: actor.userId, hospitalId: actor.hospitalId };
    const r = await asClinicalWriter(a, (tx) => fn(tx, a, new Date()));
    return {
      ok: true,
      id: typeof r === "string" ? r : a.hospitalId,
      serverTime: new Date().toISOString(),
    };
  } catch (e) {
    return actionError(e);
  }
}

/* ─── The operator (nurse workspace) ──────────────────────────────────── */

const TRIGGER = z.enum(["each_day_of_use", "new_strip_lot", "new_control_vial", "after_incident"]);

export async function recordDeviceCheckAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      deviceId: uuid,
      stripLotId: uuid,
      trigger: TRIGGER,
      observed: z.record(z.string().min(1).max(40), z.number().finite()),
      clientKey: key,
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("operator", async (tx, a, now) => (await recordDeviceCheck(tx, a, p.data, now)).id);
}

export async function recordDeviceErrorAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      deviceId: uuid,
      kind: z.enum(["error", "drop"]),
      note: z.string().trim().max(300).nullable(),
      clientKey: key,
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("operator", (tx, a, now) => recordDeviceError(tx, a, p.data, now));
}

/* ─── The laboratory's set-up ─────────────────────────────────────────── */

export async function saveDeviceQcRuleAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ testCode, payload: PAYLOADS.device_qc_rule }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) =>
    saveConfigDraft(
      tx,
      a,
      { kind: "device_qc_rule", key: p.data.testCode, payload: p.data.payload },
      now,
    ),
  );
}

export async function saveCompetencyValidityAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ testCode, payload: PAYLOADS.competency_validity }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) =>
    saveConfigDraft(
      tx,
      a,
      { kind: "competency_validity", key: p.data.testCode, payload: p.data.payload },
      now,
    ),
  );
}

/** The lead's signature on a device rule or competency validity (lead-only kinds; fresh second factor). */
export async function signBedsideConfigAction(raw: unknown): Promise<ActionResult> {
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

export async function setStripLotRangesAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      lotId: uuid,
      ranges: z
        .record(
          z.string().min(1).max(40),
          z.object({ low: z.number().finite(), high: z.number().finite() }),
        )
        .refine((r) => Object.keys(r).length > 0, "Enter the range for each level."),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("stock", (tx, a) => setStripLotRanges(tx, a, p.data));
}

export async function recordCompetencyAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      userId: uuid,
      testCode,
      assessedOn: day,
      method: z
        .array(z.enum(["training", "observed_test", "known_value_sample"]))
        .min(1, "Tick how the operator was assessed."),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("assess", (tx, a, now) => recordCompetency(tx, a, p.data, now));
}

/** D-LAB3-16: switch-on; existing operators are valid for the signed grace period until assessed. */
export async function grandfatherOperatorsAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ testCode }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) => grandfatherOperators(tx, a, p.data, now));
}
