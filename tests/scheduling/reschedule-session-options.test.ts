import type { Slot } from "@/supabase/functions/_shared/slots";
import { describe, expect, it } from "vitest";

import { toSessionOptions } from "@/app/patient/appointments/_lib/session-options";

/**
 * ADR 0084 §13's reschedule picker offers a DAY and a SESSION, never a clock
 * numeral (§10) — so the only thing that can go wrong quietly is which day and
 * which session a slot lands in.
 *
 * Every instant below is an explicit UTC ISO string and every expectation is a
 * Kampala (UTC+3) reading, so the suite fails on a machine whose clock or zone
 * leaked into the derivation rather than passing on the author's laptop and
 * shipping wrong. Kampala has no DST, so +3 holds year-round.
 */

/** 2026-09-15 is a Tuesday. */
function slot(startIso: string, minutes = 15): Slot {
  const startsAt = new Date(startIso);
  return { startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000) };
}

const NOW = new Date("2026-09-15T05:00:00Z"); // 08:00 EAT, Tuesday

describe("toSessionOptions", () => {
  it("collapses a session to its earliest slot and keeps the two sessions apart", () => {
    const options = toSessionOptions(
      [
        slot("2026-09-15T06:00:00Z"), // 09:00 EAT
        slot("2026-09-15T06:15:00Z"), // 09:15 EAT — same session, dropped
        slot("2026-09-15T11:30:00Z"), // 14:30 EAT — afternoon
      ],
      NOW,
    );

    expect(options.map((o) => [o.dayLabel, o.sessionLabel])).toEqual([
      ["Today", "Morning session"],
      ["Today", "Afternoon session"],
    ]);
    // The value is the EARLIEST slot in the bucket, not the last one seen.
    expect(options[0]?.value).toBe("2026-09-15T06:00:00.000Z|2026-09-15T06:15:00.000Z");
  });

  it("reads the day and the session in Kampala, never off a UTC host", () => {
    // 21:30Z on the 15th is 00:30 EAT on the 16th. A server reading its own
    // clock calls this "Today, Afternoon session"; the clinic calls it
    // tomorrow morning, and a patient told the wrong one loses the visit.
    const [option] = toSessionOptions([slot("2026-09-15T21:30:00Z")], NOW);

    expect(option?.dayLabel).toBe("Tomorrow");
    expect(option?.sessionLabel).toBe("Morning session");
  });

  it("names a day beyond tomorrow without a clock numeral", () => {
    const [option] = toSessionOptions([slot("2026-09-17T06:00:00Z")], NOW);

    // Weekday + date + month and nothing else. `startsWith` rather than an
    // equality, because ICU spells the month "Sep" or "Sept" depending on its
    // version and neither is a defect — a clock numeral would be.
    expect(option?.dayLabel.startsWith("Thu 17 Sep")).toBe(true);
    expect(option?.dayLabel).not.toMatch(/\d\s*[:.]\s*\d/);
  });

  it("puts local noon in the afternoon, not the morning", () => {
    // 09:00Z is exactly 12:00 EAT — the boundary the ternary is written on.
    const [option] = toSessionOptions([slot("2026-09-15T09:00:00Z")], NOW);

    expect(option?.sessionLabel).toBe("Afternoon session");
  });

  it("offers nothing when the engine offered nothing", () => {
    expect(toSessionOptions([], NOW)).toEqual([]);
  });
});
