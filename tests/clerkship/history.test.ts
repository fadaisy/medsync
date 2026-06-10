import type { ClerkPmhItem, ClerkPshItem } from "@/lib/encounter/clerkship";
import { describe, expect, it } from "vitest";

import {
  cageScore,
  packYears,
  renderFamilySummary,
  renderPmhSummary,
  renderPshSummary,
  renderSocialSummary,
} from "@/lib/clerkship/history";

describe("packYears", () => {
  it("computes (cigs/day ÷ 20) × years, 1dp", () => {
    expect(packYears(20, 15)).toBe(15);
    expect(packYears(10, 30)).toBe(15);
    expect(packYears(5, 3)).toBe(0.75);
  });
  it("returns null for missing/invalid input (never guesses)", () => {
    expect(packYears(undefined, 10)).toBeNull();
    expect(packYears(20, 0)).toBeNull();
  });
});

describe("renderPmhSummary", () => {
  const items: ClerkPmhItem[] = [
    {
      code: "hypertension",
      display: "Hypertension",
      year: "2015",
      status: "poorly_controlled",
      onTreatment: true,
    },
    { code: "diabetes_t2", display: "Diabetes mellitus — type 2", complications: ["nephropathy"] },
  ];
  it("renders conditions with attributes", () => {
    const s = renderPmhSummary(items, {});
    expect(s).toContain("Hypertension (2015, poorly controlled, on treatment)");
    expect(s).toContain("Diabetes mellitus — type 2 (complications: nephropathy)");
  });
  it("records explicit screen results honestly (positive + denied)", () => {
    const s = renderPmhSummary([], { tuberculosis: "yes", hiv: "no" });
    expect(s).toContain("Screen: reports tuberculosis");
    expect(s).toContain("denies hiv");
  });
  it("empty → recorded nil, not blank", () => {
    expect(renderPmhSummary([], {})).toBe("No significant past medical history recorded.");
  });
});

describe("renderPshSummary", () => {
  it("renders operations with year + anaesthetic", () => {
    const items: ClerkPshItem[] = [
      { code: "appendicectomy", display: "Appendicectomy", year: "2010", anaesthetic: "ga" },
    ];
    expect(renderPshSummary(items)).toContain("Appendicectomy (2010, GA)");
  });
  it("empty → recorded nil", () => {
    expect(renderPshSummary([])).toBe("No previous operations recorded.");
  });
});

describe("cageScore", () => {
  it("counts the yes answers", () => {
    expect(cageScore({ cutDown: true, annoyed: true, guilty: false, eyeOpener: true })).toBe(3);
    expect(cageScore(undefined)).toBe(0);
  });
});

describe("renderSocialSummary", () => {
  it("auto-calcs pack-years + surfaces CAGE (never types the maths)", () => {
    const s = renderSocialSummary({
      smokingStatus: "current",
      cigsPerDay: 20,
      smokingYears: 15,
      alcoholStatus: "regular",
      alcoholUnitsPerWeek: 40,
      cage: { cutDown: true, eyeOpener: true },
    });
    expect(s).toContain("Smoking: current (15 pack-years)");
    expect(s).toContain("Alcohol: regular (40 units/wk, CAGE 2/4)");
  });
  it("records non-smoker / no-alcohol explicitly", () => {
    expect(renderSocialSummary({ smokingStatus: "never", alcoholStatus: "never" })).toBe(
      "Non-smoker. No alcohol.",
    );
  });
});

describe("renderFamilySummary", () => {
  it("renders relative + condition; honest screen negatives", () => {
    const s = renderFamilySummary(
      [{ relative: "father", conditionDisplay: "IHD", ageOnset: "55", deceased: true }],
      { diabetes: "yes", cancer: "no" },
    );
    expect(s).toContain("Father: IHD (onset 55, deceased)");
    expect(s).toContain("reports diabetes");
    expect(s).toContain("denies cancer");
  });
  it("empty → recorded nil", () => {
    expect(renderFamilySummary([], {})).toBe("No significant family history recorded.");
  });
});
