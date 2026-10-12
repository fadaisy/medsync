"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { LAB2 } from "@/content/lab-phase-2";
import { encounterOrders } from "@/db/schema/encounter";
import { logChartAccess } from "@/lib/emr/access";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { actionError, EmrWriteError, withPatientWrite } from "@/lib/emr/write/context";
import { collectSpecimen, receiveSpecimen, undoReceipt } from "@/lib/emr/write/specimens";
import { lookupLabel, workingDiagnosis } from "./bench-store";
import { labBenchLiveFor } from "./feature";
import { receiveDecision, scannedLabel, UNDO_WINDOW_MS } from "./one-menu";

/**
 * The bench (Lab Phase 2 §5.5, §5.6, §8 "Bench"): scan to receive, undo, and the working diagnosis revealed
 * on demand. Each write runs through the patient's own write transaction with its access check (lab_work).
 */

const hhmm = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});

async function benchActor() {
  const actor = await requireEmrActor("lab");
  if (!labBenchLiveFor(actor.hospitalId))
    throw new EmrWriteError("config", "The live bench is not switched on here.");
  if (!actor.labPermissions?.includes("lab.receive"))
    throw new EmrWriteError(
      "forbidden",
      "Only laboratory staff who receive specimens can do this.",
    );
  return actor;
}

const Scan = z.object({
  raw: z.string().max(80),
  clientKey: z.string().min(8).max(120),
  procedureFollowed: z.boolean().optional(),
  receiveAnywayReason: z.string().trim().min(3).max(200).optional(),
});

export type ScanOutcome =
  | { kind: "received"; words: string; specimenId: string; eventId: string }
  | {
      kind: "already" | "not_found" | "not_collected" | "rejected" | "voided" | "procedure_first";
      words: string;
    };

/** SR-1..SR-4: one action receives a specimen from its label; another hospital's label reads as not found. */
export async function receiveByLabelAction(raw: unknown): Promise<ActionResult<ScanOutcome>> {
  const p = Scan.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Scan the label again." };
  try {
    const actor = await benchActor();
    const label = scannedLabel(p.data.raw);
    const found = label
      ? await asClinicalWriter({ userId: actor.userId, hospitalId: actor.hospitalId }, (tx) =>
          lookupLabel(tx, actor.hospitalId, label),
        )
      : null;
    const decision = receiveDecision({
      label: found ? { voided: found.voided, hospitalMatches: true } : null,
      specimen: found?.specimenId ? { id: found.specimenId } : null,
      lastEvent: found?.lastEvent
        ? { kind: found.lastEvent.kind, at: found.lastEvent.at, cadre: found.lastEvent.cadre }
        : null,
      highRisk: found?.highRisk ?? false,
      procedureFollowed: !!p.data.procedureFollowed,
      receiveAnywayReason: p.data.receiveAnywayReason ?? null,
    });
    const ok = (data: ScanOutcome): ActionResult<ScanOutcome> => ({
      ok: true,
      id: found?.orderId ?? "none",
      serverTime: new Date().toISOString(),
      data,
    });
    if (decision.do === "not_found")
      return ok({ kind: "not_found", words: LAB2.scan.notFound(label ?? p.data.raw.trim()) });
    if (decision.do === "already")
      return ok({
        kind: "already",
        words: LAB2.scan.already(
          hhmm.format(decision.at),
          decision.cadre.toLowerCase().replaceAll("_", " "),
        ),
      });
    if (decision.do === "not_collected")
      return ok({ kind: "not_collected", words: LAB2.scan.notCollected });
    if (decision.do === "rejected")
      return ok({
        kind: "rejected",
        words: "This specimen was rejected. Ask the ward for a new one.",
      });
    if (decision.do === "voided") return ok({ kind: "voided", words: LAB2.label.voided(label!) });
    if (decision.do === "procedure_first")
      return ok({ kind: "procedure_first", words: LAB2.highRisk.block });
    const f = found!;
    const result = await withPatientWrite(actor, f.patientUserId, async (ctx) => {
      let specimenId = f.specimenId;
      if (!specimenId)
        // "Receive anyway": the lab records the collection it can vouch for, then receives it.
        specimenId = (
          await collectSpecimen(ctx, {
            patientUserId: f.patientUserId,
            orderId: f.orderId,
            identifiersConfirmed: true,
            labelNo: f.labelNo,
            labelMethod: "scan",
            clientKey: `${p.data.clientKey}:collect`,
          })
        ).id;
      const ev = await receiveSpecimen(ctx, {
        patientUserId: f.patientUserId,
        specimenId,
        clientKey: p.data.clientKey,
        via: "scan",
        procedureFollowed: !!p.data.procedureFollowed,
        receiveReason: p.data.receiveAnywayReason,
      });
      return { specimenId, eventId: ev.id };
    });
    // Two identifiers on the confirmation (Law 13), read through the audited identity reveal.
    const who = (await identitiesFor(actor, [f.patientUserId], "lab_scan_receive")).get(
      f.patientUserId,
    );
    return ok({
      kind: "received",
      words: LAB2.scan.received(
        f.labelNo,
        f.restricted ? "Restricted test" : f.test,
        who ? `${who.name}, ${who.mrn}` : "patient",
        hhmm.format(new Date()),
      ),
      ...result,
    });
  } catch (e) {
    return actionError(e);
  }
}

/** SR-5: Undo within the window. */
export async function undoReceiveAction(raw: unknown): Promise<ActionResult> {
  const p = z
    .object({
      patientUserId: z.uuid(),
      specimenId: z.uuid(),
      clientKey: z.string().min(8).max(120),
    })
    .safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  try {
    const actor = await benchActor();
    const r = await withPatientWrite(actor, p.data.patientUserId, (ctx) =>
      undoReceipt(ctx, p.data, UNDO_WINDOW_MS),
    );
    return { ok: true, id: r.id, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}

export type RevealResult =
  | { kind: "none" }
  | { kind: "masked"; words: string }
  | { kind: "shown"; text: string; author: string | null; at: string; recorded: string };

/** CX-3, Law 10: each opening is an access event, like the identity reveal; restricted is masked (CX-4). */
export async function revealWorkingDiagnosisAction(
  raw: unknown,
): Promise<ActionResult<RevealResult>> {
  const p = z.object({ patientUserId: z.uuid(), orderId: z.uuid() }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  try {
    const actor = await benchActor();
    const data = await withPatientWrite(actor, p.data.patientUserId, async (ctx) => {
      const [row] = await ctx.tx
        .select({
          encounterId: encounterOrders.encounterId,
          sensitivity: encounterOrders.sensitivity,
        })
        .from(encounterOrders)
        .where(
          and(
            eq(encounterOrders.id, p.data.orderId),
            eq(encounterOrders.patientUserId, p.data.patientUserId),
            eq(encounterOrders.hospitalId, actor.hospitalId),
          ),
        );
      if (!row) throw new EmrWriteError("not_found", "Order not found here.");
      const wd = await workingDiagnosis(ctx.tx, row.encounterId, row.sensitivity === "restricted");
      await logChartAccess(ctx.tx, {
        hospitalId: actor.hospitalId,
        userId: actor.userId,
        patientUserId: p.data.patientUserId,
        basis: "lab_work",
        surface: "lab_working_diagnosis",
      });
      return wd;
    });
    const now = new Date();
    const out: RevealResult =
      data.kind === "shown"
        ? {
            kind: "shown",
            text: data.text,
            author: data.author,
            at: data.at.toISOString(),
            recorded: LAB2.workingDiagnosis.recorded(hhmm.format(now)),
          }
        : data.kind === "masked"
          ? { kind: "masked", words: LAB2.workingDiagnosis.masked }
          : { kind: "none" };
    return { ok: true, id: p.data.orderId, serverTime: now.toISOString(), data: out };
  } catch (e) {
    return actionError(e);
  }
}
