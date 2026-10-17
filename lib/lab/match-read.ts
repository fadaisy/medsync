import "server-only";

import type { ComparisonRow, MatchReason } from "@/lib/exchange/types";
import { and, asc, count, eq, gte } from "drizzle-orm";

import { db } from "@/db";
import { exchangeMessages, exchangeSenders, labMatchItems, labReferrals } from "@/db/schema";

/**
 * The reconciliation queue (Lab Phase 4 §5.7, MA-3, MA-5): what waits for a person, with the reason in words and
 * the comparison as Same / Differs / Cannot compare. No value and no patient detail is read here.
 */

export async function countMatchesWaiting(hospitalId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(labMatchItems)
    .where(and(eq(labMatchItems.hospitalId, hospitalId), eq(labMatchItems.state, "waiting")));
  return r?.n ?? 0;
}

export interface MatchRow {
  id: string;
  arrivedAt: Date;
  from: string;
  about: string;
  reason: MatchReason;
  referralNumber: string | null;
  comparison: ComparisonRow[];
}

export async function loadMatches(hospitalId: string): Promise<MatchRow[]> {
  const rows = await db
    .select({
      id: labMatchItems.id,
      arrivedAt: labMatchItems.createdAt,
      sender: exchangeSenders.name,
      channel: exchangeMessages.channel,
      about: exchangeMessages.about,
      reason: labMatchItems.reason,
      referralNumber: labReferrals.number,
      comparison: labMatchItems.comparison,
    })
    .from(labMatchItems)
    .innerJoin(exchangeMessages, eq(exchangeMessages.id, labMatchItems.messageId))
    .leftJoin(exchangeSenders, eq(exchangeSenders.id, exchangeMessages.senderId))
    .leftJoin(labReferrals, eq(labReferrals.id, labMatchItems.candidateReferralId))
    .where(and(eq(labMatchItems.hospitalId, hospitalId), eq(labMatchItems.state, "waiting")))
    .orderBy(asc(labMatchItems.createdAt));
  return rows.map((r) => ({
    id: r.id,
    arrivedAt: r.arrivedAt,
    from: r.sender ?? (r.channel === "manual_note" ? "Paper report, typed here" : "Unknown sender"),
    about: r.about,
    reason: r.reason as MatchReason,
    referralNumber: r.referralNumber,
    comparison: r.comparison as ComparisonRow[],
  }));
}

/** §5.7 "This month": filed by themselves, waited here, filed after confirming, sent back. */
export async function matchMonth(hospitalId: string, from: Date) {
  const rows = await db
    .select({ state: labMatchItems.state, reason: labMatchItems.reason })
    .from(labMatchItems)
    .where(and(eq(labMatchItems.hospitalId, hospitalId), gte(labMatchItems.createdAt, from)));
  return {
    filedByThemselves: rows.filter((r) => r.state === "filed" && r.reason === null).length,
    waited: rows.filter((r) => r.reason !== null).length,
    filedAfterConfirming: rows.filter((r) => r.state === "filed" && r.reason !== null).length,
    sentBack: rows.filter((r) => r.state === "not_ours").length,
  };
}
