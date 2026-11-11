/**
 * The pharmacy demo's network and go-live sections (ADR 0450) on the PGlite lane: refills on every tab, renewals for the
 * doctor, an NCD patient's medicines, and the hospital admin's going-live pages, each read back through its page's own
 * loader. Legal answers stay missing. Runs with EMR_PGLITE=1.
 */
import type { DemoLane } from "./_pharmacy-demo";
import type { EmrDb } from "@/lib/emr/db";
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

describe.skipIf(!laneOn)("Pharmacy demo: network and go-live (ADR 0450)", () => {
  let d: DemoLane;
  let db: EmrDb;

  beforeAll(async () => {
    d = await demoLane((x) => (held.db = x));
    db = d.lane.db as unknown as EmrDb;
    const { goliveSection, networkSection } = await import("@/lib/pharmacy/demo/network");
    await networkSection(d.s);
    await goliveSection(d.s);
  }, 900_000);

  it("/pharmacy/refills: rows on every tab, none routed to a partner", async () => {
    const { refillBoard } = await import("@/lib/pharmacy/refill-read");
    const rows = await refillBoard(db, d.h, new Date());
    const by = (t: string) => rows.filter((r) => r.tab === t);
    expect(by("to_prepare").length).toBeGreaterThanOrEqual(4);
    expect(by("needs_clinic").length).toBeGreaterThanOrEqual(3);
    expect(by("prepared").length).toBeGreaterThanOrEqual(3);
    expect(by("collected").length).toBeGreaterThanOrEqual(2);
    expect(by("not_collected").length).toBe(1);
    expect(by("partner")).toEqual([]);
    expect(new Set(rows.map((r) => r.channel))).toEqual(new Set(["app", "window", "phone"]));
    expect(rows.some((r) => /^Demo collector \d\d \(/.test(r.collector))).toBe(true);
    expect(by("needs_clinic").some((r) => r.timing.early)).toBe(true);
    expect(rows.every((r) => r.medicine && r.collectAt && r.products.length)).toBe(true);
  });

  it("/doctor/renewals: open requests with their reasons, and the signed decline reasons", async () => {
    const { openRenewals } = await import("@/lib/emr/read/renewals");
    const { networkPack } = await import("@/lib/pharmacy/network-packs");
    const rows = await openRenewals({ userId: d.s.people.doctors[2]!, hospitalId: d.h }, db);
    expect(new Set(rows.map((r) => r.reason))).toEqual(
      new Set(["none_left", "expired", "asked_by_pharmacy"]),
    );
    expect(rows.find((r) => r.reason === "none_left")).toMatchObject({ used: 1, authorised: 1 });
    expect(rows.every((r) => r.lastSuppliedOn && r.mrn !== undefined)).toBe(true);
    expect((await networkPack(db, d.h, "renewal_decline_reasons"))?.content.items.length).toBe(3);
  });

  it("/patient/track/medications: an NCD patient's repeats in one sentence each, a collector, the list", async () => {
    const { patientRefills } = await import("@/lib/pharmacy/refill-read");
    const { getPatientMedicineList } = await import("@/lib/pharmacy/patient-list");
    const p = d.s.patients.filter((x) => x.clinic === "ncd")[7]!;
    const mine = await patientRefills(db, p.id, new Date());
    expect(mine.repeats).toHaveLength(3);
    expect(
      mine.repeats.some((r) => r.request?.startsWith("Ready to collect at NCD clinic pharmacy")),
    ).toBe(true);
    expect(mine.repeats.some((r) => r.canAsk)).toBe(true);
    expect(mine.repeats.filter((r) => !r.canAsk && !r.request)).toHaveLength(1);
    expect(mine.collectors.map((c) => c.name)).toEqual(["Demo collector 02"]);
    expect(mine.points[d.h]!.length).toBe(8);
    const list = await getPatientMedicineList(p.id, async () => true, { database: db });
    expect(list.groups.length).toBeGreaterThan(0);
  });

  it("/hospital-admin/departments/pharmacy: eight live points and the settings", async () => {
    const { hospitalSettings, pointsWithState } = await import("@/lib/pharmacy/golive/read");
    const points = await pointsWithState(db, d.h);
    expect(points).toHaveLength(8);
    expect(points.every((p) => p.liveAt && !p.switchedOffAt)).toBe(true);
    expect(await hospitalSettings(db, d.h)).not.toBeNull();
  });

  it("/hospital-admin/departments/pharmacy/[pointId]: briefings, drill, in-charge, phone, pilot note met; legal answers missing", async () => {
    const { getPharmacyReadiness } = await import("@/lib/pharmacy/golive/read");
    const legal = await d.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pharmacy_legal_answers`,
    );
    expect(legal.rows[0]!.n).toBe(0);
    for (const k of Object.keys(d.s.points) as (keyof typeof d.s.points)[]) {
      const r = (await db.transaction((tx) =>
        getPharmacyReadiness(tx, d.h, d.s.points[k].id, new Date()),
      ))!;
      const words = JSON.stringify(r.readiness.conditions);
      expect(words).not.toContain("No drill recorded at this point");
      expect(r.readiness.pilotNote?.met).toBe(true);
      expect(r.readiness.ready).toBe(false);
      const unmet = r.readiness.conditions.filter((c) => !c.met).map((c) => c.id);
      expect(unmet).toContain(2); // legal answers
      expect(unmet).not.toContain(5); // briefings and drill
      expect(unmet).not.toContain(6); // in-charge and phone
      expect(r.request?.action ?? null).toBe(k === "private" ? "switch_off" : null);
    }
    const decided = await d.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pharmacy_golive WHERE hospital_id = $1 AND action = 'switch_on' AND approved_at IS NOT NULL`,
      [d.h],
    );
    expect(decided.rows[0]!.n).toBe(8);
  });

  it("records what it wrote on the load", () => {
    expect(d.s.counts).toMatchObject({
      repeat_lines: 19,
      refill_requests: 14,
      briefings: 10,
      drills: 8,
      golive_requests: 1,
    });
    expect(d.s.notes).toEqual({});
  });
});
