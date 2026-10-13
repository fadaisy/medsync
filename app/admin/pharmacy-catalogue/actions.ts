"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAuthState } from "@/lib/auth";
import { secondFactorFresh } from "@/lib/auth-fresh";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError } from "@/lib/emr/write/context";
import { confirmLinks, recordRowCheck, removeLink } from "@/lib/pharmacy/national-catalogue";

/**
 * The CSO's national-list console (ADR 0282). Superadmin at AAL2 with a fresh second factor, one
 * transaction as the clinical writer (audited). Links are national: no hospital is in scope.
 */

const NO_HOSPITAL = "00000000-0000-0000-0000-000000000000";
const PATH = "/admin/pharmacy-catalogue";
const uuid = z.uuid();
const medicineId = z.string().regex(/^[a-z0-9_]{2,80}$/);
const REAUTH: ActionResult = {
  ok: false,
  code: "forbidden",
  error: "reauth: enter your authenticator code to sign.",
};

async function asCso(
  fn: (tx: EmrTx, signer: { userId: string }) => Promise<string>,
): Promise<ActionResult> {
  const state = await getAuthState();
  if (!state.user || state.aal !== "aal2" || !state.roles.includes("superadmin"))
    return {
      ok: false,
      code: "forbidden",
      error: "Only the clinical safety officer links the national list.",
    };
  if (!(await secondFactorFresh())) return REAUTH;
  const signer = { userId: state.user.id, hospitalId: NO_HOSPITAL };
  try {
    const id = await asClinicalWriter(signer, (tx) => fn(tx, signer));
    revalidatePath(PATH);
    return { ok: true, id, serverTime: new Date().toISOString() };
  } catch (e) {
    return actionError(e);
  }
}

const bad = (e: z.ZodError): ActionResult => ({
  ok: false,
  code: "invalid",
  error: e.issues[0]?.message ?? "Invalid input.",
});

const Links = z.object({
  editionId: uuid,
  picks: z
    .array(z.object({ medicineId, rowId: uuid }))
    .min(1)
    .max(200),
});
export async function confirmLinksAction(raw: unknown): Promise<ActionResult> {
  const p = Links.safeParse(raw);
  if (!p.success) return bad(p.error);
  return asCso(async (tx, s) => String(await confirmLinks(tx, s, p.data.editionId, p.data.picks)));
}

const Unlink = z.object({ editionId: uuid, medicineId });
export async function removeLinkAction(raw: unknown): Promise<ActionResult> {
  const p = Unlink.safeParse(raw);
  if (!p.success) return bad(p.error);
  return asCso(async (tx) => {
    await removeLink(tx, p.data.editionId, p.data.medicineId);
    return p.data.medicineId;
  });
}

const Check = z.object({
  rowId: uuid,
  note: z.string().trim().min(10, "Say what you checked, in 10 characters or more.").max(600),
});
export async function recordRowCheckAction(raw: unknown): Promise<ActionResult> {
  const p = Check.safeParse(raw);
  if (!p.success) return bad(p.error);
  return asCso(async (tx, s) => {
    await recordRowCheck(tx, s, p.data.rowId, p.data.note);
    return p.data.rowId;
  });
}
