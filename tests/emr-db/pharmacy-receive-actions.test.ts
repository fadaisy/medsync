/** RECEIVE §L through the server actions on the seeded lane. Runs with EMR_PGLITE=1. */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type * as After from "@/lib/pharmacy/actions/receive/after";
import type * as Del from "@/lib/pharmacy/actions/receive/delivery";
import type { ReceiveLine, ReceiveWorld } from "@/lib/pharmacy/derive/receive";
import type { PharmacyActor } from "@/lib/pharmacy/write";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { blankLine, figures } from "@/lib/pharmacy/derive/receive";
import { bootLane, hospital, laneOn, staff } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

describe.skipIf(!laneOn)("Receive actions (0276)", () => {
  let lane: Lane;
  let pg: Pg;
  let D: typeof Del;
  let A: typeof After;
  let finish: (a: PharmacyActor, raw: unknown) => Promise<{ ok: boolean; error?: string; data?: unknown }>;
  let load: () => Promise<ReceiveWorld>;
  let h: string;
  let boss: string;
  let keeper: string;
  let keeperA: PharmacyActor;
  let bossA: PharmacyActor;
  let w: ReceiveWorld;

  const actor = (userId: string): PharmacyActor => ({
    userId,
    hospitalId: h,
    cadreCode: "PHARMACIST",
    cadreName: "Pharmacist",
    pointId: null,
    access: { permissions: new Set(["pharmacy.view", "pharmacy.store", "pharmacy.stock"]) } as PharmacyActor["access"],
  });
  const ok = async <T = { id: string }>(p: Promise<unknown>) => {
    const r = (await p) as { ok: boolean; error?: string; data?: unknown };
    if (!r.ok) throw new Error(r.error);
    return r.data as T;
  };
  const refusal = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const r = await p;
    return r.ok ? null : (r.error as string);
  };
  const witnessBy = async (attester: string) =>
    (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, method, outcome, attested_at)
         VALUES ($1, $2, $3, 'witness', 'receive', 'session', 'passed', now()) RETURNING id`,
        [h, keeper, attester],
      )
    ).rows[0]!.id;
  const head = (over: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    kind: "supplier",
    supplierId: w.suppliers[0]!.id,
    fromText: "",
    fromPlaceId: null,
    orderId: null,
    note: `DN-${randomUUID()}`,
    placeId: w.placeId,
    arrived: "2026-01-01 09:00",
    deliverer: "",
    vehicle: "",
    blind: false,
    ...over,
  });
  const hand = async (productId: string, placeId = w.placeId) =>
    Number(
      (
        await pg.query<{ n: string }>(
          `SELECT coalesce(sum(m.quantity), 0) AS n FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
            WHERE b.product_id = $1 AND m.location_id = $2`,
          [productId, placeId],
        )
      ).rows[0]!.n,
    );
  const med = (test: (m: ReceiveWorld["meds"][number]) => boolean) => {
    const m = w.meds.find(test);
    if (!m) throw new Error("no such medicine");
    return m;
  };
  const plain = () => med((m) => !m.cold && !m.controlled && !m.vaccine);
  const docLine = (m: ReceiveWorld["meds"][number], over: Partial<ReceiveLine> = {}) =>
    blankLine(randomUUID(), { lines: [] }, m, "typed", { batch: `B${Date.now()}${Math.floor(Math.random() * 1000)}`, exp: "2031-06", packs: "3", cost: "1000", ...over });
  const saved = (l: ReceiveLine) => {
    const { approvedBy: _a, approvalAsked: _b, rank: _c, owedFrozen: _d, witnessName: _e, ...rest } = l;
    return rest;
  };
  const started = async (lines: ReceiveLine[], over: Record<string, unknown> = {}) => {
    const hd = head(over);
    await ok(D.startDelivery(keeperA, hd));
    if (lines.length) await ok(D.saveLines(keeperA, { deliveryId: hd.id, lines: lines.map(saved), removed: [] }));
    return hd.id;
  };
  const done = (deliveryId: string, more: Record<string, unknown> = {}) =>
    finish(keeperA, { deliveryId, witnesses: [], secondAttestationId: null, ...more });

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    h = await hospital(pg, "Receive actions");
    const s = Date.now();
    const dept = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code) VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [h, `ph-r-${s}`],
      )
    ).rows[0]!.id;
    const sub = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind) VALUES ($1, $2, 'Main store', $3, 'support') RETURNING id`,
        [h, dept, `st-r-${s}`],
      )
    ).rows[0]!.id;
    await pg.query(`INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name, live_at) VALUES ($1, 'store', $2, 'Main store', now())`, [h, sub]);
    boss = (await staff(pg, { hospitalId: h, departmentId: dept, cadre: "PHARMACIST" })).userId;
    keeper = (await staff(pg, { hospitalId: h, departmentId: dept, cadre: "PHARMACIST" })).userId;
    await pg.query(`INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at) VALUES ($1, $2, $3, now() - interval '1 day')`, [h, dept, boss]);
    for (const u of [boss, keeper])
      await pg.query(`INSERT INTO public.pharmacy_roster_people (hospital_id, user_id, cadre, places, added_by) VALUES ($1, $2, 'pharmacist', ARRAY[$3::uuid], $2)`, [h, u, sub]);
    await pg.query(`INSERT INTO public.pharmacy_suppliers (hospital_id, name, updated_by) VALUES ($1, 'NMS', $2)`, [h, boss]);
    const { seedStore } = await import("../../scripts/seed-pharmacy-dev/store");
    expect(await seedStore(lane.db as never, h)).toEqual({ ok: true });
    const { seedReceive } = await import("../../scripts/seed-pharmacy-dev/receive");
    expect(await seedReceive(lane.db as never, h)).toEqual({ ok: true });
    D = await import("@/lib/pharmacy/actions/receive/delivery");
    A = await import("@/lib/pharmacy/actions/receive/after");
    finish = (await import("@/lib/pharmacy/actions/receive/finish")).finishDelivery as never;
    const { loadReceiveWorld } = await import("@/lib/pharmacy/receive/read");
    load = async () => (await loadReceiveWorld(lane.db as never, { hospitalId: h, actorUserId: boss }))!;
    keeperA = actor(keeper);
    bossA = actor(boss);
    w = await load();
  }, 300_000);

  it("the seed holds every state", () => {
    const states = new Set(w.deliveries.map((d) => d.state));
    expect([...states].sort()).toEqual(["abandoned", "counting", "received"]);
    expect(new Set(w.claims.map((c) => c.state))).toEqual(new Set(["draft", "sent", "credit"]));
    expect(w.recalls.length).toBeGreaterThan(0);
    expect(w.meds.some((m) => m.vaccine)).toBe(true);
    expect(w.meds.some((m) => !m.gtin)).toBe(true);
    expect(w.orders.some((o) => o.state === "part")).toBe(true);
    expect(w.deliveries.some((d) => d.put.some((p) => !p.done))).toBe(true);
  });

  it("L1 a duplicate note is refused, an abandoned one can be re-used", async () => {
    const note = `DN-${randomUUID()}`;
    const first = head({ note });
    await ok(D.startDelivery(keeperA, first));
    const again = await ok<{ duplicateOf?: string }>(D.startDelivery(keeperA, head({ note: note.toLowerCase() })));
    expect(again.duplicateOf).toBe(first.id);
    await ok(D.abandonDelivery(keeperA, { deliveryId: first.id, reason: "Wrong hospital" }));
    expect((await ok<{ duplicateOf?: string }>(D.startDelivery(keeperA, head({ note })))).duplicateOf).toBeUndefined();
  });

  it("L2 nothing moves until finished; abandoning leaves stock and orders alone", async () => {
    const m = plain();
    const before = await hand(m.id);
    const id = await started([docLine(m)]);
    expect(await hand(m.id)).toBe(before);
    await ok(D.abandonDelivery(keeperA, { deliveryId: id, reason: "Wrong note" }));
    expect(await hand(m.id)).toBe(before);
    expect(await refusal(done(id))).toMatch(/already finished/);
  });

  it("finishing moves accepted units, makes put-away rows and a GRN, once", async () => {
    const m = plain();
    const before = await hand(m.id);
    const l = docLine(m, { packs: "4", per: "10", notePacks: "4" });
    const id = await started([l]);
    const r = await ok<{ grn: string; replay: boolean }>(done(id));
    expect(r.grn).toMatch(/^GRN-/);
    expect(await hand(m.id)).toBe(before + 40);
    const again = await ok<{ grn: string; replay: boolean }>(done(id));
    expect(again).toMatchObject({ grn: r.grn, replay: true });
    expect(await hand(m.id)).toBe(before + 40);
    const put = await pg.query(`SELECT qty FROM public.pharmacy_delivery_put_away WHERE delivery_line_id = $1`, [l.id]);
    expect(put.rows).toEqual([{ qty: 40 }]);
  });

  it("uncounted lines are dropped", async () => {
    const m = plain();
    const l = docLine(m);
    const pending = docLine(m, { packs: "", orderLineId: randomUUID(), batch: "", no: 2 });
    const id = await started([l]);
    expect(pending.packs).toBe("");
    await ok(done(id));
    const rows = await pg.query(`SELECT 1 FROM public.pharmacy_delivery_lines WHERE delivery_id = $1`, [id]);
    expect(rows.rows).toHaveLength(1);
  });

  it("L3 a repeated serial is refused, and is free again after abandoning", async () => {
    const g = "04006381333931";
    const a = await started([]);
    await ok(D.scanPack(keeperA, { deliveryId: a, gtin: g, serial: "SER1" }));
    const b = await started([]);
    expect(await refusal(D.scanPack(keeperA, { deliveryId: b, gtin: g, serial: "SER1" }))).toMatch(/already scanned \(serial SER1/);
    await ok(D.abandonDelivery(keeperA, { deliveryId: a, reason: "Wrong note" }));
    await ok(D.scanPack(keeperA, { deliveryId: b, gtin: g, serial: "SER1" }));
  });

  it("L3 a recalled batch blocks until rejected into quarantine", async () => {
    const rc = w.recalls[0]!;
    const m = med((x) => x.id === rc.medId);
    const l = docLine(m, { batch: rc.batch });
    const id = await started([l]);
    expect(await refusal(done(id))).toMatch(/is on recall/);
    await ok(D.saveLines(keeperA, { deliveryId: id, lines: [saved({ ...l, rejOn: true, rejPacks: "3", rejWhy: "recall", rejFate: "quarantine" })], removed: [] }));
    const before = await hand(m.id);
    await ok(done(id));
    expect(await hand(m.id)).toBe(before);
  });

  it("L5 short-dated: needs the in-charge; reject goes to the driver with no claim", async () => {
    const m = plain();
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const l = docLine(m, { exp: soon, decision: "accept" });
    const id = await started([l]);
    expect(await refusal(done(id))).toMatch(/in-charge's approval/);
    expect(await refusal(D.approveShortDated(keeperA, { deliveryId: id, lineId: l.id }))).toBeTruthy();
    await ok(D.askApproval(keeperA, { deliveryId: id, lineId: l.id }));
    expect((await load()).asks.some((a) => a.lineId === l.id)).toBe(true);
    await ok(D.approveShortDated(bossA, { deliveryId: id, lineId: l.id }));
    // A changed expiry loses the approval.
    await ok(D.saveLines(keeperA, { deliveryId: id, lines: [saved({ ...l, exp: new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10) })], removed: [] }));
    expect(await refusal(done(id))).toMatch(/in-charge's approval/);
    await ok(D.approveShortDated(bossA, { deliveryId: id, lineId: l.id }));
    await ok(done(id));

    const r = docLine(m, { exp: soon, decision: "reject", notePacks: "3" });
    const rid = await started([r]);
    const out = await ok<{ claim: unknown }>(done(rid));
    expect(out.claim).toBeNull();
    const row = await pg.query<{ reject_reason: string; rejected_returned_quantity: number }>(
      `SELECT reject_reason, rejected_returned_quantity FROM public.pharmacy_delivery_lines WHERE id = $1`,
      [r.id],
    );
    expect(row.rows[0]).toMatchObject({ reject_reason: "short_dated" });
  });

  it("L6 a vaccine needs VVM and freeze", async () => {
    const m = med((x) => x.vaccine);
    const l = docLine(m, { temp: "5" });
    const id = await started([l]);
    expect(await refusal(done(id))).toMatch(/VVM/);
    await ok(D.saveLines(keeperA, { deliveryId: id, lines: [saved({ ...l, vvm: "3", freeze: "ok" })], removed: [] }));
    expect(await refusal(done(id))).toMatch(/discard point/);
    await ok(D.saveLines(keeperA, { deliveryId: id, lines: [saved({ ...l, vvm: "2", freeze: "ok" })], removed: [] }));
    await ok(done(id));
  });

  it("L7 a non-cold put-away is refused while a cold line waits", async () => {
    const c = med((x) => x.cold && !x.vaccine && !x.controlled);
    const m = plain();
    const coldLine = docLine(c, { temp: "5" });
    const other = docLine(m, { no: 2 });
    const id = await started([coldLine, other]);
    await ok(done(id));
    expect(await refusal(A.putAwayLine(keeperA, { clientKey: randomUUID(), lineId: other.id, shelf: "b-01" }))).toMatch(/Cold-chain first/);
    await ok(A.putAwayLine(keeperA, { clientKey: randomUUID(), lineId: coldLine.id, shelf: "cr-01" }));
    // 0275's guard is store-wide: the seed's other cold batches go first too.
    const waiting = await pg.query<{ id: string }>(
      `SELECT b.id FROM public.pharmacy_batches b JOIN public.pharmacy_products p ON p.id = b.product_id JOIN public.pharmacy_locations l ON l.id = b.location_id
        WHERE b.hospital_id = $1 AND l.kind = 'store' AND p.cold_chain
          AND NOT EXISTS (SELECT 1 FROM public.pharmacy_batch_shelves s WHERE s.batch_id = b.id)`,
      [h],
    );
    for (const b of waiting.rows)
      await pg.query(`INSERT INTO public.pharmacy_batch_shelves (hospital_id, batch_id, shelf, actor_id) VALUES ($1, $2, 'CR-01', $3)`, [h, b.id, keeper]);
    await ok(A.putAwayLine(keeperA, { clientKey: randomUUID(), lineId: other.id, shelf: "b-01" }));
    const d = await pg.query<{ shelved_at: string | null }>(`SELECT shelved_at FROM public.pharmacy_deliveries WHERE id = $1`, [id]);
    expect(d.rows[0]!.shelved_at).not.toBeNull();
    await ok(A.undoPutAwayLine(keeperA, { clientKey: randomUUID(), lineId: other.id }));
    const u = await pg.query<{ shelved_at: string | null }>(`SELECT shelved_at FROM public.pharmacy_deliveries WHERE id = $1`, [id]);
    expect(u.rows[0]!.shelved_at).toBeNull();
  });

  it("L8 L10 short, rejected and overpriced lines make one draft claim; a donation makes none", async () => {
    const m = plain();
    const short = docLine(m, { notePacks: "5", packs: "3", cost: String(m.cost) });
    const over = docLine(m, { no: 2, packs: "2", cost: String(Math.round(m.cost * 1.5)) });
    const id = await started([short, over]);
    const r = await ok<{ claim: { ref: string; total: number } }>(done(id));
    expect(r.claim.ref).toMatch(/^CLM-/);
    const c = (await load()).claims.find((x) => x.deliveryId === id)!;
    expect(c.state).toBe("draft");
    expect(c.lines.map((l) => l.kind)).toEqual(expect.arrayContaining(["Short on the note", "Charged above the order price"]));
    expect(await refusal(A.creditClaim(keeperA, { claimId: c.id, creditNote: "" }))).toBeTruthy();
    await ok(A.sendClaim(keeperA, { claimId: c.id }));
    await ok(A.creditClaim(keeperA, { claimId: c.id, creditNote: "CN-9" }));
    const don = docLine(m, { notePacks: "5", packs: "3" });
    const did = await started([don], { kind: "donation", supplierId: null, fromText: "MSF" });
    expect((await ok<{ claim: unknown }>(done(did))).claim).toBeNull();
  });

  it("L9 over the limit needs a second checker who is not the receiver; controlled lines need a witness", async () => {
    const m = plain();
    const big = docLine(m, { packs: "100", cost: "100000" });
    const id = await started([big]);
    expect(await refusal(done(id))).toMatch(/who checked the count/);
    await ok(done(id, { secondAttestationId: await witnessBy(boss) }));
    expect(((await pg.query<{ second_checker_id: string }>(`SELECT second_checker_id FROM public.pharmacy_deliveries WHERE id = $1`, [id])).rows[0]!).second_checker_id).toBe(boss);

    const cd = med((x) => x.controlled);
    const l = docLine(cd);
    const cid = await started([l]);
    expect(await refusal(done(cid))).toMatch(/needs its witness/);
    await ok(done(cid, { witnesses: [{ lineId: l.id, attestationId: await witnessBy(boss) }] }));
  });

  it("L11 an order line cannot go below what arrived; receiving counts against the new quantity", async () => {
    const o = w.orders.find((x) => x.state === "part")!;
    const line = o.lines.find((l) => l.received > 0)!;
    const m = med((x) => x.id === line.medId);
    const names = o.lines.map((l) => ({ id: l.id, productId: l.medId, name: "x", packs: l.packs, price: l.price, per: 100 }));
    const below = names.map((l) => (l.id === line.id ? { ...l, packs: line.received - 1, name: "Amoxicillin" } : l));
    expect(await refusal(A.editOrder(keeperA, { orderId: o.id, lines: below, removed: [] }))).toMatch(/can't be less than the 25 packs/);
    expect(await refusal(A.editOrder(keeperA, { orderId: o.id, lines: [], removed: [] }))).toBeTruthy();
    const higher = names.map((l) => (l.id === line.id ? { ...l, packs: line.packs + 5 } : l));
    await ok(A.editOrder(keeperA, { orderId: o.id, lines: higher, removed: [] }));
    const edited = (await load()).orders.find((x) => x.id === o.id)!;
    expect(edited.editedOn).not.toBe("");
    expect(edited.lines.find((l) => l.id === line.id)!.packs).toBe(line.packs + 5);
    void m;
  });

  it("L11 receiving an order fills its lines and closes it", async () => {
    const o = w.orders.find((x) => x.state === "sent" && x.lines.every((l) => !med((m) => m.id === l.medId).cold))!;
    const hd = head({ orderId: o.id, supplierId: o.supplierId });
    await ok(D.startDelivery(keeperA, hd));
    const lines = (await load()).deliveries.find((d) => d.id === hd.id)!.lines;
    expect(lines.map((l) => l.orderLineId).sort()).toEqual(o.lines.map((l) => l.id).sort());
    const all = lines.map((l) => saved({ ...l, packs: String(o.lines.find((x) => x.id === l.orderLineId)!.packs), batch: `R${l.no}`, exp: "2031-01", cost: "100" }));
    await ok(D.saveLines(keeperA, { deliveryId: hd.id, lines: all, removed: [] }));
    await ok(done(hd.id));
    const row = await pg.query<{ state: string }>(`SELECT state FROM public.pharmacy_orders WHERE id = $1`, [o.id]);
    expect(row.rows[0]!.state).toBe("closed");
  });

  it("L12 chasing records the date", async () => {
    const o = (await load()).orders.find((x) => x.state !== "closed")!;
    await ok(A.markChased(keeperA, { orderId: o.id }));
    expect((await load()).orders.find((x) => x.id === o.id)!.chasedOn).not.toBe("");
  });

  it("L13 a medicine with no GTIN gets a 200 code, kept", async () => {
    const m = med((x) => !x.gtin);
    const r = await ok<{ gtin: string }>(A.assignInHouseCode(keeperA, { productId: m.id }));
    expect(r.gtin).toMatch(/^0200\d{10}$/);
    expect((await ok<{ gtin: string }>(A.assignInHouseCode(keeperA, { productId: m.id }))).gtin).toBe(r.gtin);
    expect((await load()).meds.find((x) => x.id === m.id)).toMatchObject({ gtin: r.gtin, ownCode: true });
  });

  it("L14 replaying a device's delivery commits once; a refused one stays uncommitted", async () => {
    const m = plain();
    const before = await hand(m.id);
    const hd = head();
    const l = docLine(m, { packs: "2", per: "10" });
    const body = { head: hd, lines: [saved(l)] };
    await ok(D.syncCounting(keeperA, body));
    await ok(D.syncCounting(keeperA, body));
    await ok(done(hd.id));
    await ok(done(hd.id));
    expect(await hand(m.id)).toBe(before + 20);
    const rc = w.recalls[0]!;
    const blocked = head();
    await ok(D.syncCounting(keeperA, { head: blocked, lines: [saved(docLine(med((x) => x.id === rc.medId), { batch: rc.batch }))] }));
    expect(await refusal(done(blocked.id))).toMatch(/is on recall/);
    const st = await pg.query<{ state: string }>(`SELECT state FROM public.pharmacy_deliveries WHERE id = $1`, [blocked.id]);
    expect(st.rows[0]!.state).toBe("counting");
  });

  it("L16 the figures match SQL on the seed", async () => {
    const world = await load();
    const f = figures(world.figureRows, world.claims, world.rules);
    const rows = await pg.query<{ m: number }>(`
      WITH last AS (SELECT round(extract(epoch FROM date_trunc('minute', finished_at) - date_trunc('minute', arrived_at)) / 60)::int AS m, finished_at
        FROM public.pharmacy_deliveries WHERE hospital_id = $1 AND location_id = $2 AND state = 'received' AND kind = 'supplier' ORDER BY finished_at DESC LIMIT 8)
      SELECT m FROM last ORDER BY m`, [h, world.placeId]);
    const median = rows.rows[Math.floor((rows.rows.length - 1) / 2)]!.m;
    expect(f[0]!.chart!.bars).toHaveLength(8);
    const hours = Math.floor(median / 60);
    expect(f[0]!.value).toBe(hours ? `${hours} h${median % 60 ? ` ${median % 60} min` : ""}` : `${median} min`);
    expect(f[0]!.onTarget).toBe(median <= world.rules.targetStock);
    const open = await pg.query<{ t: string }>(`SELECT coalesce(sum(total), 0) AS t FROM public.pharmacy_supplier_claims WHERE hospital_id = $1 AND state <> 'credit'`, [h]);
    expect(f[3]!.value).toBe(`UGX ${Number(open.rows[0]!.t).toLocaleString("en-GB")}`);
  });

  /* ─── SUPPLIES.md §H4 ─── */
  const supply = async (section: "B" | "D", flags: Record<string, boolean>) => {
    const name = `Supply ${randomUUID()}`;
    const si = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.cat_supply_items (section, category, name, issue_unit, level_of_care, ven)
         VALUES ($1,'Gloves',$2,'piece','HC3','V') RETURNING id`,
        [section, name],
      )
    ).rows[0]!.id;
    const keys = Object.keys(flags);
    const id = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by, supply_item_id${keys.map((k) => `, ${k}`).join("")})
         VALUES ($1,$2,$3,'piece',$4,$5${keys.map((_, i) => `, $${i + 6}`).join("")}) RETURNING id`,
        [h, `cat_sup_${randomUUID().replaceAll("-", "_")}`, name, boss, si, ...Object.values(flags)],
      )
    ).rows[0]!.id;
    return (await load()).meds.find((m) => m.id === id)!;
  };
  const resave = (deliveryId: string, line: ReceiveLine) =>
    ok(D.saveLines(keeperA, { deliveryId, lines: [saved(line)], removed: [] }));

  it("H4 a sterile line needs the seal answered, and a broken seal blocks until rejected", async () => {
    const m = await supply("B", { sterile: true });
    const before = await hand(m.id);
    const l = docLine(m, { packs: "2", per: "10" });
    const id = await started([l]);
    expect(await refusal(done(id))).toMatch(/check the packaging and sterile seal/);
    await resave(id, { ...l, seal: "broken" });
    expect(await refusal(done(id))).toMatch(/sterile seal is broken/);
    await resave(id, { ...l, seal: "broken", rejOn: true, rejPacks: "2", rejWhy: "damaged" });
    await ok(done(id));
    expect(await hand(m.id)).toBe(before);
    const good = docLine(m, { packs: "2", per: "10", seal: "ok" });
    await ok(done(await started([good])));
    expect(await hand(m.id)).toBe(before + 20);
  });

  it("H4 a kit marked hot blocks until rejected or kept apart", async () => {
    const m = await supply("D", { test_kit: true });
    const l = docLine(m, { packs: "2", per: "10" });
    const id = await started([l]);
    expect(await refusal(done(id))).toMatch(/confirm the test kits/);
    await resave(id, { ...l, kitTemp: "hot" });
    expect(await refusal(done(id))).toMatch(/kept above/);
    await resave(id, { ...l, kitTemp: "hot", rejOn: true, rejPacks: "2", rejWhy: "other", rejFate: "quarantine" });
    await ok(done(id));
  });

  it("H4 a safety box needs no expiry, and its batch never shows one", async () => {
    const m = await supply("B", { no_expiry: true });
    const before = await hand(m.id);
    await ok(done(await started([docLine(m, { packs: "1", per: "25", exp: "" })])));
    expect(await hand(m.id)).toBe(before + 25);
    const b = await pg.query<{ expiry: string }>(
      `SELECT expiry::text FROM public.pharmacy_batches WHERE product_id = $1`,
      [m.id],
    );
    expect(b.rows).toEqual([{ expiry: "2099-12-31" }]);
  });
});
