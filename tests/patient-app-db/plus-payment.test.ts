/**
 * Paying for Plus through the one engine (migration 0303; patient app v2 §5.9, Step 10; ADR 0520). PGlite lane
 * only. Tether is the merchant: the bill has no hospital, Tether's receipts number on their own, and a paid bill
 * starts the period it bought. Exactly once under duplicate callbacks (S14); a trial still never charges (S25).
 */
import type { Actor, Pg } from "../emr-db/_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { bootLane, department, hospital, laneOn, patient, probe } from "../emr-db/_pglite";

// Every actor carries an aal2 token, so the 0288/0304 MFA gate is never what hides a row here (one test checks it).
const as = (userId: string | null): Actor => ({
  userId,
  role: userId ? "authenticated" : "anon",
  aal: "aal2",
});
let pg: Pg;
let P: string, Q: string, H: string;
async function q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  return (await pg.query<T>(sql, params)).rows;
}
let seq = 0;
async function payPlus(user: string, tier: string, period: string) {
  const [b] = await q<{ b: string }>(`SELECT public.pay_bill_membership($1, $2, $3) AS b`, [
    user,
    tier,
    period,
  ]);
  const key = `plus-key-${++seq}-${Date.now()}`;
  const [i] = await q<{ id: string; amount_ugx: number }>(
    `SELECT (x).id, (x).amount_ugx FROM (SELECT public.pay_intent_start($1, $2, 'app', 'mtn', '07•• ••• 123', $3, 'sandbox') x) s`,
    [b!.b, key, user],
  );
  const ref = `sbx_${key}`;
  await q(`SELECT public.pay_intent_prompted($1, $2)`, [i!.id, ref]);
  const apply = (ev: string) =>
    q<{ r: string }>(
      `SELECT public.pay_apply_event('sandbox', $1, $2, 'succeeded', $3, true) AS r`,
      [ev, ref, i!.amount_ugx],
    );
  return { bill: b!.b, amount: i!.amount_ugx, apply };
}

describe.skipIf(!laneOn)("Plus payment (0303)", () => {
  beforeAll(async () => {
    ({ pg } = await bootLane());
    P = await patient(pg);
    Q = await patient(pg);
    H = await hospital(pg, "Plus H");
    await department(pg, H);
  }, 120_000);

  it("the amount is the approved price, never the client's; the bill has no hospital", async () => {
    const { bill, amount } = await payPlus(P, "plus_care", "monthly");
    expect(amount).toBe(10_000);
    const [b] = await q(
      `SELECT hospital_id, kind, platform_share_ugx, total_ugx FROM public.bills WHERE id = $1`,
      [bill],
    );
    expect(b).toMatchObject({
      hospital_id: null,
      kind: "membership",
      platform_share_ugx: 10_000,
      total_ugx: 10_000,
    });
    await expect(
      q(`SELECT public.pay_bill_membership($1, 'plus_care', 'weekly')`, [P]),
    ).rejects.toThrow();
  });

  it("S14: paid once, one receipt on Tether's own counter, under a duplicate callback; the period starts", async () => {
    const { bill, apply } = await payPlus(Q, "plus_family", "quarterly");
    expect((await apply("plus-ev-1"))[0]!.r).toBe("paid");
    expect((await apply("plus-ev-1"))[0]!.r).toBe("duplicate");
    const r = await q<{ n: number; hospital_id: string | null; number: number }>(
      `SELECT count(*) OVER ()::int AS n, hospital_id, number FROM public.receipts WHERE bill_id = $1`,
      [bill],
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.hospital_id).toBeNull();
    const [m] = await q<{ tier: string; status: string; months: number }>(
      `SELECT tier, status, round(extract(epoch FROM period_ends_at - now()) / 2592000)::int AS months
         FROM public.memberships WHERE user_id = $1`,
      [Q],
    );
    expect(m).toMatchObject({ tier: "plus_family", status: "active", months: 3 });
  });

  it("Tether's receipts run 1, 2, … apart from any hospital's", async () => {
    const before = (
      await q<{ n: number }>(
        `SELECT coalesce(max(number), 0)::int AS n FROM public.receipts WHERE hospital_id IS NULL`,
      )
    )[0]!.n;
    const a = await payPlus(P, "family_care", "monthly");
    await a.apply(`plus-ev-a-${Date.now()}`);
    const nums = await q<{ number: number }>(
      `SELECT number FROM public.receipts WHERE hospital_id IS NULL ORDER BY number`,
    );
    expect(nums.at(-1)!.number).toBe(before + 1);
  });

  it("the payer reads their own Plus bill and receipt; another patient does not; no client makes one", async () => {
    const { bill } = await payPlus(P, "plus_care", "yearly");
    const mine = await probe(pg, as(P), `SELECT id FROM public.bills WHERE id = $1`, [bill]);
    expect(mine.ok && mine.rows.length).toBe(1);
    const theirs = await probe(pg, as(Q), `SELECT id FROM public.bills WHERE id = $1`, [bill]);
    expect(theirs.ok && theirs.rows.length).toBe(0);
    const write = await probe(
      pg,
      as(P),
      `SELECT public.pay_bill_membership($1, 'plus_care', 'monthly')`,
      [P],
    );
    expect(write.ok).toBe(false);
  });

  it("S25: a trial starts with no bill and lapses with none", async () => {
    const T = await patient(pg);
    await q(`SELECT public.membership_start_trial($1, 'plus_care', now() - interval '31 days')`, [
      T,
    ]);
    await q(`SELECT public.membership_lapse()`);
    const [m] = await q(`SELECT tier, status FROM public.memberships WHERE user_id = $1`, [T]);
    expect(m).toMatchObject({ tier: "basic", status: "active" });
    const bills = await q(`SELECT 1 FROM public.bills WHERE patient_user_id = $1`, [T]);
    expect(bills).toHaveLength(0);
  });

  it("a visit bill still needs its hospital", async () => {
    await expect(
      q(
        `INSERT INTO public.bills (hospital_id, patient_user_id, kind, total_ugx) VALUES (NULL, $1, 'visit', 1000)`,
        [P],
      ),
    ).rejects.toThrow();
  });
});
