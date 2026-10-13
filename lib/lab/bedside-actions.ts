"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { runEmrWrite } from "@/lib/emr/write/orders";
import { METER_RANGE } from "./bedside";
import { deliverAfterCommit } from "./criticals/store";
import {
  addLot,
  recordBedsideResult,
  registerDevice,
  setDeviceState,
  setOperator,
} from "./bedside-store";
import { labBedsideLiveFor } from "./feature";

/**
 * Bedside tests (Lab Phase 2 §5.7, §5.14, §8 "Bedside"). Recording goes through the patient's write
 * transaction (access, audit, idempotent on the client key); the register is the laboratory lead's.
 */

const Value = z.object({
  conceptId: z.string().min(3).max(80),
  value: z.string().trim().max(20).optional(),
  code: z.union([z.enum(METER_RANGE), z.string().min(1).max(60)]).optional(),
});
const Record_ = z.object({
  surface: z.enum(["nurse", "doctor", "clinician"]),
  patientUserId: z.uuid(),
  encounterId: z.uuid(),
  testCode: z.string().regex(/^test\.[a-z0-9_]{2,60}$/),
  deviceId: z.uuid(),
  lotId: z.uuid(),
  wardId: z.uuid().nullable(),
  measuredAt: z.coerce.date(),
  lateReason: z.string().trim().min(3).max(200).optional(),
  fasting: z.boolean().optional(),
  values: z.array(Value).min(1).max(20),
  marks: z
    .array(
      z.object({
        conceptId: z.string().min(3).max(80),
        check: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("repeated"), repeatValue: z.string().trim().min(1).max(20) }),
          z.object({ kind: z.literal("checked_not_repeated") }),
          z.object({
            kind: z.literal("could_not_check"),
            reason: z.enum(["not_enough_sample", "analyser_down", "no_reagent", "other"]),
            text: z.string().trim().max(200).nullable().optional(),
          }),
        ]),
        sampleChecked: z.boolean(),
        soloReason: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .max(20)
    .optional(),
  note: z.string().trim().max(280).nullable().optional(),
  clientKey: z.string().min(8).max(120),
});

export async function recordBedsideResultAction(raw: unknown) {
  const r = await runEmrWrite(Record_, raw, async (ctx, input) => {
    if (!labBedsideLiveFor(ctx.actor.hospitalId))
      throw new EmrWriteError("config", "Bedside tests are not switched on here.");
    return recordBedsideResult(ctx, input);
  });
  // PC-9 (CA-3): the alert's messages go after the commit and never undo it.
  if (!r.ok || !r.data) return r;
  const { alert, ...report } = r.data;
  if (alert?.jobs.length)
    await deliverAfterCommit((await import("@/db")).db as never, alert.jobs).catch(() => undefined);
  // Delivery jobs hold staff numbers and never leave the server (§12).
  return { ...r, data: { ...report, alertId: alert?.alertId ?? null } };
}

async function asLead<T>(
  fn: (
    tx: Parameters<Parameters<typeof asClinicalWriter>[1]>[0],
    a: { userId: string; hospitalId: string },
  ) => Promise<T>,
) {
  const actor = await requireEmrActor("lab");
  if (!labBedsideLiveFor(actor.hospitalId))
    throw new EmrWriteError("config", "Bedside tests are not switched on here.");
  if (!actor.labPermissions?.includes("lab.manage"))
    throw new EmrWriteError("forbidden", "Only the laboratory lead manages bedside devices.");
  const a = { userId: actor.userId, hospitalId: actor.hospitalId };
  return asClinicalWriter(a, (tx) => fn(tx, a));
}
const ok = (id: string): ActionResult => ({ ok: true, id, serverTime: new Date().toISOString() });

export async function registerDeviceAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      kind: z.enum(["glucometer", "ketone_meter", "hba1c_analyser", "rdt_kit", "dipstick"]),
      model: z.string().trim().min(2).max(80),
      serial: z.string().trim().max(60).nullable(),
      testCode: z.string().regex(/^test\.[a-z0-9_]{2,60}$/),
      wardId: z.uuid().nullable(),
    })
    .safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Check the device." };
  try {
    return ok(await asLead((tx, a) => registerDevice(tx, a, p.data)));
  } catch (e) {
    return actionError(e);
  }
}

export async function setDeviceStateAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      deviceId: z.uuid(),
      state: z.enum(["in_use", "retired"]),
      note: z.string().trim().max(300).nullable(),
    })
    .safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  try {
    await asLead((tx, a) => setDeviceState(tx, a, p.data, new Date()));
    return ok(p.data.deviceId);
  } catch (e) {
    return actionError(e);
  }
}

export async function addLotAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      deviceId: z.uuid(),
      lot: z.string().trim().min(1).max(60),
      useBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: "A lot needs its number and use-by date." };
  try {
    return ok(await asLead((tx, a) => addLot(tx, a, p.data)));
  } catch (e) {
    return actionError(e);
  }
}

export async function setOperatorAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ userId: z.uuid(), granted: z.boolean() }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  try {
    await asLead((tx, a) => setOperator(tx, a, p.data, new Date()));
    return ok(p.data.userId);
  } catch (e) {
    return actionError(e);
  }
}
