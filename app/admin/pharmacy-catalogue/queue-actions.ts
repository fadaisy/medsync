"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getAuthState } from "@/lib/auth";
import { secondFactorFresh } from "@/lib/auth-fresh";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError, EmrWriteError } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/exchange/store";
import { nextBatch } from "@/lib/pharmacy/shared-catalogue/queue";
import { resolveCodeConflict, reviewProposals } from "@/lib/pharmacy/shared-catalogue/store";

/**
 * The catalogue team's queue (4.8; GATE A §3). A curator (an open `catalogue_curators` row) at AAL2 with a fresh
 * second factor; one transaction as the clinical writer (audited). The database holds the rules: a curator reviews,
 * never their own proposal, and a medicine applies only with two confirmations.
 */

const NO_HOSPITAL = "00000000-0000-0000-0000-000000000000";
const PATH = "/admin/pharmacy-catalogue";
const REAUTH: ActionResult = {
  ok: false,
  code: "forbidden",
  error: "reauth: enter your authenticator code to sign.",
};

async function asCurator(
  fn: (tx: EmrTx, userId: string) => Promise<string>,
): Promise<ActionResult> {
  const state = await getAuthState();
  if (!state.user || state.aal !== "aal2")
    return {
      ok: false,
      code: "forbidden",
      error: "Only a catalogue curator reviews the catalogue.",
    };
  if (!(await secondFactorFresh())) return REAUTH;
  const userId = state.user.id;
  try {
    const id = await asClinicalWriter({ userId, hospitalId: NO_HOSPITAL }, async (tx) => {
      const [c] = rowsOf<{ ok: boolean }>(
        await tx.execute(sql`SELECT private.catalogue_is_curator(${userId}) AS ok`),
      );
      if (!c?.ok)
        throw new EmrWriteError("forbidden", "Only a catalogue curator reviews the catalogue.");
      return fn(tx, userId);
    });
    revalidatePath(PATH);
    return { ok: true, id, serverTime: new Date().toISOString() };
  } catch (e) {
    // A refusal from 0251's guards (Drizzle wraps it): said in its own words, without the guard's name.
    const m = (e as { cause?: { message?: string } })?.cause?.message ?? "";
    const guard = /^cat_[a-z_]+: (.+)$/.exec(m);
    if (guard)
      return {
        ok: false,
        code: "conflict",
        error: `${guard[1]![0]!.toUpperCase()}${guard[1]!.slice(1)}.`,
      };
    return actionError(e);
  }
}

const bad = (e: z.ZodError): ActionResult => ({
  ok: false,
  code: "invalid",
  error: e.issues[0]?.message ?? "Invalid input.",
});

const Review = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
  decision: z.enum(["confirm", "reject"]),
  note: z.string().trim().max(500).optional(),
});
export async function reviewCatalogueAction(raw: unknown): Promise<ActionResult> {
  const p = Review.safeParse(raw);
  if (!p.success) return bad(p.error);
  return asCurator(async (tx, userId) => {
    const r = await reviewProposals(tx, { userId }, p.data.ids, p.data.decision, p.data.note);
    return String(r.applied.length);
  });
}

const Batch = z.object({ kind: z.string().min(3).max(40), source: z.string().min(2).max(80) });
export async function confirmBatchAction(raw: unknown): Promise<ActionResult> {
  const p = Batch.safeParse(raw);
  if (!p.success) return bad(p.error);
  return asCurator(async (tx, userId) => {
    const ids = await nextBatch(tx, userId, p.data.kind, p.data.source);
    if (!ids.length) return "0";
    const r = await reviewProposals(tx, { userId }, ids, "confirm");
    return String(r.applied.length);
  });
}

const Settle = z.object({
  codeType: z.enum(["GTIN", "NMS", "JMS", "supplier", "other"]),
  code: z.string().min(1).max(80),
  keepPackId: z.uuid(),
  note: z.string().trim().min(3).max(500),
});
export async function settleConflictAction(raw: unknown): Promise<ActionResult> {
  const p = Settle.safeParse(raw);
  if (!p.success) return bad(p.error);
  return asCurator(async (tx, userId) => {
    const r = await resolveCodeConflict(tx, { userId }, p.data);
    return String(r.kept);
  });
}
