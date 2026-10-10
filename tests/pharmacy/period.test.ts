import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Pharmacy Phase 0 — honest time (Law 9): periods are hospital-local days on the server clock. */
describe("periodRange", async () => {
  const { periodRange } = await import("@/lib/pharmacy/read");

  it("today starts at Kampala midnight, whatever the server's own zone", () => {
    const now = new Date("2026-10-10T20:30:00Z"); // 23:30 in Kampala
    expect(periodRange("today", now)).toEqual({
      start: new Date("2026-10-09T21:00:00Z"),
      end: now,
    });
    const after = new Date("2026-10-10T21:30:00Z"); // 00:30 the next day in Kampala
    expect(periodRange("today", after).start).toEqual(new Date("2026-10-10T21:00:00Z"));
  });

  it("yesterday is the whole previous local day; 7 and 30 days include today", () => {
    const now = new Date("2026-10-10T08:00:00Z");
    expect(periodRange("yesterday", now)).toEqual({
      start: new Date("2026-10-08T21:00:00Z"),
      end: new Date("2026-10-09T21:00:00Z"),
    });
    expect(periodRange("7d", now).start).toEqual(new Date("2026-10-03T21:00:00Z"));
    expect(periodRange("30d", now).start).toEqual(new Date("2026-09-10T21:00:00Z"));
  });
});
