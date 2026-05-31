import { describe, expect, it } from "vitest";

import { computeAgeYears } from "@/lib/age";

const NOW = new Date("2026-05-31T12:00:00Z");

describe("computeAgeYears", () => {
  it("computes whole years floored to the last birthday", () => {
    expect(computeAgeYears("1990-01-01", NOW)).toBe(36);
  });

  it("does not count a birthday that hasn't happened yet this year", () => {
    // Birthday in December → still 35 in May.
    expect(computeAgeYears("1990-12-25", NOW)).toBe(35);
  });

  it("counts a birthday earlier this year", () => {
    expect(computeAgeYears("1990-03-01", NOW)).toBe(36);
  });

  it("handles the birthday being today", () => {
    expect(computeAgeYears("2000-05-31", NOW)).toBe(26);
  });

  it("returns 0 for an infant under one year", () => {
    expect(computeAgeYears("2026-01-10", NOW)).toBe(0);
  });

  it("returns null for null / invalid / implausible input", () => {
    expect(computeAgeYears(null, NOW)).toBeNull();
    expect(computeAgeYears("not-a-date", NOW)).toBeNull();
    expect(computeAgeYears("1800-01-01", NOW)).toBeNull();
  });

  it("is deterministic for a fixed now", () => {
    expect(computeAgeYears("1985-06-15", NOW)).toBe(computeAgeYears("1985-06-15", NOW));
  });
});
