import { canShift, dayState, firstOpenDay, timeGroup, weeksOf, windowEnd } from "./calendar-logic";
import { monthGrid } from "./logic";

const today = "2026-10-18";
const open = new Set(["2026-10-10", "2026-10-21", "2026-11-03", "2027-01-05"]);

describe("the booking calendar", () => {
  it("the window is today plus 60 days", () => {
    expect(windowEnd(today)).toBe("2026-12-17");
  });

  it("past and beyond the window are out; in range is open or closed", () => {
    expect(dayState("2026-10-17", today, open)).toBe("out");
    expect(dayState("2026-10-10", today, open)).toBe("out");
    expect(dayState("2027-01-05", today, open)).toBe("out");
    expect(dayState(today, today, open)).toBe("closed");
    expect(dayState("2026-10-21", today, open)).toBe("open");
    expect(dayState("2026-12-17", today, new Set(["2026-12-17"]))).toBe("open");
    expect(dayState("2026-12-18", today, new Set(["2026-12-18"]))).toBe("out");
  });

  it("the first open day skips past and out-of-window days", () => {
    expect(firstOpenDay(today, open)).toBe("2026-10-21");
    expect(firstOpenDay(today, new Set(["2026-10-01", "2027-02-01"]))).toBeNull();
  });

  it("months move only within today … today+60", () => {
    expect(canShift("2026-10-01", -1, today)).toBe(false);
    expect(canShift("2026-10-01", 1, today)).toBe(true);
    expect(canShift("2026-11-01", 1, today)).toBe(true);
    expect(canShift("2026-12-01", 1, today)).toBe(false);
    expect(canShift("2026-12-01", -1, today)).toBe(true);
  });

  it("groups a time by the clinic's clock (Kampala, UTC+3)", () => {
    expect(timeGroup("2026-10-21T05:20:00Z")).toBe("Morning"); // 08:20
    expect(timeGroup("2026-10-21T09:00:00Z")).toBe("Afternoon"); // 12:00
    expect(timeGroup("2026-10-21T13:59:00Z")).toBe("Afternoon"); // 16:59
    expect(timeGroup("2026-10-21T14:00:00Z")).toBe("Evening"); // 17:00
  });
});

describe("weeksOf", () => {
  it("puts each date under its own weekday, seven to a row", () => {
    const weeks = weeksOf(monthGrid("2026-10-17"));
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // October 2026 starts on a Thursday; the 4th is a Sunday, the last cell of the first row.
    expect(weeks[0]?.[3]).toBe("2026-10-01");
    expect(weeks[0]?.[6]).toBe("2026-10-04");
    expect(weeks[1]?.[0]).toBe("2026-10-05");
  });
});
