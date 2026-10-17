import type { MedRow, TakeRec } from "@/data/medicines";

import {
  dayDoses,
  doseStatus,
  patternFor,
  SLOT_TIMES,
  SLOT_WORDS,
  slotOf,
  takesForDay,
  toDose,
  weekCounts,
  whenWords,
} from "@/data/medicines";

const NOW = new Date(2026, 9, 17, 13, 10);
const med = (r: Partial<MedRow> = {}): MedRow => ({
  id: "m1",
  name: "[Medicine A]",
  dose: "500 mg",
  instructions: null,
  schedulePattern: "twice_daily",
  scheduleTimes: ["08:00:00", "20:00:00"],
  state: "active",
  createdAt: new Date(2026, 8, 1).toISOString(),
  ...r,
});
const take = (id: string, taken: Date, scheduled: Date | null): TakeRec => ({
  id,
  medicationId: "m1",
  takenAtIso: taken.toISOString(),
  scheduledForIso: scheduled?.toISOString() ?? null,
});
const on = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);

describe("dose slot → dose", () => {
  it("maps the web's slot to the phone's dose, never showing the dose column (L5)", () => {
    const slot = dayDoses([med({ instructions: "with food" })], [], NOW, NOW).slots[0];
    const dose = toDose(slot);
    expect(dose).toMatchObject({
      id: "m1@08:00",
      slot: "morning",
      time: "08:00",
      medicine: "[Medicine A]",
      instruction: "As your clinician prescribed · with food",
      takenAt: null,
      scheduledForIso: on(17, 8).toISOString(),
    });
    expect(JSON.stringify(dose)).not.toContain("500");
  });

  it("names the time of day from the hour, and every slot has words", () => {
    expect(["06:00", "11:00", "15:59", "16:00", "21:00", "02:00"].map(slotOf)).toEqual([
      "morning",
      "midday",
      "midday",
      "evening",
      "night",
      "night",
    ]);
    for (const s of Object.keys(SLOT_TIMES) as (keyof typeof SLOT_TIMES)[]) {
      expect(slotOf(SLOT_TIMES[s])).toBe(s);
      expect(SLOT_WORDS[s]).toBeTruthy();
    }
  });

  it("is due from an hour before until the grace ends; then missed, or no entry for a guessed time", () => {
    const at = on(17, 13);
    expect(doseStatus({ state: "open", at }, on(17, 11, 59))).toBe("later");
    expect(doseStatus({ state: "open", at }, on(17, 12, 0))).toBe("due");
    expect(doseStatus({ state: "open", at }, on(17, 14, 0))).toBe("due");
    expect(doseStatus({ state: "open", at }, on(17, 14, 1))).toBe("noEntry");
    expect(doseStatus({ state: "missed", at }, on(17, 15))).toBe("missed");
    expect(doseStatus({ state: "taken", at }, on(17, 15))).toBe("taken");
  });

  it("claims a take by its scheduled_for and shows when it was taken", () => {
    const day = dayDoses([med()], [take("t1", on(17, 8, 12), on(17, 8))], NOW, NOW);
    expect(day.taken).toBe(1);
    expect(toDose(day.slots[0]).takenAt).toBe("08:12");
  });
});

describe("week counts", () => {
  it("counts each day's takes against that day's doses, oldest first", () => {
    const takes = [
      take("a", on(17, 8, 5), on(17, 8)),
      take("b", on(16, 8, 1), on(16, 8)),
      take("c", on(16, 20, 3), on(16, 20)),
      // Last night's dose taken after midnight belongs to the 15th, not the 16th.
      take("d", on(16, 0, 20), on(15, 20)),
    ];
    const w = weekCounts([med()], takes, NOW);
    expect(w.taken).toEqual([0, 0, 0, 0, 1, 2, 1]);
    expect(w.totals).toEqual([2, 2, 2, 2, 2, 2, 2]);
  });

  it("does not count days before a medicine was added", () => {
    const w = weekCounts([med({ createdAt: on(16, 9).toISOString() })], [], NOW);
    expect(w.totals).toEqual([0, 0, 0, 0, 0, 2, 2]);
  });

  it("a paused medicine has no doses to count", () => {
    expect(weekCounts([med({ state: "paused" })], [], NOW).totals).toEqual(Array(7).fill(0));
  });

  it("files takes by scheduled_for, else taken_at", () => {
    const t = [take("x", on(16, 0, 20), on(15, 20)), take("y", on(16, 9), null)];
    expect(takesForDay(t, on(16, 0)).map((x) => x.id)).toEqual(["y"]);
  });
});

describe("adding a medicine", () => {
  it("writes the pattern the web reads", () => {
    expect(patternFor([])).toBe("as_needed");
    expect(patternFor(["08:00"])).toBe("once_daily");
    expect(patternFor(["08:00", "20:00"])).toBe("twice_daily");
    expect(patternFor(["08:00", "13:00", "20:00"])).toBe("thrice_daily");
    expect(patternFor(["08:00", "13:00", "20:00", "22:00"])).toBe("custom");
  });
  it("says the times in words", () => {
    expect(whenWords(med())).toBe("Morning and evening");
    expect(whenWords(med({ schedulePattern: "as_needed" }))).toBe("When you need it");
    expect(whenWords(med({ schedulePattern: "custom", scheduleTimes: null }))).toBe("No times set");
  });
});
