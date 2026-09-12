import type { Slot } from "@/supabase/functions/_shared/slots";
import { describe, expect, it } from "vitest";

import {
  groupByDay,
  openingLine,
  settingsLine,
} from "@/app/clinician/availability/_components/slot-preview";

/**
 * `/clinician/availability` promises a clinician what a patient will actually
 * be offered. Two things can make that promise a lie quietly:
 *
 *   1. The day bucketing. A Kampala day is not the reader's day, and the
 *      whole point of the surface is a per-day count a clinician trusts.
 *   2. The provenance sentences. Telling someone they chose 15-minute slots
 *      when ADR 0029 §2's hard default chose for them is exactly the kind of
 *      unearned claim the engine work exists to stop.
 *
 * Every instant is an explicit UTC ISO string and every expectation is a
 * Kampala (UTC+3, no DST) reading, so this fails on a machine whose zone
 * leaked in rather than passing on the author's laptop.
 */

/** 2026-09-15 is a Tuesday. */
function slot(startIso: string, minutes = 20): Slot {
  const startsAt = new Date(startIso);
  return { startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000) };
}

describe("groupByDay", () => {
  it("emits one row per day of the window, zeroes included", () => {
    const rows = groupByDay([], new Date("2026-09-15T06:00:00Z"), 14);
    expect(rows).toHaveLength(14);
    expect(rows.every((r) => r.times.length === 0)).toBe(true);
  });

  it("buckets by the hospital's day, not the reader's", () => {
    // 22:30Z on Monday is 01:30 TUESDAY in Kampala. A server or browser
    // reading UTC would file it under Monday and under-count Tuesday.
    const rows = groupByDay([slot("2026-09-14T22:30:00Z")], new Date("2026-09-14T06:00:00Z"), 3);
    expect(rows.map((r) => r.key)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
    expect(rows[0]!.times).toEqual([]);
    expect(rows[1]!.times).toEqual(["01:30"]);
  });

  it("keeps every start of a day in order, so the count is the real count", () => {
    const rows = groupByDay(
      [slot("2026-09-15T06:00:00Z"), slot("2026-09-15T06:20:00Z"), slot("2026-09-15T06:40:00Z")],
      new Date("2026-09-15T05:00:00Z"),
      1,
    );
    expect(rows[0]!.times).toEqual(["09:00", "09:20", "09:40"]);
  });
});

describe("settingsLine", () => {
  const effective = { slotMinutes: 20, bufferMinutes: 5, autoConfirm: false, allowVirtual: false };

  it("names the clinician's own row as theirs", () => {
    expect(settingsLine(effective, "clinician", "Medicine")).toBe(
      "20-minute slots with a 5-minute gap between patients — your own setting.",
    );
  });

  it("does not let a department default read as a clinician's choice", () => {
    expect(settingsLine(effective, "department", "Medicine")).toContain(
      "Medicine's default. You have not set your own.",
    );
  });

  it("says plainly when nobody chose", () => {
    expect(
      settingsLine(
        { slotMinutes: 15, bufferMinutes: 0, autoConfirm: false, allowVirtual: false },
        "hard-default",
        "Medicine",
      ),
    ).toBe(
      "15-minute slots, back to back — MedSync's default. Neither you nor Medicine has set one.",
    );
  });
});

describe("openingLine", () => {
  it("says no policy means no clipping, never 'closed'", () => {
    expect(openingLine(null, "Medicine")).toBe(
      "Medicine has not set opening hours, so nothing clips your blocks.",
    );
  });

  it("reads an empty weekday list as closed every day, like the engine does", () => {
    expect(
      openingLine(
        { bookableWeekdays: [], bookableStartMinutesLocal: 480, bookableEndMinutesLocal: 1020 },
        "Medicine",
      ),
    ).toContain("no open days set");
  });

  it("accepts 0 for Sunday the way the engine does, and renders a 24-hour window", () => {
    expect(
      openingLine(
        {
          bookableWeekdays: [0, 1, 5],
          bookableStartMinutesLocal: 480,
          bookableEndMinutesLocal: 1020,
        },
        "Medicine",
      ),
    ).toContain("Medicine is open Mon, Fri, Sun, 08:00–17:00.");
  });
});
