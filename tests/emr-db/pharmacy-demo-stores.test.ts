/**
 * The pharmacy demo's stores section on the PGlite lane (ADR 0450): setup and stock, then `storesSection`, then every
 * stores page's own loader read back as the demo chief pharmacist, as the pages call them. Runs with EMR_PGLITE=1.
 */
import type { DemoLane } from "./_pharmacy-demo";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { laneOn } from "./_pglite";
import { demoLane } from "./_pharmacy-demo";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

describe.skipIf(!laneOn)("Pharmacy demo: the stores section (ADR 0450)", () => {
  let d: DemoLane;
  let who: { userId: string; hospitalId: string };
  const ids = async (q: string) =>
    (await d.pg.query<{ id: string }>(q, [d.h])).rows.map((r) => r.id);

  beforeAll(async () => {
    d = await demoLane((db) => (held.db = db));
    const { storesSection } = await import("@/lib/pharmacy/demo/stores");
    await storesSection(d.s);
    who = { userId: d.s.people.chief, hospitalId: d.h };
  }, 900_000);

  it("writes through the stores without a refusal and stays within the write budget", () => {
    expect(d.s.counts.store_deliveries).toBe(5);
    expect(d.s.counts.store_requisitions).toBe(7);
    expect(d.s.counts.store_orders).toBe(3);
  });

  it("/store/places: two stores and a quarantine, live, counted, with their in-charge; suppliers and a facility", async () => {
    const { getPlacesPage } = await import("@/lib/pharmacy/stores/store-read");
    const page = await getPlacesPage(who, d.lane.db);
    const own = page.locations.filter((l) => l.kind === "store" || l.kind === "quarantine");
    expect(own.map((l) => l.name).sort()).toEqual(["Bulk store", "Main store", "Quarantine"]);
    expect(own.every((l) => l.live && l.inChargeName)).toBe(true);
    expect(own.filter((l) => l.kind === "store").every((l) => l.lastCountedAt)).toBe(true);
    expect(page.locations.filter((l) => l.kind === "dispensing_point")).toHaveLength(8);
    expect(page.counterparties.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "National Medical Stores",
        "Demo supplier A",
        "Demo donor programme",
        "Demo regional referral hospital",
      ]),
    );
    expect(page.countBatches.length).toBeGreaterThan(100);
  });

  it("/store/deliveries (+ [id]): received ones over the month and one being counted, with a discrepancy report", async () => {
    const { getDeliveriesPage, getDelivery } = await import("@/lib/pharmacy/stores/store-read");
    const page = await getDeliveriesPage(who, d.lane.db);
    expect(page.deliveries).toHaveLength(5);
    expect(page.deliveries[0]!.state).toBe("counting");
    expect(page.deliveries.filter((x) => x.state === "received")).toHaveLength(4);
    expect(page.receivingPlaces.length).toBeGreaterThan(2);
    expect(page.orders.length).toBe(2);
    const first = page.deliveries.find((x) => x.noteNumber.startsWith("NMS-DN-0412"))!;
    const view = (await getDelivery(who, first.id, new Date(), d.lane.db))!;
    expect(view.lines).toHaveLength(13);
    expect(view.reportLineNos.size).toBe(2);
    expect(view.lines.flatMap((l) => l.results.map((r) => r.kind))).toEqual(
      expect.arrayContaining(["fewer_than_note", "damaged"]),
    );
    const counting = (await getDelivery(who, page.deliveries[0]!.id, new Date(), d.lane.db))!;
    expect(counting.lines).toHaveLength(5);
    expect(counting.delivery.state).toBe("counting");
  });

  it("/store/issues (+ [id]): requisitions at every state, issues to confirm, a return, loans outstanding", async () => {
    const { getIssuesPage, getRequisition } = await import("@/lib/pharmacy/stores/store-read");
    const page = await getIssuesPage(who, d.lane.db);
    expect(page.requisitions).toHaveLength(7);
    expect(new Set(page.requisitions.map((r) => r.state))).toEqual(
      new Set(["raised", "issued", "confirmed", "confirmed_with_difference"]),
    );
    // NCD's issue waits for the point, and the maternity point's return waits for the main store.
    expect(page.toConfirm.map((c) => c.to).sort()).toEqual(["Main store", "NCD clinic pharmacy"]);
    expect(page.loans.map((l) => l.direction).sort()).toEqual(["borrowed", "lent"]);
    expect(page.batches.length).toBeGreaterThan(100);
    const open = page.requisitions.find(
      (r) => r.state === "raised" && r.fromName === "Paediatric pharmacy",
    )!;
    const v = (await getRequisition(who, open.id, new Date(), d.lane.db))!;
    expect(v.lines).toHaveLength(4);
    expect(v.lines.every((l) => l.held > 0 && l.prefill > 0)).toBe(true);
  });

  it("/store/orders: a proposal from the ledger, orders part received, sent and draft, ordering ready", async () => {
    const { getOrders, getProposal, orderingReadiness } =
      await import("@/lib/pharmacy/stores/order-read");
    const proposal = await getProposal(who, new Date(), null, d.lane.db);
    expect(proposal.parameters).not.toBeNull();
    expect(proposal.missing).toEqual([]);
    expect(proposal.lines.length).toBeGreaterThan(50);
    const saved = await getOrders(who, d.lane.db);
    expect(saved.map((o) => o.status).sort()).toEqual(["draft", "open", "part_received"]);
    const cycle = saved.find((o) => o.status === "part_received")!;
    expect(cycle.supplier).toBe("National Medical Stores");
    expect(cycle.lines.some((l) => l.state === "closed")).toBe(true);
    expect(cycle.lines.some((l) => l.state === "part_received")).toBe(true);
    expect((await orderingReadiness(d.lane.db, d.h)).met).toBe(true);
  });

  it("/store/packs: the stores packs signed by two people, and a draft waiting", async () => {
    const { packRows } = await import("@/lib/pharmacy/stores/packs");
    const { asClinicalReader } = await import("@/lib/emr/db");
    const rows = await asClinicalReader(who, (tx) => packRows(tx, d.h), d.lane.db);
    const byKind = new Map(rows.map((r) => [r.kind, r]));
    for (const k of [
      "order_parameters",
      "tracer_list",
      "stockout_day_rule",
      "stores_reason_lists",
    ] as const)
      expect(byKind.get(k)?.signed, k).not.toBeNull();
    expect(byKind.get("order_parameters")?.draft).not.toBeNull();
    const signers = await ids(
      `SELECT id FROM public.pharmacy_signed_sets WHERE hospital_id = $1 AND status = 'signed' AND second_signer IS NOT NULL`,
    );
    expect(signers.length).toBeGreaterThanOrEqual(4);
  });
});
