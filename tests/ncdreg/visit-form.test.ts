/**
 * §11.5 speed budget, B9 form assembly, B2/B6 derivations, G1 completeness, §5.5 confirm ranges.
 * Pure: no database.
 */
import { describe, expect, it } from "vitest";

import type { DPerson, DVisit } from "@/lib/ncdreg/indicators/dataset";
import { completeness } from "@/lib/ncdreg/indicators/engine";
import { reviewsDue, trajectory } from "@/lib/ncdreg/read/derive";
import { CONDITION_CATALOGUE, moduleByCode } from "@/lib/ncdreg/standard/conditions";
import { consistencyFindings, CONFIRM_RANGES, needsConfirmation } from "@/lib/ncdreg/standard/validation";
import { requiredInputs, visitFormSpec } from "@/lib/ncdreg/visit-form";
import { THROWAWAY } from "../ncdreg-db/_throwaway";

const m = (c: string) => moduleByCode.get(c)!;
const reg = (c: string, id = c) => ({ registrationId: id, module: m(c) });

describe("speed budget (§11.5)", () => {
  it("diabetes + hypertension follow-up, unchanged medicines: at most 9 required inputs, no navigation", () => {
    const spec = visitFormSpec([reg("diabetes"), reg("hypertension")], "scheduled");
    expect(requiredInputs(spec)).toBeLessThanOrEqual(9);
    expect(new Set(spec.map((f) => f.part))).toEqual(new Set(["nurse", "clinician"])); // one screen, two parts
  });
  it("each core registration adds at most 2 required inputs", () => {
    const base = requiredInputs(visitFormSpec([reg("diabetes"), reg("hypertension")], "scheduled"));
    for (const core of CONDITION_CATALOGUE.filter((x) => x.level === "core")) {
      const more = requiredInputs(visitFormSpec([reg("diabetes"), reg("hypertension"), reg(core.code)], "scheduled"));
      expect(more - base, core.code).toBeLessThanOrEqual(2);
    }
  });
  it("records the measured budget for the ledger", () => {
    const n = requiredInputs(visitFormSpec([reg("diabetes"), reg("hypertension")], "scheduled"));
    process.stdout.write(`speed budget: ${n} required inputs (diabetes + hypertension, unchanged medicines)\n`);
  });
});

describe("B9: the form is assembled from the registrations", () => {
  it("hypertension only: shared fields, no glucose", () => {
    const keys = visitFormSpec([reg("hypertension")], "scheduled").map((f) => f.key);
    expect(keys).toContain("bp_1");
    expect(keys).not.toContain("glucose");
  });
  it("diabetes makes glucose expected and offers HbA1c and hypoglycaemia", () => {
    const spec = visitFormSpec([reg("diabetes")], "scheduled");
    expect(spec.find((f) => f.key === "glucose")?.required).toBe(true);
    expect(spec.find((f) => f.key === "hba1c")?.required).toBe(false);
    expect(spec.some((f) => f.key === "hypoglycaemia")).toBe(true);
  });
  it("a core registration adds its control and observations; refill visits do not require control", () => {
    const spec = visitFormSpec([reg("heart_failure", "r1")], "scheduled");
    expect(spec.find((f) => f.key === "control:r1")?.required).toBe(true);
    expect(spec.filter((f) => f.kind === "observation").map((f) => f.label)).toEqual(["NYHA class", "Oedema"]);
    expect(visitFormSpec([reg("heart_failure", "r1")], "refill_only").find((f) => f.key === "control:r1")?.required).toBe(false);
  });
  it("a throwaway module needs no new screen: its fields appear from its record", () => {
    const spec = visitFormSpec([{ registrationId: "z", module: THROWAWAY }], "scheduled");
    expect(spec.some((f) => f.key === "obs:z:flares_since_last_visit")).toBe(true);
  });
});

const visit = (date: string, o: Partial<DVisit> = {}): DVisit => ({
  id: date,
  date,
  type: "scheduled",
  closed: true,
  invalid: false,
  historical: false,
  enteredDate: date,
  bp: [130, 80],
  glucose: null,
  hba1c: null,
  weightKg: 70,
  medicines: [],
  medicinesRecorded: true,
  missedDoses: "none",
  medicinesObtained: "full",
  notObtainedReason: null,
  nextAppointment: "2027-01-01",
  disposition: null,
  recordedControl: {},
  ...o,
});
const person = (o: Partial<DPerson>): DPerson => ({
  id: "p",
  sex: "female",
  birthYear: 1970,
  isSynthetic: true,
  district: null,
  knownCvd: [],
  hasValidPhone: true,
  recallRemovedAt: null,
  registrations: [{ id: "r", condition: "diabetes", date: "2024-01-01" }],
  visits: [],
  reviews: [],
  events: [],
  appointments: [],
  calls: [],
  ...o,
});

describe("B2 trajectory and B6 due markers", () => {
  it("the last six closed visits, oldest first", () => {
    const vs = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"].map((d) => visit(d));
    expect(trajectory(person({ visits: [...vs, visit("2026-09-01", { closed: false })] })).map((v) => v.date)).toEqual(vs.slice(2).map((v) => v.date));
  });
  it("due when never done or done 12 months ago or more; HbA1c from visits", () => {
    const p = person({
      reviews: [
        { component: "kidney", date: "2025-10-05", data: {}, derived: {} },
        { component: "eyes", date: "2025-10-06", data: {}, derived: {} },
      ],
      visits: [visit("2026-03-01", { hba1c: { percent: 7, resultDate: "2026-03-01" } })],
    });
    const due = Object.fromEntries(reviewsDue(p, CONDITION_CATALOGUE, "2026-10-05").map((r) => [r.component, r.due]));
    expect(due).toEqual({ eyes: false, feet: true, hba1c: false, kidney: true, lipids: true });
  });
});

describe("C3 due list on boundary dates", () => {
  const p = (last: string) =>
    person({ registrations: [{ id: "r", condition: "hypertension", date: "2020-01-01" }], reviews: [{ component: "lipids", date: last, data: {}, derived: {} }] });
  const lipids = (last: string, today: string) => reviewsDue(p(last), CONDITION_CATALOGUE, today).find((r) => r.component === "lipids")!;
  it("exactly 12 months ago: due", () => expect(lipids("2025-10-05", "2026-10-05")).toMatchObject({ due: true, dueSoon: false }));
  it("12 months less a day: not due yet, due within 30 days", () => expect(lipids("2025-10-06", "2026-10-05")).toMatchObject({ due: false, dueSoon: true, dueOn: "2026-10-06" }));
  it("due in 30 days exactly: in the list; in 31 days: not", () => {
    expect(lipids("2025-11-04", "2026-10-05").dueSoon).toBe(true);
    expect(lipids("2025-11-05", "2026-10-05").dueSoon).toBe(false);
  });
  it("never recorded: due today", () => expect(reviewsDue(person({ registrations: [{ id: "r", condition: "hypertension", date: "2026-01-01" }] }), CONDITION_CATALOGUE, "2026-10-05").every((r) => r.due)).toBe(true));
});

describe("G1 completeness", () => {
  it("lists what is missing, applicable fields only", () => {
    const regs = [{ id: "d", module: m("diabetes") }, { id: "h", module: m("heart_failure") }];
    const r = completeness({ visit: { ...visit("2026-10-05"), glucose: null, recordedControl: {} }, registrations: regs });
    expect(r.missing).toEqual(["glucose", "recorded_control:heart_failure"]);
    expect(completeness({ visit: visit("2026-10-05"), registrations: [{ id: "h", module: m("hypertension") }] }).score).toBe(100);
  });
});

describe("§5.5 confirm, never block: every range", () => {
  for (const [k, [lo, hi]] of Object.entries(CONFIRM_RANGES.ranges))
    it(`${k}: inside passes, outside asks`, () => {
      expect(needsConfirmation({ [k]: (lo + hi) / 2 })).toEqual([]);
      expect(needsConfirmation({ [k]: hi + 1 })).toEqual([k]);
      if (lo > 0) expect(needsConfirmation({ [k]: lo / 2 })).toEqual([k]);
    });
  it("systolic not above diastolic", () => expect(needsConfirmation({ systolic: 90, diastolic: 95 })).toContain("systolic_not_above_diastolic"));
});

describe("§5.5 consistency queries (to the query list, never an alert)", () => {
  const base = { sex: "female" as const, birthYear: 1970, registrations: [], latestMedicineAtc: null, eventTypes: [], visits: [] };
  it.each([
    ["type_1_without_insulin", { registrations: [{ condition: "diabetes", subtype: "type_1", diagnosisYear: 2000 }], latestMedicineAtc: ["A10BA02"] }],
    ["diagnosis_before_birth", { registrations: [{ condition: "hypertension", subtype: "primary", diagnosisYear: 1960 }] }],
    ["pregnancy_male", { sex: "male" as const, eventTypes: ["pregnancy"] }],
    ["duplicate_registration", { registrations: [{ condition: "hypertension", subtype: "primary", diagnosisYear: 2000 }, { condition: "hypertension", subtype: "primary", diagnosisYear: 2001 }] }],
    ["weight_change_20pct", { visits: [{ date: "2026-01-01", weightKg: 70 }, { date: "2026-02-01", weightKg: 90 }] }],
    ["same_day_duplicate_visit", { visits: [{ date: "2026-01-01", weightKg: 70 }, { date: "2026-01-01", weightKg: 70 }] }],
  ])("%s", (rule, o) => expect(consistencyFindings({ ...base, ...o })).toContain(rule));
  it("type 1 with insulin raises nothing", () =>
    expect(consistencyFindings({ ...base, registrations: [{ condition: "diabetes", subtype: "type_1", diagnosisYear: 2000 }], latestMedicineAtc: ["A10A"] })).toEqual([]));
});
