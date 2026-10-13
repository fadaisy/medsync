import "server-only";

import type { HighRiskEvent, LabelOutcome, PaymentMode, PaymentState } from "./one-menu";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  labHighRiskEvents,
  labIdentityChecks,
  labLabels,
  labPaymentEvents,
  labSettings,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { canCollect, checkLabel, currentPayment, highRiskNow } from "./one-menu";

/**
 * Labels, identity at collection, payment and the high-risk warning on the database (Lab Phase 2 §6.7,
 * §6.8, §6.12; ID-*, PY-*, HR-*; ADRs 0256–0258). Every check, payment change, flag and clear is an
 * append-only event (0109).
 */

type Actor = { userId: string; hospitalId: string };

/** ID-1, ID-5: the order's live label, issued now if it has none. */
export async function issueLabel(
  tx: EmrTx,
  actor: Actor,
  order: { id: string; patientUserId: string },
): Promise<string> {
  const [live] = await tx
    .select({ labelNo: labLabels.labelNo })
    .from(labLabels)
    .where(and(eq(labLabels.orderId, order.id), isNull(labLabels.voidedAt)));
  if (live) return live.labelNo;
  const [row] = await tx
    .insert(labLabels)
    .values({
      orderId: order.id,
      hospitalId: actor.hospitalId,
      patientUserId: order.patientUserId,
      issuedBy: actor.userId,
    })
    .returning({ labelNo: labLabels.labelNo });
  return row!.labelNo;
}

/** ID-5: "Void and print new": the old number is voided (and then reads as voided), a new one issued. */
export async function voidAndReissue(
  tx: EmrTx,
  actor: Actor,
  order: { id: string; patientUserId: string },
  reason: string,
  now: Date,
): Promise<string> {
  await tx
    .update(labLabels)
    .set({ voidedBy: actor.userId, voidedAt: now, voidReason: reason })
    .where(and(eq(labLabels.orderId, order.id), isNull(labLabels.voidedAt)));
  return issueLabel(tx, actor, order);
}

/** ID-1, ID-3: what the typed or scanned number is, recorded whatever it is. No override (ID-4). */
export async function recordLabelCheck(
  tx: EmrTx,
  actor: Actor,
  input: {
    order: { id: string; patientUserId: string };
    typed: string;
    method: "scan" | "typed";
    wristband: boolean;
    clientKey?: string | null;
  },
  now: Date,
): Promise<LabelOutcome> {
  const typed = input.typed.trim().toUpperCase();
  const [label] = await tx
    .select()
    .from(labLabels)
    .where(and(eq(labLabels.labelNo, typed), eq(labLabels.hospitalId, actor.hospitalId)));
  const outcome = checkLabel(
    label
      ? { orderId: label.orderId, patientUserId: label.patientUserId, voidedAt: label.voidedAt }
      : null,
    { orderId: input.order.id, patientUserId: input.order.patientUserId },
  );
  await tx.insert(labIdentityChecks).values({
    orderId: input.order.id,
    hospitalId: actor.hospitalId,
    patientUserId: input.order.patientUserId,
    labelTyped: typed.slice(0, 60) || "(empty)",
    outcome: outcome.outcome,
    method: input.method,
    wristbandChecked: input.wristband,
    actorUserId: actor.userId,
    recordedAt: now,
    clientKey: input.clientKey ?? null,
  });
  return outcome;
}

export async function paymentModeAt(tx: EmrTx, hospitalId: string): Promise<PaymentMode> {
  const [s] = await tx
    .select({ mode: labSettings.paymentMode })
    .from(labSettings)
    .where(eq(labSettings.hospitalId, hospitalId));
  return (s?.mode as PaymentMode | undefined) ?? "off";
}

export async function paymentStates(
  tx: EmrTx,
  orderIds: string[],
): Promise<Map<string, PaymentState>> {
  const rows = orderIds.length
    ? await tx
        .select({
          orderId: labPaymentEvents.orderId,
          state: labPaymentEvents.state,
          recordedAt: labPaymentEvents.recordedAt,
        })
        .from(labPaymentEvents)
        .where(inArray(labPaymentEvents.orderId, orderIds))
    : [];
  return new Map(orderIds.map((id) => [id, currentPayment(rows.filter((r) => r.orderId === id))]));
}

/**
 * ID-2, PY-3 at "collected": with the check on, a matching label is required in the same transaction (the
 * match is recorded); with payment on, an order awaiting payment is collected only as the mode allows.
 * Returns the columns the specimen keeps.
 */
export async function guardCollection(
  tx: EmrTx,
  actor: Actor,
  input: {
    order: { id: string; patientUserId: string };
    check: { labelNo: string; method: "scan" | "typed"; wristband: boolean } | null;
    paymentReason: string | null;
    checkOn: boolean;
    paymentOn: boolean;
  },
  now: Date,
): Promise<{ labelNo?: string; paymentState?: PaymentState; paymentReason?: string | null }> {
  const out: { labelNo?: string; paymentState?: PaymentState; paymentReason?: string | null } = {};
  if (input.checkOn) {
    if (!input.check)
      throw new EmrWriteError("invalid", "Scan or type the label on the tube first.");
    const r = await recordLabelCheck(
      tx,
      actor,
      {
        order: input.order,
        typed: input.check.labelNo,
        method: input.check.method,
        wristband: input.check.wristband,
      },
      now,
    );
    if (r.outcome !== "match")
      throw new EmrWriteError(
        "conflict",
        "The label does not match this patient and test. Print a new label.",
      );
    out.labelNo = input.check.labelNo.trim().toUpperCase();
  }
  if (input.paymentOn) {
    const state = (await paymentStates(tx, [input.order.id])).get(input.order.id)!;
    const mode = await paymentModeAt(tx, actor.hospitalId);
    if (!canCollect(state, mode, input.paymentReason))
      throw new EmrWriteError(
        "conflict",
        mode === "hold"
          ? "Payment not recorded. The cashier must record it before this sample is collected."
          : "Payment not recorded. Give a reason to collect now.",
      );
    out.paymentState = state;
    out.paymentReason = state === "awaiting" ? (input.paymentReason?.trim() ?? null) : null;
  }
  return out;
}

/* ─── HR: the high-risk warning ─────────────────────────────────────── */

export async function highRiskFor(
  tx: EmrTx,
  encounterIds: string[],
): Promise<Map<string, HighRiskEvent>> {
  if (!encounterIds.length) return new Map();
  const rows = await tx
    .select()
    .from(labHighRiskEvents)
    .where(inArray(labHighRiskEvents.encounterId, encounterIds))
    .orderBy(desc(labHighRiskEvents.recordedAt));
  const out = new Map<string, HighRiskEvent>();
  for (const id of encounterIds) {
    const on = highRiskNow(
      rows
        .filter((r) => r.encounterId === id)
        .map((r) => ({
          kind: r.kind as "flag" | "clear",
          source: r.source as "rule" | "manual",
          ruleId: r.ruleId,
          reason: r.reason,
          recordedAt: r.recordedAt,
        })),
    );
    if (on) out.set(id, on);
  }
  return out;
}

/** HR-1, HR-2: flag (by rule, once; or by hand with a reason) and clear (a clinician, with a reason). */
export async function setHighRisk(
  tx: EmrTx,
  actor: Actor,
  input: {
    encounterId: string;
    patientUserId: string;
    kind: "flag" | "clear";
    source: "rule" | "manual";
    ruleId?: string | null;
    reason?: string | null;
  },
  now: Date,
): Promise<boolean> {
  const current = (await highRiskFor(tx, [input.encounterId])).get(input.encounterId);
  if (input.kind === "flag" && current) return false; // already on: nothing to add
  if (input.kind === "clear" && !current) return false;
  await tx.insert(labHighRiskEvents).values({
    encounterId: input.encounterId,
    hospitalId: actor.hospitalId,
    patientUserId: input.patientUserId,
    kind: input.kind,
    source: input.source,
    ruleId: input.ruleId ?? null,
    reason: input.reason?.trim() || null,
    actorUserId: actor.userId,
    recordedAt: now,
  });
  return true;
}
