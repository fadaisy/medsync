import type { LevelInput } from "@/lib/resus/closeout/level-of-care";
import type { CareUnit } from "@/lib/resus/model";
import { describe, expect, it } from "vitest";

import { mismatchRequired, suggestLevel } from "@/lib/resus/closeout/level-of-care";
import { BASE } from "./fixtures";

const L3_CAPS = [
  "continuous_ecg",
  "arterial_line",
  "vasopressors",
  "niv_cpap",
  "invasive_ventilation",
] as const;

const unit = (id: string, over: Partial<CareUnit>): CareUnit => ({
  id,
  name: id,
  unitType: "ward",
  ageGroup: "adult",
  capabilities: [],
  active: true,
  ...over,
});

const WARD = unit("ward", {});
const HDU = unit("hdu", {
  unitType: "hdu",
  capabilities: ["continuous_ecg", "arterial_line", "vasopressors", "niv_cpap"],
});
const ICU = unit("icu", { unitType: "icu", capabilities: [...L3_CAPS] });
const ICU_RRT = unit("icu-rrt", { unitType: "icu", capabilities: [...L3_CAPS, "rrt"] });
const PICU = unit("picu", { unitType: "picu", ageGroup: "paediatric", capabilities: [...L3_CAPS] });
const CLOSED_ICU = unit("icu-closed", {
  unitType: "icu",
  capabilities: [...L3_CAPS],
  active: false,
});
const UNITS = [WARD, HDU, ICU, ICU_RRT, PICU, CLOSED_ICU];

const s = (p: Partial<LevelInput>, units: CareUnit[] = UNITS) =>
  suggestLevel({ ...BASE, ...p }, units);
const ids = (p: Partial<LevelInput>, units?: CareUnit[]) =>
  s(p, units).qualifyingUnits.map((u) => u.id);
const news2Ok = { news2: { total: 1, hasSingleParameterThree: false } };

describe("CO-R — capability-aware unit matching", () => {
  it("CO-R8: L1 needs continuous ECG + vasopressors (HDU, ICUs; not the ward)", () => {
    const r = s({ vasopressor: true });
    expect(r.requiredCapabilities).toEqual(["continuous_ecg", "vasopressors"]);
    expect(r.qualifyingUnits.map((u) => u.id)).toEqual(["hdu", "icu", "icu-rrt"]);
  });

  it("CO-R5: L2 qualifies HDU and ICUs", () => {
    expect(ids({ niv: true, vasopressor: true })).toEqual(["hdu", "icu", "icu-rrt"]);
  });

  it("CO-R3: L3 qualifies only units with invasive ventilation", () => {
    const r = s({ ettInSitu: true });
    expect(r.requiredCapabilities).toEqual([...L3_CAPS]);
    expect(r.qualifyingUnits.map((u) => u.id)).toEqual(["icu", "icu-rrt"]);
  });

  it("CO-R12: Ward requires nothing — every active adult unit qualifies", () => {
    const r = s(news2Ok);
    expect(r.requiredCapabilities).toEqual([]);
    expect(r.qualifyingUnits.map((u) => u.id)).toEqual(["ward", "hdu", "icu", "icu-rrt"]);
  });

  it("CO-R3: an inactive unit never qualifies", () => {
    expect(ids({ ettInSitu: true })).not.toContain("icu-closed");
  });

  it("CO-R14: RRT rules add rrt to the required capabilities", () => {
    const r = s({ rrtNeeded: true });
    expect(r.requiredCapabilities).toEqual([
      "continuous_ecg",
      "arterial_line",
      "vasopressors",
      "niv_cpap",
      "rrt",
    ]);
    expect(r.qualifyingUnits.map((u) => u.id)).toEqual(["icu-rrt"]);
  });

  it("CO-R13: RRT + vasopressor needs an L3 unit with rrt", () => {
    expect(ids({ rrtNeeded: true, vasopressor: true })).toEqual(["icu-rrt"]);
  });

  it("CO-R14: RRT needed but no unit declares rrt → transfer suggested", () => {
    const r = s({ rrtNeeded: true }, [WARD, HDU, ICU]);
    expect(r.qualifyingUnits).toEqual([]);
    expect(r.transferSuggested).toBe(true);
  });

  it("CO-R3: no qualifying unit → transfer to a higher-level facility", () => {
    const r = s({ ettInSitu: true }, [WARD, HDU]);
    expect(r.level).toBe("l3");
    expect(r.transferSuggested).toBe(true);
  });

  it("CO-R3: a qualifying unit exists → no transfer", () => {
    expect(s({ ettInSitu: true }).transferSuggested).toBe(false);
  });

  it("CO-R3: a child (age 10) matches paediatric units only", () => {
    expect(ids({ ettInSitu: true, ageYears: 10 })).toEqual(["picu"]);
  });

  it("CO-R3: age 16 is adult", () => {
    expect(ids({ ettInSitu: true, ageYears: 16 })).toEqual(["icu", "icu-rrt"]);
  });

  it("CO-R3: a unit for all ages matches adults and children", () => {
    const mixed = unit("mixed", { unitType: "icu", ageGroup: "all", capabilities: [...L3_CAPS] });
    expect(ids({ ettInSitu: true, ageYears: 8 }, [mixed, ICU])).toEqual(["mixed"]);
    expect(ids({ ettInSitu: true, ageYears: 40 }, [mixed, ICU])).toEqual(["mixed", "icu"]);
  });
});

describe("CO-DST — extra destinations", () => {
  it("CO-DST-01: STEMI / coronary occlusion → cath lab", () => {
    expect(s({ stemi: true }).extraDestinations).toEqual([
      {
        ruleId: "CO-DST-01",
        destination: "cath_lab",
        reason:
          "STEMI / suspected coronary occlusion recorded (C ecg_ischaemia, PR-C-05) → Cath lab",
      },
    ]);
  });

  it("CO-DST-02: haemorrhage / surgical source → theatre", () => {
    expect(s({ haemorrhage: true }).extraDestinations.map((d) => d.destination)).toEqual([
      "theatre",
    ]);
  });

  it("CO-DST-03: pregnancy-related cause → labour ward", () => {
    expect(s({ pregnancyRelated: true }).extraDestinations[0]!.destination).toBe("labour_ward");
  });

  it("CO-DST-04: head injury → CT before the unit", () => {
    expect(s({ headInjury: true }).extraDestinations[0]).toMatchObject({
      ruleId: "CO-DST-04",
      destination: "ct_first",
    });
  });

  it("CO-DST-04: suspected non-coronary arrest cause → CT before the unit", () => {
    expect(s({ nonCoronaryCause: true }).extraDestinations[0]!.destination).toBe("ct_first");
  });

  it("CO-DST-01: destinations are flagged alongside the level, in catalog order", () => {
    const r = s({ ettInSitu: true, stemi: true, headInjury: true, haemorrhage: true });
    expect(r.level).toBe("l3");
    expect(r.extraDestinations.map((d) => d.ruleId)).toEqual([
      "CO-DST-01",
      "CO-DST-02",
      "CO-DST-04",
    ]);
  });

  it("CO-DST-02: destinations still show when no level is suggested", () => {
    const r = s({ haemorrhage: true });
    expect(r.level).toBeNull();
    expect(r.extraDestinations).toHaveLength(1);
  });
});

describe("CO-R — below-suggestion mismatch", () => {
  it("CO-R1: choosing L2 when L3 is suggested needs a reason", () => {
    expect(mismatchRequired("l3", "l2")).toBe(true);
  });

  it("CO-R8: choosing Ward when L1 is suggested needs a reason", () => {
    expect(mismatchRequired("l1", "ward")).toBe(true);
  });

  it("CO-R5: choosing the suggested level needs no reason", () => {
    expect(mismatchRequired("l2", "l2")).toBe(false);
  });

  it("CO-R12: choosing above the suggestion needs no reason", () => {
    expect(mismatchRequired("ward", "l3")).toBe(false);
  });

  it("CO-R12: no suggestion → any choice needs no mismatch reason", () => {
    expect(mismatchRequired(null, "ward")).toBe(false);
  });
});
