import type { MarRecord, Regimen } from "@/lib/pharmacy/wards/derive";
import { describe, expect, it } from "vitest";

import { PRW } from "@/content/pharmacy-rework-patients";
import { dayStats, excursions, monthGrid, pctInRange } from "@/lib/pharmacy/cold/derive";
import { epiPlan, epiStatus, nextAfter, vaxStock } from "@/lib/pharmacy/epi/derive";
import { opCourse, opRefill, pillCount } from "@/lib/pharmacy/op/derive";
import { smsQueue } from "@/lib/pharmacy/sms/derive";
import {
  courseDays,
  DAY,
  day0,
  doseState,
  HOUR,
  journey,
  MIN,
  roundLines,
  slots,
} from "@/lib/pharmacy/wards/derive";

/** Pure P4 engines (rework PRD §6.3, §6.4): wards, outpatients, immunisation, cold chain and the SMS queue. */
const T0 = Date.parse("2026-10-20T00:00:00+03:00");
const at = (h: number, d = 0) => T0 + d * DAY + h * HOUR;

const rx = (over: Partial<Regimen> = {}): Regimen => ({
  id: "rx1",
  patientId: "p1",
  medicineId: "amox",
  drug: "Amoxicillin",
  dose: "500 mg",
  route: "oral",
  frequency: "8h",
  prn: false,
  start: at(5),
  days: 5,
  ...over,
});

describe("wards", () => {
  it("lays dose times on the Kampala clock and stops at the course end", () => {
    expect(slots(rx(), at(0), at(23))).toEqual([at(6), at(14), at(22)]);
    expect(slots(rx({ days: 1 }), at(0), at(0, 3))).toHaveLength(3);
    expect(day0(at(23))).toBe(T0);
  });

  it("names each dose's state", () => {
    const r = rx();
    const recs: MarRecord[] = [
      {
        rxId: "rx1",
        scheduledFor: at(6),
        at: at(6) + 10 * MIN,
        state: "administered",
        reason: null,
      },
      { rxId: "rx1", scheduledFor: at(14), at: at(14), state: "withheld", reason: "Out of stock" },
    ];
    expect(doseState(r, at(6), recs, at(23))).toBe("given");
    expect(doseState(r, at(14), recs, at(23))).toBe("stock");
    expect(doseState(r, at(22), recs, at(21.6))).toBe("due");
    expect(doseState(r, at(22), recs, at(23.5))).toBe("overdue");
    expect(doseState(r, at(6, 1), recs, at(23))).toBe("next");
  });

  it("follows the journey and lists what to pick", () => {
    const r = rx();
    const recs: MarRecord[] = [
      { rxId: "rx1", scheduledFor: at(6), at: at(6), state: "administered", reason: null },
    ];
    const j = journey(
      r,
      [
        { qty: 3, at: at(5), receivedAt: at(5.5) },
        { qty: 2, at: at(12), receivedAt: null },
      ],
      0,
      recs,
      at(13),
    );
    expect(j).toMatchObject({ picked: 5, recv: 3, given: 1, left: 2, onway: 2 });
    const lines = roundLines([r], recs, () => j, 24, at(13));
    expect(lines[0]).toMatchObject({ medicineId: "amox", need: 3, have: 4, pick: 0 });
    expect(courseDays("7d")).toBe(7);
    expect(courseDays(null)).toBeNull();
  });
});

describe("outpatients", () => {
  it("works out the run-out, the pill count and the course day", () => {
    const hist = [
      { at: at(9, -60), qty: 60, back: null },
      { at: at(9, -30), qty: 60, back: 6 },
    ];
    const s = opRefill(hist, 2, T0);
    expect(s.runOut).toBe(day0(at(9, -30)) + 30 * DAY);
    expect(s.k).toBe("due");
    expect(s.counts[0]!.pct).toBe(90);
    expect(pillCount(hist[1]!, 2, 10, T0)).toMatchObject({
      since: 30,
      should: 60,
      taken: 50,
      pct: 83,
    });
    const c = opCourse(at(9, -3), 7, [], T0);
    expect(c).toMatchObject({ dayN: 4, needCheck: true, done: false });
  });
});

describe("immunisation", () => {
  it("plans the schedule, flags a defaulter and books the next visit", () => {
    const dob = T0 - 60 * DAY;
    const plan = epiPlan(
      { id: "c", kind: "child", dob },
      { BCG: { at: dob, batchId: "b" }, OPV0: { at: dob, batchId: "b" } },
      T0,
    );
    expect(plan.find((x) => x.lab === "Penta1")!.s).toBe("overdue");
    expect(plan.find((x) => x.lab === "Penta2")!.s).toBe("wait");
    const st = epiStatus(plan, null);
    expect(st.k).toBe("overdue");
    const nx = nextAfter(plan, ["OPV1", "Penta1", "PCV1", "Rota1"], T0);
    expect(nx!.d).toBe(day0(T0) + 28 * DAY);
    expect(
      vaxStock({
        vaccine: "penta",
        at: 30,
        cold: 200,
        max: 150,
        todayUsed: 0,
        week: 10,
        perDay: 2,
      }),
    ).toMatchObject({ k: "refill", min: 75, top: 120 });
  });
});

describe("cold chain", () => {
  const series = Array.from({ length: 12 }, (_, i) => ({
    at: T0 + i * 10 * MIN,
    v: i >= 3 && i <= 7 ? 9.2 : 5,
  }));
  it("finds a 30-minute excursion and the time in range", () => {
    const e = excursions(series);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ kind: "high", peak: 9.2, mins: 50 });
    expect(pctInRange(series)).toBe(55);
    expect(dayStats(series)).toMatchObject({ max: 9.2, min: 5, hiAlarm: null });
  });

  it("places the chart readings on the WHO grid", () => {
    const g = monthGrid({
      monthStart: T0,
      days: 31,
      chart: [{ day: 1, slot: "am", v: 5.4, initials: "NS", fi: null }],
      sensor: series,
      now: T0 + 2 * DAY,
    });
    expect(g.rows).toHaveLength(22);
    expect(g.days[0]).toMatchObject({ amRow: 5, pmRow: null });
    expect(g.days[0]!.sensor!.max).toBe(9.2);
  });
});

describe("reminders", () => {
  it("queues refill, course and immunisation messages under 160 characters", () => {
    const q = smsQueue({
      now: T0,
      hospital: "Mulago",
      enabled: (r) => r !== "course",
      template: (r) => PRW.sms.templates[r]!.en,
      refills: [
        { rxId: "r1", patientId: "p1", name: "Sarah", med: "Metformin", runOut: T0 + 3 * DAY },
      ],
      courses: [{ rxId: "r2", patientId: "p2", name: "John", med: "Amoxicillin", needCheck: true }],
      epi: [{ clientId: "c1", name: "Aisha", appt: T0 + DAY, overdue: null }],
    });
    expect(q.map((x) => x.rule)).toEqual(["refill_due", "epi_tomorrow"]);
    expect(q[0]!.body).toContain("Metformin");
    expect(q.every((x) => x.body.length <= 160)).toBe(true);
  });

  it("keeps build words out of the copy", () => {
    expect(JSON.stringify(PRW)).not.toMatch(/\b(Phase|ADR|D-PH|seam)\b/);
  });
});
