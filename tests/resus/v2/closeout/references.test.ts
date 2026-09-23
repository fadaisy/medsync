import { describe, expect, it } from "vitest";

import {
  CLOSEOUT_REFS,
  LEVEL_RULE_IDS,
  LEVEL_RULE_LEVEL,
  REQUIRED_CAPABILITIES,
} from "@/lib/resus/reference/levels-of-care";
import { POST_ROSC_BUNDLE, POST_ROSC_REFS } from "@/lib/resus/reference/post-rosc-catalog";
import { indexRefs, refValue } from "@/lib/resus/reference/ref";

const ALL = [...CLOSEOUT_REFS, ...POST_ROSC_REFS];
const ids = (prefix: string) => ALL.map((e) => e.id).filter((id) => id.startsWith(prefix));

describe("References — close-out and post-ROSC catalogs", () => {
  it("CO-HO-01: every entry is signed, verified 2026-09-23, with a URL and source", () => {
    for (const e of ALL) {
      expect(e.status, e.id).toBe("signed");
      expect(e.verifiedOn, e.id).toBe("2026-09-23");
      expect(e.url.length, e.id).toBeGreaterThan(0);
      expect(e.source.length, e.id).toBeGreaterThan(0);
    }
  });

  it("CO-HO-02: IDs are unique across both catalogs", () => {
    expect(() => indexRefs(ALL)).not.toThrow();
  });

  it("CO-R1: every recommender rule CO-R1..R16 has an entry and a level", () => {
    expect(ids("CO-R")).toEqual([...LEVEL_RULE_IDS]);
    for (const id of LEVEL_RULE_IDS) expect(LEVEL_RULE_LEVEL[id]).toBeDefined();
  });

  it("CO-NEWS-01: the NEWS2 response rows are all present with values", () => {
    expect(ids("CO-NEWS-")).toHaveLength(5);
    expect(ALL.find((e) => e.id === "CO-NEWS-01")?.value).toBe("≥ 7");
  });

  it("CO-DST-01: the four extra-destination rows are present", () => {
    expect(ids("CO-DST-")).toEqual(["CO-DST-01", "CO-DST-02", "CO-DST-03", "CO-DST-04"]);
  });

  it("CO-BRD-01: boarding rows CO-BRD-01..04 are present", () => {
    expect(ids("CO-BRD-")).toHaveLength(4);
  });

  it("CO-ADT-01: after-death tasks CO-ADT-01..11 are present", () => {
    expect(ids("CO-ADT-")).toHaveLength(11);
  });

  it("CO-IDLE-01: idle rows carry 2 h / 12 h / 24 h", () => {
    expect(ids("CO-IDLE-").map((id) => ALL.find((e) => e.id === id)?.value)).toEqual([
      "2 h",
      "12 h",
      "24 h",
    ]);
  });

  it("CO-R3: required capabilities per level match the catalog §4 table", () => {
    expect(REQUIRED_CAPABILITIES.ward).toEqual([]);
    expect(REQUIRED_CAPABILITIES.l1).toEqual(["continuous_ecg", "vasopressors"]);
    expect(REQUIRED_CAPABILITIES.l2).toEqual([
      "continuous_ecg",
      "arterial_line",
      "vasopressors",
      "niv_cpap",
    ]);
    expect(REQUIRED_CAPABILITIES.l3).toEqual([
      "continuous_ecg",
      "arterial_line",
      "vasopressors",
      "niv_cpap",
      "invasive_ventilation",
    ]);
  });

  it("PR-A-01: every bundle row and pin has an entry (25 bundle + 4 pins)", () => {
    expect(POST_ROSC_BUNDLE).toHaveLength(25);
    expect(POST_ROSC_REFS).toHaveLength(29);
    for (const b of POST_ROSC_BUNDLE) expect(POST_ROSC_REFS.some((e) => e.id === b.id)).toBe(true);
  });

  it("PR-C-06: the 120-min angiography target cites RCUK-SC25", () => {
    const e = POST_ROSC_REFS.find((x) => x.id === "PR-C-06")!;
    expect(e.source).toBe("RCUK-SC25");
    expect(e.url).toContain("special-circumstances");
    expect(refValue(e)).toBe("≤ 120 min");
  });

  it("PR-B-02: the SpO₂ target reads 94–98 % through refValue", () => {
    expect(refValue(POST_ROSC_REFS.find((x) => x.id === "PR-B-02")!)).toBe("94–98 %");
  });

  it("PR-FAM-01: a two-source row keeps both codes and the first URL", () => {
    const e = POST_ROSC_REFS.find((x) => x.id === "PR-FAM-01")!;
    expect(e.source).toBe("RCUK-PRC25, RCUK-ETH25");
    expect(e.url).toContain("post-resuscitation-care");
  });
});
