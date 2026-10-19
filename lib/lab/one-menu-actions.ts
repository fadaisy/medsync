"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { encounterOrders, labPaymentEvents, labSettings } from "@/db/schema";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { requireReceptionScope } from "@/lib/reception/scope";
import { paymentStates } from "./collection-store";
import { labPaymentLiveFor } from "./feature";

/* ─── Payment (§5.3, §5.14; PY-*, D-LAB2-02, -03) ───────────────────────── */

const Pay = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("paid"),
    orderIds: z.array(z.uuid()).min(1).max(40),
    receiptNo: z.string().trim().min(1).max(60),
  }),
  z.object({
    state: z.literal("insured"),
    orderIds: z.array(z.uuid()).min(1).max(40),
    insurer: z.string().trim().min(2).max(120),
    authorisationNo: z.string().trim().min(1).max(60),
  }),
  z.object({
    state: z.literal("waived"),
    orderIds: z.array(z.uuid()).min(1).max(40),
    reason: z.string().trim().min(3).max(200),
    approverId: z.uuid(),
  }),
]);

/**
 * PY-4, PY-5: the cashier (the RECEPTION cadre here) records how the orders awaiting payment were settled.
 * Only orders whose newest state is "awaiting" at this hospital are touched; an emergency is never changed
 * (0109's trigger refuses it too).
 */
export async function recordPaymentAction(raw: unknown): Promise<ActionResult> {
  const p = Pay.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      code: "invalid",
      error: p.error.issues[0]?.message ?? "Check the payment.",
    };
  try {
    const scope = await requireReceptionScope();
    if (!labPaymentLiveFor(scope.hospitalId))
      throw new EmrWriteError("config", "Payment before the sample is not switched on here.");
    await asClinicalWriter({ userId: scope.userId, hospitalId: scope.hospitalId }, async (tx) => {
      const states = await paymentStates(tx, p.data.orderIds);
      const own = await tx
        .select({ id: encounterOrders.id })
        .from(encounterOrders)
        .where(
          and(
            inArray(encounterOrders.id, p.data.orderIds),
            eq(encounterOrders.hospitalId, scope.hospitalId),
          ),
        );
      if (
        own.length !== p.data.orderIds.length ||
        p.data.orderIds.some((id) => states.get(id) !== "awaiting")
      )
        throw new EmrWriteError(
          "conflict",
          "These orders are no longer awaiting payment: reload the list.",
        );
      const now = new Date();
      await tx.insert(labPaymentEvents).values(
        p.data.orderIds.map((orderId) => ({
          orderId,
          hospitalId: scope.hospitalId,
          state: p.data.state,
          receiptNo: p.data.state === "paid" ? p.data.receiptNo : null,
          insurer: p.data.state === "insured" ? p.data.insurer : null,
          authorisationNo: p.data.state === "insured" ? p.data.authorisationNo : null,
          reason: p.data.state === "waived" ? p.data.reason : null,
          approverId: p.data.state === "waived" ? p.data.approverId : null,
          actorUserId: scope.userId,
          recordedAt: now,
        })),
      );
    });
    return { ok: true, id: p.data.orderIds[0]!, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}

const Settings = z.object({
  paymentMode: z.enum(["off", "inform", "hold"]).optional(),
  highRiskProcedure: z.string().trim().min(3).max(300).nullable().optional(),
});

/** §5.14: payment mode and the high-risk procedure link. The lead sets them; the never-held line is fixed. */
export async function setLabSettingsAction(raw: unknown): Promise<ActionResult> {
  const p = Settings.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Check the settings." };
  try {
    const actor = await requireEmrActor("lab");
    if (!actor.labPermissions?.includes("lab.manage"))
      throw new EmrWriteError("forbidden", "Only the laboratory lead changes lab settings.");
    const set = {
      ...(p.data.paymentMode !== undefined ? { paymentMode: p.data.paymentMode } : {}),
      ...(p.data.highRiskProcedure !== undefined
        ? { highRiskProcedure: p.data.highRiskProcedure }
        : {}),
      updatedBy: actor.userId,
      updatedAt: new Date(),
    };
    await asClinicalWriter({ userId: actor.userId, hospitalId: actor.hospitalId }, (tx) =>
      tx
        .insert(labSettings)
        .values({ hospitalId: actor.hospitalId, ...set })
        .onConflictDoUpdate({ target: labSettings.hospitalId, set }),
    );
    return { ok: true, id: actor.hospitalId, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}
