/**
 * The pharmacy demo's dispensing day (ADR 0450, section 4) on the PGlite lane: setup and stock, then
 * `dispensingSection`, then each page's own loader as a demo pharmacist of the point. Runs with EMR_PGLITE=1.
 */
import type { DemoLane } from "./_pharmacy-demo";
import type { EmrTx } from "@/lib/emr/db";
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

describe.skipIf(!laneOn)("Pharmacy demo: the dispensing day (section 4)", () => {
  let d: DemoLane;
  let made: { handovers: string[]; slips: string[]; queries: string[] };
  const db = () => d.lane.db;
  const point = (k: "opd" | "inpatient") => d.s.points[k].id;

  beforeAll(async () => {
    d = await demoLane((x) => (held.db = x));
    const m = await import("@/lib/pharmacy/demo/dispensing");
    const t0 = Date.now();
    await m.dispensingSection(d.s);
    // eslint-disable-next-line no-console -- the section's size and time, reported
    console.info(`[dispensing] ${Date.now() - t0} ms`, JSON.stringify(d.s.counts));
    made = m.dispensingMade;
  }, 900_000);

  it("writes about 250 prescription lines over the 60 patients", () => {
    expect(d.s.counts.prescription_lines).toBeGreaterThan(200);
    expect(d.s.counts.prescription_lines).toBeLessThan(320);
  });

  it("/pharmacy: the queue at both busy points has every stage, both lanes, window and ward lines", async () => {
    const { getReviewQueue } = await import("@/lib/pharmacy/review/read");
    for (const k of ["opd", "inpatient"] as const) {
      const queue = await getReviewQueue(d.h, point(k), db());
      const stages = new Set(queue.rows.map((r) => r.stage));
      for (const st of ["to_review", "queried", "ready", "awaiting_cosign"])
        expect(stages, st).toContain(st);
      expect(new Set(queue.rows.map((r) => r.lane))).toEqual(
        new Set(["standard", "pharmacist_first"]),
      );
      expect(new Set(queue.rows.map((r) => r.origin))).toEqual(new Set(["window", "ward"]));
      expect(queue.rule.signed && queue.rule.highRiskSigned).toBe(true);
      expect(queue.rows.length).toBeGreaterThan(30);
    }
  });

  it("/pharmacy/prescriptions/[key] and /handover: the review, and ready lines with first-to-expire batches", async () => {
    const { getReview, getReviewQueue } = await import("@/lib/pharmacy/review/read");
    const { getHandover } = await import("@/lib/pharmacy/supply/read");
    const rows = (await getReviewQueue(d.h, point("opd"), db())).rows;
    const queried = rows.find((r) => r.stage === "queried")!;
    const rv = await getReview(d.h, queried.key, point("opd"), db());
    expect(rv?.scope).not.toBe("out");
    expect(rv!.queries.some((q) => q.state === "open")).toBe(true);
    const ready = rows.filter((r) => r.stage === "ready" && r.origin === "window");
    expect(ready.length).toBeGreaterThan(2);
    const ho = await getHandover(
      d.h,
      ready[0]!.key,
      { id: point("opd"), labelMode: "printed" },
      null,
      db(),
    );
    expect(ho!.lines.length).toBeGreaterThan(0);
    for (const l of ho!.lines) expect(l.staged?.batches?.length).toBeGreaterThan(0);
    expect(ho!.lines[0]!.directions).toContain("[demo dose]");
  });

  it("/pharmacy/open-lines: owed and buying outside", async () => {
    const { getOpenLines } = await import("@/lib/pharmacy/review/read");
    const open = await getOpenLines(d.h, db(), point("opd"));
    const outcomes = open.rows.map((r) => r.outcome);
    expect(outcomes.filter((o) => o === "owed").length).toBeGreaterThanOrEqual(5);
    expect(outcomes.filter((o) => o === "buying_outside").length).toBeGreaterThanOrEqual(3);
  });

  it("/pharmacy/supplied: today's hand-overs and the past week's; a reversal; look-backs read", async () => {
    const { getLookBack, getSupplied } = await import("@/lib/pharmacy/supply/read");
    const { localDate } = await import("@/lib/pharmacy/stock/ledger");
    const now = new Date();
    for (const k of ["opd", "inpatient"] as const) {
      const today = await getSupplied(d.h, point(k), localDate(now), db());
      expect(today.rows.length, k).toBeGreaterThanOrEqual(4);
      const before = await getSupplied(
        d.h,
        point(k),
        localDate(new Date(now.getTime() - 2 * DAY)),
        db(),
      );
      expect(before.rows.length, k).toBeGreaterThanOrEqual(2);
    }
    expect(
      JSON.stringify((await getSupplied(d.h, point("opd"), localDate(now), db())).rows),
    ).toMatch(/handed_back|reversed|Handed back/i);
    expect(Array.isArray(await getLookBack(d.h, db()))).toBe(true);
  });

  it("/pharmacy/supplied/log: the day's log, with a struck row three days ago and log prints logged", async () => {
    const { getDispensingLog } = await import("@/lib/pharmacy/print/log-read");
    const { localDate } = await import("@/lib/pharmacy/stock/ledger");
    const names = async (ids: string[]) =>
      new Map(ids.map((id) => [id, { name: "Demo patient", mrn: "MS-DEMO" }]));
    const day = localDate(new Date(Date.now() - 3 * DAY));
    const log = await getDispensingLog(d.h, point("opd"), day, names, db());
    expect(log.rows.length).toBeGreaterThan(3);
    expect(log.rows.some((r) => r.struck)).toBe(true);
    const prints = await d.pg.query<{ kind: string; n: number }>(
      `SELECT kind, count(*)::int AS n FROM pharmacy_print_events WHERE hospital_id = $1 GROUP BY kind`,
      [d.h],
    );
    const by = Object.fromEntries(prints.rows.map((r) => [r.kind, r.n]));
    expect(by.dispensing_log).toBe(6);
    expect(by.label).toBeGreaterThan(50);
    expect(by.label_reprint).toBe(1);
    expect(by.slip).toBeGreaterThanOrEqual(5);
  });

  it("/pharmacy/labels/[handoverId] and /pharmacy/slip/[id]", async () => {
    const { getLabelSource } = await import("@/lib/pharmacy/supply/read");
    const { getSlip } = await import("@/lib/pharmacy/review/read");
    const src = await getLabelSource(d.h, made.handovers.at(-1)!, db());
    expect(src!.supplies.length).toBeGreaterThan(0);
    expect(src!.supplies[0]!.batchNumber).toMatch(/^DEMO-/);
    const who = async () => ({
      name: "Demo patient",
      medsyncNumber: "MS-DEMO",
      sexAndAge: "F · 40 y",
    });
    // The last slip's line was later confirmed filled elsewhere: its slip has no line left to fill.
    for (const id of made.slips.slice(0, -1)) {
      const slip = await getSlip(d.h, id, who, db());
      expect(slip?.result.ok, id).toBe(true);
    }
    const filled = await getSlip(d.h, made.slips.at(-1)!, who, db());
    expect(filled?.result).toMatchObject({ ok: false });
  });

  it("/pharmacy/clinical/interventions: 30 days of queries, answered every way, at several points and types", async () => {
    const { asClinicalReader } = await import("@/lib/emr/db");
    const { nameWards, queryFacts } = await import("@/lib/pharmacy/clinical/interventions-read");
    const { interventionReport } = await import("@/lib/pharmacy/clinical/interventions");
    const to = new Date();
    const from = new Date(to.getTime() - 30 * DAY);
    const read = await asClinicalReader(
      { userId: d.s.people.pharmacists[0]!, hospitalId: d.h },
      (tx) => queryFacts(tx as EmrTx, d.h, from, to),
      db(),
    );
    const facts = await nameWards(read, d.h, db());
    const r = interventionReport(facts, from, to);
    expect(r.total.sent).toBeGreaterThanOrEqual(25);
    for (const k of ["kept", "changed", "stopped", "withdrawn", "open"] as const)
      expect(r.total[k], k).toBeGreaterThan(0);
    expect(r.byType.length).toBeGreaterThanOrEqual(5);
    expect(r.byWard.length).toBeGreaterThanOrEqual(5);
    expect(r.byWard.some((w) => w.key === "Main outpatient pharmacy")).toBe(true);
  });

  it("/pharmacy/stock: supplied in the last 7 days shows at the window", async () => {
    const { getStockPage } = await import("@/lib/pharmacy/stock/read");
    const page = await getStockPage(
      { userId: d.s.people.pharmacists[0]!, hospitalId: d.h },
      { id: point("opd") },
      new Date(),
      db(),
    );
    expect(
      page.rows.filter((row) => (row as { supplied7?: number }).supplied7! > 0).length,
    ).toBeGreaterThan(5);
  });
});
