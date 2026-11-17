/** Patient app v2 shared core: the hero ladder (S17), reading cards, stages (MR4). */
import type { TodayState } from "@patient-core/today-hero";
import { inTargetCount, plausible, weekChange } from "@patient-core/reading-cards";
import { heroFor, heroTone } from "@patient-core/today-hero";
import { stageOf, STAGES } from "@patient-core/visit-stages";
import { describe, expect, it } from "vitest";

const PARTS = {
  danger: { kind: "low_sugar" as const, at: "07:20" },
  teamAsks: { id: "m1", from: "Nurse", at: "07:00" },
  dueNow: { kind: "dose" as const, key: "metformin", label: "Metformin", dueAt: "08:00" },
  visitToday: { appointmentId: "a1", window: "09:00–11:00" },
  nextItem: { kind: "walk" as const, label: "Walk", at: "17:00" },
};
const KEYS = Object.keys(PARTS) as (keyof typeof PARTS)[];

describe("S17 the Today ladder picks the right hero for every combination", () => {
  it("all 32 combinations", () => {
    for (let mask = 0; mask < 32; mask++) {
      const s: TodayState = {
        danger: null,
        teamAsks: null,
        dueNow: null,
        visitToday: null,
        nextItem: null,
        nothingUntil: "Tomorrow 08:00",
      };
      KEYS.forEach((k, i) => {
        if (mask & (1 << i)) (s as unknown as Record<string, unknown>)[k] = PARTS[k];
      });
      const first = KEYS.findIndex((_, i) => mask & (1 << i));
      const h = heroFor(s);
      expect(h.rung, `mask ${mask}`).toBe(first === -1 ? 6 : first + 1);
      expect(heroTone(h) === "emergency", `mask ${mask}`).toBe(h.kind === "danger");
    }
  });
});

describe("reading cards", () => {
  it("week change: toward target is good, away is amber, inside is flat", () => {
    expect(weekChange("sugar", "fasting", 8.4, 7.8)).toMatchObject({
      text: "↓ 0.6 in a week",
      tone: "good",
    });
    expect(weekChange("sugar", "fasting", 7.8, 8.4)).toMatchObject({
      direction: "away",
      tone: "caution",
    });
    expect(weekChange("sugar", "fasting", 5.5, 6.0)).toMatchObject({
      direction: "flat",
      tone: "neutral",
    });
    expect(weekChange("bp", "random", 150, 142)).toMatchObject({ direction: "toward" });
    expect(weekChange("weight", "random", 82, 80)).toMatchObject({ tone: "neutral" });
    expect(weekChange("weight", "random", 82, 80, 75)).toMatchObject({ tone: "good" });
    expect(weekChange("sugar", "fasting", null, 7)).toBeNull();
  });

  it("N of 10 in target, from the thresholds file's band", () => {
    const r = inTargetCount("sugar", "fasting", [5, 6, 7, 8, null, 4.5, 3.5, 7.2, 9, 6]);
    expect(r).toEqual({ inTarget: 6, days: 10, text: "6 of 10 in target" });
    expect(inTargetCount("weight", "random", [80])).toBeNull();
  });

  it("plausibility catches slips, not clinical judgement", () => {
    expect(plausible({ kind: "bp", top: 138, bottom: 86 })).toEqual({ ok: true });
    expect(plausible({ kind: "bp", top: 86, bottom: 138 }).ok).toBe(false);
    expect(plausible({ kind: "sugar", value: 72 }).ok).toBe(false);
    expect(plausible({ kind: "sugar", value: 3.2 }).ok).toBe(true);
  });
});

describe("visit stages: words, never numbers (MR4)", () => {
  it("maps the appointment and the floor", () => {
    expect(stageOf("confirmed", null)).toEqual({ index: 0, label: "Booked", called: false });
    expect(stageOf("arrived", null).index).toBe(1);
    expect(stageOf("arrived", "triage").label).toBe("Waiting for the nurse");
    expect(stageOf("arrived", "line").label).toBe("Waiting for the doctor");
    expect(stageOf("arrived", "called")).toEqual({ index: 3, label: "Called", called: true });
    expect(stageOf("completed", null).index).toBe(4);
  });
  it("no stage word holds a number or a wait", () => {
    for (const w of STAGES) expect(w).not.toMatch(/\d|ahead|wait time|minutes|position/i);
  });
});
