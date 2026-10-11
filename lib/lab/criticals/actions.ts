"use server";

import type { Delivery } from "./store";
import type { ActionResult } from "@/lib/emr/write/context";
import { z } from "zod";

import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { runEmrWrite } from "@/lib/emr/write/orders";
import { criticalsLive } from "@/lib/lab/criticals/readiness";
import {
  acknowledgeAlert,
  couldNotReach,
  deliverAfterCommit,
  disputePhoneAck,
  logCriticalCall,
  recordSeen,
  releaseWithCriticalMark,
} from "./store";

/**
 * Criticals server actions (Lab Phase 1 §8; ADRs 0242–0245). The house contract: Zod with a client
 * key → the role scope (sign-in, AAL2, affiliation) → the flag → one transaction → delivery after
 * commit, never thrown (CA-3) → `{ id, serverTime }`. Delivery jobs hold staff numbers for SMS and
 * never leave the server (§12).
 */

const uuid = z.uuid();
const clientKey = z.string().trim().min(8).max(120);
const appDb = async () =>
  (await import("@/db")).db as unknown as Parameters<typeof deliverAfterCommit>[0];

async function deliver(jobs: readonly Delivery[]): Promise<number> {
  try {
    return (await deliverAfterCommit(await appDb(), jobs)).failed;
  } catch {
    return jobs.length;
  }
}

const Check = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("repeated"), repeatValue: z.string().trim().min(1).max(20) }),
  z.object({ kind: z.literal("checked_not_repeated") }),
  z.object({
    kind: z.literal("could_not_check"),
    reason: z.enum(["not_enough_sample", "analyser_down", "no_reagent", "other"]),
    text: z.string().trim().max(200).optional(),
  }),
]);

const Mark = z.object({
  conceptId: z.string().trim().min(3).max(80),
  check: Check,
  sampleChecked: z.boolean(),
  secondCheckerId: uuid.optional(),
  soloReason: z.string().trim().min(3).max(200).optional(),
});

const Value = z.object({
  conceptId: z.string().trim().min(3).max(80),
  value: z.string().trim().max(200).optional(),
  unit: z.string().trim().max(40).optional(),
  unitConfirmed: z.boolean().optional(),
  code: z.string().trim().max(60).optional(),
  referenceRange: z
    .object({ low: z.number().optional(), high: z.number().optional(), unit: z.string().max(40) })
    .optional(),
  labInterpretation: z.enum(["L", "H", "LL", "HH", "N", "A"]).optional(),
  restricted: z.boolean().optional(),
  name: z.string().trim().max(120).optional(),
  replaces: uuid.optional(),
});

const Release = z.object({
  surface: z.literal("lab"),
  patientUserId: uuid,
  orderId: uuid,
  reportId: uuid.optional(),
  values: z.array(Value).max(40).optional(),
  conclusionCode: z.enum(["normal", "abnormal", "indeterminate"]).optional(),
  conclusionText: z.string().trim().max(4000).optional(),
  marks: z.array(Mark).max(40),
  note: z.string().trim().max(280).optional(),
  clientKey,
});

export interface ReleaseOutcome {
  reportId: string;
  alertId: string | null;
  subState: "sent" | "not_sent" | "escalated" | null;
  emptyLevels: number[];
  deliveryFailed: boolean;
}

/** §5.2: Release and alert. The report, the marks and the alert in one transaction (CM-2). */
export async function releaseWithCriticalMarkAction(
  raw: unknown,
): Promise<ActionResult<ReleaseOutcome>> {
  const r = await runEmrWrite(Release, raw, async (ctx, input) => {
    if (!(await criticalsLive(ctx.actor.hospitalId)))
      throw new EmrWriteError("config", "Critical alerts are not switched on here.");
    return releaseWithCriticalMark(ctx, { ...input, note: input.note ?? null });
  });
  if (!r.ok) return r;
  const out = r.data!;
  const failed = await deliver(out.alert.jobs);
  return {
    ok: true,
    id: out.id,
    serverTime: r.serverTime,
    ...(r.warnings ? { warnings: r.warnings } : {}),
    data: {
      reportId: out.id,
      alertId: out.alert.alertId,
      subState: out.alert.subState,
      emptyLevels: out.alert.emptyLevels,
      deliveryFailed: out.alert.jobs.length > 0 && failed >= out.alert.jobs.length,
    },
  };
}

/* ─── The clinician ─────────────────────────────────────────────────────── */

const ClinicianSurface = z.enum(["doctor", "clinician"]);

async function asClinician<T>(
  surface: z.infer<typeof ClinicianSurface>,
  fn: (
    tx: Parameters<Parameters<typeof asClinicalWriter>[1]>[0],
    actor: Awaited<ReturnType<typeof requireEmrActor>>,
  ) => Promise<T>,
) {
  const actor = await requireEmrActor(surface);
  if (!(await criticalsLive(actor.hospitalId)))
    throw new EmrWriteError("config", "Critical alerts are not switched on here.");
  return asClinicalWriter({ userId: actor.userId, hospitalId: actor.hospitalId }, (tx) =>
    fn(tx, actor),
  );
}

const Acknowledge = z.object({
  surface: ClinicianSurface,
  alertId: uuid,
  response: z.enum(["reviewing", "asked_team", "already_aware"]).nullable(),
  note: z.string().trim().max(500).optional(),
  clientKey,
});

/** §5.4: one tap; a second attempt returns the first (CA-6, CA-8). */
export async function acknowledgeCriticalAlertAction(
  raw: unknown,
): Promise<ActionResult<{ kind: "acknowledged" | "already"; at: string; byMe: boolean }>> {
  const p = Acknowledge.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: p.error.issues[0]?.message ?? "Invalid input." };
  try {
    const out = await asClinician(p.data.surface, (tx, actor) =>
      acknowledgeAlert(tx, actor, {
        alertId: p.data.alertId,
        response: p.data.response,
        note: p.data.note ?? null,
        now: new Date(),
      }).then((r) => ({ ...r, me: actor.userId })),
    );
    await deliver(out.jobs);
    return {
      ok: true,
      id: p.data.alertId,
      serverTime: new Date().toISOString(),
      data: { kind: out.kind, at: out.state.at.toISOString(), byMe: out.state.by === out.me },
    };
  } catch (e) {
    return actionError(e);
  }
}

const AlertOnly = z.object({ surface: ClinicianSurface, alertId: uuid });

/** CA-5: the detail rendered for a recipient. Silent; never shown to the lab as acknowledgement. */
export async function recordAlertSeenAction(raw: unknown): Promise<ActionResult> {
  const p = AlertOnly.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  try {
    await asClinician(p.data.surface, (tx, actor) =>
      recordSeen(tx, actor, p.data.alertId, new Date()),
    );
    return { ok: true, id: p.data.alertId, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}

/** CA-9: "Not me" on a phone acknowledgement reopens the alert at its level. */
export async function disputePhoneAcknowledgementAction(raw: unknown): Promise<ActionResult> {
  const p = AlertOnly.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  try {
    const out = await asClinician(p.data.surface, (tx, actor) =>
      disputePhoneAck(tx, actor, { alertId: p.data.alertId, now: new Date() }),
    );
    await deliver(out.jobs);
    return { ok: true, id: p.data.alertId, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}

/* ─── The lab ───────────────────────────────────────────────────────────── */

async function asLab<T>(
  fn: (
    tx: Parameters<Parameters<typeof asClinicalWriter>[1]>[0],
    actor: Awaited<ReturnType<typeof requireEmrActor>>,
  ) => Promise<T>,
) {
  const actor = await requireEmrActor("lab");
  if (!(await criticalsLive(actor.hospitalId)))
    throw new EmrWriteError("config", "Critical alerts are not switched on here.");
  if (!actor.labPermissions?.includes("lab.result.release"))
    throw new EmrWriteError("forbidden", "You do not have permission to act on critical alerts.");
  return asClinicalWriter({ userId: actor.userId, hospitalId: actor.hospitalId }, (tx) =>
    fn(tx, actor),
  );
}

const LogCall = z.object({
  alertId: uuid,
  to: z.union([
    z.object({ userId: uuid }),
    z.object({ name: z.string().trim().min(2).max(120), role: z.string().trim().min(2).max(80) }),
  ]),
  readBack: z.boolean(),
  clientKey,
});

/** §5.3: Log a phone call. Read-back to a clinician who may acknowledge stops the clock (CA-9). */
export async function logCriticalCallAction(
  raw: unknown,
): Promise<ActionResult<{ acknowledged: boolean }>> {
  const p = LogCall.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: p.error.issues[0]?.message ?? "Invalid input." };
  try {
    const out = await asLab((tx, actor) =>
      logCriticalCall(tx, actor, {
        alertId: p.data.alertId,
        to: p.data.to,
        readBack: p.data.readBack,
        now: new Date(),
      }),
    );
    await deliver(out.jobs);
    return {
      ok: true,
      id: p.data.alertId,
      serverTime: new Date().toISOString(),
      data: { acknowledged: out.acknowledged },
    };
  } catch (e) {
    return actionError(e);
  }
}

/** §5.3: Could not reach anyone. Escalates at once (ES-1), signed times or not. */
export async function couldNotReachAction(
  raw: unknown,
): Promise<ActionResult<{ escalatedTo: number | null; emptyLevels: number[] }>> {
  const p = z.object({ alertId: uuid, clientKey }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  try {
    const out = await asLab((tx, actor) =>
      couldNotReach(tx, actor, { alertId: p.data.alertId, now: new Date() }),
    );
    await deliver(out.jobs);
    return {
      ok: true,
      id: p.data.alertId,
      serverTime: new Date().toISOString(),
      data: { escalatedTo: out.escalatedTo, emptyLevels: out.emptyLevels },
    };
  } catch (e) {
    return actionError(e);
  }
}
