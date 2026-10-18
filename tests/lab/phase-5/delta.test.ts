import type { DeltaRule, Pair } from "@/lib/lab/delta";
import { describe, expect, it } from "vitest";

import {
  applies,
  DeltaRulePayload,
  evaluate,
  monthlyReview,
  panelFires,
  PanelRulePayload,
  patternFires,
  previousResult,
  rcv,
  rcvLogNormal,
  trialRule,
  undecided,
} from "@/lib/lab/delta";

/** Every limit, window and threshold here is a FIXTURE, not a proposal. */
const rule = (o: Partial<DeltaRule> = {}): DeltaRule => ({
  concept: "obs.mcv",
  type: "absolute",
  limit: { both: 10 },
  windowHours: 72,
  basis: { kind: "clinical", approver: "Fixture lead", rationale: "Fixture" },
  applicability: { ageFromYears: null, ageToYears: null, specimen: null },
  acrossMethods: false,
  meaning: "May be another patient's sample",
  source: "Fixture source",
  ...o,
});

describe("DL-1 the rule shape", () => {
  it("an RCV rule needs an RCV basis; a panel's k cannot exceed its components", () => {
    expect(DeltaRulePayload.safeParse(rule()).success).toBe(true);
    expect(DeltaRulePayload.safeParse(rule({ type: "rcv" })).success).toBe(false);
    expect(
      PanelRulePayload.safeParse({
        testCode: "test.fbc",
        components: ["obs.mcv", "obs.haemoglobin"],
        k: 3,
        meaning: "Fixture meaning",
        source: "Fixture",
      }).success,
    ).toBe(false);
  });
});

describe("DL-3 evaluation for every type, rise and fall limits", () => {
  it("absolute and percent", () => {
    expect(evaluate(rule(), 80, 95, 24).fired).toBe(true);
    expect(evaluate(rule(), 80, 85, 24).fired).toBe(false);
    expect(evaluate(rule({ type: "percent", limit: { both: 10 } }), 100, 111, 24)).toMatchObject({
      fired: true,
      changePct: 11,
    });
    expect(evaluate(rule({ type: "percent", limit: { both: 10 } }), 100, 95, 24).fired).toBe(false);
  });
  it("rate types divide by the days between the results", () => {
    expect(evaluate(rule({ type: "rate_absolute", limit: { both: 5 } }), 10, 20, 48).fired).toBe(
      false,
    ); // 5/day
    expect(evaluate(rule({ type: "rate_absolute", limit: { both: 4 } }), 10, 20, 48).fired).toBe(
      true,
    );
    expect(evaluate(rule({ type: "rate_percent", limit: { both: 20 } }), 100, 150, 48).fired).toBe(
      true,
    ); // 25 %/day
  });
  it("separate rise and fall limits; a missing direction never fires", () => {
    const r = rule({ limit: { rise: 5, fall: null } });
    expect(evaluate(r, 80, 86, 24).fired).toBe(true);
    expect(evaluate(r, 80, 60, 24).fired).toBe(false);
  });
  it("RCV with both Z conventions and the log-normal form", () => {
    expect(rcv(2, 1.5, 1.96)).toBeCloseTo(6.93, 2); // gate-a §6 arithmetic illustration
    expect(rcv(2, 1.5, 2.58)).toBeGreaterThan(rcv(2, 1.5, 1.96));
    expect(rcv(2, 1.5, 1.65)).toBeLessThan(rcv(2, 1.5, 1.96));
    const ln = rcvLogNormal(10, 20, 1.96);
    expect(ln.up).toBeGreaterThan(-ln.down); // asymmetric: a rise needs more than a fall
    const basis = {
      kind: "rcv" as const,
      cvaPercent: 2,
      cvaSource: "QC",
      cviPercent: 1.5,
      cviSource: "EFLM",
      z: "1.96" as const,
      logNormal: false,
    };
    const r = rule({ type: "rcv", basis });
    expect(evaluate(r, 100, 107.5, 24).fired).toBe(true);
    expect(evaluate(r, 100, 106, 24).fired).toBe(false);
    expect(
      evaluate(
        rule({ type: "rcv", basis: { ...basis, cvaPercent: 10, cviPercent: 20, logNormal: true } }),
        100,
        150,
        24,
      ).fired,
    ).toBe(false);
  });
});

describe("DL-2 the previous result", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 17, 12) - h * 3_600_000);
  const now = { at: at(0), methodCode: "m1" };
  it("the most recent within the window, never an amended-away value", () => {
    const p = previousResult(
      [
        { reportId: "old", value: 1, at: at(100), methodCode: "m1", amendedAway: false },
        { reportId: "new", value: 2, at: at(10), methodCode: "m1", amendedAway: false },
        { reportId: "gone", value: 3, at: at(5), methodCode: "m1", amendedAway: true },
      ],
      now,
      rule(),
    );
    expect(p).toMatchObject({ kind: "compare", prior: { reportId: "new" } });
    expect(
      previousResult(
        [{ reportId: "old", value: 1, at: at(100), methodCode: "m1", amendedAway: false }],
        now,
        rule(),
      ).kind,
    ).toBe("none");
  });
  it("a different method is shown, not compared, unless the rule says so", () => {
    const h = [{ reportId: "x", value: 1, at: at(1), methodCode: "m2", amendedAway: false }];
    expect(previousResult(h, now, rule()).kind).toBe("different_method");
    expect(previousResult(h, now, rule({ acrossMethods: true })).kind).toBe("compare");
  });
});

describe("DL-1 applicability, DL-10 panel, DL-11 pattern, DL-6 decisions", () => {
  it("age band and specimen", () => {
    const r = rule({
      applicability: { ageFromYears: 18, ageToYears: null, specimen: "venous_whole_blood" },
    });
    expect(applies(r, { ageYears: 30, specimen: "venous_whole_blood" })).toBe(true);
    expect(applies(r, { ageYears: 10, specimen: "venous_whole_blood" })).toBe(false);
    expect(applies(r, { ageYears: 30, specimen: "capillary" })).toBe(false);
  });
  it("a panel rule fires once for k of N failures", () => {
    const p = {
      testCode: "test.urea_electrolytes",
      components: ["obs.sodium", "obs.potassium", "obs.urea"],
      k: 2,
      meaning: "Fixture",
      source: "Fixture",
    };
    expect(panelFires(p, ["obs.sodium"])).toBe(false);
    expect(panelFires(p, ["obs.sodium", "obs.urea"])).toBe(true);
  });
  it("a pattern rule needs every condition, including changes", () => {
    const p = {
      name: "Fixture pattern",
      description: "Fixture: one high with another low",
      conditions: [
        { concept: "obs.potassium", op: "above" as const, value: 6 },
        { concept: "obs.calcium", op: "fell_by" as const, value: 0.5 },
      ],
      meaning: "Fixture meaning",
      source: "Fixture",
    };
    expect(
      patternFires(p, {
        "obs.potassium": { now: 7, previous: 4 },
        "obs.calcium": { now: 1.5, previous: 2.2 },
      }),
    ).toBe(true);
    expect(
      patternFires(p, {
        "obs.potassium": { now: 7, previous: 4 },
        "obs.calcium": { now: 2.1, previous: 2.2 },
      }),
    ).toBe(false);
    expect(patternFires(p, { "obs.potassium": { now: 7, previous: null } })).toBe(false);
  });
  it("release waits for a decision on every fired rule", () => {
    expect(undecided(["f1", "f2"], ["f1"])).toEqual(["f2"]);
    expect(undecided(["f1"], ["f1"])).toEqual([]);
  });
});

describe("DL-8 the trial, DL-9 the monthly review", () => {
  it("counts pairs, flags and known mislabels, and writes nothing", () => {
    const pairs: Pair[] = [
      { previous: 80, current: 95, intervalHours: 24, knownMislabel: true },
      { previous: 80, current: 82, intervalHours: 24, knownMislabel: false },
      { previous: 80, current: 99, intervalHours: 500, knownMislabel: false }, // outside the window
    ];
    const frozen = Object.freeze(pairs.map((p) => Object.freeze({ ...p })));
    expect(trialRule(rule(), frozen)).toEqual({
      pairs: 3,
      flags: 1,
      mislabels: 1,
      mislabelsFlagged: 1,
    });
  });
  it("rate, outcome shares, PPV for sample errors and 'Flags often'", () => {
    const r = monthlyReview(10, ["physiological_or_treatment", "mislabel_confirmed"]);
    expect(r).toMatchObject({ rate: 0.2, ppv: 0.5, flagsOften: true });
    expect(r.share.mislabel_confirmed).toBe(0.5);
    expect(monthlyReview(0, [])).toMatchObject({ rate: null, ppv: null, flagsOften: false });
  });
});
