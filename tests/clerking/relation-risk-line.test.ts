import { describe, expect, it } from "vitest";

import { riskLine, riskWords } from "@/lib/clerking/impression/risk-line";

const rec = (dxId: string, display: string, restrictedClass: string | null = null) => ({
  dxId,
  display,
  restrictedClass,
});

describe("the risk-factor line (D-REL-04)", () => {
  it("names the record's risk factors and exposures for ACS", () => {
    const l = riskLine("dx.acs", {
      onRecord: [
        rec("dx.dm_type2", "Type 2 diabetes"),
        rec("dx.hypertension", "Hypertension"),
        rec("dx.malaria_uncomplicated", "Malaria"),
      ],
      linkedCauses: new Set(),
      exposuresPresent: new Set(["exposure.tobacco_current"]),
      outcomeClass: null,
    })!;
    expect(riskWords(l)).toBe(
      "Risk factors on record: type 2 diabetes, hypertension; current tobacco use.",
    );
  });

  it("leaves out a factor already linked as the cause, and nothing on record gives no line", () => {
    const l = riskLine("dx.heart_failure", {
      onRecord: [rec("dx.hypertension", "Hypertension")],
      linkedCauses: new Set(["dx.hypertension"]),
      exposuresPresent: new Set(),
      outcomeClass: null,
    });
    expect(l).toBeNull();
  });

  it("takes the restricted class of every factor it names", () => {
    const l = riskLine("dx.acs", {
      onRecord: [rec("dx.hiv", "HIV infection", "hiv")],
      linkedCauses: new Set(),
      exposuresPresent: new Set(),
      outcomeClass: null,
    })!;
    expect(l.restrictedClasses).toEqual(["hiv"]);
  });
});
