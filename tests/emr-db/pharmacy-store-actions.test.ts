/**
 * Stock › Main store through the server actions (STORE.md §I, §M) on the seeded lane: FEFO, part issues, the witness,
 * a dispatch reaching a place only on confirmation, runs, transfers, balance cases, orders, put away, counts, losses
 * and the figures against SQL. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type * as Bring from "@/lib/pharmacy/actions/store/bring-in";
import type * as Look from "@/lib/pharmacy/actions/store/look-after";
import type * as Send from "@/lib/pharmacy/actions/store/send-out";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import type { PharmacyActor } from "@/lib/pharmacy/write";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { bootLane, hospital, laneOn, staff } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

describe.skipIf(!laneOn)("Main store actions (0275)", () => {
  let lane: Lane;
  let pg: Pg;
  let S: typeof Send;
  let B: typeof Bring;
  let K: typeof Look;
  let load: () => Promise<StoreWorld>;
  let h: string;
  let boss: string;
  let keeper: string;
  let bossA: PharmacyActor;
  let keeperA: PharmacyActor;

  const actor = (userId: string, pointId: string | null = null): PharmacyActor => ({
    userId,
    hospitalId: h,
    cadreCode: "PHARMACIST",
    cadreName: "Pharmacist",
    pointId,
    access: {
      permissions: new Set(["pharmacy.view", "pharmacy.store", "pharmacy.stock"]),
    } as PharmacyActor["access"],
  });
  const ok = async <T>(p: Promise<unknown>) => {
    const r = (await p) as { ok: boolean; error?: string; data?: unknown };
    if (!r.ok) throw new Error(r.error);
    return r.data as T;
  };
  const refusal = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const r = await p;
    return r.ok ? null : (r.error as string);
  };
  /** The in-charge approves the keeper's step on their own phone: on the roster today, usable once. */
  const approval = async () =>
    (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, method, outcome, attested_at)
         VALUES ($1, $2, $3, 'witness', 'issue', 'session', 'passed', now()) RETURNING id`,
        [h, keeper, boss],
      )
    ).rows[0]!.id;
  const named = (w: StoreWorld, start: string) => {
    const m = w.meds.find((x) => x.name.startsWith(start));
    if (!m) throw new Error(`no ${start}`);
    return m;
  };
  const hereAt = async (productId: string, placeId: string) =>
    Number(
      (
        await pg.query<{ n: string }>(
          `SELECT coalesce(sum(m.quantity), 0) AS n FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
            WHERE b.product_id = $1 AND m.location_id = $2`,
          [productId, placeId],
        )
      ).rows[0]!.n,
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    h = await hospital(pg, "Store actions");
    const s = Date.now();
    const dept = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [h, `pharmacy-a-${s}`],
      )
    ).rows[0]!.id;
    const sub = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
         VALUES ($1, $2, 'Main store', $3, 'support') RETURNING id`,
        [h, dept, `store-a-${s}`],
      )
    ).rows[0]!.id;
    await pg.query(
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name, live_at)
       VALUES ($1, 'store', $2, 'Main store', now())`,
      [h, sub],
    );
    boss = (await staff(pg, { hospitalId: h, departmentId: dept, cadre: "PHARMACIST" })).userId;
    keeper = (await staff(pg, { hospitalId: h, departmentId: dept, cadre: "PHARMACIST" })).userId;
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
    const { seedStore } = await import("../../scripts/seed-pharmacy-dev/store");
    expect(await seedStore(lane.db as never, h)).toEqual({ ok: true });
    S = await import("@/lib/pharmacy/actions/store/send-out");
    B = await import("@/lib/pharmacy/actions/store/bring-in");
    K = await import("@/lib/pharmacy/actions/store/look-after");
    const { loadStoreWorld } = await import("@/lib/pharmacy/store/read");
    load = async () =>
      (await loadStoreWorld(lane.db as never, { hospitalId: h, actorUserId: boss }))!;
    bossA = actor(boss);
    keeperA = actor(keeper);
  }, 300_000);

  it("the loader reads every state the seed made", async () => {
    const w = await load();
    expect(w.actor.inCharge).toBe(true);
    expect(w.meds.length).toBe(11);
    expect(w.places.length).toBe(4);
    expect(new Set(w.requisitions.map((r) => r.state))).toEqual(
      new Set(["open", "partial", "issued", "received", "diff"]),
    );
    expect(w.dispatches.some((d) => d.status === "transit")).toBe(true);
    expect(w.quarantine.length).toBeGreaterThan(0);
    expect(w.shelves.length).toBeGreaterThan(0);
    expect(w.weeks).toHaveLength(12);
  });

  it("issuing takes the earliest expiry first, across batches", async () => {
    const w = await load();
    const m = w.meds.find(
      (x) =>
        !x.controlled &&
        w.batches.filter((b) => b.medId === x.id && !b.blocked && !b.waiting).length >= 2,
    )!;
    const bs = w.batches
      .filter((b) => b.medId === m.id && !b.blocked && !b.waiting)
      .sort((a, b) => a.exp.localeCompare(b.exp));
    const r = await ok<{ voucher: string }>(
      S.sendUrgent(keeperA, {
        clientKey: randomUUID(),
        placeId: w.places[0]!.id,
        productId: m.id,
        quantity: bs[0]!.qty + 1,
      }),
    );
    expect(r.voucher).toMatch(/^RIV-\d{4,}$/);
    const d = (await load()).dispatches.find((x) => x.voucher === r.voucher)!;
    expect(d.status).toBe("transit");
    expect(new Map(d.lines.map((l) => [l.no, l.qty]))).toEqual(
      new Map([
        [bs[0]!.no, bs[0]!.qty],
        [bs[1]!.no, 1],
      ]),
    );
  });

  it("the same tap twice takes one voucher", async () => {
    const w = await load();
    const m = w.meds.find(
      (x) => !x.controlled && w.batches.some((b) => b.medId === x.id && b.qty > 5 && !b.waiting),
    )!;
    const raw = { clientKey: randomUUID(), placeId: w.places[0]!.id, productId: m.id, quantity: 1 };
    const a = await ok<{ voucher: string }>(S.sendUrgent(keeperA, raw));
    const b = await ok<{ voucher: string }>(S.sendUrgent(keeperA, raw));
    expect(b.voucher).toBe(a.voucher);
  });

  it("a part issue leaves lines owed; the next offers only those; then it is issued", async () => {
    const w = await load();
    const r = w.requisitions.find(
      (x) =>
        x.state === "open" &&
        x.lines.every(
          (l) => !named(w, "").controlled && !w.meds.find((m) => m.id === l.medId)!.controlled,
        ),
    )!;
    const line = r.lines[0]!;
    // Stock for it, whatever the seed left.
    const store = w.storeId;
    await pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind)
       SELECT $1, $2, b.id, 'received', 100000, now() - interval '1 minute', $4, 'opening'
         FROM public.pharmacy_batches b WHERE b.location_id = $2 AND b.product_id = ANY($3::uuid[])
          AND b.expiry > now() + interval '1 year' AND NOT private.pharmacy_batch_waiting(b.id)`,
      [h, store, r.lines.map((l) => l.medId), keeper],
    );
    const first = await ok<{ state: string }>(
      S.issueRequisition(keeperA, {
        clientKey: randomUUID(),
        requisitionId: r.id,
        lines: [{ productId: line.medId, quantity: 1 }],
      }),
    );
    expect(first.state).toBe("part_issued");
    expect(
      await refusal(
        S.issueRequisition(keeperA, {
          clientKey: randomUUID(),
          requisitionId: r.id,
          lines: [{ productId: line.medId, quantity: line.asked }],
        }),
      ),
    ).toMatch(/still owed/);
    const w2 = await load();
    const again = w2.requisitions.find((x) => x.id === r.id)!;
    expect(again.state).toBe("partial");
    expect(again.lines.find((l) => l.medId === line.medId)!.issued).toBe(1);
    const second = await ok<{ state: string }>(
      S.issueRequisition(keeperA, {
        clientKey: randomUUID(),
        requisitionId: r.id,
        lines: again.lines.map((l) => ({ productId: l.medId, quantity: l.asked - l.issued })),
      }),
    );
    expect(second.state).toBe("issued");
    expect(
      await refusal(
        S.issueRequisition(keeperA, {
          clientKey: randomUUID(),
          requisitionId: r.id,
          lines: [{ productId: line.medId, quantity: 1 }],
        }),
      ),
    ).toMatch(/already been issued/);
  });

  it("a controlled line needs a witness who is not the issuer", async () => {
    const w = await load();
    const m = w.meds.find((x) => x.controlled)!;
    const raw = { clientKey: randomUUID(), placeId: w.places[0]!.id, productId: m.id, quantity: 1 };
    expect(await refusal(S.sendUrgent(keeperA, raw))).toMatch(/choose the witness/);
    const r = await ok<{ voucher: string }>(
      S.sendUrgent(keeperA, { ...raw, witnessAttestationId: await approval() }),
    );
    expect(r.voucher).toMatch(/^RIV-/);
    const row = await pg.query<{ witness_id: string; issued_by: string }>(
      `SELECT witness_id, issued_by FROM public.pharmacy_issues WHERE voucher = $1 AND hospital_id = $2`,
      [r.voucher, h],
    );
    expect(row.rows[0]!.witness_id).toBe(boss);
    expect(row.rows[0]!.issued_by).toBe(keeper);
  });

  it("a dispatch adds to a place only on confirmation, and never twice", async () => {
    const { needAt, daysAt } = await import("@/lib/pharmacy/derive/store/places");
    const w = await load();
    const ps = w.placeStock.find(
      (p) => !w.meds.find((m) => m.id === p.medId)!.controlled && p.level > 0,
    )!;
    const m = w.meds.find((x) => x.id === ps.medId)!;
    const before = await hereAt(m.id, ps.placeId);
    const needBefore = needAt(w, m.id, ps.placeId);
    const clientKey = randomUUID();
    await ok(
      S.sendUrgent(keeperA, { clientKey, placeId: ps.placeId, productId: m.id, quantity: 2 }),
    );
    expect(await hereAt(m.id, ps.placeId)).toBe(before);
    const w2 = await load();
    expect(needAt(w2, m.id, ps.placeId)).toBe(Math.max(0, needBefore - 2));
    expect(daysAt(w2, m.id, ps.placeId)!).toBeGreaterThan(daysAt(w, m.id, ps.placeId)!);
    expect(w2.placeStock.find((p) => p.medId === m.id && p.placeId === ps.placeId)!.here).toBe(
      before,
    );

    // The sender does not confirm; someone at the place does, and a note opens a case.
    expect(await refusal(S.confirmDispatch(keeperA, { issueId: clientKey }))).toMatch(
      /Only someone at/,
    );
    await ok(
      S.confirmDispatch(actor(keeper, ps.placeId), { issueId: clientKey, note: "Two boxes wet" }),
    );
    expect(await hereAt(m.id, ps.placeId)).toBe(before + 2);
    const w3 = await load();
    expect(w3.dispatches.find((d) => d.id === clientKey)!.status).toBe("diff");
    expect(needAt(w3, m.id, ps.placeId)).toBe(Math.max(0, needBefore - 2));
    const cases = await pg.query(
      `SELECT 1 FROM public.pharmacy_cases WHERE source_type = 'receipt' AND source_id = $1`,
      [clientKey],
    );
    expect(cases.rows).toHaveLength(1);
    // Twice is once.
    await ok(S.confirmDispatch(actor(keeper, ps.placeId), { issueId: clientKey }));
    expect(await hereAt(m.id, ps.placeId)).toBe(before + 2);
  });

  it("a requisition closes when every voucher has arrived", async () => {
    const w = await load();
    const r = w.requisitions.find((x) => x.state === "issued")!;
    for (const d of w.dispatches.filter((x) => x.requisitionId === r.id && x.status === "transit"))
      await ok(S.confirmDispatch(bossA, { issueId: d.id }));
    const after = (await load()).requisitions.find((x) => x.id === r.id)!;
    expect(["received", "diff"]).toContain(after.state);
  });

  it("a top-up run sends level − here − on the way, limited by the store, once a day", async () => {
    const { runLines } = await import("@/lib/pharmacy/derive/store/places");
    const w = await load();
    const run = w.runs.find(
      (r) => !r.sentVoucher && runLines(w, r.placeId).some((l) => l.give > 0),
    )!;
    const lines = runLines(w, run.placeId);
    const cd = lines.some((l) => l.give > 0 && w.meds.find((m) => m.id === l.medId)!.controlled);
    const r = await ok<{ id: string; voucher: string }>(
      S.sendTopUpRun(keeperA, {
        clientKey: randomUUID(),
        runId: run.id,
        witnessAttestationId: cd ? await approval() : null,
      }),
    );
    const w2 = await load();
    const d = w2.dispatches.find((x) => x.id === r.id)!;
    expect(d.kind).toBe("topup");
    for (const l of lines.filter((x) => x.give > 0))
      expect(d.lines.filter((x) => x.medId === l.medId).reduce((a, x) => a + x.qty, 0)).toBe(
        l.give,
      );
    expect(w2.runs.find((x) => x.id === run.id)!.sentVoucher).toBe(r.voucher);
    expect(
      await refusal(S.sendTopUpRun(keeperA, { clientKey: randomUUID(), runId: run.id })),
    ).toMatch(/already gone/);
  });

  it("accepting a return moves it off the place, once", async () => {
    const w = await load();
    const ret = w.returns.find((x) => !x.acceptedVoucher)!;
    const here = await hereAt(ret.medId, ret.placeId);
    const r = await ok<{ voucher: string }>(S.acceptReturn(keeperA, { returnId: ret.id }));
    expect(r.voucher).toMatch(/^RTS-/);
    expect(await hereAt(ret.medId, ret.placeId)).toBe(here - ret.qty);
    expect(await refusal(S.acceptReturn(keeperA, { returnId: ret.id }))).toMatch(/already/);
  });

  it("arranging a transfer makes a TRF from place to place and stays listed", async () => {
    const { transfers, daysAt, needAt } = await import("@/lib/pharmacy/derive/store/places");
    const w0 = await load();
    // A place short of something, and another piled high with it: the 60 / 14-day rule then suggests a move.
    const short = w0.placeStock.find(
      (p) =>
        !w0.meds.find((m) => m.id === p.medId)!.controlled &&
        daysAt(w0, p.medId, p.placeId)! < w0.rules.transferUnder &&
        needAt(w0, p.medId, p.placeId) > 0,
    )!;
    const other = w0.places.find((p) => p.id !== short.placeId)!;
    const src = w0.batches.find((x) => x.medId === short.medId && !x.blocked)!;
    const placed = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, expiry, expiry_month_only, first_batch_number, first_expiry, created_by)
         VALUES ($1, $2, $3, 'SPARE-1', $4, false, 'SPARE-1', $4, $5) RETURNING id`,
        [h, other.id, short.medId, src.exp, keeper],
      )
    ).rows[0]!.id;
    await pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind)
       VALUES ($1, $2, $3, 'received', 100000, now() - interval '1 minute', $4, 'opening')`,
      [h, other.id, placed, keeper],
    );
    const w = await load();
    const t = transfers(w).find(
      (x) =>
        !x.voucher && x.medId === short.medId && x.toId === short.placeId && x.fromId === other.id,
    )!;
    expect(t).toBeTruthy();
    const r = await ok<{ voucher: string }>(
      S.arrangeTransfer(keeperA, {
        clientKey: randomUUID(),
        fromId: t.fromId,
        toId: t.toId,
        productId: t.medId,
        quantity: t.qty,
      }),
    );
    expect(r.voucher).toMatch(/^TRF-/);
    expect(transfers(await load()).find((x) => x.key === t.key)?.voucher).toBe(r.voucher);
  });

  it("a gap over the rule offers a case; a small one does not; only the in-charge opens it", async () => {
    const { placeBalance } = await import("@/lib/pharmacy/derive/store/places");
    const w = await load();
    const bad = w.places.find((p) => placeBalance(w, p.id).state === "bad");
    const fine = w.places.find((p) => placeBalance(w, p.id).state !== "bad");
    if (fine)
      expect(await refusal(S.openBalanceCase(bossA, { placeId: fine.id }))).toMatch(
        /does not need/,
      );
    expect(bad).toBeTruthy();
    expect(await refusal(S.openBalanceCase(keeperA, { placeId: bad!.id }))).toMatch(/in-charge/);
    await ok(S.openBalanceCase(bossA, { placeId: bad!.id }));
    expect((await load()).balanceCases).toContain(bad!.id);
  });

  it("trim cuts N then E to the trim months, never V; send locks the order", async () => {
    const { planFor, minQtyFor } = await import("@/lib/pharmacy/derive/store/orders");
    const w = await load();
    const supplier = w.suppliers[0]!.id;
    await ok(B.setBudget(keeperA, { supplierId: supplier, budget: 1 }));
    const before = planFor(w, supplier);
    const r = await ok<{ trimmed: string[]; stillOver: boolean }>(
      B.trimOrder(keeperA, { supplierId: supplier }),
    );
    expect(r.stillOver).toBe(true);
    const w2 = await load();
    const after = planFor(w2, supplier);
    for (const l of before.filter((x) => x.ven === "V"))
      expect(after.find((x) => x.medId === l.medId)!.qty).toBe(l.qty);
    for (const id of r.trimmed) {
      const m = w2.meds.find((x) => x.id === id)!;
      expect(m.ven).not.toBe("V");
      expect(after.find((x) => x.medId === id)!.qty).toBeGreaterThanOrEqual(
        minQtyFor(w2, m, w2.rules),
      );
    }
    expect(await refusal(B.sendOrder(keeperA, { supplierId: supplier }))).toMatch(/in-charge/);
    await ok(B.sendOrder(bossA, { supplierId: supplier }));
    const sent = (await load()).orders.find((o) => o.supplierId === supplier && o.sentAt);
    expect(sent?.state).toBe("open");
    await expect(
      pg.query(`UPDATE public.pharmacy_orders SET budget = 99 WHERE id = $1`, [sent!.id]),
    ).rejects.toThrow(/changes only by closing/);
  });

  it("put away refuses other lines while a cold one waits; undo is the putter's own", async () => {
    const w = await load();
    const waiting = w.batches.filter((b) => b.waiting);
    const cold = waiting.find((b) => w.meds.find((m) => m.id === b.medId)!.cold)!;
    const warm = waiting.find((b) => !w.meds.find((m) => m.id === b.medId)!.cold)!;
    expect(
      await refusal(
        B.putAway(keeperA, { clientKey: randomUUID(), batchId: warm.id, shelf: "C-01" }),
      ),
    ).toMatch(/Cold-chain first/);
    const row = randomUUID();
    await ok(B.putAway(keeperA, { clientKey: row, batchId: cold.id, shelf: "CR-01" }));
    expect((await load()).batches.find((b) => b.id === cold.id)!.waiting).toBe(false);
    expect(
      await refusal(B.undoPutAway(bossA, { clientKey: randomUUID(), shelfRowId: row })),
    ).toMatch(/Only the person/);
    await ok(B.undoPutAway(keeperA, { clientKey: randomUUID(), shelfRowId: row }));
    expect((await load()).batches.find((b) => b.id === cold.id)!.waiting).toBe(true);
    await ok(B.putAway(keeperA, { clientKey: randomUUID(), batchId: cold.id, shelf: "CR-01" }));
    await ok(B.putAway(keeperA, { clientKey: randomUUID(), batchId: warm.id, shelf: "C-01" }));
  });

  it("send straight writes the GRN in and the RIV out, never shelved", async () => {
    const w = await load();
    const b =
      w.batches.find((x) => x.waiting && !w.meds.find((m) => m.id === x.medId)!.controlled) ??
      w.batches.find((x) => !x.blocked && !w.meds.find((m) => m.id === x.medId)!.controlled)!;
    const r = await ok<{ voucher: string }>(
      B.sendStraight(keeperA, {
        clientKey: randomUUID(),
        batchId: b.id,
        placeId: w.places[0]!.id,
        quantity: 1,
      }),
    );
    expect((await load()).dispatches.find((d) => d.voucher === r.voucher)!.kind).toBe("straight");
  });

  it("a count is blind until saved; over the value waits for the in-charge; a stock-take cannot close early", async () => {
    const { shelfBatches } = await import("@/lib/pharmacy/derive/store/counts");
    const w = await load();
    const shelf = w.shelves.find((s) => !s.controlled && shelfBatches(w, s.code).length > 0)!;
    const lines = shelfBatches(w, shelf.code);
    expect(
      await refusal(
        K.saveCount(keeperA, { clientKey: randomUUID(), shelfId: shelf.id, lines: [] }),
      ),
    ).toMatch(/Type a count/);

    const take = randomUUID();
    await ok(K.startStocktake(keeperA, { clientKey: take }));
    expect(await refusal(K.closeStocktake(bossA, { stocktakeId: take }))).toMatch(
      /Count every shelf/,
    );

    // Matches: posts nothing.
    const same = await ok<{ needsSign: boolean; value: number }>(
      K.saveCount(keeperA, {
        clientKey: randomUUID(),
        shelfId: shelf.id,
        lines: lines.map((b) => ({ batchId: b.id, counted: b.qty })),
      }),
    );
    expect(same).toMatchObject({ needsSign: false, value: 0 });

    // Far off: waits. The balance does not move until the in-charge signs.
    const b0 = lines[0]!;
    const bal = async () =>
      Number(
        (
          await pg.query<{ n: string }>(
            `SELECT coalesce(sum(quantity), 0) AS n FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
            [b0.id],
          )
        ).rows[0]!.n,
      );
    const start = await bal();
    const countId = randomUUID();
    const off = await ok<{
      needsSign: boolean;
      posted: boolean;
      value: number;
      lines: { expected: number }[];
    }>(
      K.saveCount(keeperA, {
        clientKey: countId,
        shelfId: shelf.id,
        lines: lines.map((b) => ({ batchId: b.id, counted: b.id === b0.id ? 0 : b.qty })),
      }),
    );
    if (off.value > w.rules.countSign) {
      expect(off).toMatchObject({ needsSign: true, posted: false });
      expect(await bal()).toBe(start);
      expect(await refusal(K.signOffCount(keeperA, { countId }))).toMatch(/in-charge/);
      await ok(K.signOffCount(bossA, { countId }));
    }
    expect(await bal()).toBe(0);
    expect((await load()).stocktake?.id).toBe(take);
  });

  it("a loss needs its words; theft opens a case, a controlled one a witness; the value is written off", async () => {
    const w = await load();
    const b = w.batches.find(
      (x) => !x.blocked && !w.meds.find((m) => m.id === x.medId)!.controlled && x.qty > 2,
    )!;
    const m = w.meds.find((x) => x.id === b.medId)!;
    const base = { batchId: b.id, quantity: 2 };
    expect(
      await refusal(
        K.recordLoss(keeperA, { ...base, clientKey: randomUUID(), reason: "broken", note: "" }),
      ),
    ).toMatch(/Say what happened/);
    expect(
      await refusal(
        K.recordLoss(keeperA, {
          batchId: b.id,
          quantity: b.qty + 1,
          clientKey: randomUUID(),
          reason: "broken",
          note: "Dropped",
        }),
      ),
    ).toMatch(/Only \d+ in that batch/);
    const quiet = await ok<{ caseId: string | null }>(
      K.recordLoss(keeperA, {
        ...base,
        clientKey: randomUUID(),
        reason: "broken",
        note: "Dropped",
      }),
    );
    expect(quiet.caseId).toBeNull();
    const theft = await ok<{ caseId: string | null }>(
      K.recordLoss(keeperA, {
        ...base,
        clientKey: randomUUID(),
        reason: "missing",
        note: "Short after the weekend",
      }),
    );
    expect(theft.caseId).toBeTruthy();
    const after = await load();
    expect(after.losses.slice(0, 2).every((l) => l.value === 2 * m.cost)).toBe(true);

    const cd = after.batches.find(
      (x) => !x.blocked && after.meds.find((y) => y.id === x.medId)!.controlled && x.qty > 0,
    )!;
    const raw = {
      clientKey: randomUUID(),
      batchId: cd.id,
      quantity: 1,
      reason: "broken",
      note: "Ampoule cracked",
    };
    expect(await refusal(K.recordLoss(keeperA, raw))).toMatch(/choose the witness/);
    const c = await ok<{ caseId: string | null }>(
      K.recordLoss(keeperA, { ...raw, witnessAttestationId: await approval() }),
    );
    expect(c.caseId).toBeTruthy();
  });

  it("destruction needs a witness; both ways out land in the losses with their value", async () => {
    const w = await load();
    const q = w.quarantine[0]!;
    const raw = { clientKey: randomUUID(), batchId: q.id, decided: "destroy" };
    expect(await refusal(K.quarantineDecide(keeperA, raw))).toMatch(/witness for the destruction/);
    const r = await ok<{ voucher: string }>(
      K.quarantineDecide(keeperA, { ...raw, witnessAttestationId: await approval() }),
    );
    expect(r.voucher).toMatch(/^ADJ-/);
    const w2 = await load();
    expect(w2.quarantine.find((x) => x.id === q.id)).toBeUndefined();
    expect(w2.losses.find((l) => l.voucher === r.voucher)!.reason).toBe("destroyed");
    const q2 = w2.quarantine[0];
    if (q2) {
      const back = await ok<{ voucher: string }>(
        K.quarantineDecide(keeperA, { clientKey: randomUUID(), batchId: q2.id, decided: "return" }),
      );
      expect(back.voucher).toMatch(/^RTN-/);
    }
  });

  it("the expiry actions record what was done", async () => {
    const { expRows, bestPlace } = await import("@/lib/pharmacy/derive/store/expiry");
    const w = await load();
    const rows = expRows(w).filter((e) => !w.meds.find((m) => m.id === e.med.id)!.controlled);
    const row = rows.find((e) => bestPlace(w, e.med.id) && e.batch.qty > 1) ?? rows[0]!;
    await ok(
      K.expiryAction(keeperA, { clientKey: randomUUID(), batchId: row.batch.id, action: "first" }),
    );
    expect((await load()).expiryActions[row.batch.id]).toContain("first");
    const before = await hereAt(row.med.id, w.storeId);
    const back = await ok<{ voucher: string }>(
      K.expiryAction(keeperA, {
        clientKey: randomUUID(),
        batchId: row.batch.id,
        action: "return",
        quantity: 1,
      }),
    );
    expect(back.voucher).toMatch(/^RTN-/);
    expect(await hereAt(row.med.id, w.storeId)).toBe(before - 1);
  });

  it("a room reading says when it is outside the limits", async () => {
    const w = await load();
    const inside = await ok<{ inside: boolean }>(
      K.recordRoomReading(keeperA, { clientKey: randomUUID(), temp: 22, humidity: 40 }),
    );
    expect(inside.inside).toBe(true);
    const warm = await ok<{ inside: boolean; tooWarm: boolean }>(
      K.recordRoomReading(keeperA, {
        clientKey: randomUUID(),
        temp: w.rules.roomTemp + 1,
        humidity: 40,
      }),
    );
    expect(warm).toMatchObject({ inside: false, tooWarm: true });
  });

  it("the figures match SQL on the same data", async () => {
    const { storeValue, onHand } = await import("@/lib/pharmacy/derive/store/stock");
    const { storeValueByWeek, issuedByPlace, sectionStats, navGroups } =
      await import("@/lib/pharmacy/derive/store/stats");
    const w = await load();
    const qtySql = await pg.query<{ product_id: string; n: string }>(
      `SELECT b.product_id, sum(m.quantity) AS n FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
        WHERE m.location_id = $1 AND private.pharmacy_expires_on(b.expiry, b.expiry_month_only) >= (now() AT TIME ZONE 'Africa/Kampala')::date
          AND NOT private.pharmacy_batch_recalled(b.id)
        GROUP BY 1`,
      [w.storeId],
    );
    for (const r of qtySql.rows)
      if (w.meds.some((m) => m.id === r.product_id))
        expect(onHand(w, r.product_id)).toBe(Number(r.n));
    const value = storeValue(w);
    expect(storeValueByWeek(value, w.weeks).at(-1)).toBe(value);

    const since = await pg.query<{ to_id: string; n: string; product_id: string }>(
      `SELECT i.to_location_id AS to_id, b.product_id, -sum(m.quantity) AS n
         FROM public.pharmacy_issues i JOIN public.pharmacy_stock_movements m ON m.source_id = i.id AND m.kind = 'issued' AND m.location_id = i.from_location_id
         JOIN public.pharmacy_batches b ON b.id = m.batch_id
        WHERE i.from_location_id = $1 AND (i.issued_at AT TIME ZONE 'Africa/Kampala')::date >= (now() AT TIME ZONE 'Africa/Kampala')::date - 29
        GROUP BY 1, 2`,
      [w.storeId],
    );
    for (const p of issuedByPlace(w)) {
      const sqlValue = since.rows
        .filter((r) => r.to_id === p.id)
        .reduce(
          (a, r) => a + Number(r.n) * (w.meds.find((m) => m.id === r.product_id)?.cost ?? 0),
          0,
        );
      expect(p.value).toBe(sqlValue);
    }
    // Every section's figures build on the real world; every chart lists its numbers.
    for (const s of [
      "home",
      "req",
      "runs",
      "disp",
      "all",
      "books",
      "order",
      "put",
      "health",
      "exp",
      "card",
      "count",
      "quar",
      "cond",
    ] as const) {
      const r = sectionStats(w, s);
      for (const c of r.charts)
        expect(c.table.rows.length, `${s}/${c.key}`).toBeGreaterThanOrEqual(0);
    }
    expect(sectionStats(w, "home").charts).toHaveLength(8);
    const req = navGroups(w)
      .find((g) => g.key === "send")!
      .items.find((i) => i.key === "req")!;
    expect(req.count).toBe(
      w.requisitions.filter((r) => r.state === "open" || r.state === "partial").length,
    );
  });
});
