"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { secondFactorFresh } from "@/lib/auth-fresh";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { saveConfigDraft, signConfig } from "./catalogue-v2";
import { labHmisLiveFor } from "./feature";
import { hmisDeskScope } from "./hmis-scope";
import {
  checkHmis,
  endDesignation,
  exportHmis,
  generateHmis,
  prepareRevision,
  saveManualCells,
  saveMapping,
  setDesignation,
  signHmis,
  signMapping,
} from "./hmis-store";
import { classAccessFor, recordPrint, REGISTERS } from "./register-store";
import { PAYLOADS } from "./signed-config";

/**
 * Registers and HMIS 105 (Lab Phase 3 §8 "Register", "HMIS"; Step 9). The house contract: Zod → the actor
 * (AAL2 through its scope) → labHmis → permission → one transaction as the clinical writer, hospital-scoped
 * (audited by trigger) → `{ id, serverTime }`. The lab lead (`lab.hmis.check`) maps, counts, enters hand cells,
 * checks and prepares revisions; the HMIS focal person co-signs the mapping and the Health Unit In-Charge signs
 * the report from the HMIS desk, each with a fresh second factor; the hospital admin sets the designations.
 */

type A = { userId: string; hospitalId: string };
type Need = "lead" | "staff";
const uuid = z.uuid();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose the month.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date.");
const revision = z.number().int().min(1);
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
const ok = (id: string): ActionResult => ({ ok: true, id, serverTime: new Date().toISOString() });

async function lab(
  need: Need,
  fn: (tx: EmrTx, a: A, now: Date, permissions: readonly string[]) => Promise<string>,
): Promise<ActionResult> {
  try {
    const actor = await requireEmrActor("lab");
    if (!labHmisLiveFor(actor.hospitalId))
      throw new EmrWriteError("config", "Registers and HMIS 105 are not switched on here.");
    const p = actor.labPermissions ?? [];
    const allowed =
      need === "lead"
        ? p.includes("lab.hmis.check") || p.includes("lab.manage")
        : p.includes("lab.view");
    if (!allowed)
      throw new EmrWriteError(
        "forbidden",
        need === "lead" ? "Only the laboratory lead does this." : "You do not work in this lab.",
      );
    const a = { userId: actor.userId, hospitalId: actor.hospitalId };
    return ok(await asClinicalWriter(a, (tx) => fn(tx, a, new Date(), p)));
  } catch (e) {
    return actionError(e);
  }
}

async function desk(
  fn: (
    tx: EmrTx,
    a: A,
    now: Date,
    who: Awaited<ReturnType<typeof hmisDeskScope>>,
  ) => Promise<string>,
): Promise<ActionResult> {
  try {
    const who = await hmisDeskScope();
    const a = { userId: who.userId, hospitalId: who.hospitalId };
    return ok(await asClinicalWriter(a, (tx) => fn(tx, a, new Date(), who)));
  } catch (e) {
    return actionError(e);
  }
}

/* ─── HM-2: the mapping ───────────────────────────────────────────────── */

export async function saveHmisMappingAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ payload: PAYLOADS.hmis_mapping }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return lab("lead", (tx, a, now) => saveMapping(tx, a, p.data.payload, now));
}

const SignInput = z.object({
  configId: uuid,
  exceptionNote: z.string().trim().max(500).nullable(),
});

export async function signHmisMappingAction(raw: unknown): Promise<ActionResult> {
  const p = SignInput.safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh())) return REAUTH;
  return lab("lead", (tx, a, now) => signMapping(tx, { ...a, as: "lead" }, p.data, now));
}

/** The HMIS focal person's co-signature, from the HMIS desk. */
export async function coSignHmisMappingAction(raw: unknown): Promise<ActionResult> {
  const p = SignInput.safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh())) return REAUTH;
  return desk((tx, a, now) => signMapping(tx, { ...a, as: "focal" }, p.data, now));
}

/* ─── HM-3..HM-12: the report ─────────────────────────────────────────── */

export async function generateHmis105Action(raw: unknown): Promise<ActionResult> {
  const p = z.object({ month }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return lab("lead", (tx, a) => generateHmis(tx, a, p.data));
}

export async function saveManualCellsAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      month,
      cells: z.record(
        z.string().min(3).max(200),
        z.number().int().min(0).max(1_000_000).nullable(),
      ),
    })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return lab("lead", (tx, a) => saveManualCells(tx, a, p.data));
}

export async function checkHmis105Action(raw: unknown): Promise<ActionResult> {
  const p = z.object({ month, revision }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return lab("lead", (tx, a, now) => checkHmis(tx, a, p.data, now));
}

export async function prepareRevisionAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ month }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return lab("lead", (tx, a) => prepareRevision(tx, a, p.data));
}

/** HM-10: the In-Charge's signature, from the HMIS desk (fresh second factor). */
export async function signHmis105Action(raw: unknown): Promise<ActionResult> {
  const p = z.object({ month, revision }).safeParse(raw);
  if (!p.success) return bad(p.error);
  const fresh = await secondFactorFresh();
  if (!fresh) return REAUTH;
  return desk((tx, a, now) => signHmis(tx, a, { ...p.data, freshSecondFactor: fresh }, now));
}

/** HM-12: the CSV, for the lab lead or anyone designated; a signed report is recorded as exported. */
export async function exportHmis105Action(raw: unknown): Promise<ActionResult & { csv?: string }> {
  const p = z.object({ month, revision, from: z.enum(["lab", "desk"]) }).safeParse(raw);
  if (!p.success) return bad(p.error);
  let csv = "";
  const go = async (tx: EmrTx, a: A, now: Date) => {
    csv = (await exportHmis(tx, a, p.data, now)).csv;
    return p.data.month;
  };
  const r =
    p.data.from === "lab"
      ? await lab("lead", go)
      : await desk((tx, a, now, who) => {
          if (!who.roles.length && !who.admin)
            throw new EmrWriteError("forbidden", "You are not designated for HMIS 105 here.");
          return go(tx, a, now);
        });
  return r.ok ? { ...r, csv } : r;
}

/* ─── E-LAB3-11: designations (hospital admin) ────────────────────────── */

export async function setDesignationAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ role: z.enum(["in_charge", "focal"]), userId: uuid, startsOn: day })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return desk((tx, a, now, who) => {
    if (!who.admin) throw new EmrWriteError("forbidden", "Only the hospital admin designates.");
    return setDesignation(tx, a, p.data, now);
  });
}

export async function endDesignationAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ id: uuid, endsOn: day }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return desk((tx, a, _now, who) => {
    if (!who.admin) throw new EmrWriteError("forbidden", "Only the hospital admin designates.");
    return endDesignation(tx, a, p.data);
  });
}

/* ─── DR-2, DR-4: the register ────────────────────────────────────────── */

const register = z.enum(REGISTERS);

export async function saveRegisterConfigAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ register, payload: PAYLOADS.register_config }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return lab("lead", (tx, a, now) =>
    saveConfigDraft(
      tx,
      a,
      { kind: "register_config", key: p.data.register, payload: p.data.payload },
      now,
    ),
  );
}

export async function signRegisterConfigAction(raw: unknown): Promise<ActionResult> {
  const p = SignInput.safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh())) return REAUTH;
  return lab("lead", async (tx, a, now) => {
    await signConfig(tx, { ...a, as: "lead" }, p.data, now);
    return p.data.configId;
  });
}

export async function printRegisterAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ register, sectionId: uuid, day, rows: z.number().int().min(0).max(5000) })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  return lab("staff", (tx, a, now, perms) =>
    recordPrint(tx, a, { ...p.data, classAccess: classAccessFor(perms) }, now),
  );
}
