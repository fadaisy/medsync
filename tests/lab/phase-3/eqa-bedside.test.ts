import type { Competency, DeviceCheck, DeviceQcRule } from "@/lib/lab/bedside-quality";
import type { EqaRound, EqaScheme } from "@/lib/lab/eqa";
import { describe, expect, it } from "vitest";

import {
  bedsideQuality,
  competencyStatus,
  competencyValidTo,
  deviceCheckDue,
  evaluateDeviceCheck,
} from "@/lib/lab/bedside-quality";
import { eqaCoverage, roundOutcome, roundOverdue, testerWarnings } from "@/lib/lab/eqa";
import { H1, H2, kla, TZ } from "./_fixtures";

const scheme = (o: Partial<EqaScheme> = {}): EqaScheme => ({
  hospitalId: H1,
  id: "scheme-chem",
  provider: "Fixture provider",
  covers: ["test.urea_electrolytes"],
  roundsPerYear: 3,
  active: true,
  ...o,
});
const round = (o: Partial<EqaRound> = {}): EqaRound => ({
  hospitalId: H1,
  id: "round-1",
  schemeId: "scheme-chem",
  receivedOn: "2026-09-01",
  dueOn: "2026-09-15",
  submittedOn: null,
  scoredOn: null,
  testedBy: ["tech-1", "tech-2"],
  samples: [
    { sampleId: "S1", conceptId: "obs.potassium" },
    { sampleId: "S2", conceptId: "obs.sodium" },
  ],
  ...o,
});

describe("external quality assessment (§6.7)", () => {
  it("EA-1 schemes enrol tests per hospital", () => {
    const out = eqaCoverage({
      hospitalId: H1,
      tests: ["test.urea_electrolytes"],
      schemes: [scheme({ hospitalId: H2 })],
      alternatives: [],
      today: "2026-10-13",
      periodDays: 365,
    });
    expect(out).toEqual([{ testCode: "test.urea_electrolytes", covered: "none" }]);
  });

  it("EA-2 a tester with no patient release for the scheme's tests in the window is warned about", () => {
    const releases = [
      { hospitalId: H1, userId: "tech-1", testCode: "test.urea_electrolytes", day: "2026-08-20" },
      { hospitalId: H1, userId: "tech-2", testCode: "test.fbc", day: "2026-08-20" },
      { hospitalId: H2, userId: "tech-2", testCode: "test.urea_electrolytes", day: "2026-08-20" },
    ];
    expect(testerWarnings({ round: round(), scheme: scheme(), releases, windowDays: 30 })).toEqual([
      "tech-2",
    ]);
    expect(testerWarnings({ round: round(), scheme: scheme(), releases, windowDays: 5 })).toEqual([
      "tech-1",
      "tech-2",
    ]);
    expect(roundOverdue(round(), "2026-09-16")).toBe(true);
    expect(roundOverdue(round({ submittedOn: "2026-09-14" }), "2026-09-16")).toBe(false);
  });

  it("EA-3 scores are the provider's; MedSync only reads them", () => {
    expect(roundOutcome(round()).outcome).toBeNull();
    const scored = round({
      samples: [{ sampleId: "S1", conceptId: "obs.potassium", score: "acceptable" }],
    });
    expect(roundOutcome(scored)).toEqual({
      outcome: "acceptable",
      unacceptable: [],
      lookBack: null,
    });
  });

  it("EA-4 an unacceptable result opens a nonconformity with a look-back from receipt to scoring", () => {
    const r = round({
      scoredOn: "2026-10-01",
      samples: [
        { sampleId: "S1", conceptId: "obs.potassium", score: "unacceptable", bias: 0.3 },
        { sampleId: "S2", conceptId: "obs.sodium", score: "acceptable" },
      ],
    });
    const out = roundOutcome(r);
    expect(out.outcome).toBe("mixed");
    expect(out.unacceptable.map((s) => [s.conceptId, s.bias])).toEqual([["obs.potassium", 0.3]]);
    expect(out.lookBack).toEqual({ from: "2026-09-01", to: "2026-10-01" });
  });

  it("EA-5 coverage: a scheme, or an alternative assessment within the lead's period, else counted", () => {
    const out = eqaCoverage({
      hospitalId: H1,
      tests: ["test.urea_electrolytes", "test.esr", "test.crp", "test.fbc"],
      schemes: [
        scheme(),
        scheme({ covers: ["test.fbc"], active: false }),
        scheme({ hospitalId: H2, covers: ["test.crp"] }),
      ],
      alternatives: [
        { hospitalId: H1, testCode: "test.esr", doneOn: "2026-06-01" },
        { hospitalId: H1, testCode: "test.crp", doneOn: "2025-01-01" },
      ],
      today: "2026-10-13",
      periodDays: 180,
    });
    expect(out.map((c) => c.covered)).toEqual(["scheme", "alternative", "none", "none"]);
  });
});

/** FIXTURE device rule, ranges and validity: invented. */
const rule: DeviceQcRule = {
  triggers: ["each_day_of_use", "new_strip_lot", "new_control_vial", "after_incident"],
  levels: ["L1", "L2"],
  requiredBeforeUse: false,
};
const dcheck = (at: string, o: Partial<DeviceCheck> = {}): DeviceCheck => ({
  hospitalId: H1,
  deviceId: "meter-1",
  stripLotId: "strip-1",
  controlVialLotId: "vial-1",
  outcome: "pass",
  at: kla(at),
  ...o,
});
const ddue = (checks: DeviceCheck[], o: Partial<Parameters<typeof deviceCheckDue>[0]> = {}) =>
  deviceCheckDue({
    rule,
    hospitalId: H1,
    deviceId: "meter-1",
    stripLotId: "strip-1",
    controlVialLotId: "vial-1",
    lastIncidentAt: null,
    checks,
    at: kla("2026-10-13 10:00"),
    timeZone: TZ,
    ...o,
  });

describe("bedside quality (§6.9)", () => {
  it("BQ-1 triggers: each day, new strip lot, new control vial, after a drop or error", () => {
    expect(ddue([])).toEqual(["each_day_of_use", "new_strip_lot", "new_control_vial"]);
    expect(ddue([dcheck("2026-10-13 07:00")])).toEqual([]);
    expect(ddue([dcheck("2026-10-12 07:00")])).toEqual(["each_day_of_use"]);
    expect(ddue([dcheck("2026-10-13 07:00")], { stripLotId: "strip-2" })).toEqual([
      "new_strip_lot",
    ]);
    expect(ddue([dcheck("2026-10-13 07:00")], { controlVialLotId: "vial-2" })).toEqual([
      "new_control_vial",
    ]);
    expect(ddue([dcheck("2026-10-13 07:00")], { lastIncidentAt: kla("2026-10-13 08:00") })).toEqual(
      ["after_incident"],
    );
    expect(ddue([dcheck("2026-10-13 07:00", { hospitalId: H2 })])).toHaveLength(3);
  });

  it("BQ-1 ranges come from the strip lot; a level with no range cannot be scored", () => {
    const lotRanges = { L1: { low: 2.0, high: 3.0 }, L2: { low: 15, high: 20 } };
    expect(evaluateDeviceCheck({ rule, lotRanges, observed: { L1: 2.5, L2: 18 } })).toMatchObject({
      ok: true,
      outcome: "pass",
      deviceState: "in_use",
    });
    expect(
      evaluateDeviceCheck({ rule, lotRanges: { L1: lotRanges.L1 }, observed: { L1: 2.5, L2: 18 } }),
    ).toEqual({ ok: false, error: "no_range_for_lot" });
    expect(evaluateDeviceCheck({ rule, lotRanges: null, observed: {} })).toEqual({
      ok: false,
      error: "no_range_for_lot",
    });
  });

  it("BQ-2 a failed check blocks the device until a check passes; selection is refused", () => {
    const lotRanges = { L1: { low: 2.0, high: 3.0 }, L2: { low: 15, high: 20 } };
    expect(evaluateDeviceCheck({ rule, lotRanges, observed: { L1: 3.1, L2: 18 } })).toMatchObject({
      outcome: "fail",
      deviceState: "blocked",
    });
    expect(
      bedsideQuality({ deviceState: "blocked", rule, due: [], competency: "valid" }).errors,
    ).toEqual(["device_blocked"]);
  });

  it("BQ-3 not done today informs, and blocks only when the rule says required before use", () => {
    expect(
      bedsideQuality({
        deviceState: "in_use",
        rule,
        due: ["each_day_of_use"],
        competency: "valid",
      }),
    ).toEqual({
      errors: [],
      notice: "control_check_not_done_today",
      snapshot: { deviceCheck: "not_done", competency: "valid" },
    });
    expect(
      bedsideQuality({
        deviceState: "in_use",
        rule: { ...rule, requiredBeforeUse: true },
        due: ["each_day_of_use"],
        competency: "valid",
      }).errors,
    ).toEqual(["control_check_required"]);
  });

  it("BQ-3 a new strip lot, control vial, drop or error needs the check before the next result (S35)", () => {
    for (const due of [["new_strip_lot"], ["new_control_vial"], ["after_incident"]] as const)
      expect(
        bedsideQuality({ deviceState: "in_use", rule, due: [...due], competency: "valid" }),
      ).toMatchObject({ errors: ["control_check_required"], notice: null });
    expect(
      bedsideQuality({
        deviceState: "in_use",
        rule,
        due: ["each_day_of_use", "new_strip_lot"],
        competency: "valid",
      }),
    ).toMatchObject({
      errors: ["control_check_required"],
      notice: "control_check_not_done_today",
    });
  });

  it("BQ-4 competency per test: valid to from the signed validity; lapsed and revoked refused; grace at switch-on", () => {
    const row = (o: Partial<Competency>): Competency => ({
      hospitalId: H1,
      userId: "nurse-1",
      testCode: "test.capillary_glucose",
      assessedOn: "2026-01-10",
      validTo: competencyValidTo("2026-01-10", 365),
      grandfathered: false,
      revokedAt: null,
      ...o,
    });
    expect(competencyValidTo("2026-01-10", 365)).toBe("2027-01-10");
    const q = {
      hospitalId: H1,
      userId: "nurse-1",
      testCode: "test.capillary_glucose",
      at: kla("2026-10-13 10:00"),
      timeZone: TZ,
    };
    expect(competencyStatus([row({})], q)).toBe("valid");
    expect(competencyStatus([row({ validTo: "2026-10-12" })], q)).toBe("lapsed");
    expect(competencyStatus([row({ validTo: "2026-10-13" })], q)).toBe("valid"); // to the end of its day
    expect(
      competencyStatus(
        [row({ validTo: "2026-10-12" }), row({ assessedOn: "2026-10-13", validTo: "2027-10-13" })],
        q,
      ),
    ).toBe("valid");
    expect(competencyStatus([row({ grandfathered: true, validTo: "2026-11-30" })], q)).toBe(
      "grace",
    );
    expect(competencyStatus([row({ revokedAt: kla("2026-10-01 09:00") })], q)).toBe("revoked");
    expect(competencyStatus([row({ testCode: "test.malaria_rdt" })], q)).toBe("none");
    expect(competencyStatus([row({ hospitalId: H2 })], q)).toBe("none");
    expect(
      bedsideQuality({ deviceState: "in_use", rule, due: [], competency: "lapsed" }).errors,
    ).toEqual(["competency_not_valid"]);
    expect(
      bedsideQuality({ deviceState: "in_use", rule, due: [], competency: "grace" }).errors,
    ).toEqual([]);
  });

  it("BQ-5 the result snapshots the device check status and the operator's competency", () => {
    expect(
      bedsideQuality({ deviceState: "in_use", rule, due: [], competency: "grace" }).snapshot,
    ).toEqual({ deviceCheck: "passed", competency: "grace" });
    expect(
      bedsideQuality({ deviceState: "in_use", rule: null, due: [], competency: "valid" }).snapshot
        .deviceCheck,
    ).toBe("no_rule");
  });
});
