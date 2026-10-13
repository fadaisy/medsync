"use server";

import type { HubCall } from "./equipment-store";
import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { callEdge } from "@/lib/supabase/edge";
import {
  EQUIPMENT_KINDS,
  markBackInService,
  markDown,
  recordLog,
  recordTemperature,
  saveEquipment,
  saveSchedule,
} from "./equipment-store";
import { labEquipmentLiveFor } from "./feature";

/**
 * Equipment actions (Lab Phase 3 §8 "Equipment"; Step 5). The house contract: Zod with a client key → the lab
 * actor (AAL2) → labEquipment → permission → one transaction as the clinical writer (audited by trigger) →
 * `{ id, serverTime }`. The register, schedules, down and back need `lab.manage` (the hub's own head check
 * applies to its status too); repairs, maintenance, calibration and temperature readings are recorded by lab
 * staff who release results (`lab.result.release`) or the lead.
 */

type A = { userId: string; hospitalId: string };
const uuid = z.uuid();
const key = z.string().min(8).max(120);
const bad = (e?: z.ZodError): ActionResult => ({
  ok: false,
  code: "invalid",
  error: e?.issues[0]?.message ?? "Check the form.",
});

async function run(
  need: "lead" | "staff",
  fn: (tx: EmrTx, a: A, now: Date, hub: HubCall) => Promise<string | void>,
): Promise<ActionResult> {
  try {
    const actor = await requireEmrActor("lab");
    if (!labEquipmentLiveFor(actor.hospitalId))
      throw new EmrWriteError("config", "Equipment is not switched on here.");
    const p = new Set(actor.labPermissions ?? []);
    if (!p.has("lab.manage") && (need === "lead" || !p.has("lab.result.release")))
      throw new EmrWriteError(
        "forbidden",
        need === "lead"
          ? "Only the laboratory lead does this."
          : "You do not record equipment logs.",
      );
    const a = { userId: actor.userId, hospitalId: actor.hospitalId };
    const hub: HubCall = (body) =>
      callEdge("ha-services-hub", { ...body, hospital_id: a.hospitalId }, "lab.equipment");
    const r = await asClinicalWriter(a, (tx) => fn(tx, a, new Date(), hub));
    return { ok: true, id: r ?? a.hospitalId, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}

const text = (max: number) => z.string().trim().min(1).max(max).nullable();
const Equipment = z.object({
  id: uuid.optional(),
  kind: z.enum(EQUIPMENT_KINDS),
  model: z.string().trim().min(2, "Name the machine.").max(80),
  serial: text(60),
  sectionId: uuid.nullable(),
  details: z.object({
    location: text(120).optional(),
    provider: text(120).optional(),
    contact: text(120).optional(),
    installedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  }),
  linkedConcepts: z.array(z.string().min(3).max(80)).max(60),
  linkedTests: z.array(z.string().regex(/^test\.[a-z0-9_]{2,60}$/)).max(60),
});
export async function saveEquipmentAction(raw: unknown): Promise<ActionResult> {
  const p = Equipment.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now) => saveEquipment(tx, a, p.data, now));
}

const Schedules = z.object({
  deviceId: uuid,
  schedules: z.object({
    tasks: z
      .array(
        z.object({
          key: z
            .string()
            .regex(/^[A-Za-z0-9._-]{1,60}$/, "A task key is letters, digits, dots or dashes."),
          kind: z.enum(["maintenance", "calibration"]),
          every: z.union([
            z.object({ days: z.number().int().min(1).max(3650) }),
            z.object({ count: z.number().int().min(1).max(1_000_000) }),
          ]),
          requiredBeforeUse: z.boolean(),
        }),
      )
      .max(40),
    temperature: z
      .object({
        min: z.number(),
        max: z.number(),
        readingsPerDay: z.number().int().min(1).max(24),
      })
      .refine((t) => t.min <= t.max, "The lowest cannot be above the highest.")
      .nullable(),
  }),
});
/** EQ-4..EQ-6: operational, the lead's (labelled operational on the screen). */
export async function saveScheduleAction(raw: unknown): Promise<ActionResult> {
  const p = Schedules.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", async (tx, a, now) => {
    await saveSchedule(tx, a, p.data, now);
    return p.data.deviceId;
  });
}

const Down = z.object({
  deviceId: uuid,
  since: z.coerce.date(),
  cause: z.string().trim().min(3, "Say what is wrong.").max(500),
  reportedTo: text(160),
  ticket: text(60),
});
export async function markDownAction(raw: unknown): Promise<ActionResult> {
  const p = Down.safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now, hub) => markDown(tx, a, p.data, hub, now));
}

export async function markBackInServiceAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ deviceId: uuid }).safeParse(raw);
  if (!p.success) return bad(p.error);
  return run("lead", (tx, a, now, hub) => markBackInService(tx, a, p.data, hub, now));
}

const Log = z.object({
  deviceId: uuid,
  kind: z.enum(["maintenance", "calibration", "repair", "error", "drop"]),
  taskKey: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,60}$/)
    .nullable(),
  doneAt: z.coerce.date(),
  note: z.string().trim().min(1).max(1000).nullable(),
  filePath: z.string().trim().min(3).max(300).nullable(),
  clientKey: key,
});
/** recordRepair, recordMaintenance, recordCalibration: one append-only log row each. */
export async function recordEquipmentLogAction(raw: unknown): Promise<ActionResult> {
  const p = Log.safeParse(raw);
  if (!p.success) return bad(p.error);
  if (p.data.kind === "repair" && !p.data.note)
    return { ok: false, code: "invalid", error: "Say what was repaired." };
  return run("staff", (tx, a, now) => recordLog(tx, a, p.data, now));
}

const Temp = z.object({
  deviceId: uuid,
  value: z.number().min(-100).max(200),
  unit: z.string().trim().min(1).max(40),
  doneAt: z.coerce.date(),
  clientKey: key,
});
export async function recordTemperatureAction(
  raw: unknown,
): Promise<
  ActionResult<{ ncId: string | null; suggestQuarantine: { id: string; lot: string }[] }>
> {
  const p = Temp.safeParse(raw);
  if (!p.success) return bad(p.error);
  let out: { ncId: string | null; suggestQuarantine: { id: string; lot: string }[] } = {
    ncId: null,
    suggestQuarantine: [],
  };
  const r = await run("staff", async (tx, a, now) => {
    const t = await recordTemperature(tx, a, p.data, now);
    out = { ncId: t.ncId, suggestQuarantine: t.suggestQuarantine };
    return t.logId;
  });
  return r.ok ? { ...r, data: out } : r;
}
