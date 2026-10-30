"use server";

import type { EmrDb } from "@/lib/emr/db";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { getAuthState } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import * as w from "@/lib/pharmacy/witness";

/**
 * The witness on their own device (rework PRD §6.5). The actor asks and waits; the witness answers in their own
 * signed-in session with the second factor. No password crosses another person's screen.
 */
type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string };
const database = db as unknown as EmrDb;

async function guarded<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof w.WitnessError) return { ok: false, error: e.message };
    logger.error("pharmacy.witness.action_failed", { error: e instanceof Error ? e.name : "unknown" });
    return { ok: false, error: "That did not go through. Try again." };
  }
}

export async function witnessesOnDutyAction(raw: unknown) {
  return guarded(async () => {
    const { locationId } = z.object({ locationId: z.uuid().nullable() }).parse(raw);
    const actor = await requirePharmacyActor();
    const r = await w.witnessesOnDuty(database, {
      hospitalId: actor.hospitalId,
      actorUserId: actor.userId,
      locationId: locationId ?? actor.pointId,
    });
    return { ok: true, ...r };
  });
}

export async function requestWitnessAction(raw: unknown) {
  return guarded(async () => {
    const i = z
      .object({
        witnessUserId: z.uuid(),
        locationId: z.uuid().nullable(),
        purpose: z.string().min(2).max(80),
        summary: z.string().min(2).max(300),
      })
      .parse(raw);
    const actor = await requirePharmacyActor();
    const r = await w.requestWitness(database, {
      ...i,
      hospitalId: actor.hospitalId,
      actorUserId: actor.userId,
      locationId: i.locationId ?? actor.pointId,
    });
    return { ok: true, id: r.id };
  });
}

export async function witnessRequestStateAction(raw: unknown) {
  return guarded(async () => {
    const { requestId } = z.object({ requestId: z.uuid() }).parse(raw);
    const actor = await requirePharmacyActor();
    const s = await w.witnessRequestState(database, requestId, actor.userId);
    if (!s) return { ok: false, error: "This request is not yours." };
    return { ok: true, ...s };
  });
}

/** The witness's side: any signed-in member of staff with the second factor, pharmacy or ward. */
async function witnessUser() {
  const auth = await getAuthState();
  if (!auth.user || auth.aal !== "aal2") throw new w.WitnessError("forbidden", "Sign in with your second factor first.");
  return auth.user.id;
}

export async function waitingForMeAction() {
  return guarded(async () => {
    const userId = await witnessUser();
    const rows = await w.waitingForWitness(database, userId);
    return { ok: true, rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  });
}

export async function answerWitnessAction(raw: unknown) {
  return guarded(async () => {
    const i = z.object({ requestId: z.uuid(), approve: z.boolean() }).parse(raw);
    const userId = await witnessUser();
    await w.answerWitnessRequest(database, { ...i, witnessUserId: userId });
    return { ok: true };
  });
}
