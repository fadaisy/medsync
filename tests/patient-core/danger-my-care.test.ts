import {
  dangerFor,
  nextStep,
  startFlow,
  SUGAR_RECHECK_MINUTES,
  timerText,
} from "@patient-core/danger-flow";
import { checksThisYear, inTeamHours, teamCards } from "@patient-core/my-care";
import { describe, expect, it } from "vitest";

describe("danger flows (§5.8)", () => {
  const now = new Date("2026-11-16T09:00:00Z");
  it("S23: a sugar of 3.2 is low sugar and opens the sweet step", () => {
    expect(dangerFor({ kind: "sugar", value: 3.2 })).toBe("low_sugar");
    expect(startFlow("low_sugar")).toEqual({ flow: "low_sugar", step: "sweet" });
  });
  it("low sugar: sweet → sit → a 15-minute wait that cannot be skipped → recheck → better or Help", () => {
    let s = nextStep(nextStep(startFlow("low_sugar"), { type: "next", now }), {
      type: "next",
      now,
    });
    expect(s).toMatchObject({ step: "wait" });
    expect(SUGAR_RECHECK_MINUTES).toBe(15);
    expect(nextStep(s, { type: "next", now: new Date(now.getTime() + 14 * 60_000) })).toEqual(s);
    s = nextStep(s, { type: "next", now: new Date(now.getTime() + 15 * 60_000) });
    expect(s.step).toBe("recheck");
    expect(nextStep(s, { type: "reading", input: { kind: "sugar", value: 3.6 } }).step).toBe(
      "help",
    );
    expect(nextStep(s, { type: "reading", input: { kind: "sugar", value: 5.1 } }).step).toBe(
      "better",
    );
  });
  it("very high BP: a second reading at or above 180 or 110 means call the nurse today", () => {
    const second = nextStep(startFlow("very_high_bp"), { type: "next", now });
    expect(
      nextStep(second, { type: "reading", input: { kind: "bp", top: 182, bottom: 100 } }).step,
    ).toBe("call_nurse");
    expect(
      nextStep(second, { type: "reading", input: { kind: "bp", top: 150, bottom: 110 } }).step,
    ).toBe("call_nurse");
    expect(
      nextStep(second, { type: "reading", input: { kind: "bp", top: 165, bottom: 100 } }).step,
    ).toBe("better");
    expect(
      nextStep(second, { type: "reading", input: { kind: "bp", top: 165, bottom: null } }),
    ).toEqual(second);
  });
  it("a warning sign is Help from any step; high sugar and pulse go straight to Help", () => {
    expect(nextStep(startFlow("very_high_bp"), { type: "warning_sign" }).step).toBe("help");
    expect(nextStep(startFlow("low_sugar"), { type: "warning_sign" }).step).toBe("help");
    expect(startFlow("high_sugar").step).toBe("help_now");
    expect(startFlow("pulse").step).toBe("help_now");
  });
  it("the timer counts down and stops at 0:00", () => {
    expect(timerText("2026-11-16T09:15:00Z", now)).toBe("15:00");
    expect(timerText("2026-11-16T09:15:00Z", new Date("2026-11-16T09:16:00Z"))).toBe("0:00");
  });
});

describe("My care (§5.8)", () => {
  it("S20: names only with consent; roles always; the first contact first", () => {
    const cards = teamCards(
      [
        { id: "a", role: "nutritionist", firstContact: false, nextStep: null, memberUserId: null },
        {
          id: "b",
          role: "nurse",
          firstContact: true,
          nextStep: "Calls you on Friday",
          memberUserId: "u-nurse",
        },
        { id: "c", role: "doctor", firstContact: false, nextStep: null, memberUserId: "u-unknown" },
      ],
      new Map([["u-nurse", "Sister Example"]]),
    );
    expect(cards.map((c) => [c.role, c.name, c.firstContact])).toEqual([
      ["Nurse", "Sister Example", true],
      ["Doctor", null, false],
      ["Nutritionist", null, false],
    ]);
  });
  it("checks: done within the interval, due, overdue after a month, never recorded is due", () => {
    const now = new Date("2026-11-16T09:00:00Z");
    const lines = checksThisYear(
      { hba1c: 3, eyes: 12, feet: 12, kidneys: 12 },
      new Map([
        ["hba1c", "2026-10-01T00:00:00Z"],
        ["eyes", "2025-11-01T00:00:00Z"],
        ["feet", "2025-08-01T00:00:00Z"],
      ]),
      now,
    );
    expect(Object.fromEntries(lines.map((l) => [l.key, l.state]))).toEqual({
      hba1c: "done",
      eyes: "due",
      feet: "overdue",
      kidneys: "due",
    });
    expect(lines[0]!.state).toBe("overdue");
  });
  it("team hours: weekdays 08:00 to 17:00 Kampala", () => {
    expect(inTeamHours(new Date("2026-11-16T05:00:00Z"))).toBe(true); // Mon 08:00
    expect(inTeamHours(new Date("2026-11-16T14:00:00Z"))).toBe(false); // Mon 17:00
    expect(inTeamHours(new Date("2026-11-15T08:00:00Z"))).toBe(false); // Sun
  });
});
