/**
 * Pharmacy rework, safety tests 1–3 and 7 (docs/pharmacy/rework/TECH-SPEC.md §7) on the PGlite lane, straight at the
 * ledger guard of migration 0265: S2 (no negative, expired, recalled or quarantined stock out; downtime flags a count),
 * S3 (a controlled movement out needs one fresh, unused witness approval from another person on duty), the reversal
 * rule, and one write per idempotency key. Every row is a fixture. Runs with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { authUser, bootLane, department, hospital, laneOn } from "./_pglite";

const id = async (pg: Pg, q: string, p?: unknown[]) =>
  (await pg.query<{ id: string }>(q, p)).rows[0]!.id;

describe.skipIf(!laneOn)("Pharmacy rework: the ledger guard (safety tests 1–3, 7)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;

  const product = (medicine: string, controlled: boolean) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by, controlled_class)
       VALUES ($1, $2, $2, 'unit', $3, $4) RETURNING id`,
      [f.h, medicine, f.actor, controlled ? "fixture_class" : null],
    );
  const batch = (productId: string, number: string, place = f.store!, expiry = "2099-12-31") =>
    id(
      pg,
      `INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, expiry,
         first_batch_number, first_expiry, created_by)
       VALUES ($1, $2, $3, $4, $5, $4, $5, $6) RETURNING id`,
      [f.h, place, productId, number, expiry, f.actor],
    );
  const move = (
    batchId: string,
    kind: string,
    quantity: number,
    o: {
      witness?: string | null;
      downtime?: boolean;
      paper?: string;
      reverses?: string;
      key?: string;
      actor?: string;
      place?: string;
      effectiveAt?: string;
    } = {},
  ) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at,
         actor_user_id, source_kind, witness_attestation_id, downtime, paper_witness_name, reverses_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), $7,
         CASE WHEN $4 IN ('reversed','adjusted') THEN 'adjustment' WHEN $4 = 'received' THEN 'delivery'
              WHEN $4 = 'count_correction' THEN 'count' ELSE 'transfer' END,
         $8, $9, $10, $11, $12) RETURNING id`,
      [
        f.h,
        o.place ?? f.store,
        batchId,
        kind,
        quantity,
        o.effectiveAt ?? null,
        o.actor ?? f.actor,
        o.witness ?? null,
        o.downtime ?? false,
        o.paper ?? null,
        o.reverses ?? null,
        o.key ?? null,
      ],
    );
  const approval = (o: { witness?: string; actor?: string; minutesAgo?: number } = {}) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome,
         attested_at)
       VALUES ($1, $2, $3, 'witness', 'fixture', 'passed', now() - make_interval(mins => $4)) RETURNING id`,
      [f.h, o.actor ?? f.actor, o.witness ?? f.witness, o.minutesAgo ?? 0],
    );
  const balance = async (b: string) =>
    Number(
      (
        await pg.query<{ n: string }>(
          `SELECT coalesce(sum(quantity), 0) AS n FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
          [b],
        )
      ).rows[0]!.n,
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Rework guard");
    f.actor = await authUser(pg, "pharmacist");
    f.witness = await authUser(pg, "witness");
    f.offDuty = await authUser(pg, "off-duty");
    f.store = await id(
      pg,
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name)
       VALUES ($1, 'store', $2, 'Fixture store') RETURNING id`,
      [f.h, await department(pg, f.h, "Pharmacy")],
    );
    f.quarantine = await id(
      pg,
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, name) VALUES ($1, 'quarantine', 'Fixture quarantine')
       RETURNING id`,
      [f.h],
    );
    f.morphine = await product("fixture_morphine", true);
    f.para = await product("fixture_paracetamol", false);
  }, 120_000);

  it("1: a controlled movement out is refused with no approval, a used one, the actor's own, or an off-duty witness", async () => {
    const b = await batch(f.morphine!, "CD-1");
    await move(b, "received", 10);
    await expect(move(b, "transfer_out", -1)).rejects.toThrow(/only with a witness/);

    const once = await approval();
    await move(b, "transfer_out", -1, { witness: once });
    await expect(move(b, "transfer_out", -1, { witness: once })).rejects.toThrow(/already used/);

    // Witnessing yourself is refused when the approval is made; someone else's approval does not stand for you.
    await expect(approval({ witness: f.actor })).rejects.toThrow(/pa_not_self/);
    const theirs = await approval({ actor: f.offDuty, witness: f.witness });
    await expect(move(b, "transfer_out", -1, { witness: theirs })).rejects.toThrow(/does not stand/);

    const stale = await approval({ minutesAgo: 11 });
    await expect(move(b, "transfer_out", -1, { witness: stale })).rejects.toThrow(/10 minutes/);

    // With a roster, only a person on duty here now may witness.
    await pg.query(
      `INSERT INTO public.pharmacy_duty_roster (hospital_id, user_id, location_id, role, shift, date_from, date_to, created_by)
       VALUES ($1, $2, NULL, 'pharmacist', 'call', current_date - 1, current_date + 1, $2)`,
      [f.h, f.witness],
    );
    const offDuty = await approval({ witness: f.offDuty });
    await expect(move(b, "transfer_out", -1, { witness: offDuty })).rejects.toThrow(/not on duty/);
    await move(b, "transfer_out", -1, { witness: await approval() });
    expect(await balance(b)).toBe(8);

    // A medicine that is not controlled moves without a witness.
    const p = await batch(f.para!, "P-1");
    await move(p, "received", 5);
    await move(p, "transfer_out", -2);
    expect(await balance(p)).toBe(3);
  });

  it("2: below zero, expired, recalled and quarantined stock out are refused; downtime is allowed and asks for a count", async () => {
    const b = await batch(f.para!, "S2-A");
    await move(b, "received", 3);
    await expect(move(b, "transfer_out", -4)).rejects.toThrow(/holds 3/);

    const old = await batch(f.para!, "S2-OLD", f.store, "2020-01-31");
    await move(old, "received", 2);
    await expect(move(old, "transfer_out", -1)).rejects.toThrow(/expired/);

    const q = await batch(f.para!, "S2-Q", f.quarantine);
    await move(q, "received", 2, { place: f.quarantine });
    await expect(move(q, "transfer_out", -1, { place: f.quarantine })).rejects.toThrow(/quarantine/);

    const r = await batch(f.para!, "S2-R");
    await move(r, "received", 2);
    await pg.query(
      `INSERT INTO public.pharmacy_recalls (hospital_id, product_id, batch_number, source, notice_ref, notice_date,
         stated_class, level, instructions, started_by)
       VALUES ($1, $2, 'S2-R', 'nda', 'FX-1', current_date, 'B', 'fixture level', 'fixture instructions', $3)`,
      [f.h, f.para, f.actor],
    );
    await expect(move(r, "transfer_out", -1)).rejects.toThrow(/recalled/);

    // Downtime back-entry: allowed, then the next live movement out waits for a count.
    const d = await batch(f.para!, "S2-D");
    await move(d, "received", 5);
    await move(d, "transfer_out", -1, { downtime: true });
    await expect(move(d, "transfer_out", -1)).rejects.toThrow(/needs a count/);
    const count = await id(
      pg,
      `INSERT INTO public.pharmacy_counts (hospital_id, location_id, scope, counted_by, counted_at)
       VALUES ($1, $2, 'medicine', $3, now() + interval '1 second') RETURNING id`,
      [f.h, f.store, f.actor],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_count_lines (count_id, batch_id, counted_quantity, recorded_balance) VALUES ($1, $2, 4, 4)`,
      [count, d],
    );
    await move(d, "transfer_out", -1);
    expect(await balance(d)).toBe(3);

    // A controlled back-entry needs the paper witness's name.
    const cd = await batch(f.morphine!, "S2-CD");
    await move(cd, "received", 2);
    await expect(move(cd, "transfer_out", -1, { downtime: true })).rejects.toThrow(/only with a witness/);
    await move(cd, "transfer_out", -1, { downtime: true, paper: "Fixture paper witness" });
  });

  it("3: a reversal mirrors its movement exactly, once, and the balance is right after a correction", async () => {
    const b = await batch(f.para!, "S3-A");
    await move(b, "received", 20);
    const handed = await move(b, "transfer_out", -15);
    await expect(move(b, "reversed", 10, { reverses: handed })).rejects.toThrow(/mirrors/);
    await move(b, "reversed", 15, { reverses: handed });
    await expect(move(b, "reversed", 15, { reverses: handed })).rejects.toThrow(/psm_one_reversal|duplicate/);
    // The replacement: 10, not 15.
    await move(b, "transfer_out", -10);
    expect(await balance(b)).toBe(10);

    // A controlled reversal needs a witness too.
    const c = await batch(f.morphine!, "S3-CD");
    await move(c, "received", 4);
    const out = await move(c, "transfer_out", -2, { witness: await approval() });
    await expect(move(c, "reversed", 2, { reverses: out })).rejects.toThrow(/only with a witness/);
    await move(c, "reversed", 2, { reverses: out, witness: await approval() });
    expect(await balance(c)).toBe(4);
  });

  it("7: one idempotency key writes a line once", async () => {
    const b = await batch(f.para!, "S7-A");
    await move(b, "received", 5);
    await move(b, "transfer_out", -2, { key: "handover:fixture-1" });
    await expect(move(b, "transfer_out", -2, { key: "handover:fixture-1" })).rejects.toThrow(/psm_idempotency|duplicate/);
    expect(await balance(b)).toBe(3);
  });

  it("marks a line entered more than 30 minutes after it happened as late, for good", async () => {
    const b = await batch(f.para!, "LATE-A");
    const m = await move(b, "received", 5, { effectiveAt: new Date(Date.now() - 3_600_000).toISOString() });
    const row = await pg.query<{ late: boolean }>(
      `SELECT late FROM public.pharmacy_stock_movements WHERE id = $1`,
      [m],
    );
    expect(row.rows[0]!.late).toBe(true);
  });
});
