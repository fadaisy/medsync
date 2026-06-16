import { describe, expect, it } from "vitest";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";

describe("normalizeFeature", () => {
  it("strips guillemets, lowercases, trims", () => {
    expect(normalizeFeature("«Unequal pulses»")).toBe("unequal pulses");
    expect(normalizeFeature("  Crushing ")).toBe("crushing");
  });
  it("collapses internal whitespace", () => {
    expect(normalizeFeature("Radiation to   left arm")).toBe("radiation to left arm");
  });
  it("empty / undefined → empty string", () => {
    expect(normalizeFeature("")).toBe("");
    expect(normalizeFeature(undefined)).toBe("");
  });
});
