import "server-only";

import type { EmrTx } from "@/lib/emr/db";
import { and, eq, sql } from "drizzle-orm";

import { labMatchItems, labMatchResolutions } from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { fileAfterConfirmingErrors } from "@/lib/exchange/match";

/**
 * The reconciliation queue's decisions (Lab Phase 4 §5.7; MA-6, MA-7). Every decision is an append-only
 * resolution with a reason. "File after confirming" needs the method, who was spoken to for a call, and a second
 * person; for a paper report it lets the entry go ahead, marked "Filed by hand after a mismatch" (RB-2, MA-6).
 */
type Actor = { userId: string; hospitalId: string };

export interface ResolveInput {
  itemId: string;
  action: "file_after_confirming" | "not_ours" | "set_aside" | "keep_unordered" | "asked_partner";
  method: "corrected_report" | "phone_call" | null;
  spokeTo: string | null;
  secondUserId: string | null;
  reason: string;
}

async function isLabColleague(tx: EmrTx, hospitalId: string, userId: string) {
  const r =
    (await tx.execute(sql`SELECT 1 FROM staff_affiliations sa JOIN cadres c ON c.id = sa.cadre_id
     WHERE sa.user_id = ${userId} AND sa.hospital_id = ${hospitalId} AND sa.state IN ('active','approved')
       AND c.code IN ('LAB_TECH','LAB_TECHNOLOGIST') LIMIT 1`)) as unknown as
      | unknown[]
      | { rows: unknown[] };
  return (Array.isArray(r) ? r : r.rows).length > 0;
}

export async function resolveMatch(
  tx: EmrTx,
  a: Actor & { canResolve: boolean },
  i: ResolveInput,
  now: Date,
) {
  const [item] = await tx
    .select()
    .from(labMatchItems)
    .where(and(eq(labMatchItems.id, i.itemId), eq(labMatchItems.hospitalId, a.hospitalId)))
    .for("update");
  if (!item) throw new EmrWriteError("not_found", "That item was not found.");
  if (item.state !== "waiting")
    throw new EmrWriteError("conflict", "This item has already been decided.");
  if (!a.canResolve) throw new EmrWriteError("forbidden", "You do not resolve matches.");
  if (i.action === "file_after_confirming") {
    const errors = fileAfterConfirmingErrors({
      ...i,
      actorUserId: a.userId,
      hasPermission: a.canResolve,
    });
    if (errors.length)
      throw new EmrWriteError(
        "invalid",
        errors.includes("second_person")
          ? "A second person, not you, confirms it."
          : errors.includes("spoke_to")
            ? "Name who you spoke to."
            : "Say how it was confirmed and why.",
      );
    if (!(await isLabColleague(tx, a.hospitalId, i.secondUserId!)))
      throw new EmrWriteError("invalid", "The second person must be lab staff here.");
  } else if (i.reason.trim().length < 3) throw new EmrWriteError("invalid", "Say why.");
  await tx.insert(labMatchResolutions).values({
    hospitalId: a.hospitalId,
    itemId: item.id,
    action: i.action,
    method: i.method,
    spokeTo: i.spokeTo,
    secondUserId: i.secondUserId,
    reason: i.reason.trim(),
    actorUserId: a.userId,
    at: now,
  });
  const state =
    i.action === "not_ours"
      ? "not_ours"
      : i.action === "set_aside"
        ? "set_aside"
        : i.action === "keep_unordered"
          ? "kept_unordered"
          : null;
  if (state)
    await tx
      .update(labMatchItems)
      .set({ state, decidedAt: now })
      .where(eq(labMatchItems.id, item.id));
  return item.id;
}

/** RB-2 + MA-6: a confirmed paper mismatch for this referral, not yet filed, lets the entry go ahead. */
export async function confirmedPaperMismatch(tx: EmrTx, hospitalId: string, referralId: string) {
  const rows =
    (await tx.execute(sql`SELECT i.id AS "itemId", r.method, r.actor_user_id AS "by", r.second_user_id AS "second"
      FROM lab_match_items i JOIN lab_match_resolutions r ON r.item_id = i.id
     WHERE i.hospital_id = ${hospitalId} AND i.candidate_referral_id = ${referralId} AND i.component_key = 'paper'
       AND i.state = 'waiting' AND r.action = 'file_after_confirming'
     ORDER BY r.at DESC LIMIT 1`)) as unknown as
      | { itemId: string; method: string; by: string; second: string }[]
      | { rows: { itemId: string; method: string; by: string; second: string }[] };
  return (Array.isArray(rows) ? rows : rows.rows)[0] ?? null;
}

export async function markFiled(tx: EmrTx, itemId: string, reportId: string, now: Date) {
  await tx
    .update(labMatchItems)
    .set({ state: "filed", reportId, decidedAt: now })
    .where(eq(labMatchItems.id, itemId));
}
