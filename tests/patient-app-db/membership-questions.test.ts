/**
 * Membership, entitlements and Questions for the doctor on real Postgres (migration 0300). PGlite lane only.
 * S3/S26 nothing in MR9 changes with tier · S25 a trial ends without a charge · D-PA-10 the desk never reads
 * the questions · prices come only from approved server rows (D-MR-10).
 */
import type { Actor, Pg } from "../emr-db/_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  appointmentFixture,
  authUser,
  bootLane,
  clinician,
  department,
  hospital,
  laneOn,
  patient,
  probe,
  reception,
  staff,
} from "../emr-db/_pglite";

const as = (userId: string | null): Actor => ({ userId, role: userId ? "authenticated" : "anon" });

const PROTECTED = [
  "queue_order",
  "triage",
  "results_release",
  "help",
  "danger_flows",
  "reminders",
  "booking",
  "booking_for_household",
  "care_team_reach",
  "readings",
  "plan",
  "wellness",
  "widgets",
  "basic_card",
  "medical_id",
  "tickets",
];
const EXTRAS = [
  "household_calendar",
  "pay_for_household",
  "helper_in_loop",
  "helper_readings",
  "texts_and_alerts",
  "refills_packed",
  "report_12m",
];
const TIERS = ["basic", "plus_family", "plus_care", "family_care"] as const;

let pg: Pg;
describe.skipIf(!laneOn)("membership and questions (0300)", () => {
  let H: string, D: string;
  beforeAll(async () => {
    ({ pg } = await bootLane());
    H = await hospital(pg, "Plus");
    D = await department(pg, H);
  }, 120_000);

  const allows = async (u: string, f: string, now = "now()") =>
    (
      await pg.query<{ a: boolean }>(`SELECT public.entitlement_allows($1, $2, ${now}) AS a`, [
        u,
        f,
      ])
    ).rows[0]!.a;

  it("S3/S26: every protected feature is allowed on every tier, active or lapsed", async () => {
    for (const tier of TIERS) {
      const u = await authUser(pg, tier);
      if (tier !== "basic") {
        await pg.query(
          `INSERT INTO public.memberships (user_id, tier, period, status, period_ends_at)
           VALUES ($1, $2, 'monthly', 'active', now() + interval '20 days')`,
          [u, tier],
        );
      }
      for (const f of PROTECTED) expect(await allows(u, f), `${tier} ${f}`).toBe(true);
      for (const f of PROTECTED)
        expect(await allows(u, f, "now() + interval '400 days'")).toBe(true);
    }
  });

  it("the Plus extras follow the tier", async () => {
    const want: Record<(typeof TIERS)[number], string[]> = {
      basic: [],
      plus_family: ["household_calendar", "pay_for_household", "helper_in_loop"],
      plus_care: ["helper_readings", "texts_and_alerts", "refills_packed", "report_12m"],
      family_care: EXTRAS,
    };
    for (const tier of TIERS) {
      const u = await authUser(pg, `x-${tier}`);
      if (tier !== "basic") {
        await pg.query(
          `INSERT INTO public.memberships (user_id, tier, period, status, period_ends_at)
           VALUES ($1, $2, 'yearly', 'active', now() + interval '200 days')`,
          [u, tier],
        );
      }
      const got: string[] = [];
      for (const f of EXTRAS) if (await allows(u, f)) got.push(f);
      expect(got.sort(), tier).toEqual([...want[tier]].sort());
    }
  });

  it("S25: a trial runs 30 days once, then lapses to Basic with no charge", async () => {
    const u = await authUser(pg, "trial");
    await pg.query(`SELECT public.membership_start_trial($1, 'plus_care')`, [u]);
    expect(await allows(u, "texts_and_alerts")).toBe(true);
    await expect(
      pg.query(`SELECT public.membership_start_trial($1, 'plus_family')`, [u]),
    ).rejects.toThrow(/already used/);
    await pg.query(`SELECT public.membership_lapse(now() + interval '31 days')`);
    const { rows } = await pg.query<{ tier: string; status: string }>(
      `SELECT tier, status FROM public.memberships WHERE user_id = $1`,
      [u],
    );
    expect(rows[0]).toEqual({ tier: "basic", status: "active" });
    expect(await allows(u, "texts_and_alerts")).toBe(false);
    const bills = await pg.query(`SELECT 1 FROM public.bills WHERE patient_user_id = $1`, [u]);
    expect(bills.rows).toHaveLength(0);
  });

  it("prices: approved rows show, a draft row stays hidden, clients cannot write them", async () => {
    const u = await authUser(pg, "price");
    await pg.query(
      `INSERT INTO public.plus_prices (tier, period, amount_ugx, effective_from) VALUES ('plus_care','monthly',99000,'2099-01-01')`,
    );
    const seen = await probe(
      pg,
      as(u),
      `SELECT tier, period, amount_ugx FROM public.plus_prices ORDER BY tier, period`,
    );
    expect(seen.ok && seen.rows.length).toBe(9);
    expect(seen.ok && seen.rows.some((r) => r.amount_ugx === 99000)).toBe(false);
    const { rows } = await pg.query<{ tier: string; period: string; amount_ugx: number }>(
      `SELECT tier, period, amount_ugx FROM public.plus_prices WHERE approved_at IS NOT NULL`,
    );
    for (const r of rows.filter((x) => x.period === "yearly")) {
      const monthly = rows.find((x) => x.tier === r.tier && x.period === "monthly")!;
      expect(r.amount_ugx).toBe(monthly.amount_ugx * 10);
    }
    const write = await probe(pg, as(u), `UPDATE public.plus_prices SET amount_ugx = 1`);
    expect(write.ok && write.affected).toBeFalsy();
  });

  describe("D-PA-10 Questions for the doctor", () => {
    let P: string, Q: string, N: string, C: string, R: string, appt: string;
    beforeAll(async () => {
      P = await patient(pg);
      Q = await patient(pg);
      N = (await staff(pg, { hospitalId: H, departmentId: D, cadre: "NURSE" })).userId;
      C = (await clinician(pg, { hospitalId: H, departmentId: D })).userId;
      R = (await reception(pg, { hospitalId: H, departmentId: D })).userId;
      appt = await appointmentFixture(pg, {
        hospitalId: H,
        departmentId: D,
        patientUserId: P,
        clinicianUserId: C,
        daysAgo: 0,
      });
      await pg.query(
        `INSERT INTO public.visit_questions (appointment_id, author_user_id, body) VALUES ($1, $2, 'When should I come back?')`,
        [appt, P],
      );
    });
    const count = async (who: string) => {
      const r = await probe(
        pg,
        as(who),
        `SELECT id FROM public.visit_questions WHERE appointment_id = $1`,
        [appt],
      );
      return r.ok ? r.rows.length : -1;
    };

    it("the patient, the nurse and the doctor read; the desk and other patients do not", async () => {
      expect(await count(P)).toBe(1);
      expect(await count(N)).toBe(1);
      expect(await count(C)).toBe(1);
      expect(await count(R)).toBe(0);
      expect(await count(Q)).toBe(0);
    });

    it("only the patient writes, and only on their own visit", async () => {
      const ins = `INSERT INTO public.visit_questions (appointment_id, author_user_id, body) VALUES ($1, $2, 'x')`;
      expect((await probe(pg, as(P), ins, [appt, P])).ok).toBe(true);
      expect((await probe(pg, as(Q), ins, [appt, Q])).ok).toBe(false);
      expect((await probe(pg, as(R), ins, [appt, R])).ok).toBe(false);
      const tick = await probe(
        pg,
        as(C),
        `UPDATE public.visit_questions SET asked_at = now() WHERE appointment_id = $1`,
        [appt],
      );
      expect(tick.ok && tick.affected).toBe(1);
      const edit = await probe(
        pg,
        as(C),
        `UPDATE public.visit_questions SET body = 'changed' WHERE appointment_id = $1`,
        [appt],
      );
      expect(edit.ok).toBe(false);
    });
  });
});
