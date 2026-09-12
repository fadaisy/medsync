import { describe, expect, it } from "vitest";

import { formatWhen } from "@/lib/patient/appointments";

/**
 * ADR 0084 §10 on the appointments list and on home, which read the same
 * function. Two things can silently regress here and neither shows up on a
 * developer's laptop:
 *
 *   1. A clock numeral comes back. "14:00" is read six hours out against the
 *      dawn-anchored Luganda clock, and an English AM/PM word does not fix a
 *      numeral — so the assertion is that no digit pair survives at all.
 *   2. The zone pin is dropped. The host is UTC in production and Kampala is
 *      UTC+3, so every case below is chosen to read DIFFERENTLY unpinned.
 */
describe("formatWhen (ADR 0084 §10)", () => {
  it("names a day-part, never a clock numeral", () => {
    // 07:30 UTC = 10:30 EAT.
    const when = formatWhen("2026-03-13T07:30:00.000Z");
    expect(when).toBe("Fri 13 Mar · Morning session");
    expect(when).not.toMatch(/\d{1,2}[:.]\d{2}/);
  });

  it("reads the session in Kampala, not on the host clock", () => {
    // 10:00 UTC = 13:00 EAT. Unpinned this is 10:00 — "Morning session".
    expect(formatWhen("2026-03-13T10:00:00.000Z")).toBe("Fri 13 Mar · Afternoon session");
  });

  it("reads the day in Kampala, not on the host clock", () => {
    // 22:30 UTC on the 12th = 01:30 EAT on the 13th. Unpinned, a patient is
    // told to come on the day BEFORE the one the clinic holds.
    expect(formatWhen("2026-03-12T22:30:00.000Z")).toBe("Fri 13 Mar · Morning session");
  });
});
