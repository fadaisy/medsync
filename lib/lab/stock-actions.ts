"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { secondFactorFresh } from "@/lib/auth-fresh";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { saveConfigDraft, signConfig } from "./catalogue-v2";
import { labStockLiveFor } from "./feature";
import { PAYLOADS } from "./signed-config";
import {
  acceptLot,
  grandfatherLots,
  issueStock,
  quarantineLot,
  receiveDelivery,
  recordCount,
  recordMovement,
  rejectLot,
  releaseLotFromQuarantine,
  saveItem,
  setLotInUse,
  setQualitySettings,
} from "./stock-store";

/**
 * Stock, lots and acceptance actions (Lab Phase 3 §8 "Stock", "Acceptance", "Lots in use"; Step 4). The house
 * contract: Zod with a client key → the lab actor (AAL2) → labStock → permission → one transaction as the
 * clinical writer, hospital-scoped (audited by trigger) → `{ id, serverTime }`. Receiving, issuing, counting,
 * writing off, quarantine, acceptance and lots in use need `lab.stock.manage` (or `lab.manage`: the lead may do
 * anything the store does, and until the CSO signs permission map 2.0.0 no cadre holds lab.stock.manage);
 * items, levels, settings, plans, release from quarantine and the switch-on statement need `lab.manage`.
 */

type A = { userId: string; hospitalId: string };
const uuid = z.uuid();
const key = z.string().min(8).max(120);
const reason = z.string().trim().min(3, "Say why.").max(300);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bad = (e?: z.ZodError): ActionResult => ({
  ok: false,
  code: "invalid",
  error: e?.issues[0]?.message ?? "Check the form.",
});

async function run(
  need: "stock" | "lead",
  fn: (tx: EmrTx, a: A, now: Date) => Promise<string | string[] | void>,
): Promise<ActionResult> {
  try {
    const actor = await requireEmrActor("lab");
    if (!labStockLiveFor(actor.hospitalId))
      throw new EmrWriteError("config", "Stock and lots are not switched on here.");
    const p = new Set(actor.labPermissions ?? []);
    if (need === "lead" ? !p.has("lab.manage") : !p.has("lab.stock.manage") && !p.has("lab.manage"))
      throw new EmrWriteError(
        "forbidden",
        need === "lead"
          ? "Only the laboratory lead does this."
          : "You do not manage the lab's stock.",
      );
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

/* ─── Items, levels, operational settings (lead) ────────────────────── */

const months = z.number().min(0).max(120).nullable();
const Item = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2, "Name the item.").max(160),
  kind: z.enum(["reagent", "kit", "control", "calibrator", "stain", "consumable", "strip"]),
  unitOfIssue: z.string().trim().min(1, "Say the unit of issue.").max(40),
  packSize: z.number().int().positive().nullable(),
  testsPerUnit: z.number().positive().nullable(),
  testCodes: z.array(z.string().regex(/^test\.[a-z0-9_]{2,60}$/)).max(40),
  conceptIds: z.array(z.string().min(3).max(80)).max(40),
  hmisTracerCode: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,40}$/)
    .nullable(),
  storageDeviceId: uuid.nullable(),
  minMonths: months,
  maxMonths: months,
});
export async function saveStockItemAction(raw: unknown): Promise<ActionResult> {
  const p = Item.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) => saveItem(tx, a, p.data, now));
}

const Settings = z.object({
  expiryWindowDays: z.number().int().min(1).max(365).nullable().optional(),
  lookBackMonths: z.number().int().min(1).max(24).nullable().optional(),
  countEveryDays: z.number().int().min(1).max(365).nullable().optional(),
  tolerancePct: z.number().min(0).max(1000).nullable().optional(),
});
export async function setStockSettingsAction(raw: unknown): Promise<ActionResult> {
  const p = Settings.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) => setQualitySettings(tx, a, p.data, now));
}

/* ─── Deliveries, issue, movements, counts ──────────────────────────── */

const Delivery = z.object({
  supplier: z.enum(["nms", "jms", "other"]),
  supplierName: z.string().trim().min(2).max(120).nullable(),
  noteNumber: z.string().trim().min(1).max(60).nullable(),
  receivedAt: z.coerce.date(),
  lines: z
    .array(
      z.object({
        itemId: uuid,
        lot: z.string().trim().min(1, "Each line needs its lot.").max(60),
        useBy: day.nullable(),
        received: z.number().int().positive("Each line needs a quantity."),
        rejected: z.number().int().min(0),
        condition: z.object({
          sealed: z.boolean(),
          coldChain: z.boolean().nullable(),
          note: z.string().trim().max(200).nullable(),
        }),
      }),
    )
    .min(1, "Add a line.")
    .max(60),
  clientKey: key,
});
export async function receiveDeliveryAction(raw: unknown): Promise<ActionResult> {
  const p = Delivery.safeParse(raw);
  if (!p.success) return bad(p.error);
  if (p.data.supplier === "other" && !p.data.supplierName)
    return { ok: false, code: "invalid", error: "Name the other supplier." };
  return run("stock", (tx, a, now) => receiveDelivery(tx, a, p.data, now));
}

const Issue = z.object({
  itemId: uuid,
  lotId: uuid,
  quantity: z.number().int().positive("Type how many."),
  toKind: z.enum(["bench", "device", "ward"]),
  toRef: uuid.nullable(),
  fefoReason: z.string().trim().max(300).nullable(),
  clientKey: key,
});
export async function issueStockAction(raw: unknown): Promise<ActionResult> {
  const p = Issue.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("stock", (tx, a, now) => issueStock(tx, a, p.data, now));
}

const Movement = z.object({
  kind: z.enum(["adjustment", "write_off", "return"]),
  lotId: uuid,
  quantity: z
    .number()
    .int()
    .refine((n) => n !== 0, "Type a quantity."),
  reason,
  clientKey: key,
});
/** adjustStock, writeOff and returns: one ledger row with its reason (ST-3). */
export async function recordMovementAction(raw: unknown): Promise<ActionResult> {
  const p = Movement.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("stock", (tx, a, now) => recordMovement(tx, a, p.data, now));
}

const Count = z.object({
  lines: z
    .array(
      z.object({
        lotId: uuid,
        counted: z.number().int().min(0),
        reason: z.string().trim().max(300).nullable(),
      }),
    )
    .min(1)
    .max(200),
  clientKey: key,
});
export async function recordCountAction(raw: unknown): Promise<ActionResult> {
  const p = Count.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("stock", (tx, a, now) => recordCount(tx, a, p.data, now));
}

/* ─── Quarantine ────────────────────────────────────────────────────── */

const LotReason = z.object({ lotId: uuid, reason });
export async function quarantineLotAction(raw: unknown): Promise<ActionResult> {
  const p = LotReason.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("stock", async (tx, a, now) => {
    await quarantineLot(tx, a, p.data, now);
    return p.data.lotId;
  });
}
export async function releaseLotFromQuarantineAction(raw: unknown): Promise<ActionResult> {
  const p = LotReason.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", async (tx, a, now) => {
    await releaseLotFromQuarantine(tx, a, p.data, now);
    return p.data.lotId;
  });
}

/* ─── Acceptance plans and decisions ────────────────────────────────── */

export async function saveAcceptancePlanAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ itemId: uuid, payload: PAYLOADS.acceptance_plan }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) =>
    saveConfigDraft(
      tx,
      a,
      { kind: "acceptance_plan", key: p.data.itemId, payload: p.data.payload },
      now,
    ),
  );
}

/** LA-1, E-LAB3-12: the lead signs alone; a fresh second factor; the author needs a written exception. */
export async function signAcceptancePlanAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({ configId: uuid, exceptionNote: z.string().trim().max(500).nullable() })
    .safeParse(raw);
  if (!p.success) return bad(p.error);
  if (!(await secondFactorFresh()))
    return {
      ok: false,
      code: "forbidden",
      error: "reauth: enter your authenticator code to sign.",
    };
  return run("lead", async (tx, a, now) => {
    await signConfig(tx, { ...a, as: "lead" }, p.data, now);
    return p.data.configId;
  });
}

const Pair = z.object({
  observationId: z.string().max(80),
  level: z.string().trim().min(1).max(40),
  current: z.number(),
  candidate: z.number(),
});
const Accept = z.object({
  lotId: uuid,
  pairs: z.array(Pair).max(40),
  qcIds: z.array(uuid).max(20),
  certificate: z.string().trim().max(300).nullable(),
});
export async function acceptLotAction(raw: unknown): Promise<ActionResult> {
  const p = Accept.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("stock", (tx, a, now) => acceptLot(tx, a, p.data, now));
}

export async function rejectLotAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ lotId: uuid, reason, pairs: z.array(Pair).max(40) }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("stock", (tx, a, now) => rejectLot(tx, a, p.data, now));
}

/* ─── Lots in use, switch-on ────────────────────────────────────────── */

const InUse = z.object({
  lotId: uuid,
  deviceId: uuid.nullable(),
  sectionId: uuid.nullable(),
  conceptId: z.string().min(3).max(80).nullable(),
  kind: z.enum(["reagent", "calibrator", "control", "strip", "kit"]),
});
export async function setLotInUseAction(raw: unknown): Promise<ActionResult> {
  const p = InUse.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("stock", (tx, a, now) => setLotInUse(tx, a, p.data, now));
}

const SwitchOn = z.object({
  statement: z.string().trim().min(10, "Write the statement in a sentence.").max(500),
  lots: z
    .array(
      z.object({
        itemId: uuid,
        lot: z.string().trim().min(1).max(60),
        useBy: day.nullable(),
        quantity: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(200),
  clientKey: key,
});
/** LA-6: lots on hand at switch-on, accepted (before MedSync) on the lead's statement. */
export async function grandfatherLotsAction(raw: unknown): Promise<ActionResult> {
  const p = SwitchOn.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) => grandfatherLots(tx, a, p.data, now));
}
