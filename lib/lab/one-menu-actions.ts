"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { labTestServices } from "@/db/schema";
import { requireEmrActor } from "@/lib/emr/actor";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { labOneMenuLiveFor } from "./feature";

/**
 * One menu set-up (Lab Phase 2 §5.10, OM-1; HARMONISATION §9): the laboratory lead links each test to the
 * hub offering that provides it here. Section, hours and status are never edited here: they stay in the hub
 * (Law 2).
 */
const Link = z.object({
  testCode: z.string().regex(/^test\.[a-z0-9_]{2,60}$/),
  offeringCode: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,40}$/)
    .nullable(),
});

export async function setTestServiceAction(raw: unknown): Promise<ActionResult> {
  const p = Link.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Choose a service." };
  try {
    const actor = await requireEmrActor("lab");
    if (!labOneMenuLiveFor(actor.hospitalId))
      throw new EmrWriteError("config", "One menu is not switched on here.");
    if (!actor.labPermissions?.includes("lab.manage"))
      throw new EmrWriteError("forbidden", "Only the laboratory lead links tests to services.");
    await asClinicalWriter({ userId: actor.userId, hospitalId: actor.hospitalId }, async (tx) => {
      const key = and(
        eq(labTestServices.hospitalId, actor.hospitalId),
        eq(labTestServices.testCode, p.data.testCode),
      );
      if (!p.data.offeringCode) {
        await tx.delete(labTestServices).where(key);
        return;
      }
      await tx
        .insert(labTestServices)
        .values({
          hospitalId: actor.hospitalId,
          testCode: p.data.testCode,
          offeringCode: p.data.offeringCode,
          setBy: actor.userId,
        })
        .onConflictDoUpdate({
          target: [labTestServices.hospitalId, labTestServices.testCode],
          set: { offeringCode: p.data.offeringCode, setBy: actor.userId, setAt: new Date() },
        });
    });
    return { ok: true, id: p.data.testCode, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}
