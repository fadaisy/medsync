/**
 * The pharmacy demo's sections 5–7 on the PGlite lane (ADR 0450): the controlled register, downtime and emergency
 * doses, run on the shared boot (setup and stock), then read back through each page's own loader. Runs with
 * EMR_PGLITE=1.
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

const DAY = 86_400_000;
const ymd = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

describe.skipIf(!laneOn)("Pharmacy demo: controlled, downtime, emergency doses (ADR 0450)", () => {
  let L: DemoLane;
  const one = async <T = Record<string, unknown>>(q: string, p: unknown[] = []) =>
    (await L.pg.query<T>(q, p)).rows[0] as T;

  beforeAll(async () => {
    L = await demoLane((db) => (held.db = db));
    const { controlledSection, downtimeSection, emergencySection } =
      await import("@/lib/pharmacy/demo/controlled");
    await controlledSection(L.s);
    await downtimeSection(L.s);
    await emergencySection(L.s);
  }, 900_000);

  it("controlled: today's register at the outpatient window, a month of it, an open difference and a paper supply to confirm", async () => {
    const { getControlledRegister } = await import("@/lib/pharmacy/controlled-read");
    const opd = L.s.points.opd.id;
    const today = await getControlledRegister(L.h, opd, "tramadol", null, L.lane.db);
    expect(today.rows.some((r) => r.what === "count" && r.witness)).toBe(true);
    expect(today.differences).toHaveLength(1);
    expect(today.backEntered).toHaveLength(1);
    const month = await getControlledRegister(
      L.h,
      opd,
      "tramadol",
      { from: ymd(new Date(Date.now() - 36 * DAY)), to: ymd(new Date()) },
      L.lane.db,
    );
    const kinds = new Set(month.rows.map((r) => r.what));
    for (const k of ["received", "supplied", "count", "count_correction"])
      expect(kinds).toContain(k);
    expect(month.rows.filter((r) => r.supply).length).toBe(5);
    expect(
      month.rows.filter((r) => r.what === "supplied").every((r) => r.witness && r.entryId),
    ).toBe(true);
    expect(month.balance).toBeGreaterThan(0);
    // The ledger's balance after the newest row is the page's balance.
    expect(month.rows[0]!.balance).toBe(month.balance);

    // Inpatient morphine: its difference was closed with the reason; emergency morphine supplied three times.
    const inp = await getControlledRegister(
      L.h,
      L.s.points.inpatient.id,
      "morphine",
      null,
      L.lane.db,
    );
    expect(inp.differences).toEqual([]);
    const note = await one<{ close_note: string }>(
      `SELECT close_note FROM pharmacy_controlled_differences WHERE dispensing_point_id = $1 AND closed_at IS NOT NULL`,
      [L.s.points.inpatient.id],
    );
    expect(note.close_note).toMatch(/^Demo:/);
    const em = await getControlledRegister(
      L.h,
      L.s.points.emergency.id,
      "morphine",
      { from: ymd(new Date(Date.now() - 30 * DAY)), to: ymd(new Date()) },
      L.lane.db,
    );
    expect(em.rows.filter((r) => r.supply)).toHaveLength(3);
  });

  it("controlled: a supply's register slip names the patient, prescriber, supplier, witness and balance", async () => {
    const { getRegisterEntry } = await import("@/lib/pharmacy/controlled-read");
    const e = await one<{ id: string }>(
      `SELECT id FROM pharmacy_controlled_entries WHERE hospital_id = $1 AND kind = 'supply' ORDER BY recorded_at DESC LIMIT 1`,
      [L.h],
    );
    const slip = await getRegisterEntry(L.h, e.id, L.lane.db);
    expect(slip).toMatchObject({ kind: "supply", collectedBy: "The patient" });
    expect(slip!.patientUserId).toBeTruthy();
    expect(slip!.prescriber).toBeTruthy();
    expect(slip!.witness).toBeTruthy();
    expect(slip!.balanceAfter).toBeGreaterThanOrEqual(0);
    const n = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM pharmacy_controlled_entries WHERE hospital_id = $1 AND kind = 'supply'`,
      [L.h],
    );
    expect(n.n).toBe(10);
  });

  it("downtime: sheets in every state, two periods, a drill; the entered sheets and the blank sheets to print", async () => {
    const { loadDowntimePage } = await import("@/lib/pharmacy/downtime-store");
    const { loadSheetEntry } = await import("@/lib/pharmacy/downtime-entry");
    const page = await loadDowntimePage(L.h, L.s.points.opd.id, L.lane.db);
    const states = page.sheets.map((x) => x.state);
    for (const st of ["unused", "to_enter", "complete", "voided"] as const)
      expect(states).toContain(st);
    expect(page.sheets).toHaveLength(20);
    expect(page.periods).toHaveLength(2);
    expect(page.drills).toHaveLength(1);
    const mat = await loadDowntimePage(L.h, L.s.points.maternity.id, L.lane.db);
    expect(new Set(mat.sheets.map((x) => x.state))).toEqual(
      new Set(["unused", "to_enter", "voided"]),
    );

    const done = page.sheets.find((x) => x.state === "complete")!;
    const sheet = await loadSheetEntry(L.h, L.s.points.opd.id, done.number, L.lane.db);
    expect(sheet!.rows).toHaveLength(4);
    expect(sheet!.rows.filter((r) => r.section === "not_supplied")).toHaveLength(1);
    expect(sheet!.rows.every((r) => r.paper)).toBe(true);
    const part = page.sheets
      .filter((x) => x.state === "to_enter")
      .sort((a, b) => a.number - b.number)[0]!;
    expect(
      (await loadSheetEntry(L.h, L.s.points.opd.id, part.number, L.lane.db))!.rows,
    ).toHaveLength(2);
    const lines = await one<{ n: number; demo: number }>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE directions_as_written = '[demo dose]')::int AS demo
         FROM paper_prescription_lines WHERE hospital_id = $1`,
      [L.h],
    );
    expect(lines.n).toBeGreaterThan(0);
    expect(lines.demo).toBe(lines.n);
    // The print page's blank sheets: the unused numbers at the point.
    const unused = page.sheets.filter((x) => x.state === "unused").map((x) => x.number);
    expect(unused.length).toBeGreaterThan(10);
  });

  it("emergency doses: by cart over 30 days, a controlled dose witnessed, corrections and undone doses out", async () => {
    const { getEmergencyDoses } = await import("@/lib/pharmacy/read");
    const d = await getEmergencyDoses(L.h, "30d", "all", L.lane.db);
    // 21 given (one indicated is not counted, a corrected one counts once), 5 of them protocol doses.
    expect(d.total).toBe(21);
    expect([...d.cartCounts.values()].reduce((a, b) => a + b, 0)).toBe(d.total);
    expect(
      d.rows.filter((r) => r.controlled).every((r) => r.witness && r.witness !== "typed"),
    ).toBe(true);
    expect(d.rows.filter((r) => r.controlled)).toHaveLength(3);
    expect(d.rows.filter((r) => r.dose !== null).every((r) => r.dose === "[demo dose]")).toBe(true);
    expect(d.rows.some((r) => r.patientUserId === null)).toBe(true);
    expect(d.rows.find((r) => r.medicine.match(/ondansetron/i))!.cart).toBe(
      "Demo resus cart A (emergency)",
    );
    expect((await getEmergencyDoses(L.h, "7d", "all", L.lane.db)).total).toBeGreaterThan(0);
    expect((await getEmergencyDoses(L.h, "today", "all", L.lane.db)).total).toBeGreaterThan(0);
  });

  it("writes no legal answer and names only demo people", async () => {
    expect(
      (await one<{ n: number }>(`SELECT count(*)::int AS n FROM pharmacy_legal_answers`)).n,
    ).toBe(0);
    expect(L.s.notes).toEqual({});
  });
});
