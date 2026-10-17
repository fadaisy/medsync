import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lab Phase 4, Step 0 (docs/lab/phase-4/PROMPT-LAB-PHASE-4.md §9): the three defects named in the baseline,
 * written as `it.fails` at Step 0 and flipped to plain `it` when fixed: (a) at Step 5 (tables 0151 and the
 * send-out action), (b) and (c) at Step 7 (results back through the shared writer, the printed range on each
 * value's snapshot). The behaviour itself is proven on the database in tests/emr-db/lab-referral.test.ts.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const migrations = () =>
  readdirSync(resolve(process.cwd(), "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => read(`supabase/migrations/${f}`))
    .join("\n");

describe("Lab Phase 4 baseline — defects reproduced at Step 0", () => {
  // (a) To refer (app/lab/refer/page.tsx) is a computed list with no action and no table: once a specimen leaves,
  // nothing records where it went, when, or whether its result came back.
  it("(a) a specimen that leaves To refer has a record (a referral row with append-only events)", () => {
    const sql = migrations();
    expect(sql).toMatch(/create table[^;]*\blab_referrals\b/i);
    expect(sql).toMatch(/create table[^;]*\blab_referral_events\b/i);
    // …and a person can record the send-out (the tables arrive at Step 2, the action at Step 5).
    expect(read("lib/lab/referral-actions.ts")).toMatch(
      /export async function addToManifestAction/,
    );
  });

  // (b) The only result-entry paths (enterResults, releaseResults, the downtime form) write a report on an order
  // the lab performs; nothing files a returned result on the original order with its referral and provenance.
  it("(b) a returned result files on the original order with its referral provenance", () => {
    const results = read("lib/emr/write/results.ts");
    expect(results).toMatch(/referred_paper|referralId/);
  });

  // (c) Flags are computed from this hospital's signed ranges (resolveRange); no path keeps or applies the
  // performing laboratory's printed range, so a referred result would be flagged against ours.
  it("(c) a referred result is flagged against the performing lab's printed range, not ours", () => {
    const sql = migrations();
    expect(sql).toMatch(/range_source[^;]*performing_lab/);
  });
});
