import type { PatientRelease, ResultSnapshot, ViewerContext } from "@/lib/lab/patient-release";
import { describe, expect, it } from "vitest";

import {
  groupOf,
  holdErrors,
  holdExpired,
  isAged,
  minorAllows,
  neverShown,
  pickLanguage,
  rangeLine,
  rangeWords,
  RELEASE_GROUPS,
  statusWord,
  visibleToPatient,
} from "@/lib/lab/patient-release";

/** FIXTURE release table: every group after review except critical after told; corrected after review. */
const RULES: PatientRelease = {
  groups: {
    routine: { inApp: "after_review", sms: true },
    critical: { inApp: "after_told", sms: false },
    referred: { inApp: "after_review", sms: true },
    bedside: { inApp: "after_review", sms: false },
    corrected: { inApp: "after_review", sms: false },
  },
  holdMaxDays: 30,
  agedWindowDays: 7,
  source: { doc: "Fixture", date: "2026-10-17" },
};
const FBC = { code: "test.fbc", restrictedClass: null, patientGroup: null };
const base: ResultSnapshot = {
  test: FBC,
  status: "final",
  current: true,
  critical: false,
  reviewed: true,
  told: false,
  hold: null,
  referred: false,
  bedside: false,
  earlierSeen: false,
};
const adult: ViewerContext = {
  viewer: "patient",
  patientAge: 30,
  consent: true,
  rules: RULES,
  minors: null,
  floorAdditions: [],
};
const reason = (r: Partial<ResultSnapshot>, c: Partial<ViewerContext> = {}) =>
  visibleToPatient({ ...base, ...r }, { ...adult, ...c }).reason;

describe("PR-1 visibleToPatient: the decision table (gate-a §3)", () => {
  it("routine reviewed is visible; unreviewed waits for the doctor", () => {
    expect(reason({})).toBe("visible");
    expect(reason({ reviewed: false })).toBe("not_reviewed");
  });
  it("PR-4 a critical needs a told event even when reviewed", () => {
    expect(reason({ critical: true })).toBe("not_told");
    expect(reason({ critical: true, told: true })).toBe("visible");
  });
  it("PR-7 a hold hides it until released; an expired hold still hides it", () => {
    expect(reason({ hold: { kind: "set", untilOn: "2026-10-30" } })).toBe("held");
    expect(reason({ hold: { kind: "set", untilOn: "2020-01-01" } })).toBe("held");
    expect(reason({ hold: { kind: "release", untilOn: null } })).toBe("visible");
  });
  it("PR-5 a corrected result is 'being checked' until the correction is reviewed", () => {
    expect(reason({ status: "corrected", earlierSeen: true, reviewed: false })).toBe(
      "being_checked",
    );
    expect(reason({ status: "corrected", earlierSeen: true, reviewed: true })).toBe("visible");
  });
  it("not released, superseded or cancelled never shows", () => {
    expect(reason({ status: "preliminary" })).toBe("not_released");
    expect(reason({ current: false })).toBe("not_released");
    expect(reason({ status: "cancelled" })).toBe("not_released");
  });
  it("PR-6 referred and bedside follow their group's rule", () => {
    expect(reason({ referred: true })).toBe("visible");
    expect(
      reason(
        { bedside: true },
        {
          rules: { ...RULES, groups: { ...RULES.groups, bedside: { inApp: "never", sms: false } } },
        },
      ),
    ).toBe("group_rule");
  });
  it("PR-12 consent off hides everything; unsigned rules show nothing", () => {
    expect(reason({}, { consent: false })).toBe("no_consent");
    expect(reason({}, { rules: null })).toBe("rules_unsigned");
  });
  it("PR-3 HIV viral load and pregnancy never show, whatever else is true", () => {
    expect(
      reason({ test: { code: "test.hiv_viral_load", restrictedClass: "hiv", patientGroup: null } }),
    ).toBe("never_shown");
    expect(
      reason({ test: { code: "test.pregnancy_urine", restrictedClass: null, patientGroup: null } }),
    ).toBe("never_shown");
    expect(
      reason({ test: { code: "test.biopsy", restrictedClass: null, patientGroup: "tissue" } }),
    ).toBe("never_shown");
    expect(reason({}, { floorAdditions: ["test.fbc"] })).toBe("never_shown");
  });
  it("PR-11 under 18: nothing until the minors rule is signed; then by age band and viewer", () => {
    expect(reason({}, { patientAge: 10 })).toBe("minor");
    expect(reason({}, { patientAge: 10, viewer: "guardian" })).toBe("minor");
    const minors = {
      under12Guardian: ["routine" as const],
      adolescentGuardian: ["routine" as const],
      adolescentOwnAccess: false,
      legalOpinionRef: "Fixture opinion",
    };
    expect(reason({}, { patientAge: 10, viewer: "guardian", minors })).toBe("visible");
    expect(reason({}, { patientAge: 10, viewer: "patient", minors })).toBe("minor");
    expect(
      reason({ critical: true, told: true }, { patientAge: 15, viewer: "guardian", minors }),
    ).toBe("minor");
    expect(reason({}, { patientAge: 15, viewer: "patient", minors })).toBe("minor");
    expect(
      reason(
        {},
        { patientAge: 15, viewer: "patient", minors: { ...minors, adolescentOwnAccess: true } },
      ),
    ).toBe("visible");
    expect(minorAllows({ ...adult, viewer: "guardian" }, "routine")).toBe(false); // no proxy for adults here
  });
  it("groupOf: corrected, then critical, referred, bedside, routine", () => {
    expect(groupOf({ earlierSeen: true, critical: true, referred: true, bedside: true })).toBe(
      "corrected",
    );
    expect(groupOf({ earlierSeen: false, critical: true, referred: true, bedside: false })).toBe(
      "critical",
    );
    expect(groupOf({ earlierSeen: false, critical: false, referred: true, bedside: true })).toBe(
      "referred",
    );
  });
});

describe("PR-3 property: no never-shown result is ever visible, whatever the inputs", () => {
  it("holds across every combination of the other inputs", () => {
    const floor = [
      { code: "test.hiv_rapid", restrictedClass: "hiv", patientGroup: null },
      { code: "test.tb_xpert", restrictedClass: "tb", patientGroup: null },
      { code: "test.x", restrictedClass: "mental_health", patientGroup: null },
      { code: "test.syphilis", restrictedClass: "sexual_reproductive_health", patientGroup: null },
      { code: "test.pregnancy_urine", restrictedClass: null, patientGroup: null },
      { code: "test.cyto", restrictedClass: null, patientGroup: "cytology" },
    ];
    const bools = [true, false];
    const allOpen = Object.fromEntries(
      RELEASE_GROUPS.map((g) => [g, { inApp: "after_review", sms: true }]),
    );
    let checked = 0;
    for (const test of floor)
      for (const reviewed of bools)
        for (const told of bools)
          for (const critical of bools)
            for (const consent of bools)
              for (const viewer of ["patient", "guardian"] as const)
                for (const patientAge of [5, 15, 40])
                  for (const status of ["final", "corrected"] as const) {
                    const v = visibleToPatient(
                      { ...base, test, reviewed, told, critical, status },
                      {
                        ...adult,
                        viewer,
                        patientAge,
                        consent,
                        rules: { ...RULES, groups: allOpen as PatientRelease["groups"] },
                        minors: {
                          under12Guardian: [...RELEASE_GROUPS],
                          adolescentGuardian: [...RELEASE_GROUPS],
                          adolescentOwnAccess: true,
                          legalOpinionRef: "x",
                        },
                      },
                    );
                    expect(v.visible).toBe(false);
                    checked++;
                  }
    expect(checked).toBe(6 * 2 * 2 * 2 * 2 * 2 * 3 * 2);
  });
  it("neverShown is the floor plus additions, never less", () => {
    expect(neverShown(FBC)).toBe(false);
    expect(neverShown(FBC, ["test.fbc"])).toBe(true);
  });
});

describe("PR-7 holds, PR-16 aged results, PR-17 language", () => {
  it("a hold needs a reason and an until-date within the signed maximum", () => {
    expect(holdErrors({ reason: null, untilOn: null }, "2026-10-17", 30)).toEqual([
      "reason_required",
      "until_required",
    ]);
    expect(
      holdErrors({ reason: "harm_to_patient", untilOn: "2026-10-16" }, "2026-10-17", 30),
    ).toEqual(["until_past"]);
    expect(
      holdErrors({ reason: "harm_to_patient", untilOn: "2026-12-31" }, "2026-10-17", 30),
    ).toEqual(["until_beyond_max"]);
    expect(
      holdErrors({ reason: "explain_in_person", untilOn: "2026-10-20" }, "2026-10-17", null),
    ).toEqual(["max_unsigned"]);
    expect(
      holdErrors({ reason: "explain_in_person", untilOn: "2026-10-20" }, "2026-10-17", 30),
    ).toEqual([]);
    expect(holdExpired({ kind: "set", untilOn: "2026-10-16" }, "2026-10-17")).toBe(true);
    expect(holdExpired({ kind: "release", untilOn: null }, "2026-10-17")).toBe(false);
  });
  it("aged after the signed window; never without one", () => {
    expect(isAged("2026-10-01", "2026-10-17", 7)).toBe(true);
    expect(isAged("2026-10-15", "2026-10-17", 7)).toBe(false);
    expect(isAged("2026-01-01", "2026-10-17", null)).toBe(false);
  });
  it("words show in the chosen language only when signed; otherwise English with a note", () => {
    expect(pickLanguage({ en: "A", lg: "B" }, "lg")).toEqual({
      lang: "lg",
      text: "B",
      fallback: false,
    });
    expect(pickLanguage({ en: "A" }, "lg")).toEqual({ lang: "en", text: "A", fallback: true });
    expect(pickLanguage({}, "en")).toEqual({ lang: "en", text: null, fallback: false });
  });
});

describe("PR-8 status words and PR-9 the range line at the edges", () => {
  it("status words come from the result's own flag against its snapshotted range", () => {
    expect(statusWord({ flag: "high", rangeLow: "1", rangeHigh: "2" })).toBe("higher");
    expect(statusWord({ flag: "low", rangeLow: "1", rangeHigh: null })).toBe("lower");
    expect(statusWord({ flag: "normal", rangeLow: "1", rangeHigh: "2" })).toBe("within");
    expect(statusWord({ flag: null, rangeLow: null, rangeHigh: null })).toBe("no_range");
    expect(statusWord({ flag: "high", rangeLow: null, rangeHigh: null })).toBe("no_range");
  });
  it("the scale always contains the value and the band; open ends and no range are handled", () => {
    const far = rangeLine(1000, 10, 20)!;
    expect(far.max).toBeGreaterThanOrEqual(1000);
    expect(far.min).toBeLessThanOrEqual(10);
    const below = rangeLine(-5, 10, 20)!;
    expect(below.min).toBeLessThanOrEqual(-5);
    const openLow = rangeLine(3, null, 5)!;
    expect(openLow).toMatchObject({ bandFrom: 0, bandTo: 5, openLow: true, openHigh: false });
    const openHigh = rangeLine(9, 5, null)!;
    expect(openHigh.openHigh).toBe(true);
    expect(openHigh.max).toBeGreaterThanOrEqual(9);
    expect(rangeLine(null, 1, 2)).toBeNull();
    expect(rangeLine(5, null, null)).toBeNull();
  });
  it("the text alternative says the value, where it sits and the range", () => {
    expect(rangeWords("168", "µmol/L", "53", "106", "higher")).toBe(
      "Your result, 168, is above the usual range of 53 to 106 µmol/L.",
    );
    expect(rangeWords("4", "x", null, null, "no_range")).toBe(
      "Your result is 4 x. There is no usual range for this test.",
    );
  });
});
