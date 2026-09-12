import type { DoseSlot, MedicationRow, TakeRow } from "@/lib/patient/doses";
import { describe, expect, it } from "vitest";

import { buildDayDoses, isRecordableDay, pendingSlotAt, slotStateLabel } from "@/lib/patient/doses";

/**
 * Dose-slot derivation (PLAN §C/0.1). Pure, so no fixtures and no DB.
 *
 * The two cases that matter clinically: a take must never leave a slot it
 * plausibly belongs to rendered "Missed" (telling a patient they missed a
 * dose they took is a harm, not a cosmetic bug), and a slot whose time we
 * guessed from a schedule pattern must never reach "missed" at all.
 */

/** 12 Mar 2026, local — every instant below is local-time on purpose. */
const DAY = new Date(2026, 2, 12);
const at = (h: number, m = 0) => new Date(2026, 2, 12, h, m);
const iso = (h: number, m = 0) => at(h, m).toISOString();

const med = (over: Partial<MedicationRow> = {}): MedicationRow => ({
  id: "med-1",
  name: "Metformin",
  dose: "500 mg",
  instructions: null,
  schedulePattern: "twice_daily",
  scheduleTimes: null,
  state: "active",
  ...over,
});

const take = (over: Partial<TakeRow> = {}): TakeRow => ({
  medicationId: "med-1",
  takenAtIso: iso(8, 12),
  scheduledForIso: null,
  ...over,
});

const build = (medications: MedicationRow[], takes: TakeRow[], now: Date) =>
  buildDayDoses({ medications, takes, day: DAY, now });

const bySlot = (slots: DoseSlot[], timeLabel: string) => {
  const slot = slots.find((s) => s.timeLabel === timeLabel);
  if (!slot) throw new Error(`no slot at ${timeLabel}`);
  return slot;
};

describe("buildDayDoses — slot construction", () => {
  it("twice_daily with no schedule_times gives 2 presumed slots", () => {
    const { slots } = build([med()], [], at(9, 30));
    expect(slots.map((s) => s.timeLabel)).toEqual(["08:00", "20:00"]);
    expect(slots.every((s) => s.presumed)).toBe(true);
  });

  it("as_needed gives no slots and one as-needed row", () => {
    const { slots, asNeeded } = build([med({ schedulePattern: "as_needed" })], [], at(9, 30));
    expect(slots).toHaveLength(0);
    expect(asNeeded).toHaveLength(1);
    expect(asNeeded[0]?.hasNoTimes).toBe(false);
  });

  it("custom without times gives no slots and an as-needed row flagged hasNoTimes", () => {
    const { slots, asNeeded } = build([med({ schedulePattern: "custom" })], [], at(9, 30));
    expect(slots).toHaveLength(0);
    expect(asNeeded[0]?.hasNoTimes).toBe(true);
  });

  it("real schedule_times override the pattern and are not presumed", () => {
    const { slots } = build([med({ scheduleTimes: ["08:00:00", "20:00:00"] })], [], at(9, 30));
    expect(slots.map((s) => s.timeLabel)).toEqual(["08:00", "20:00"]);
    expect(slots.every((s) => s.presumed)).toBe(false);
  });
});

describe("buildDayDoses — claiming takes", () => {
  const twiceDaily = med({ scheduleTimes: ["08:00:00", "20:00:00"] });

  it("an exact scheduled_for claims that slot and leaves the other open", () => {
    const { slots } = build(
      [twiceDaily],
      [take({ takenAtIso: iso(8, 12), scheduledForIso: iso(8) })],
      at(9, 30),
    );
    expect(bySlot(slots, "08:00").state).toBe("taken");
    expect(bySlot(slots, "08:00").takenAtLabel).toBe("08:12");
    expect(bySlot(slots, "20:00").state).toBe("open");
  });

  it("a legacy take at 08:12 claims 08:00, not 20:00", () => {
    const { slots } = build([twiceDaily], [take({ takenAtIso: iso(8, 12) })], at(9, 30));
    expect(bySlot(slots, "08:00").state).toBe("taken");
    expect(bySlot(slots, "20:00").state).toBe("open");
  });

  it("a legacy take at 19:00 claims 20:00 — 08:00 is the missed one, not the reverse", () => {
    const { slots } = build([twiceDaily], [take({ takenAtIso: iso(19) })], at(19, 30));
    expect(bySlot(slots, "20:00").state).toBe("taken");
    expect(bySlot(slots, "08:00").state).toBe("missed");
  });

  it("with 20:00 already claimed, a 19:00 take falls back to 08:00 — no distance window", () => {
    // The harm case stated in the plan: a window of ±2h would discard this
    // take and leave 08:00 rendering "Missed" for a dose that was taken.
    const { slots, extras } = build(
      [twiceDaily],
      [take({ takenAtIso: iso(20, 5), scheduledForIso: iso(20) }), take({ takenAtIso: iso(19) })],
      at(21),
    );
    expect(bySlot(slots, "20:00").state).toBe("taken");
    expect(bySlot(slots, "08:00").state).toBe("taken");
    expect(bySlot(slots, "08:00").takenAtLabel).toBe("19:00");
    expect(extras).toHaveLength(0);
  });

  it("two legacy takes against one slot give 1 taken + 1 extra", () => {
    const { slots, extras, total, taken } = build(
      [med({ schedulePattern: "once_daily", scheduleTimes: ["08:00:00"] })],
      [take({ takenAtIso: iso(8, 5) }), take({ takenAtIso: iso(16, 40) })],
      at(18),
    );
    expect(total).toBe(1);
    expect(taken).toBe(1);
    expect(bySlot(slots, "08:00").state).toBe("taken");
    expect(extras).toHaveLength(1);
    expect(extras[0]?.timeLabel).toBe("16:40");
  });

  it("takes on an as-needed medication are recorded on its row, never as extras", () => {
    const { extras, asNeeded } = build(
      [med({ schedulePattern: "as_needed" })],
      [take({ takenAtIso: iso(16, 40) })],
      at(18),
    );
    expect(extras).toHaveLength(0);
    expect(asNeeded[0]?.takenTimeLabels).toEqual(["16:40"]);
  });
});

describe("buildDayDoses — state and labels", () => {
  const realTimes = med({ scheduleTimes: ["08:00:00", "20:00:00"] });

  it("an unclaimed real 08:00 slot is missed once the grace hour has passed", () => {
    const { slots } = build([realTimes], [], at(9, 30));
    const slot = bySlot(slots, "08:00");
    expect(slot.state).toBe("missed");
    expect(slotStateLabel(slot, DAY, at(9, 30))).toBe("Missed");
  });

  it("the same slot is still open inside the grace hour", () => {
    const { slots } = build([realTimes], [], at(8, 45));
    const slot = bySlot(slots, "08:00");
    expect(slot.state).toBe("open");
    expect(slotStateLabel(slot, DAY, at(8, 45))).toBe("Due 08:00");
  });

  it("an unclaimed PRESUMED 08:00 slot is never missed — it reads 'No entry'", () => {
    // We invented the time. Inventing the failure on top of it would be two
    // fabrications in one row.
    const { slots } = build([med()], [], at(9, 30));
    const slot = bySlot(slots, "08:00");
    expect(slot.presumed).toBe(true);
    expect(slot.state).toBe("open");
    expect(slotStateLabel(slot, DAY, at(9, 30))).toBe("No entry");
  });

  it("a paused or stopped medicine is never missed — it reads 'No entry'", () => {
    // `listMedicationsForDay` has no paused-on date to bound a paused row
    // with, so it returns one on every day forever, and it returns a row
    // ended *on* the day being viewed (`ended_on` is a date, so it cannot
    // say at what hour). Either would otherwise accuse the patient of
    // missing a dose of a medicine they had already stopped taking.
    for (const state of ["paused", "ended"]) {
      const { slots } = build([med({ scheduleTimes: ["08:00:00"], state })], [], at(9, 30));
      const slot = bySlot(slots, "08:00");
      expect(slot.presumed).toBe(false);
      expect(slot.state).toBe("open");
      expect(slotStateLabel(slot, DAY, at(9, 30))).toBe("No entry");
    }
  });

  it("a dose recorded against a stopped medicine still reads Taken", () => {
    // Only `missed` is suppressed — a take is a fact whatever the state.
    const { slots } = build(
      [med({ scheduleTimes: ["08:00:00"], state: "ended" })],
      [take({ takenAtIso: iso(8, 12) })],
      at(9, 30),
    );
    expect(bySlot(slots, "08:00").state).toBe("taken");
  });

  it("every slot on a future day is open and labelled 'Scheduled'", () => {
    const tomorrow = new Date(2026, 2, 13);
    const { slots, next } = buildDayDoses({
      medications: [realTimes],
      takes: [],
      day: tomorrow,
      now: at(9, 30),
    });
    expect(slots.every((s) => s.state === "open")).toBe(true);
    for (const slot of slots) {
      expect(slotStateLabel(slot, tomorrow, at(9, 30))).toBe("Scheduled");
    }
    expect(next?.timeLabel).toBe("08:00");
  });

  it("a taken slot is labelled with the time it was actually taken", () => {
    const { slots } = build([realTimes], [take({ takenAtIso: iso(8, 12) })], at(9, 30));
    expect(slotStateLabel(bySlot(slots, "08:00"), DAY, at(9, 30))).toBe("Taken 08:12");
  });

  it("next is the earliest still-actionable slot, and null once the day is done", () => {
    expect(build([realTimes], [], at(9, 30)).next?.timeLabel).toBe("20:00");
    expect(build([realTimes], [], at(23, 30)).next).toBeNull();
  });
});

describe("buildDayDoses — counts and tints", () => {
  it("total and taken count slots only", () => {
    const { total, taken } = build(
      [
        med({ scheduleTimes: ["08:00:00", "20:00:00"] }),
        med({ id: "med-2", name: "Aspirin", schedulePattern: "as_needed" }),
      ],
      [take({ takenAtIso: iso(8, 12) })],
      at(9, 30),
    );
    expect(total).toBe(2);
    expect(taken).toBe(1);
  });

  it("a stopped medication is neutral; an active one keeps a rotation tint", () => {
    const { slots } = build(
      [
        med({ scheduleTimes: ["08:00:00"], state: "ended" }),
        med({ id: "med-2", name: "Aspirin", scheduleTimes: ["09:00:00"] }),
      ],
      [],
      at(9, 30),
    );
    expect(bySlot(slots, "08:00").tint).toBe("neutral");
    expect(bySlot(slots, "09:00").tint).not.toBe("neutral");
  });

  it("the tint is stable per medication id and independent of position", () => {
    const first = build([med({ id: "abc", scheduleTimes: ["08:00:00"] })], [], at(9, 30));
    const second = build(
      [
        med({ id: "zzz", name: "Other", scheduleTimes: ["07:00:00"] }),
        med({ id: "abc", scheduleTimes: ["08:00:00"] }),
      ],
      [],
      at(9, 30),
    );
    expect(bySlot(second.slots, "08:00").tint).toBe(bySlot(first.slots, "08:00").tint);
  });
});

describe("pendingSlotAt — the slot a single Take button records against", () => {
  const twiceDaily = med({ scheduleTimes: ["08:00:00", "20:00:00"] });

  it("names the slot nearest the clock, never the earliest unrecorded one", () => {
    const now = at(19, 55);
    const { slots } = build([twiceDaily], [], now);
    expect(pendingSlotAt(slots, now)?.timeLabel).toBe("20:00");
    // …which is not what scanning for the first non-taken slot answers.
    expect(slots.find((s) => s.state !== "taken")?.timeLabel).toBe("08:00");
  });

  it("a 19:55 tap records the evening dose, leaving only the morning missed", () => {
    // The harm in full: a surface with one button per medicine has to name
    // the slot it writes `scheduled_for` against. Name the earliest
    // unrecorded one and this take is filed under 08:00, the exact-match
    // pass claims 08:00, and the 20:00 dose the patient has just swallowed
    // is left unclaimed — to flip to "Missed" at 21:00.
    const now = at(19, 55);
    const { slots } = build([twiceDaily], [], now);
    const chosen = pendingSlotAt(slots, now);

    const recorded = build(
      [twiceDaily],
      [take({ takenAtIso: iso(19, 55), scheduledForIso: chosen?.at.toISOString() ?? null })],
      at(21),
    );
    expect(bySlot(recorded.slots, "20:00").state).toBe("taken");
    expect(bySlot(recorded.slots, "08:00").state).toBe("missed");
  });

  it("picks the slot the greedy pass would have inferred for a take with none", () => {
    // The invariant behind the rule: the surface that names a slot and the
    // derivation that infers one must never reach different answers.
    const now = at(19, 55);
    const { slots } = build([twiceDaily], [], now);
    const inferred = build([twiceDaily], [take({ takenAtIso: iso(19, 55) })], at(21));
    expect(bySlot(inferred.slots, "20:00").takenAtLabel).toBe("19:55");
    expect(pendingSlotAt(slots, now)?.timeLabel).toBe("20:00");
  });

  it("moves on once a slot is recorded, and is undefined when the day is complete", () => {
    const morning = build(
      [twiceDaily],
      [take({ takenAtIso: iso(8, 5), scheduledForIso: iso(8) })],
      at(8, 10),
    );
    expect(pendingSlotAt(morning.slots, at(8, 10))?.key).toBe("med-1@20:00");

    const both = build(
      [twiceDaily],
      [
        take({ takenAtIso: iso(8, 5), scheduledForIso: iso(8) }),
        take({ takenAtIso: iso(20, 5), scheduledForIso: iso(20) }),
      ],
      at(21),
    );
    expect(pendingSlotAt(both.slots, at(21))).toBeUndefined();
  });
});

describe("buildDayDoses — a dose taken after midnight", () => {
  const twiceDaily = med({ scheduleTimes: ["08:00:00", "20:00:00"] });
  const YESTERDAY = new Date(2026, 2, 11);
  /** 20:00 on the 11th, recorded at 00:20 on the 12th. */
  const crossMidnight = take({
    takenAtIso: iso(0, 20),
    scheduledForIso: new Date(2026, 2, 11, 20, 0).toISOString(),
  });
  const yesterday = (takes: TakeRow[], now: Date) =>
    buildDayDoses({ medications: [twiceDaily], takes, day: YESTERDAY, now });

  it("never claims a slot on the day it was tapped", () => {
    // 00:20 is 7h40 from today's 08:00 and 19h40 from today's 20:00, so the
    // greedy pass hands it to the morning — "Taken 00:20" on a dose nobody
    // has swallowed yet. `scheduled_for` says which evening it was for.
    const { slots, extras } = build([twiceDaily], [crossMidnight], at(9, 30));
    expect(bySlot(slots, "08:00").state).toBe("missed");
    expect(bySlot(slots, "20:00").state).toBe("open");
    expect(extras).toHaveLength(0);
  });

  it("lands on the evening it names", () => {
    const { slots } = yesterday([crossMidnight], at(9, 30));
    expect(bySlot(slots, "20:00").state).toBe("taken");
  });

  it("reads a bare 'Taken' there — never 'Taken 00:20' beside a 20:00 dose", () => {
    const { slots } = yesterday([crossMidnight], at(9, 30));
    const evening = bySlot(slots, "20:00");
    expect(evening.takenAtLabel).toBeNull();
    expect(slotStateLabel(evening, YESTERDAY, at(9, 30))).toBe("Taken");
  });
});

describe("isRecordableDay", () => {
  it("covers today and yesterday, and nothing else", () => {
    // Yesterday, because the 00:20 dose above has to be reachable from some
    // screen. No further, because `taken_at` is always the clock.
    const now = at(0, 20);
    expect(isRecordableDay(DAY, now)).toBe(true);
    expect(isRecordableDay(new Date(2026, 2, 11), now)).toBe(true);
    expect(isRecordableDay(new Date(2026, 2, 10), now)).toBe(false);
    expect(isRecordableDay(new Date(2026, 2, 13), now)).toBe(false);
  });
});
