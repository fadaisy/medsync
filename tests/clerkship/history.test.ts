import type { ClerkPmhItem, ClerkPshItem } from "@/lib/encounter/clerkship";
import { describe, expect, it } from "vitest";

import { packYears, renderPmhSummary, renderPshSummary } from "@/lib/clerkship/history";

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
