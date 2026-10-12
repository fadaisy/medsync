import "server-only";

import type { WriteCtx } from "./context";
import type { WriteResult } from "./orders";
import { eq } from "drizzle-orm";

import { specimenEvents, specimens } from "@/db/schema/emr";
import { encounters } from "@/db/schema/scheduling";
import { needsFastingChip } from "@/lib/emr/orders";
import { catalogueV2Active, profileInUse } from "@/lib/lab/catalogue-v2";
import {
  guardCollection,
  recordLabelCheck,
  setHighRisk,
  voidAndReissue,
} from "@/lib/lab/collection-store";
import { labCollectionCheckLiveFor, labPaymentLiveFor } from "@/lib/lab/feature";
import { EmrWriteError, stampActivity } from "./context";
import {
  COLLECTING_CADRES,
  LAB_CADRES,
  loadOrder,
  loadTest,
  ORDERING_CADRES,
  orderStatus,
  replayed,
  requireCadre,
  requireLabPermission,
  statusConflict,
} from "./orders";
import { withdrawPreliminary } from "./results";

/**
 * Specimens (PROMPT §5.8): collection at the bedside (two identifiers, the fasting chip, the
 * container, who collected it), receipt by the laboratory, and rejection, which returns the order
 * to "to collect" with the reason visible. Specimens and their events are insert-only.
 */

/** The values the specimens CHECKs accept (0071). The test menu also names `sputum`, which the
 *  table does not yet take: those collections are refused with a clear message, not a DB error. */
export const SPECIMEN_TYPES = [
  "venous_plasma",
  "venous_serum",
  "venous_whole_blood",
  "capillary_whole_blood",
  "arterial_blood",
  "urine_spot",
  "urine_first_morning",
  "urine_24h",
  "interstitial_fluid",
  "unknown",
] as const;
export const CONTAINERS = [
  "fluoride_oxalate",
  "serum_plain",
  "lithium_heparin",
  "edta",
  "capillary_direct",
  "unknown",
] as const;
export const REJECTION_REASONS = [
  "haemolysed",
  "clotted",
  "insufficient",
  "unlabelled_or_mislabelled",
  "wrong_container",
  "delayed",
] as const;

export interface CollectSpecimenInput {
  patientUserId: string;
  orderId: string;
  /** Two identifiers confirmed at the bedside; the table refuses anything else. */
  identifiersConfirmed: true;
  fastingState?: "fasting" | "non_fasting" | "unknown";
  fastingHours?: number;
  collectedAt?: Date;
  specimenType?: string;
  container?: string;
  labelNo?: string;
  /** Lab Phase 2 (ID-2): how the label was read, and the wristband check (ID-6). */
  labelMethod?: "scan" | "typed";
  wristbandChecked?: boolean;
  /** Lab Phase 2 (PY-3): why an order awaiting payment is collected now (inform mode). */
  paymentReason?: string;
  clientKey: string;
}

export async function collectSpecimen(
  ctx: WriteCtx,
  input: CollectSpecimenInput,
): Promise<WriteResult> {
  requireCadre(ctx, COLLECTING_CADRES, "collect specimens");
  if (input.identifiersConfirmed !== true)
    throw new EmrWriteError("invalid", "Confirm two identifiers before collecting.");
  const replay = await replayed(ctx.tx, specimens, input.clientKey, input.patientUserId);
  if (replay) return { id: replay };
  const order = await loadOrder(ctx, input.patientUserId, input.orderId);
  if (order.kind !== "lab")
    throw new EmrWriteError("invalid", "Only laboratory orders take a specimen.");
  const status = await orderStatus(ctx.tx, order);
  // "To collect" is active, including after a rejection.
  if (status.state !== "active") throw statusConflict(status, order, "collect a specimen");
  const test = await loadTest(ctx.tx, order.testId);
  if (needsFastingChip(order, test) && !input.fastingState)
    throw new EmrWriteError(
      "invalid",
      "Record the fasting state: fasting, not fasting or not sure.",
    );
  const specimenType = input.specimenType ?? test?.specimenType;
  const container = input.container ?? test?.container;
  if (!specimenType || !container)
    throw new EmrWriteError("invalid", "Record the specimen type and the container.");
  if (!(SPECIMEN_TYPES as readonly string[]).includes(specimenType))
    throw new EmrWriteError(
      "config",
      `A ${specimenType} specimen cannot be recorded yet (the specimen list needs extending).`,
    );
  if (!(CONTAINERS as readonly string[]).includes(container))
    throw new EmrWriteError("invalid", `Unknown container ${container}.`);
  const collectedAt = input.collectedAt ?? ctx.now;
  if (collectedAt.getTime() > ctx.now.getTime())
    throw new EmrWriteError("invalid", "The collection time cannot be in the future.");
  // Lab Phase 2: the label must match (ID-2) and payment must allow it (PY-3), in this transaction.
  const guard = await guardCollection(
    ctx.tx,
    ctx.actor,
    {
      order: { id: order.id, patientUserId: input.patientUserId },
      check: input.labelNo
        ? {
            labelNo: input.labelNo,
            method: input.labelMethod ?? "typed",
            wristband: input.wristbandChecked ?? false,
          }
        : null,
      paymentReason: input.paymentReason ?? null,
      checkOn: labCollectionCheckLiveFor(ctx.actor.hospitalId),
      paymentOn: labPaymentLiveFor(ctx.actor.hospitalId),
    },
    ctx.now,
  );

  const [s] = await ctx.tx
    .insert(specimens)
    .values({
      orderId: order.id,
      hospitalId: ctx.actor.hospitalId,
      patientUserId: input.patientUserId,
      specimenType,
      container,
      collectedAt,
      collectedByUserId: ctx.actor.userId,
      collectorCadre: ctx.actor.cadreCode,
      fastingState: input.fastingState ?? null,
      fastingHours: input.fastingHours === undefined ? null : String(input.fastingHours),
      identifiersConfirmed: true,
      labelNo: guard.labelNo ?? input.labelNo ?? null,
      paymentState: guard.paymentState ?? null,
      paymentReason: guard.paymentReason ?? null,
      recordedAt: ctx.now,
      clientKey: input.clientKey,
    })
    .returning({ id: specimens.id });
  await stampActivity(ctx, order.encounterId);
  return { id: s!.id };
}

/** The specimen with its order, checked to be this patient's here. */
async function specimenWithOrder(ctx: WriteCtx, patientUserId: string, specimenId: string) {
  const [s] = await ctx.tx.select().from(specimens).where(eq(specimens.id, specimenId));
  if (!s || s.patientUserId !== patientUserId || s.hospitalId !== ctx.actor.hospitalId)
    throw new EmrWriteError("not_found", "Specimen not found for this patient here.");
  const order = await loadOrder(ctx, patientUserId, s.orderId);
  return { specimen: s, order, status: await orderStatus(ctx.tx, order) };
}

export interface SpecimenActInput {
  patientUserId: string;
  specimenId: string;
  clientKey: string;
  /** Lab Phase 2 (SR-1): how it was received. */
  via?: "scan" | "click";
}

export async function receiveSpecimen(
  ctx: WriteCtx,
  input: SpecimenActInput,
): Promise<WriteResult> {
  requireCadre(ctx, LAB_CADRES, "receive specimens");
  requireLabPermission(ctx, "lab.receive", "receive specimens");
  const replay = await replayed(ctx.tx, specimenEvents, input.clientKey, input.patientUserId);
  if (replay) return { id: replay };
  const { specimen, order, status } = await specimenWithOrder(
    ctx,
    input.patientUserId,
    input.specimenId,
  );
  if (status.state !== "collected" || status.specimenId !== specimen.id)
    throw statusConflict(status, order, "receive this specimen");
  // AP-5: the analyser profile in use is pinned at receipt; a later change never alters this specimen.
  const profileId =
    order.testId && (await catalogueV2Active(ctx.tx, ctx.actor.hospitalId))
      ? await profileInUse(ctx.tx, ctx.actor.hospitalId, order.testId)
      : null;
  const [e] = await ctx.tx
    .insert(specimenEvents)
    .values({
      specimenId: specimen.id,
      hospitalId: ctx.actor.hospitalId,
      patientUserId: input.patientUserId,
      kind: "received",
      profileId,
      receivedVia: input.via ?? null,
      actorUserId: ctx.actor.userId,
      actorCadre: ctx.actor.cadreCode,
      recordedAt: ctx.now,
      clientKey: input.clientKey,
    })
    .returning({ id: specimenEvents.id });
  await stampActivity(ctx, order.encounterId);
  return { id: e!.id };
}

export async function rejectSpecimen(
  ctx: WriteCtx,
  input: SpecimenActInput & { reasonCode: (typeof REJECTION_REASONS)[number] },
): Promise<WriteResult> {
  requireCadre(ctx, LAB_CADRES, "reject specimens");
  requireLabPermission(ctx, "lab.receive", "reject specimens");
  const replay = await replayed(ctx.tx, specimenEvents, input.clientKey, input.patientUserId);
  if (replay) return { id: replay };
  const { specimen, order, status } = await specimenWithOrder(
    ctx,
    input.patientUserId,
    input.specimenId,
  );
  // Before release: awaiting receipt, received, or entered as a preliminary result on it.
  const onThis =
    ((status.state === "collected" || status.state === "in_progress") &&
      status.specimenId === specimen.id) ||
    (status.state === "resulted" && status.review === "not_released");
  if (!onThis) throw statusConflict(status, order, "reject this specimen");
  const [e] = await ctx.tx
    .insert(specimenEvents)
    .values({
      specimenId: specimen.id,
      hospitalId: ctx.actor.hospitalId,
      patientUserId: input.patientUserId,
      kind: "rejected",
      reasonCode: input.reasonCode,
      actorUserId: ctx.actor.userId,
      actorCadre: ctx.actor.cadreCode,
      recordedAt: ctx.now,
      clientKey: input.clientKey,
    })
    .returning({ id: specimenEvents.id });
  await withdrawPreliminary(ctx, input.patientUserId, order, specimen.id, input.reasonCode);
  await stampActivity(ctx, order.encounterId);
  return { id: e!.id };
}

/* ─── Lab Phase 2: labels and the high-risk warning (ID-*, HR-*) ───────── */

export interface CheckLabelInput {
  patientUserId: string;
  orderId: string;
  labelNo: string;
  method: "scan" | "typed";
  wristbandChecked: boolean;
  clientKey: string;
}

/** ID-1, ID-3: every scan or typed number is recorded; a mismatch names the other patient (two identifiers). */
export async function checkSpecimenLabel(
  ctx: WriteCtx,
  input: CheckLabelInput,
): Promise<WriteResult & { outcome: string; otherPatientUserId: string | null }> {
  requireCadre(ctx, COLLECTING_CADRES, "check a label");
  const order = await loadOrder(ctx, input.patientUserId, input.orderId);
  const r = await recordLabelCheck(
    ctx.tx,
    ctx.actor,
    {
      order: { id: order.id, patientUserId: input.patientUserId },
      typed: input.labelNo,
      method: input.method,
      wristband: input.wristbandChecked,
      clientKey: input.clientKey,
    },
    ctx.now,
  );
  return {
    id: order.id,
    outcome: r.outcome,
    otherPatientUserId: r.outcome === "other_patient" ? r.otherPatientUserId : null,
  };
}

/** ID-5: "Void and print new". */
export async function voidAndReprintLabel(
  ctx: WriteCtx,
  input: { patientUserId: string; orderId: string; reason: string; clientKey: string },
): Promise<WriteResult & { labelNo: string }> {
  requireCadre(ctx, COLLECTING_CADRES, "print a new label");
  const order = await loadOrder(ctx, input.patientUserId, input.orderId);
  const labelNo = await voidAndReissue(
    ctx.tx,
    ctx.actor,
    { id: order.id, patientUserId: input.patientUserId },
    input.reason.trim(),
    ctx.now,
  );
  return { id: order.id, labelNo };
}

/**
 * HR-1, HR-2, D-LAB2-06: a clinician flags "Suspected high-risk infection" with a reason, or the clerking
 * desk's fever-with-bleeding rule flags it once; only a clinician clears it, with a reason. The lab cannot.
 */
export async function setSpecimenHighRisk(
  ctx: WriteCtx,
  input: {
    patientUserId: string;
    encounterId: string;
    kind: "flag" | "clear";
    source: "rule" | "manual";
    ruleId?: string;
    reason?: string;
    clientKey: string;
  },
): Promise<WriteResult & { changed: boolean }> {
  requireCadre(
    ctx,
    ORDERING_CADRES,
    input.kind === "clear" ? "clear the high-risk warning" : "flag a high-risk specimen",
  );
  if (input.source === "manual" && (input.reason?.trim().length ?? 0) < 3)
    throw new EmrWriteError("invalid", "Say why.");
  const [enc] = await ctx.tx
    .select({
      id: encounters.id,
      patientUserId: encounters.patientUserId,
      hospitalId: encounters.hospitalId,
    })
    .from(encounters)
    .where(eq(encounters.id, input.encounterId));
  if (!enc || enc.patientUserId !== input.patientUserId || enc.hospitalId !== ctx.actor.hospitalId)
    throw new EmrWriteError("not_found", "Visit not found for this patient here.");
  const changed = await setHighRisk(
    ctx.tx,
    ctx.actor,
    {
      encounterId: enc.id,
      patientUserId: input.patientUserId,
      kind: input.kind,
      source: input.source,
      ruleId: input.ruleId ?? null,
      reason: input.reason ?? null,
    },
    ctx.now,
  );
  return { id: enc.id, changed };
}
