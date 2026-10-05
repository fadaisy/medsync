/**
 * A1 search before create. Returns the tiered candidates for what was typed, and a search token
 * that `person.enrol` requires: no new person without a search in the last 24 hours.
 */
import "server-only";

import type { NcdContext } from "./context";
import type { IdentityFacts, TieredCandidate } from "./identity";

import { findCandidates, issueSearchToken } from "./commands/shared";
import { authorize } from "./context";
import { withNcd } from "./db";

export async function searchPersons(
  ctx: NcdContext,
  typed: IdentityFacts,
): Promise<{ token: string; candidates: TieredCandidate[] }> {
  authorize(ctx, "person_search", "demo_write");
  const candidates = await withNcd(ctx, "app", (tx) => findCandidates(tx, ctx, typed), ctx.db);
  return { token: issueSearchToken(ctx, typed), candidates };
}
