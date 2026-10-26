import type { LogRow } from "@/data/health-log";

import {
  ACTIVITIES,
  activityOf,
  costOf,
  exercisesOn,
  exerciseUnit,
  kcalFor,
  stepsOn,
  stepsToSave,
} from "@/data/exercise";

jest.mock("@/data/health-log", () => {
  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return {
    dayKey,
    latestByDay: (rows: LogRow[], kind: string) => {
      const out = new Map<string, LogRow>();
      for (const r of rows)
        if (r.kind === kind && !out.has(dayKey(new Date(r.recordedAt))))
          out.set(dayKey(new Date(r.recordedAt)), r);
      return out;
    },
  };
});

const row = (
  kind: string,
  at: string,
  v1: number,
  unit: string | null = null,
  v2: number | null = null,
) => ({ id: `${kind}${at}`, kind, recordedAt: at, v1, v2, unit, note: null }) as LogRow;

describe("exercise (ADR 0413)", () => {
  it("every activity cites a Compendium code and a MET", () => {
    for (const a of ACTIVITIES)
      for (const e of ["easy", "moderate", "hard"] as const) {
        const c = costOf(a, e);
        expect(c.code).toMatch(/^\d{5}$/);
        expect(c.met).toBeGreaterThan(1);
      }
  });

  it("estimates energy as MET × kg × hours, and not without a weight", () => {
    expect(kcalFor(4.8, 70, 30)).toBe(168);
    expect(kcalFor(4.8, null, 30)).toBeNull();
  });

  it("stores the activity and effort and reads them back", () => {
    const walk = ACTIVITIES.find((a) => a.key === "walk")!;
    expect(exerciseUnit(walk, "hard")).toBe("walk:hard");
    expect(activityOf("walk:hard")?.effort).toBe("hard");
    expect(activityOf("dance")?.activity.label).toBe("Dancing");
    expect(activityOf("nonsense")).toBeNull();
  });

  it("takes the day's latest step count and writes only real increases", () => {
    const day = new Date(2026, 9, 18, 9);
    const rows = [
      row("steps", new Date(2026, 9, 18, 12).toISOString(), 4200),
      row("steps", new Date(2026, 9, 18, 8).toISOString(), 1000),
    ];
    expect(stepsOn(rows, [day])).toEqual([4200]);
    const stored = new Map([["2026-10-18", 4200]]);
    expect(stepsToSave(stored, [{ day: "2026-10-18", steps: 4220 }])).toEqual([]);
    expect(
      stepsToSave(stored, [
        { day: "2026-10-18", steps: 4300 },
        { day: "2026-10-17", steps: 6000 },
      ]),
    ).toEqual([
      { day: "2026-10-18", steps: 4300 },
      { day: "2026-10-17", steps: 6000 },
    ]);
  });

  it("lists today's activities with minutes and energy", () => {
    const today = new Date(2026, 9, 18, 18);
    const rows = [
      row("exercise", new Date(2026, 9, 18, 7).toISOString(), 30, "walk:moderate", 168),
    ];
    expect(exercisesOn(rows, today)).toMatchObject([{ label: "Walking", minutes: 30, kcal: 168 }]);
  });
});
