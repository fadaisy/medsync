/**
 * Patient payments core on real Postgres (migration 0299; patient app v2 §8.2). PGlite lane only
 * (EMR_PGLITE=1, ADR 0133). Owner-role statements stand in for the service role (Edge Functions).
 * S1 RLS probes · S4 exactly-once callbacks · S13 a timed-out prompt leaves the booking · S14 one payment,
 * one receipt · S15 refunds never exceed the receipt and need a second person · PA5 clients never write paid.
 */
import type { Actor, Pg } from "../emr-db/_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  appointmentFixture,
  authUser,
  bootLane,
  department,
  hospital,
  laneOn,
  patient,
  probe,
  reception,
} from "../emr-db/_pglite";

const as = (userId: string | null): Actor => ({ userId, role: userId ? "authenticated" : "anon" });

let pg: Pg;
let H: string, H2: string, D: string, D2: string;
let P: string, Q: string, A: string, R: string, R2: string, U: string;

async function q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  return (await pg.query<T>(sql, params)).rows;
}
async function visit(fee: number | null, hospitalId = H, dep = D, who = P): Promise<string> {
  const clin = await authUser(pg, "clin");
  const id = await appointmentFixture(pg, {
    hospitalId,
    departmentId: dep,
    patientUserId: who,
    clinicianUserId: clin,
    daysAgo: -2,
  });
  await pg.query(
    `UPDATE public.appointments SET status = 'confirmed', quoted_fee_ugx = $2, quoted_fee_label = 'Medical officer',
            quoted_fee_at = CASE WHEN $2::int IS NULL THEN NULL ELSE now() END
      WHERE id = $1`,
    [id, fee],
  );
  return id;
}
async function bill(appt: string): Promise<string> {
  return (await q<{ b: string }>(`SELECT public.pay_bill_for_appointment($1) AS b`, [appt]))[0]!.b;
}
let keySeq = 0;
async function intent(b: string, payer = P): Promise<{ id: string; ref: string }> {
  const key = `key-${++keySeq}-${Date.now()}`;
  const [i] = await q<{ id: string }>(
    `SELECT (public.pay_intent_start($1, $2, 'app', 'mtn', '07•• ••• 123', $3, 'sandbox')).id`,
    [b, key, payer],
  );
  const ref = `sbx_${key}`;
  await q(`SELECT public.pay_intent_prompted($1, $2)`, [i!.id, ref]);
  return { id: i!.id, ref };
}
async function event(
  ref: string,
  eventId: string,
  outcome: string,
  amount: number | null,
  verified = true,
) {
  return (
    await q<{ r: string }>(
      `SELECT public.pay_apply_event('sandbox', $1, $2, $3, $4, $5, $6) AS r`,
      [eventId, ref, outcome, amount, verified, outcome === "failed" ? "not_enough_balance" : null],
    )
  )[0]!.r;
}
const receipts = async (b: string) =>
  (
    await q<{ n: number }>(`SELECT count(*)::int AS n FROM public.receipts WHERE bill_id = $1`, [b])
  )[0]!.n;

describe.skipIf(!laneOn)("patient payments (0299)", () => {
  beforeAll(async () => {
    ({ pg } = await bootLane());
    H = await hospital(pg, "Pay A");
    H2 = await hospital(pg, "Pay B");
    D = await department(pg, H);
    D2 = await department(pg, H2);
    P = await patient(pg);
    Q = await patient(pg);
    A = await authUser(pg, "agent");
    await pg.query(
      `INSERT INTO public.booking_agents (agent_user_id, patient_user_id, member_label, relationship, declared_adult)
       VALUES ($1, $2, 'Mother', 'child', true)`,
      [A, P],
    );
    R = (await reception(pg, { hospitalId: H, departmentId: D })).userId;
    R2 = (await reception(pg, { hospitalId: H2, departmentId: D2 })).userId;
    U = await authUser(pg, "supervisor");
    await pg.query(
      `INSERT INTO public.hospital_designations (hospital_id, role, user_id, starts_on, set_by)
       VALUES ($1, 'accounts_supervisor', $2, current_date - 1, $2)`,
      [H, U],
    );
  }, 120_000);

  it("bills only from the booking's fee snapshot, once; a free visit has no bill", async () => {
    const appt = await visit(30_000);
    const b = await bill(appt);
    expect(await bill(appt)).toBe(b);
    const [row] = await q<{ total_ugx: number; status: string }>(
      `SELECT * FROM public.bills WHERE id = $1`,
      [b],
    );
    expect(row).toMatchObject({ total_ugx: 30_000, status: "open" });
    expect(await bill(await visit(null))).toBeNull();
    expect(await bill(await visit(0))).toBeNull();
  });

  it("the same idempotency key is the same attempt; reused on another bill it fails", async () => {
    const b1 = await bill(await visit(30_000));
    const b2 = await bill(await visit(30_000));
    const sql = `SELECT (public.pay_intent_start($1, 'fixed-key-1', 'app', 'mtn', null, $2, 'sandbox')).id`;
    const [x] = await q<{ id: string }>(sql, [b1, P]);
    const [y] = await q<{ id: string }>(sql, [b1, P]);
    expect(y!.id).toBe(x!.id);
    await expect(q(sql, [b2, P])).rejects.toThrow(/another bill/);
  });

  it("S4/S14: duplicate, late, out-of-order and forged callbacks never make a second receipt", async () => {
    const b = await bill(await visit(30_000));
    const { ref } = await intent(b);
    expect(await event(ref, "e1", "succeeded", 30_000, false)).toBe("unverified");
    expect(await receipts(b)).toBe(0);
    expect(await event(ref, "e2", "succeeded", 30_000)).toBe("paid");
    expect(await event(ref, "e2", "succeeded", 30_000)).toBe("duplicate");
    expect(await event(ref, "e3", "succeeded", 30_000)).toBe("late");
    expect(await event(ref, "e4", "failed", null)).toBe("late");
    expect(await event("sbx_nobody", "e5", "succeeded", 30_000)).toBe("unknown_intent");
    expect(await receipts(b)).toBe(1);
    const [row] = await q<{ status: string; paid_ugx: number }>(
      `SELECT * FROM public.bills WHERE id = $1`,
      [b],
    );
    expect(row).toMatchObject({ status: "paid", paid_ugx: 30_000 });
  });

  it("a wrong amount is not a payment", async () => {
    const b = await bill(await visit(30_000));
    const { ref } = await intent(b);
    expect(await event(ref, "m1", "succeeded", 3_000)).toBe("amount_mismatch");
    expect(await receipts(b)).toBe(0);
  });

  it("receipt numbers run per hospital with no gaps", async () => {
    const before = (
      await q<{ n: number }>(
        `SELECT coalesce(max(number),0)::int n FROM public.receipts WHERE hospital_id=$1`,
        [H],
      )
    )[0]!.n;
    for (let k = 0; k < 3; k++) {
      const { ref } = await intent(await bill(await visit(20_000)));
      await event(ref, `n-${k}`, "succeeded", 20_000);
    }
    const nums = (
      await q<{ number: number }>(
        `SELECT number FROM public.receipts WHERE hospital_id = $1 AND number > $2 ORDER BY number`,
        [H, before],
      )
    ).map((r) => r.number);
    expect(nums).toEqual([before + 1, before + 2, before + 3]);
    const { ref } = await intent(await bill(await visit(20_000, H2, D2)));
    await event(ref, "other-h", "succeeded", 20_000);
    const [other] = await q<{ number: number }>(
      `SELECT number FROM public.receipts WHERE hospital_id = $1`,
      [H2],
    );
    expect(other!.number).toBe(1);
  });

  it("S13: a prompt nobody answers expires; the booking and the bill stand", async () => {
    const appt = await visit(30_000);
    const b = await bill(appt);
    const { id } = await intent(b);
    await q(`SELECT public.pay_expire_stale(now() + interval '11 minutes')`);
    const [i] = await q<{ status: string; failure_reason: string }>(
      `SELECT * FROM public.payment_intents WHERE id=$1`,
      [id],
    );
    expect(i).toMatchObject({ status: "expired", failure_reason: "timeout" });
    const [a] = await q<{ status: string }>(
      `SELECT status FROM public.appointments WHERE id = $1`,
      [appt],
    );
    expect(a!.status).toBe("confirmed");
    const [bb] = await q<{ status: string }>(`SELECT status FROM public.bills WHERE id = $1`, [b]);
    expect(bb!.status).toBe("open");
  });

  it("a payer outside the household is refused", async () => {
    const b = await bill(await visit(30_000));
    await expect(
      q(`SELECT public.pay_intent_start($1, 'outsider-key', 'app', 'mtn', null, $2, 'sandbox')`, [
        b,
        Q,
      ]),
    ).rejects.toThrow(/household/);
  });

  describe("S15 refunds", () => {
    let receipt: string;
    let b: string;
    beforeAll(async () => {
      b = await bill(await visit(30_000));
      const { ref } = await intent(b);
      await event(ref, "rf-1", "succeeded", 30_000);
      receipt = (
        await q<{ id: string }>(`SELECT id FROM public.receipts WHERE bill_id = $1`, [b])
      )[0]!.id;
    });
    const ask = (amount: number, reason = "patient_cancel", by: string | null = P) =>
      q<{ id: string; status: string; automatic: boolean }>(
        `SELECT (r).id, (r).status, (r).automatic FROM (SELECT public.pay_refund_request($1, $2, $3, $4) r) s`,
        [receipt, amount, reason, by],
      );

    it("never more than the receipt", async () => {
      await expect(ask(30_001)).rejects.toThrow(/over the receipt/);
    });

    it("a patient cancellation waits for the accounts supervisor, never the asker", async () => {
      const [r] = await ask(30_000);
      expect(r).toMatchObject({ status: "waiting", automatic: false });
      await expect(ask(1)).rejects.toThrow(/over the receipt/);
      await expect(q(`SELECT public.pay_refund_decide($1, $2, true)`, [r!.id, P])).rejects.toThrow(
        /second person/,
      );
      await expect(q(`SELECT public.pay_refund_decide($1, $2, true)`, [r!.id, R])).rejects.toThrow(
        /supervisor/,
      );
      await q(`SELECT public.pay_refund_decide($1, $2, true)`, [r!.id, U]);
      await q(`SELECT public.pay_refund_sent($1, 'sbx_rf', true)`, [r!.id]);
      await q(`SELECT public.pay_refund_sent($1, 'sbx_rf', true)`, [r!.id]);
      const [bb] = await q<{ status: string; refunded_ugx: number }>(
        `SELECT * FROM public.bills WHERE id = $1`,
        [b],
      );
      expect(bb).toMatchObject({ status: "refunded", refunded_ugx: 30_000 });
    });

    it("a hospital cancellation is approved automatically (D-PA-06)", async () => {
      const b2 = await bill(await visit(30_000));
      const { ref } = await intent(b2);
      await event(ref, "rf-2", "succeeded", 30_000);
      receipt = (
        await q<{ id: string }>(`SELECT id FROM public.receipts WHERE bill_id = $1`, [b2])
      )[0]!.id;
      const [r] = await ask(30_000, "hospital_cancel", null);
      expect(r).toMatchObject({ status: "approved", automatic: true });
    });
  });

  describe("S1 RLS and PA5", () => {
    let b: string;
    let paidByAgent: string;
    beforeAll(async () => {
      b = await bill(await visit(30_000));
      paidByAgent = await bill(await visit(25_000));
      const { ref } = await intent(paidByAgent, A);
      await event(ref, "agent-pay", "succeeded", 25_000);
    });
    const sees = async (who: string | null, id: string) => {
      const r = await probe(pg, as(who), `SELECT id FROM public.bills WHERE id = $1`, [id]);
      return r.ok ? r.rows.length : -1;
    };

    it("the patient, the household payer and the hospital's staff read; others do not", async () => {
      expect(await sees(P, b)).toBe(1);
      expect(await sees(R, b)).toBe(1);
      expect(await sees(Q, b)).toBe(0);
      expect(await sees(R2, b)).toBe(0);
      expect(await sees(A, paidByAgent)).toBe(1);
      expect(await sees(A, b)).toBe(0);
      expect(await sees(null, b)).toBe(-1);
    });

    it("the one status view follows the same rows", async () => {
      const r = await probe(
        pg,
        as(P),
        `SELECT status FROM public.payment_status WHERE bill_id = $1`,
        [paidByAgent],
      );
      expect(r.ok && r.rows[0]).toMatchObject({ status: "paid" });
      const r2 = await probe(pg, as(Q), `SELECT 1 FROM public.payment_status WHERE bill_id = $1`, [
        paidByAgent,
      ]);
      expect(r2.ok && r2.rows.length).toBe(0);
    });

    it("no client can write paid, a receipt, or call the engine", async () => {
      for (const sql of [
        `UPDATE public.bills SET status = 'paid', paid_ugx = total_ugx WHERE id = '${b}'`,
        `UPDATE public.payment_intents SET status = 'succeeded' WHERE bill_id = '${b}'`,
        `INSERT INTO public.receipts (hospital_id, number, bill_id, intent_id, total_ugx, method, item_label)
           VALUES ('${H}', 999, '${b}', gen_random_uuid(), 1, 'mtn', 'x')`,
        `SELECT public.pay_apply_event('sandbox','x','y','succeeded',1,true)`,
        `SELECT * FROM public.payment_callbacks`,
      ]) {
        for (const who of [P, R]) {
          const r = await probe(pg, as(who), sql);
          expect(r.ok && r.affected > 0, sql).toBe(false);
          if (r.ok) expect(r.rows.length, sql).toBe(0);
        }
      }
    });
  });

  it("S16: a counter payment (ha-pay-desk) is one receipt the desk and the patient read as Paid", async () => {
    const appt = await visit(30_000);
    const b = await bill(appt);
    const key = `counter-${Date.now()}`;
    const [i] = await q<{ id: string; amount_ugx: number }>(
      `SELECT (x).id, (x).amount_ugx FROM (SELECT public.pay_intent_start($1, $2, 'counter', NULL, NULL, NULL, 'counter') x) s`,
      [b, key],
    );
    const ref = `counter_${i!.id}`;
    await q(`SELECT public.pay_intent_prompted($1, $2)`, [i!.id, ref]);
    const apply = () =>
      q<{ r: string }>(
        `SELECT public.pay_apply_event('counter', $1, $1, 'succeeded', $2, true) AS r`,
        [ref, i!.amount_ugx],
      );
    expect((await apply())[0]!.r).toBe("paid");
    expect((await apply())[0]!.r).toBe("duplicate");
    expect(await receipts(b)).toBe(1);
    const read = async (who: string) => {
      const r = await probe(
        pg,
        as(who),
        `SELECT status, method, receipt_number FROM public.payment_status WHERE appointment_id = $1`,
        [appt],
      );
      return r.ok ? r.rows[0] : null;
    };
    const desk = await read(R);
    expect(desk).toMatchObject({ status: "paid", method: "counter" });
    expect(await read(P)).toEqual(desk);
  });

  it("P3: a top-up is its own bill on the same visit; the visit bill stays paid", async () => {
    const appt = await visit(20_000);
    const b = await bill(appt);
    const { ref } = await intent(b);
    await event(ref, `topup-base-${Date.now()}`, "succeeded", 20_000);
    const [t] = await q<{ b: string }>(
      `SELECT public.pay_bill_top_up($1, 15000, 'Top-up · specialist') AS b`,
      [appt],
    );
    const rows = await q<{ kind: string; status: string; total_ugx: number }>(
      `SELECT kind, status, total_ugx FROM public.bills WHERE appointment_id = $1 ORDER BY kind DESC`,
      [appt],
    );
    expect(rows).toEqual([
      { kind: "visit", status: "paid", total_ugx: 20_000 },
      { kind: "top_up", status: "open", total_ugx: 15_000 },
    ]);
    expect(t!.b).toBeTruthy();
  });

  it("0302: a patient reads only the refund cut-off, and only where Mobile Money is on", async () => {
    await q(
      `INSERT INTO public.hospital_payment_accounts (hospital_id, provider, enabled, refund_cutoff_hours)
       VALUES ($1, 'sandbox', true, 12), ($2, 'sandbox', false, 48)
       ON CONFLICT (hospital_id) DO UPDATE SET enabled = EXCLUDED.enabled,
         refund_cutoff_hours = EXCLUDED.refund_cutoff_hours`,
      [H, H2],
    );
    const r = await probe(pg, as(P), `SELECT * FROM public.hospital_refund_rules`);
    expect(r.ok && r.rows).toEqual([{ hospital_id: H, refund_cutoff_hours: 12 }]);
    expect((await probe(pg, as(null), `SELECT * FROM public.hospital_refund_rules`)).ok).toBe(
      false,
    );
  });

  it("a confidential clinic's receipt says Clinic visit", async () => {
    const b = await bill(await visit(30_000));
    await pg.query(`UPDATE public.bills SET confidential = true WHERE id = $1`, [b]);
    const { ref } = await intent(b);
    await event(ref, "conf-1", "succeeded", 30_000);
    const [r] = await q<{ item_label: string }>(
      `SELECT item_label FROM public.receipts WHERE bill_id = $1`,
      [b],
    );
    expect(r!.item_label).toBe("Clinic visit");
  });

  it("no table holds a balance or a wallet (Appendix C, Money)", async () => {
    const cols = await q<{ c: string }>(
      `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name ~* '(balance|wallet)'
          AND table_name ~ '^(bills|bill_items|payment_|receipt|refund_|hospital_payment_|membership|plus_)'`,
    );
    expect(cols.map((r) => r.c)).toEqual([]);
  });
});
