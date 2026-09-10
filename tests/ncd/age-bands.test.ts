/**
 * Life-stage banding (ADR 0083).
 *
 * The boundaries are conventions — WHO's 10-19 for adolescence, ADA's 65 for
 * older adults — and they are pinned here so a change to them is a deliberate
 * act with a failing test attached, rather than a quiet edit to a helper.
 */
import { describe, expect, it } from "vitest";

import { ageBandFromDob } from "@/lib/ncd/age";

/** Fixed "today" — the engine must never read the clock for a clinical answer. */
const NOW = new Date("2026-09-07T12:00:00Z");
const band = (dob: string) => ageBandFromDob(dob, NOW);

describe("the boundaries", () => {
  it("bands a newborn, and moves to infant at 28 days", () => {
    expect(band("2026-09-01")).toBe("neonate");
    expect(band("2026-08-11")).toBe("neonate"); // 27 days
    expect(band("2026-08-10")).toBe("infant"); // 28 days
  });

  it("moves infant to child on the first birthday", () => {
    expect(band("2025-09-08")).toBe("infant");
    expect(band("2025-09-07")).toBe("child");
  });

  it("moves child to adolescent at 10 — WHO defines adolescence as 10-19", () => {
    expect(band("2016-09-08")).toBe("child");
    expect(band("2016-09-07")).toBe("adolescent");
  });

  it("keeps a 19-year-old adolescent and makes a 20-year-old an adult", () => {
    expect(band("2007-01-01")).toBe("adolescent");
    expect(band("2006-09-07")).toBe("adult");
  });

  it("moves adult to older adult at 65 — the threshold ADA's older-adults section applies from", () => {
    expect(band("1961-09-08")).toBe("adult");
    expect(band("1961-09-07")).toBe("older_adult");
  });
});

describe("bad data fails loud and harmless, never quiet and narrowing", () => {
  it("returns undefined for an unparseable date rather than guessing a band", () => {
    expect(band("not-a-date")).toBeUndefined();
    expect(band("")).toBeUndefined();
  });

  it("returns undefined for a date of birth in the future", () => {
    // Bad data, not a newborn. Banding it `neonate` would scope an adult's
    // examination to neonatal findings.
    expect(band("2027-01-01")).toBeUndefined();
  });
});

describe("it does not drift with the month", () => {
  it("counts a birthday that has not happened yet this year as the younger age", () => {
    // Born December 1961: 64 on this September date, not 65.
    expect(ageBandFromDob("1961-12-01", NOW)).toBe("adult");
    expect(ageBandFromDob("1961-12-01", new Date("2026-12-01T12:00:00Z"))).toBe("older_adult");
  });
});
