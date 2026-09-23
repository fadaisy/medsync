import { describe, expect, it } from "vitest";

import { formatIdle, idleClass } from "@/lib/resus/closeout/idle";

const H = 3_600_000;
const NOW = Date.parse("2026-09-23T17:00:00Z");
const at = (idleMs: number) => idleClass(NOW - idleMs, NOW);

describe("CO-IDLE — idle classes (nothing auto-closes)", () => {
  it("CO-IDLE-01: under 2 h is active", () => {
    const r = at(2 * H - 1);
    expect(r.class).toBe("active");
    expect(r.ruleId).toBeNull();
  });

  it("CO-IDLE-01: exactly 2 h is flagged idle", () => {
    const r = at(2 * H);
    expect(r.class).toBe("idle");
    expect(r.ruleId).toBe("CO-IDLE-01");
  });

  it("CO-IDLE-01: 11 h 59 min is still only flagged", () => {
    expect(at(12 * H - 60_000).class).toBe("idle");
  });

  it("CO-IDLE-02: exactly 12 h triggers the notice class", () => {
    const r = at(12 * H);
    expect(r.class).toBe("notify");
    expect(r.ruleId).toBe("CO-IDLE-02");
  });

  it("CO-IDLE-02: 23 h 59 min does not yet enable administrative close", () => {
    expect(at(24 * H - 60_000).class).toBe("notify");
  });

  it("CO-IDLE-03: exactly 24 h enables administrative close", () => {
    const r = at(24 * H);
    expect(r.class).toBe("admin_close");
    expect(r.ruleId).toBe("CO-IDLE-03");
  });

  it("CO-IDLE-03: days later it stays admin_close (never auto-closes)", () => {
    expect(at(30 * 24 * H).class).toBe("admin_close");
  });

  it("CO-IDLE-01: the header label reads 'No activity 2 d 16 h'", () => {
    expect(at(64 * H + 59 * 60_000).label).toBe("No activity 2 d 16 h");
  });

  it("CO-IDLE-01: hours and minutes under a day", () => {
    expect(at(3 * H + 5 * 60_000).label).toBe("No activity 3 h 5 min");
  });

  it("CO-IDLE-01: minutes under an hour", () => {
    expect(at(45 * 60_000 + 30_000).label).toBe("No activity 45 min");
  });

  it("CO-IDLE-01: activity in the future (clock skew) counts as 0 idle", () => {
    const r = idleClass(NOW + 10 * 60_000, NOW);
    expect(r.idleMs).toBe(0);
    expect(r.class).toBe("active");
    expect(r.label).toBe("No activity 0 min");
  });

  it("CO-IDLE-01: formatIdle floors and never goes negative", () => {
    expect(formatIdle(-5)).toBe("0 min");
    expect(formatIdle(24 * H)).toBe("1 d 0 h");
  });
});
