/**
 * The pharmacy demo's clinical section on the PGlite lane (ADR 0450): setup and stock, then `clinicalSection`, then
 * every clinical page's own loader read back as a demo pharmacist through the reader role, as the pages call them.
 * Runs with EMR_PGLITE=1.
 */
import type { DemoLane } from "./_pharmacy-demo";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { demoLane } from "./_pharmacy-demo";
import { laneOn } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

describe.skipIf(!laneOn)("Pharmacy demo: the clinical section (ADR 0450)", () => {
  let d: DemoLane;
  let who: { userId: string; hospitalId: string };
  const read = async <T>(fn: (tx: import("@/lib/emr/db").EmrTx) => Promise<T>) => {
    const { asClinicalReader } = await import("@/lib/emr/db");
    return asClinicalReader(who, fn, d.lane.db);
  };
  // Stewardship, reaction detail and reconciliation read on the app connection, as their pages now do (see "why
  // these pages leave the reader" below); the owner's transaction stands in for it here.
  const owner = async <T>(fn: (tx: import("@/lib/emr/db").EmrTx) => Promise<T>) => d.lane.db.transaction(fn);

  beforeAll(async () => {
    d = await demoLane((db) => (held.db = db));
    const { clinicalSection } = await import("@/lib/pharmacy/demo/clinical");
    await clinicalSection(d.s);
    who = { userId: d.s.people.pharmacists[2]!, hospitalId: d.h };
  }, 900_000);

  it("writes through the clinical stores without a refusal and stays within the write budget", () => {
    expect(d.s.notes).toEqual({});
    const c = d.s.counts;
    expect(c.reaction_reports).toBe(6);
    expect(c.reconciliations).toBe(5);
    expect(c.ams_reviews).toBe(4);
    const mine = ["content_entries", "content_signatures", "clinical_prescriptions", "mar_doses", "culture_orders", "ams_reviews",
      "reaction_reports", "reaction_events", "admissions", "medication_statements", "reconciliations", "home_decisions",
      "reconciliation_events"].reduce((n, k) => n + (c[k] ?? 0), 0);
    expect(mine).toBeLessThan(400);
  });

  it("every line this section prescribed reads [demo dose]", async () => {
    const r = await d.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM prescriptions WHERE hospital_id = $1 AND indication = 'Demo indication' AND (dose <> '[demo dose]' OR frequency <> '[demo dose]')`,
      [d.h],
    );
    expect(r.rows[0]!.n).toBe(0);
  });

  it("/clinical/content: every pack, in force, one signature, drafts and withdrawn; every source says Demo", async () => {
    const { pharmacyContentEntries } = await import("@/db/schema/pharmacy-clinical");
    const { PACKS } = await import("@/lib/pharmacy/clinical/content");
    const rows = await read((tx) => tx.select().from(pharmacyContentEntries).where(and(eq(pharmacyContentEntries.hospitalId, d.h))));
    for (const pack of PACKS) expect(rows.some((r) => r.pack === pack), pack).toBe(true);
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(["in_force", "reviewer_signed", "draft", "withdrawn"]));
    expect(rows.every((r) => r.source?.startsWith("Demo"))).toBe(true);
    expect(rows.filter((r) => r.status === "in_force")).toHaveLength(9);
    const pairs = rows.filter((r) => r.pack === "interaction_pair");
    expect(pairs.every((r) => String((r.payload as { effect: string }).effect).startsWith("Demo pair"))).toBe(true);
  });

  it("/clinical/interventions: the check-worth-signing minimum in force (version 2)", async () => {
    const { entriesInForce } = await import("@/lib/pharmacy/clinical/read");
    const worth = await read((tx) => entriesInForce(tx, d.h, "check_worth_signing"));
    expect(worth).toHaveLength(1);
    expect(worth[0]!.version).toBe(2);
    expect(worth[0]!.payload.minimum).toBe(20);
  });

  it("/clinical/stewardship: courses by group with doses, cultures, reviews, and some due today", async () => {
    const { stewardshipData } = await import("@/lib/pharmacy/clinical/stewardship-read");
    const { figures, groupOf, reviewDue } = await import("@/lib/pharmacy/clinical/stewardship");
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 86_400_000);
    const data = await owner((tx) => stewardshipData(tx, d.h, from));
    expect(data.signed).toBe(true);
    expect(data.settings?.intervalDays.Watch).toBe(3);
    expect(data.courses.length).toBeGreaterThanOrEqual(12);
    expect(data.courses.filter((c) => c.doses.length > 0).length).toBeGreaterThanOrEqual(12);
    expect(data.cultures.length).toBeGreaterThanOrEqual(6);
    expect(data.reviews).toHaveLength(4);
    const f = figures(data.courses, data.tags, data.cultures, data.settings, from, now);
    expect(f.byGroup.Access.numerator).toBeGreaterThan(0);
    expect(f.byGroup.Watch.numerator).toBeGreaterThan(0);
    expect(f.noCulture!.numerator).toBeGreaterThan(0);
    const due = data.courses.filter(
      (c) => !c.endedAt && reviewDue(c, groupOf(data.tags, c.medicineId, c.route) ?? "unknown", data.settings, data.reviews, now, "Africa/Kampala").due,
    );
    expect(due.length).toBeGreaterThan(0);
  });

  it("/clinical/reactions (+ [id]): six reports across the states, one past due, with medicines and events", async () => {
    const { listReports, reportFor } = await import("@/lib/pharmacy/clinical/reaction-read");
    const list = await read((tx) => listReports(tx, d.h, new Date()));
    expect(list).toHaveLength(6);
    expect(new Set(list.map((r) => r.state))).toEqual(new Set(["to_submit", "submitted", "closed_not_submitted"]));
    expect(list.some((r) => r.pastDue)).toBe(true);
    expect(list.filter((r) => r.assessed)).toHaveLength(2);
    expect(list.every((r) => r.medicine !== "Not known")).toBe(true);
    const submitted = list.find((r) => r.state === "submitted" && r.assessed)!;
    const one = (await owner((tx) => reportFor(tx, d.h, submitted.id)))!;
    expect(one.causality).toBe("probable");
    expect(one.medicines[0]!.name).toBeTruthy();
    expect(one.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["causality", "submitted"]));
    expect(one.report.reactionText.startsWith("Demo note")).toBe(true);
  });

  it("/clinical/reconciliation (+ [id]): five admissions, open, confirmed, reopened and closed, with signed rules", async () => {
    const { factsFor, listReconciliations, rulesFor } = await import("@/lib/pharmacy/clinical/reconciliation-read");
    const now = new Date();
    const [list, rules] = await owner((tx) => Promise.all([listReconciliations(tx, d.h, now), rulesFor(tx, d.h)]));
    expect(rules.signed).toBe(true);
    expect(list).toHaveLength(5);
    expect(list.map((r) => r.state).sort()).toEqual(["closed", "confirmed", "open", "open", "reopened"]);
    for (const r of list) {
      expect(r.facts.before.length).toBeGreaterThanOrEqual(3);
      expect(r.facts.home.length).toBeGreaterThanOrEqual(2);
      expect(r.facts.ward.length).toBeGreaterThanOrEqual(2);
    }
    const confirmed = list.find((r) => r.state === "confirmed")!;
    const one = (await owner((tx) => factsFor(tx, d.h, confirmed.rec.id, now)))!;
    expect(one.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["confirmed", "printed"]));
    expect(one.facts.decisions.length).toBeGreaterThan(0);
  });

  it("why these pages leave the reader: as the reader a pharmacist sees no course, no name, no admission", async () => {
    const { stewardshipData } = await import("@/lib/pharmacy/clinical/stewardship-read");
    const { reportFor, listReports } = await import("@/lib/pharmacy/clinical/reaction-read");
    const { listReconciliations } = await import("@/lib/pharmacy/clinical/reconciliation-read");
    // accessible_patient_ids() gives a pharmacist no ward patient: the courses are filtered out.
    expect((await read((tx) => stewardshipData(tx, d.h, new Date(Date.now() - 30 * 86_400_000)))).courses).toHaveLength(0);
    // patient_profiles grants the reader no name columns; admissions grants the reader nothing.
    const [first] = await read((tx) => listReports(tx, d.h, new Date()));
    await expect(read((tx) => reportFor(tx, d.h, first!.id))).rejects.toThrow();
    await expect(read((tx) => listReconciliations(tx, d.h, new Date()))).rejects.toThrow();
  });

  it("the three pages, as they now read (app connection): courses, a report with initials, every reconciliation", async () => {
    const { stewardshipData } = await import("@/lib/pharmacy/clinical/stewardship-read");
    const { reportFor, listReports } = await import("@/lib/pharmacy/clinical/reaction-read");
    const { listReconciliations } = await import("@/lib/pharmacy/clinical/reconciliation-read");
    const db = d.lane.db;
    expect((await stewardshipData(db, d.h, new Date(Date.now() - 30 * 86_400_000))).courses.length).toBeGreaterThan(0);
    const [first] = await read((tx) => listReports(tx, d.h, new Date()));
    expect((await reportFor(db, d.h, first!.id))?.patient.fullName).toMatch(/^Demo patient/);
    expect(await listReconciliations(db, d.h, new Date())).toHaveLength(5);
    // Scoped to this hospital: another hospital's id reads nothing.
    expect(await reportFor(db, d.real, first!.id)).toBeNull();
    expect(await listReconciliations(db, d.real, new Date())).toHaveLength(0);
  });
});
