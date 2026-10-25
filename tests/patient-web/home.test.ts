import type { LogRow } from "@patient-core/log";
import type { MedRow, TakeRec } from "@patient-core/medicines";
import { doctorFilters, FEE_UNKNOWN, toDoctorCards, WALK_IN_FILTER } from "@patient-core/doctors";
import { lastDays, moodsFor, readingsFrom, yearMix } from "@patient-core/log";
import { describe, expect, it } from "vitest";

import { buildDay } from "@/app/pw/patient/_lib/cascade";
import { HOME_COPY } from "@/content/patient/home";
import { today } from "@/lib/patient-web/today";

/** Home (Step 3): S4 first run and the cascade order; S5's take/undo pair round-trips the day. */
const NOW = new Date(2026, 9, 25, 8, 10);
const at = (h: number, m = 0) => new Date(2026, 9, 25, h, m).toISOString();
const med = (id: string, times: string[]): MedRow => ({
  id,
  name: `Medicine ${id}`,
  dose: null,
  instructions: null,
  schedulePattern: times.length === 1 ? "once_daily" : "twice_daily",
  scheduleTimes: times,
  state: "active",
  createdAt: new Date(2026, 0, 1).toISOString(),
});
const row = (
  kind: LogRow["kind"],
  v1: number,
  recordedAt: string,
  extra: Partial<LogRow> = {},
): LogRow => ({
  id: `${kind}-${recordedAt}`,
  kind,
  recordedAt,
  v1,
  v2: null,
  unit: null,
  note: null,
  ...extra,
});
const day = (meds: MedRow[], takes: TakeRec[], rows: LogRow[]) =>
  buildDay({
    today: today(meds, takes, NOW),
    medicineCount: meds.length,
    readings: readingsFrom(rows),
    rows,
    now: NOW,
  });

describe("Home day (S4)", () => {
  it("nothing logged: first run", () => {
    expect(day([], [], [])).toEqual({ kind: "firstRun" });
  });

  it("a loaded day: taken doses, the reading, Move, Eat, Water, then the Now card last", () => {
    const meds = [med("a", ["07:00", "20:00"]), med("b", ["08:00"])];
    const takes: TakeRec[] = [
      { id: "t1", medicationId: "a", takenAtIso: at(7, 5), scheduledForIso: at(7) },
    ];
    const rows = [row("bp", 128, at(7, 30), { v2: 82, unit: "mmHg" }), row("water", 3, at(7))];
    const v = day(meds, takes, rows);
    expect(v.kind).toBe("cascade");
    if (v.kind !== "cascade") return;
    expect(v.steps.map((s) => s.key)).toEqual(["a@07:00", rows[0]!.id, "move", "eat", "water"]);
    expect(v.steps[0]!.done).toBe(true);
    expect(v.steps[4]!.title).toBe(HOME_COPY.water(3, 8));
    expect(v.tail).toMatchObject({ kind: "now", dose: { id: "b@08:00" } });
  });

  it("a take moves the dose out of Now; removing it (Undo) brings it back (S5)", () => {
    const meds = [med("b", ["08:00"])];
    const taken = day(
      meds,
      [{ id: "t", medicationId: "b", takenAtIso: at(8, 10), scheduledForIso: at(8) }],
      [],
    );
    expect(taken.kind === "cascade" && taken.tail).toBeNull();
    const undone = day(meds, [], []);
    expect(undone.kind === "cascade" && undone.tail).toMatchObject({ kind: "now" });
    expect(
      today(
        meds,
        [{ id: "t", medicationId: "b", takenAtIso: at(8, 10), scheduledForIso: at(8) }],
        NOW,
      ).doses[0]!.takeId,
    ).toBe("t");
  });

  it("with nothing taken or read, the tail is the next dose, else Nothing due", () => {
    const later = day([med("c", ["20:00"])], [], []);
    expect(later.kind === "cascade" && later.tail).toMatchObject({ kind: "next" });
    const quiet = day([], [], [row("water", 1, at(7))]);
    expect(quiet.kind === "cascade" && quiet.tail).toEqual({ kind: "quiet" });
  });
});

describe("mood", () => {
  it("the day's latest face wins; the week strip is seven days ending today", () => {
    const rows = [row("mood", 1, at(8)), row("mood", 3, at(7))];
    const week = moodsFor(rows, lastDays(NOW));
    expect(week).toHaveLength(7);
    expect(week[6]).toBe("low");
    expect(yearMix(rows, NOW)[9]).toEqual([0, 0, 100]);
  });
});

describe("See a doctor (S7)", () => {
  const base = {
    fullName: "Dr Jane Doe",
    hospitalName: "Mulago",
    cadre: "Medical Officer",
    cadreId: "00000000-0000-0000-0000-000000000d02",
    specialty: null,
    departmentName: "General",
    photoUrl: null,
    rating: null,
    slotsByDate: {},
  };
  it("a price list that did not load is not 'No fee'; walk-ins only at home and open now", () => {
    const cards = toDoctorCards(
      [
        { ...base, userId: "u1", hospitalId: "h1", departmentId: "d1" },
        { ...base, userId: "u2", fullName: "Dr Ann Bee", hospitalId: "h1", departmentId: "d2" },
      ],
      new Map(),
      [{ id: "d1", name: "General", openNow: true }],
      "h1",
    );
    expect(cards[0]!.places[0]!.feeWords).toBe(FEE_UNKNOWN);
    expect(cards[0]!.places[0]!.walkInToday).toBe(true);
    expect(cards[1]!.places[0]!.walkInToday).toBe(false);
    expect(doctorFilters(cards)).toContain(WALK_IN_FILTER);
  });
});
