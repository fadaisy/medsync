/**
 * Stock › Main store (migration 0275, STORE.md §M): the database refuses a balance below zero, an issue that is not
 * first expiry first, a controlled issue without a witness or by the issuer, a place leg before its confirmation, a
 * non-cold put-away while a cold line waits, posting a count over the sign-off value unsigned, closing a stock-take
 * early, trimming a V line, issuing from quarantine, and a controlled or theft loss without its witness and case.
 * Runs with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { asClinicalWriter } from "@/lib/emr/db";
import {
  batchAtLocation,
  batchRef,
  loadLocation,
  move,
  movePair,
} from "@/lib/pharmacy/stores/write";
import { seedStore } from "../../scripts/seed-pharmacy-dev/store";
import { bootLane, hospital, laneOn, staff } from "./_pglite";

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!laneOn)("Pharmacy Main store: database invariants (0275)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;
  const id = async (q: string, p?: unknown[]) => (await pg.query<{ id: string }>(q, p)).rows[0]!.id;
  const hint = async (p: Promise<unknown>) => {
    try {
      await p;
      return "ok";
    } catch (e) {
      // Drizzle wraps the database error in `cause`.
      const err = e as {
        hint?: string;
        message?: string;
        cause?: { hint?: string; message?: string };
      };
      return err.cause?.hint ?? err.hint ?? err.cause?.message ?? err.message ?? "error";
    }
  };
  const as = <T>(fn: Parameters<typeof asClinicalWriter<T>>[1]) =>
    asClinicalWriter<T>({ userId: f.tech!, hospitalId: f.h! }, fn, lane.db);

  const product = (name: string, extra: { ven?: string; cold?: boolean; cd?: string } = {}) =>
    id(
      `INSERT INTO public.pharmacy_products
         (hospital_id, medicine_id, name, issue_unit, pack_size, created_by, ven, cold_chain, controlled_class)
       VALUES ($1, $2, $3, 'tablet', '10', $4, $5, $6, $7) RETURNING id`,
      [
        f.h,
        name.toLowerCase().replace(/\W+/g, "_"),
        name,
        f.tech,
        extra.ven ?? null,
        extra.cold ?? false,
        extra.cd ?? null,
      ],
    );
  /** A delivery of `qty` at the store. */
  const stock = (
    productId: string,
    batchNumber: string,
    days: number,
    qty: number,
    at = f.store!,
  ) =>
    as(async (tx) => {
      const location = await loadLocation(tx, f.h!, at);
      const batchId = await batchAtLocation(tx, {
        hospitalId: f.h!,
        location,
        productId,
        batchNumber,
        expiry: iso(days),
        monthOnly: false,
        actorUserId: f.tech!,
      });
      await move(tx, {
        hospitalId: f.h!,
        location,
        batchId,
        kind: "received",
        quantity: qty,
        sourceKind: "delivery",
        actorUserId: f.tech!,
        effectiveAt: new Date(),
      });
      return batchId;
    });
  let seq = 0;
  const dispatch = (opts: { kind?: string; witness?: string | null; to?: string } = {}) =>
    id(
      `INSERT INTO public.pharmacy_issues
         (hospital_id, kind, from_location_id, to_location_id, issued_by, voucher, dispatch_kind, witness_id)
       VALUES ($1, 'issue', $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        f.h,
        f.store,
        opts.to ?? f.place,
        f.tech,
        `RIV-${String(++seq).padStart(4, "0")}`,
        opts.kind ?? "requisition",
        opts.witness ?? null,
      ],
    );
  /** The store → transit leg of a dispatch. */
  const send = (
    issueId: string,
    batchId: string,
    quantity: number,
    witnessAttestationId?: string,
  ) =>
    as(async (tx) => {
      const from = await loadLocation(tx, f.h!, f.store!);
      const to = await loadLocation(tx, f.h!, f.transit!);
      await movePair(tx, {
        pair: "issue",
        hospitalId: f.h!,
        from,
        to,
        batch: await batchRef(tx, f.h!, batchId, f.store!),
        quantity,
        sourceId: issueId,
        actorUserId: f.tech!,
        effectiveAt: new Date(),
        witnessAttestationId,
      });
    });
  /** An approval by the in-charge on their own device (S3), usable once. */
  const approval = () =>
    id(
      `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, method, outcome, attested_at)
       VALUES ($1, $2, $3, 'witness', 'issue', 'session', 'passed', now()) RETURNING id`,
      [f.h, f.tech, f.boss],
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Store lane");
    const s = Date.now();
    f.pharm = await id(
      `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
       VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
      [f.h, `pharmacy-store-${s}`],
    );
    f.storeDept = await id(
      `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
       VALUES ($1, $2, 'Main store', $3, 'support') RETURNING id`,
      [f.h, f.pharm, `store-store-${s}`],
    );
    f.store = await id(
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name, live_at)
       VALUES ($1, 'store', $2, 'Main store', now()) RETURNING id`,
      [f.h, f.storeDept],
    );
    f.place = await id(
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, name, live_at)
       VALUES ($1, 'clinic', 'EPI clinic', now()) RETURNING id`,
      [f.h],
    );
    f.quarantine = await id(
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, name, live_at)
       VALUES ($1, 'quarantine', 'Q-shelf', now()) RETURNING id`,
      [f.h],
    );
    f.boss = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharm, cadre: "PHARMACIST" })
    ).userId;
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.pharm, f.boss],
    );
    f.tech = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharm, cadre: "PHARMACIST" })
    ).userId;
    f.transit = (
      await pg.query<{ id: string }>(`SELECT private.pharmacy_transit_location($1) AS id`, [f.h])
    ).rows[0]!.id;
  }, 240_000);

  it("the voucher sequence runs per prefix and per hospital", async () => {
    const next = async (p: string) =>
      (await pg.query<{ v: string }>(`SELECT private.pharmacy_next_voucher($1, $2) AS v`, [f.h, p]))
        .rows[0]!.v;
    expect(await next("GRN")).toBe("GRN-0001");
    expect(await next("GRN")).toBe("GRN-0002");
    expect(await next("CNT")).toBe("CNT-0001");
  });

  it("one transit location per hospital", async () => {
    const again = await pg.query<{ id: string }>(
      `SELECT private.pharmacy_transit_location($1) AS id`,
      [f.h],
    );
    expect(again.rows[0]!.id).toBe(f.transit);
    expect(
      await hint(
        pg.query(
          `INSERT INTO public.pharmacy_locations (hospital_id, kind, name) VALUES ($1, 'transit', 'Another')`,
          [f.h],
        ),
      ),
    ).toMatch(/pl_one_transit/);
  });

  it("a balance never goes below zero", async () => {
    const p = await product("Below zero");
    const b = await stock(p, "BZ1", 200, 5);
    expect(await hint(send(await dispatch(), b, 6))).toMatch(/below_zero/);
  });

  it("first expiry first; straight and expiry moves may take another batch", async () => {
    const p = await product("Fefo");
    const early = await stock(p, "F-EARLY", 100, 5);
    const late = await stock(p, "F-LATE", 300, 5);
    expect(await hint(send(await dispatch(), late, 2))).toBe("fefo");
    expect(await hint(send(await dispatch({ kind: "straight" }), late, 1))).toBe("ok");
    expect(await hint(send(await dispatch({ kind: "expiry_move" }), late, 1))).toBe("ok");
    expect(await hint(send(await dispatch(), early, 5))).toBe("ok");
    // Spent: the later batch is now the first.
    expect(await hint(send(await dispatch(), late, 1))).toBe("ok");
  });

  it("a controlled line needs a witness who is not the issuer", async () => {
    const p = await product("Morphine fixture", { cd: "class_a" });
    const b = await stock(p, "CD1", 200, 10);
    expect(await hint(send(await dispatch(), b, 1))).toBe("witness");
    expect(await hint(dispatch({ witness: f.tech! }))).toMatch(/pis_witness/);
    const issueId = await dispatch({ witness: f.boss! });
    // The ledger's own S3 rule still stands: the approval, then the dispatch's witness.
    expect(await hint(send(issueId, b, 1))).toBe("witness_needed");
    expect(await hint(send(issueId, b, 1, await approval()))).toBe("ok");
    // The arrival takes no second witness.
    await pg.query(
      `INSERT INTO public.pharmacy_issue_confirmations (issue_id, hospital_id, confirmed_by) VALUES ($1, $2, $3)`,
      [issueId, f.h, f.tech],
    );
    const [leg] = (
      await pg.query<{ batch_id: string }>(
        `SELECT batch_id FROM public.pharmacy_stock_movements WHERE source_id = $1 AND location_id = $2`,
        [issueId, f.transit],
      )
    ).rows;
    expect(
      await hint(
        as(async (tx) => {
          await movePair(tx, {
            pair: "issue",
            hospitalId: f.h!,
            from: await loadLocation(tx, f.h!, f.transit!),
            to: await loadLocation(tx, f.h!, f.place!),
            batch: await batchRef(tx, f.h!, leg!.batch_id, f.transit!),
            quantity: 1,
            sourceId: issueId,
            actorUserId: f.tech!,
            effectiveAt: new Date(),
          });
        }),
      ),
    ).toBe("ok");
  });

  it("a dispatch reaches the place only when it is confirmed", async () => {
    const p = await product("Transit");
    const b = await stock(p, "T1", 200, 10);
    const issueId = await dispatch();
    await send(issueId, b, 4);
    const [leg] = (
      await pg.query<{ batch_id: string }>(
        `SELECT batch_id FROM public.pharmacy_stock_movements
          WHERE source_id = $1 AND location_id = $2 AND kind = 'received_from_issue'`,
        [issueId, f.transit],
      )
    ).rows;
    const arrive = () =>
      as(async (tx) => {
        const transit = await loadLocation(tx, f.h!, f.transit!);
        const place = await loadLocation(tx, f.h!, f.place!);
        await movePair(tx, {
          pair: "issue",
          hospitalId: f.h!,
          from: transit,
          to: place,
          batch: await batchRef(tx, f.h!, leg!.batch_id, f.transit!),
          quantity: 4,
          sourceId: issueId,
          actorUserId: f.tech!,
          effectiveAt: new Date(),
        });
      });
    expect(await hint(arrive())).toBe("not_confirmed");
    await pg.query(
      `INSERT INTO public.pharmacy_issue_confirmations (issue_id, hospital_id, confirmed_by, note)
       VALUES ($1, $2, $3, 'One box dented')`,
      [issueId, f.h, f.tech],
    );
    expect(await hint(arrive())).toBe("ok");
    const at = await pg.query<{ n: number }>(
      `SELECT coalesce(sum(quantity), 0)::int AS n FROM public.pharmacy_stock_movements m
         JOIN public.pharmacy_batches b ON b.id = m.batch_id
        WHERE b.product_id = $1 AND m.location_id = $2`,
      [p, f.place],
    );
    expect(at.rows[0]!.n).toBe(4);
  });

  it("issuing from quarantine or an expired batch is refused", async () => {
    const p = await product("Quarantined");
    const b = await stock(p, "Q1", 200, 3);
    await as(async (tx) => {
      const from = await loadLocation(tx, f.h!, f.store!);
      const to = await loadLocation(tx, f.h!, f.quarantine!);
      await movePair(tx, {
        pair: "quarantine",
        hospitalId: f.h!,
        from,
        to,
        batch: await batchRef(tx, f.h!, b, f.store!),
        quantity: 3,
        sourceId: crypto.randomUUID(),
        actorUserId: f.tech!,
        effectiveAt: new Date(),
        reasonCode: "recalled",
      });
    });
    const q = (
      await pg.query<{ id: string }>(
        `SELECT id FROM public.pharmacy_batches WHERE product_id = $1 AND location_id = $2`,
        [p, f.quarantine],
      )
    ).rows[0]!.id;
    const out = as(async (tx) => {
      const from = await loadLocation(tx, f.h!, f.quarantine!);
      await move(tx, {
        hospitalId: f.h!,
        location: from,
        batchId: q,
        kind: "supplied",
        quantity: -1,
        sourceKind: "adjustment",
        actorUserId: f.tech!,
        effectiveAt: new Date(),
      });
    });
    expect(await hint(out)).toBe("quarantined");
  });

  it("cold-chain lines are put away first; only the person who put it away undoes it", async () => {
    const cold = await product("Insulin fixture", { cold: true });
    const dry = await product("Dry line");
    const c = await stock(cold, "COLD1", 200, 5);
    const d = await stock(dry, "DRY1", 200, 5);
    const put = (batch: string, shelf: string, by = f.tech!) =>
      id(
        `INSERT INTO public.pharmacy_batch_shelves (hospital_id, batch_id, shelf, actor_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [f.h, batch, shelf, by],
      );
    expect(await hint(put(d, "A-01"))).toBe("cold_first");
    const row = await put(c, "CR-01");
    expect(await hint(put(d, "A-01"))).toBe("ok");
    const undo = (by: string) =>
      pg.query(
        `INSERT INTO public.pharmacy_batch_shelves (hospital_id, batch_id, shelf, actor_id, undoes) VALUES ($1, $2, NULL, $3, $4)`,
        [f.h, c, by, row],
      );
    expect(await hint(undo(f.boss!))).toBe("undo_own");
    expect(await hint(undo(f.tech!))).toBe("ok");
    // Waiting again: the dry line can no longer go on.
    const dry2 = await product("Dry line two");
    const d2 = await stock(dry2, "DRY2", 200, 5);
    expect(await hint(put(d2, "A-02"))).toBe("cold_first");
    await put(c, "CR-01");
    await put(d2, "A-02");
  });

  it("a count over the sign-off value posts only once the in-charge signs; a stock-take cannot close early", async () => {
    const p = await product("Counted");
    const b = await stock(p, "CNT1", 200, 10);
    const shelf = (code: string) =>
      id(
        `INSERT INTO public.pharmacy_shelves (hospital_id, location_id, code, name, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [f.h, f.store, code, `Shelf ${code}`, f.tech],
      );
    const s1 = await shelf("A");
    const s2 = await shelf("B");
    const take = await id(
      `INSERT INTO public.pharmacy_stocktakes (hospital_id, location_id, started_by) VALUES ($1, $2, $3) RETURNING id`,
      [f.h, f.store, f.tech],
    );
    const count = (shelfId: string, voucher: string, diff: number) =>
      id(
        `INSERT INTO public.pharmacy_shelf_counts (hospital_id, shelf_id, stocktake_id, voucher, counted_by, diff_value, sign_over)
         VALUES ($1, $2, $3, $4, $5, $6, 50000) RETURNING id`,
        [f.h, shelfId, take, voucher, f.tech, diff],
      );
    const c1 = await count(s1, "CNT-0101", 50_001);
    const post = () =>
      as(async (tx) => {
        const location = await loadLocation(tx, f.h!, f.store!);
        await move(tx, {
          hospitalId: f.h!,
          location,
          batchId: b,
          kind: "count_correction",
          quantity: -1,
          sourceKind: "count",
          sourceId: c1,
          actorUserId: f.tech!,
          effectiveAt: new Date(),
          reasonCode: "count",
          reasonNote: "Short by one",
        });
      });
    expect(await hint(post())).toBe("needs_sign");
    const close = (by: string) =>
      pg.query(
        `UPDATE public.pharmacy_stocktakes SET closed_by = $2, closed_at = now(), report = '{}'::jsonb WHERE id = $1`,
        [take, by],
      );
    expect(await hint(close(f.tech!))).toBe("in_charge_only");
    expect(await hint(close(f.boss!))).toBe("uncounted");
    const c2 = await count(s2, "CNT-0102", 50_000);
    expect(
      (
        await pg.query<{ needs_sign: boolean }>(
          `SELECT needs_sign FROM public.pharmacy_shelf_counts WHERE id = $1`,
          [c2],
        )
      ).rows[0]!.needs_sign,
    ).toBe(false);
    expect(await hint(close(f.boss!))).toBe("unsigned");
    const sign = (by: string) =>
      pg.query(
        `UPDATE public.pharmacy_shelf_counts SET signed_by = $2, signed_at = now() WHERE id = $1`,
        [c1, by],
      );
    expect(await hint(sign(f.tech!))).toBe("in_charge_only");
    expect(await hint(sign(f.boss!))).toBe("ok");
    expect(await hint(sign(f.boss!))).toBe("count_fixed");
    expect(await hint(post())).toBe("ok");
    expect(await hint(close(f.boss!))).toBe("ok");
    expect(await hint(close(f.boss!))).toBe("stocktake_fixed");
  });

  it("a V line is never trimmed; other lines may be", async () => {
    const v = await product("Vital", { ven: "V" });
    const n = await product("Non-essential", { ven: "N" });
    const order = await id(
      `INSERT INTO public.pharmacy_orders (hospital_id, kind, cut_at, created_by) VALUES ($1, 'cycle', now(), $2) RETURNING id`,
      [f.h, f.tech],
    );
    const line = (productId: string, medicine: string) =>
      pg.query(
        `INSERT INTO public.pharmacy_order_lines (order_id, medicine_id, product_id, inputs, chosen_units, cut)
         VALUES ($1, $2, $3, '{}', 10, '{"to":2}')`,
        [order, medicine, productId],
      );
    expect(await hint(line(v, "vital"))).toBe("vital_trim");
    expect(await hint(line(n, "non_essential"))).toBe("ok");
  });

  it("destroying needs a witness who is not the decider", async () => {
    const p = await product("Destroyed");
    const b = await stock(p, "D1", 200, 3);
    const decide = (witness: string | null) =>
      pg.query(
        `INSERT INTO public.pharmacy_quarantine_decisions (hospital_id, batch_id, decided, qty, value_ugx, voucher, witness_id, decided_by)
         VALUES ($1, $2, 'destroy', 3, 3000, 'ADJ-0001', $3, $4)`,
        [f.h, b, witness, f.tech],
      );
    expect(await hint(decide(null))).toMatch(/pqd_witness/);
    expect(await hint(decide(f.tech!))).toMatch(/pqd_witness/);
    expect(await hint(decide(f.boss!))).toBe("ok");
  });

  it("theft or a controlled loss opens a case; a controlled loss needs a witness", async () => {
    const dry = await product("Lost");
    const cd = await product("Lost CD", { cd: "class_a" });
    const a = await stock(dry, "L1", 200, 5);
    const c = await stock(cd, "L2", 200, 5);
    const caseId = (
      await pg.query<{ id: string }>(
        `SELECT private.pharmacy_open_case($1, 'loss', gen_random_uuid(), 'lost', $2, 1, 'high', $3, now()) AS id`,
        [f.h, f.store, f.tech],
      )
    ).rows[0]!.id;
    const loss = (batch: string, reason: string, witness: string | null, kase: string | null) =>
      pg.query(
        `INSERT INTO public.pharmacy_store_losses (hospital_id, location_id, batch_id, qty, reason, note, value_ugx, voucher, witness_id, case_id, recorded_by)
         VALUES ($1, $2, $3, 1, $4, 'What happened', 1000, 'ADJ-0002', $5, $6, $7)`,
        [f.h, f.store, batch, reason, witness, kase, f.tech],
      );
    expect(await hint(loss(a, "missing", null, null))).toBe("case");
    expect(await hint(loss(a, "damaged", null, null))).toBe("ok");
    expect(await hint(loss(a, "missing", null, caseId))).toBe("ok");
    expect(await hint(loss(c, "damaged", null, caseId))).toBe("witness");
    expect(await hint(loss(c, "damaged", f.boss!, null))).toBe("case");
    expect(await hint(loss(c, "damaged", f.boss!, caseId))).toBe("ok");
  });

  it("the monthly balance view: opening + received − used − sent + adjusted = closing", async () => {
    const p = await product("Balanced");
    const b = await stock(p, "B1", 200, 20, f.place!);
    await as(async (tx) => {
      const location = await loadLocation(tx, f.h!, f.place!);
      await move(tx, {
        hospitalId: f.h!,
        location,
        batchId: b,
        kind: "adjusted",
        quantity: -2,
        sourceKind: "adjustment",
        actorUserId: f.tech!,
        effectiveAt: new Date(),
        reasonCode: "damaged",
        reasonNote: "Crushed",
      });
    });
    const r = await pg.query<Record<string, string>>(
      `SELECT * FROM public.pharmacy_place_balance_month WHERE product_id = $1 AND location_id = $2`,
      [p, f.place],
    );
    const row = r.rows[0]!;
    expect(Number(row.received)).toBe(20);
    expect(Number(row.adjusted)).toBe(-2);
    expect(Number(row.opening)).toBe(0);
    expect(Number(row.closing)).toBe(18);
    expect(Number(row.unexplained)).toBe(2);
  });

  it("a topup run: one active per place, one log per day", async () => {
    const run = await id(
      `INSERT INTO public.pharmacy_topup_runs (hospital_id, location_id, weekdays, at, created_by)
       VALUES ($1, $2, '{2,5}', '10:00', $3) RETURNING id`,
      [f.h, f.place, f.tech],
    );
    expect(
      await hint(
        pg.query(
          `INSERT INTO public.pharmacy_topup_runs (hospital_id, location_id, weekdays, at, created_by)
           VALUES ($1, $2, '{1}', '10:00', $3)`,
          [f.h, f.place, f.tech],
        ),
      ),
    ).toMatch(/ptr_one/);
    const i1 = await dispatch({ kind: "topup" });
    const i2 = await dispatch({ kind: "topup" });
    const log = (issue: string) =>
      pg.query(
        `INSERT INTO public.pharmacy_topup_run_log (hospital_id, run_id, on_date, issue_id) VALUES ($1, $2, current_date, $3)`,
        [f.h, run, issue],
      );
    expect(await hint(log(i1))).toBe("ok");
    expect(await hint(log(i2))).toMatch(/run_id|unique/);
  });

  it("the dev seed runs through every guard, at a fresh hospital", async () => {
    const h = await hospital(pg, "Seeded store");
    const s2 = Date.now();
    const dept = await id(
      `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
       VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
      [h, `pharmacy-seed-${s2}`],
    );
    const sub = await id(
      `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
       VALUES ($1, $2, 'Main store', $3, 'support') RETURNING id`,
      [h, dept, `store-seed-${s2}`],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name, live_at)
       VALUES ($1, 'store', $2, 'Main store', now())`,
      [h, sub],
    );
    const boss = (await staff(pg, { hospitalId: h, departmentId: dept, cadre: "PHARMACIST" }))
      .userId;
    const keeper = (await staff(pg, { hospitalId: h, departmentId: dept, cadre: "PHARMACIST" }))
      .userId;
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [h, dept, boss],
    );
    for (const u of [boss, keeper])
      await pg.query(
        `INSERT INTO public.pharmacy_roster_people (hospital_id, user_id, cadre, places, added_by)
         VALUES ($1, $2, 'pharmacist', ARRAY[$3::uuid], $2)`,
        [h, u, sub],
      );
    await pg.query(
      `INSERT INTO public.pharmacy_suppliers (hospital_id, name, updated_by) VALUES ($1, 'NMS', $2)`,
      [h, boss],
    );
    const r = await seedStore(lane.db as never, h);
    expect(r).toEqual({ ok: true });
    const again = await seedStore(lane.db as never, h);
    expect(again).toEqual({ skipped: "already seeded" });
  }, 120_000);
});
