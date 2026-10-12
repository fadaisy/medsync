import type { LaneLine, LaneReasonCode, LaneRule } from "@/lib/pharmacy/lanes";
import { describe, expect, it } from "vitest";

import { LANE_REASON_ORDER, laneFor } from "@/lib/pharmacy/lanes";

/**
 * Pharmacy Phase 1 — review lanes (LN-1..LN-8; gate-a-proposal §4). Fixture medicines are invented
 * and named as fixtures (Law 8); no signed list or rule is real.
 */
let n = 0;
const line = (o: Partial<LaneLine> = {}): LaneLine => ({
  id: `L${++n}`,
  controlled: false,
  checkAnswers: [],
  confirmedFlags: [],
  regimenId: "fixture-regimen-a",
  edits: [],
  conditionId: "fixture-condition",
  kind: "drug",
  drugId: "fixture-tablet-a",
  ...o,
});

const ruleWith = (on: readonly LaneReasonCode[], version = 1): LaneRule => ({
  version,
  reasons: LANE_REASON_ORDER.map((code) => ({ code, on: on.includes(code) })),
});
const ALL_ON = ruleWith(LANE_REASON_ORDER);
const HIGH_RISK = new Set(["fixture-injection-d"]);

/** One line holding exactly the stored fact each reason reads. */
const FACT_LINE: Record<LaneReasonCode, () => LaneLine> = {
  overridden_stop: () =>
    line({ checkAnswers: [{ code: "allergy", answer: "benefit", outcome: "stop" }] }),
  controlled: () => line({ controlled: true }),
  high_risk: () => line({ drugId: "fixture-injection-d" }),
  child_check: () => line({ checkAnswers: [{ code: "child", outcome: "check" }] }),
  renal_check: () => line({ checkAnswers: [{ code: "kidney", outcome: "check" }] }),
  preset_dose_changed: () => line({ edits: [{ field: "dose" }] }),
  typed_dose: () => line({ regimenId: null }),
};

describe("lanes", () => {
  for (const code of LANE_REASON_ORDER) {
    it(`LN-1, LN-2 reason "${code}" on: its line makes the prescription pharmacist-first`, () => {
      const r = laneFor([FACT_LINE[code]()], ruleWith([code]), HIGH_RISK);
      expect(r.lane).toBe("pharmacist_first");
      expect(r.reasons).toEqual([code]);
    });

    it(`LN-1, LN-2 reason "${code}" off: it never fires${code === "controlled" ? " (except LN-5)" : ""}`, () => {
      const r = laneFor(
        [FACT_LINE[code]()],
        ruleWith(LANE_REASON_ORDER.filter((c) => c !== code)),
        HIGH_RISK,
      );
      if (code === "controlled") {
        expect(r.lane).toBe("pharmacist_first");
        expect(r.reasons).toEqual(["controlled"]);
      } else {
        expect(r.lane).toBe("standard");
        expect(r.reasons).toEqual([]);
      }
    });
  }

  it("LN-1 a reason the rule does not list is off", () => {
    const r = laneFor([FACT_LINE.child_check()], { version: 3, reasons: [] }, null);
    expect(r).toMatchObject({ lane: "standard", reasons: [], ruleVersion: 3 });
  });

  it("LN-2 the lane belongs to the prescription; perLine names which line matched", () => {
    const plain = line();
    const stop = FACT_LINE.overridden_stop();
    const r = laneFor([plain, stop], ALL_ON, null);
    expect(r.lane).toBe("pharmacist_first");
    expect(r.perLine.get(plain.id)).toEqual([]);
    expect(r.perLine.get(stop.id)).toEqual(["overridden_stop"]);
  });

  it("LN-2 reasons are listed most serious first, once each", () => {
    const r = laneFor(
      [
        line({ regimenId: null }),
        line({ edits: [{}], checkAnswers: [{ code: "kidney", outcome: "check" }] }),
        line({ drugId: "fixture-injection-d", controlled: true }),
        line({ checkAnswers: [{ code: "child" }, { code: "allergy", outcome: "stop" }] }),
        line({ regimenId: null }),
      ],
      ALL_ON,
      HIGH_RISK,
    );
    expect(r.reasons).toEqual([...LANE_REASON_ORDER]);
  });

  it("LN-3 an overridden stop is read from a stored stop answer, or the legacy allergy code", () => {
    const legacy = line({ checkAnswers: [], confirmedFlags: ["allergy"] });
    const answeredCheck = line({ checkAnswers: [{ code: "allergy", outcome: "check" }] });
    const otherStop = line({ checkAnswers: [{ code: "interactions", outcome: "stop" }] });
    const rule = ruleWith(["overridden_stop"]);
    expect(laneFor([legacy], rule, null).reasons).toEqual(["overridden_stop"]);
    expect(laneFor([otherStop], rule, null).reasons).toEqual(["overridden_stop"]);
    expect(laneFor([answeredCheck], rule, null).lane).toBe("standard");
  });

  it("LN-3 child reads `child` or the EMR sheet's `paediatric_routing`; renal reads `kidney`", () => {
    const rule = ruleWith(["child_check", "renal_check"]);
    expect(laneFor([line({ confirmedFlags: ["paediatric_routing"] })], rule, null).reasons).toEqual(
      ["child_check"],
    );
    expect(laneFor([line({ confirmedFlags: ["kidney"] })], rule, null).reasons).toEqual([
      "renal_check",
    ]);
    expect(laneFor([line({ confirmedFlags: ["weight"] })], rule, null).lane).toBe("standard");
  });

  it("LN-3 a preset dose changed needs a regimen and edits; typed dose needs a drug Plan line with no regimen", () => {
    const rule = ruleWith(["preset_dose_changed", "typed_dose"]);
    expect(laneFor([line({ regimenId: null, edits: [{}] })], rule, null).reasons).toEqual([
      "typed_dose",
    ]);
    expect(laneFor([line({ regimenId: null, kind: "fluid" })], rule, null).lane).toBe("standard");
    // An EMR-sheet row (no problem) is not a typed Plan dose.
    expect(laneFor([line({ regimenId: null, conditionId: null })], rule, null).lane).toBe(
      "standard",
    );
  });

  it("LN-4 with no signed rule every prescription is pharmacist-first, with no reasons", () => {
    for (const lines of [[], [line()], [FACT_LINE.controlled()]])
      expect(laneFor(lines, null, HIGH_RISK)).toEqual({
        lane: "pharmacist_first",
        reasons: [],
        perLine: new Map(),
        ruleVersion: null,
      });
  });

  it("LN-5 a controlled line is always pharmacist-first, even with every reason off", () => {
    const r = laneFor([line(), FACT_LINE.controlled()], ruleWith([]), null);
    expect(r).toMatchObject({ lane: "pharmacist_first", reasons: ["controlled"], ruleVersion: 1 });
  });

  it("LN-6 stock and payment are not inputs: a stored stock answer moves nothing", () => {
    const r = laneFor(
      [line({ checkAnswers: [{ code: "stock", answer: "out", outcome: "check" }] })],
      ALL_ON,
      null,
    );
    expect(r.lane).toBe("standard");
  });

  it("LN-1 high-risk fires only against a signed list; with none it never fires", () => {
    const d = line({ drugId: "fixture-injection-d" });
    expect(laneFor([d], ALL_ON, null).lane).toBe("standard");
    expect(laneFor([d], ALL_ON, new Set()).lane).toBe("standard");
    expect(laneFor([d], ALL_ON, HIGH_RISK).reasons).toEqual(["high_risk"]);
  });

  it("LN-7 the result is a snapshot: a later rule version does not rewrite it", () => {
    const lines = [FACT_LINE.typed_dose()];
    const first = laneFor(lines, ruleWith(["typed_dose"], 1), null);
    const copy = structuredClone(first);
    const later = laneFor(lines, ruleWith([], 2), null);
    expect(first).toEqual(copy);
    expect(later).toMatchObject({ lane: "standard", ruleVersion: 2 });
  });

  it("LN-8 a changed prescription is worked out again as it now stands", () => {
    const a = line();
    const b = line({ drugId: "fixture-tablet-b" });
    expect(laneFor([a, b], ALL_ON, null).lane).toBe("standard");
    // The prescriber replaces line b with a controlled medicine: the old row is no longer active.
    const bNew = line({ drugId: "fixture-injection-d", controlled: true });
    const r = laneFor([a, bNew], ALL_ON, null);
    expect(r.lane).toBe("pharmacist_first");
    expect(r.perLine.get(a.id)).toEqual([]);
    expect(r.perLine.has(b.id)).toBe(false);
  });

  describe("gate-a-proposal §4: six fixture prescriptions under three sets of reasons", () => {
    const P = ruleWith(LANE_REASON_ORDER.filter((c) => c !== "typed_dose"));
    const W = ruleWith(LANE_REASON_ORDER);
    const N = ruleWith(["overridden_stop", "controlled"]);
    const FIXTURES: Record<string, LaneLine[]> = {
      // FTA from a signed regimen, unchanged
      R1: [line()],
      // FTA typed dose (no regimen)
      R2: [line({ regimenId: null })],
      // Fixture capsule C, allergy stop overridden
      R3: [
        line({
          drugId: "fixture-capsule-c",
          checkAnswers: [{ code: "allergy", answer: "benefit", outcome: "stop" }],
        }),
      ],
      // FTA for a child under the threshold, "Child" answered
      R4: [line({ checkAnswers: [{ code: "child", answer: "weight_checked", outcome: "check" }] })],
      // FTA regimen, dose edited + Fixture tablet B typed
      R5: [
        line({ edits: [{ field: "dose" }] }),
        line({ drugId: "fixture-tablet-b", regimenId: null }),
      ],
      // Fixture injection D flagged controlled
      R6: [line({ drugId: "fixture-injection-d", controlled: true })],
    };
    const TABLE: [string, string, string, string][] = [
      ["R1", "standard", "standard", "standard"],
      ["R2", "standard", "pharmacist_first", "standard"],
      ["R3", "pharmacist_first", "pharmacist_first", "pharmacist_first"],
      ["R4", "pharmacist_first", "pharmacist_first", "standard"],
      ["R5", "pharmacist_first", "pharmacist_first", "standard"],
      ["R6", "pharmacist_first", "pharmacist_first", "pharmacist_first"],
    ];
    for (const [rx, p, w, nn] of TABLE)
      it(`LN-2 ${rx}: P ${p}, W ${w}, N ${nn}`, () => {
        // No high-risk list is signed: that reason is on in P and W but inert.
        expect(laneFor(FIXTURES[rx]!, P, null).lane).toBe(p);
        expect(laneFor(FIXTURES[rx]!, W, null).lane).toBe(w);
        expect(laneFor(FIXTURES[rx]!, N, null).lane).toBe(nn);
      });
  });
});
