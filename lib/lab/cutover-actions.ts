"use server";

import type { ActionResult } from "@/lib/emr/write/context";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAuthState } from "@/lib/auth";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError } from "@/lib/emr/write/context";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { approveCutover, requestCutover, reverseCutover } from "./cutover-store";
import { recordBriefing } from "./downtime-store";

/**
 * One result path actions (Lab Phase 1 §5.9, CO-2, CO-5). Hospital admins request and approve the
 * switch (two different people); superadmins reverse it (two different people, with a reason).
 */

const PAGE = "/hospital-admin/departments/diagnostics/one-result-path";
const ok = (id: string): ActionResult => ({ ok: true, id, serverTime: new Date().toISOString() });

async function asAdmin<T>(
  fn: (
    tx: Parameters<Parameters<typeof asClinicalWriter>[1]>[0],
    a: { userId: string; hospitalId: string },
  ) => Promise<T>,
) {
  const scope = await requireHospitalAdminScope();
  const actor = { userId: scope.userId, hospitalId: scope.hospitalId };
  return asClinicalWriter(actor, (tx) => fn(tx, actor));
}

export async function requestCutoverAction(): Promise<ActionResult> {
  try {
    const id = await asAdmin((tx, a) => requestCutover(tx, a, new Date()));
    revalidatePath(PAGE);
    return ok(id);
  } catch (e) {
    return actionError(e);
  }
}

export async function approveCutoverAction(raw: unknown): Promise<ActionResult> {
  const p = z.object({ cutoverId: z.uuid() }).safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  try {
    await asAdmin((tx, a) => approveCutover(tx, a, p.data.cutoverId, new Date()));
    revalidatePath(PAGE);
    return ok(p.data.cutoverId);
  } catch (e) {
    return actionError(e);
  }
}

const Briefing = z.object({
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date."),
  audience: z.string().trim().min(2, "Who was briefed?").max(300),
  notes: z.string().trim().max(1000).nullable(),
});

/** The fourth condition: the lab and the wards are briefed. A record only. */
export async function recordBriefingAsAdminAction(raw: unknown): Promise<ActionResult> {
  const p = Briefing.safeParse(raw);
  if (!p.success)
    return { ok: false, code: "invalid", error: p.error.issues[0]?.message ?? "Invalid input." };
  try {
    const id = await asAdmin((tx, a) => recordBriefing(tx, a, p.data, new Date()));
    revalidatePath(PAGE);
    return ok(id);
  } catch (e) {
    return actionError(e);
  }
}

const Reverse = z.object({
  cutoverId: z.uuid(),
  hospitalId: z.uuid(),
  reason: z.string().trim().max(500).nullable(),
  approve: z.boolean(),
});

export async function reverseCutoverAction(raw: unknown): Promise<ActionResult> {
  const p = Reverse.safeParse(raw);
  if (!p.success) return { ok: false, code: "invalid", error: "Invalid input." };
  const state = await getAuthState();
  if (!state.user || state.aal !== "aal2" || !state.roles.includes("superadmin"))
    return { ok: false, code: "forbidden", error: "Only a superadmin reverses the switch." };
  const userId = state.user.id;
  try {
    await asClinicalWriter({ userId, hospitalId: p.data.hospitalId }, (tx) =>
      reverseCutover(
        tx,
        { userId },
        { cutoverId: p.data.cutoverId, reason: p.data.reason, approve: p.data.approve },
        new Date(),
      ),
    );
    revalidatePath("/admin/lab-signoffs");
    return ok(p.data.cutoverId);
  } catch (e) {
    return actionError(e);
  }
}
