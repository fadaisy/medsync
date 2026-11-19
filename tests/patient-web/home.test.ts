import type { DoctorCard } from "@patient-core/doctors";
import type { LogRow } from "@patient-core/log";
import type { MedRow, TakeRec } from "@patient-core/medicines";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  doctorFilters,
  doctorPreviews,
  FEE_UNKNOWN,
  PREVIEW_COUNT,
  toDoctorCards,
  WALK_IN_FILTER,
} from "@patient-core/doctors";
import { lastDays, moodsFor, readingsFrom, yearMix } from "@patient-core/log";
import { describe, expect, it, vi } from "vitest";

import { DoctorsView } from "@/app/pw/patient/_components/doctors";
import { buildDay } from "@/app/pw/patient/_lib/cascade";
import { HOME_COPY } from "@/content/patient/home";
import { today } from "@/lib/patient-web/today";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

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

/** A doctor with one place; invented, belongs to nobody (the phone's doctors.test.tsx fixture). */
const doc = (key: string, next: string | null, home = false): DoctorCard => ({
  key,
  userId: key,
  name: `Doctor ${key}`,
  role: "Medical Officer",
  initials: "DR",
  photoUrl: null,
  nextDayKey: next,
  rating: null,
  places: [
    {
      hospitalId: home ? "h-home" : "h-away",
      hospitalName: home ? "Home Hospital" : "Away Hospital",
      departmentId: "dep",
      departmentName: "General OPD",
      nextDayKey: next,
      feeWords: "No fee",
      walkInToday: false,
      home,
    },
  ],
});

describe("Home's See a doctor previews (the phone's, 19 Nov 2026)", () => {
  it("soonest open day first, the patient's own hospital first on the same day, at most four", () => {
    const list = [
      doc("late", "2026-11-23"),
      doc("none", null),
      doc("away-today", "2026-11-18"),
      doc("home-today", "2026-11-18", true),
      doc("tomorrow", "2026-11-19"),
      doc("later", "2026-11-25"),
    ];
    expect(doctorPreviews(list).map((d) => d.key)).toEqual([
      "home-today",
      "away-today",
      "tomorrow",
      "late",
    ]);
    expect(PREVIEW_COUNT).toBe(4);
  });

  it("draws each preview with its day on a chip, asking that doctor for a day; See all opens Book", () => {
    const html = renderToStaticMarkup(
      h(DoctorsView, { doctors: [doc("a", "2027-01-14", true), doc("b", null)] }),
    );
    expect(html).toContain("See a doctor");
    expect(html).toContain("Thu 14 Jan");
    expect(html).toContain("/patient/book/day?doctor=a&amp;department=dep&amp;hospital=h-home");
    expect(html).toContain('href="/patient/book"');
    expect(html).not.toContain("Doctor b");
    expect(html).not.toMatch(/rating|UGX|No fee|Come today/i);
  });

  it("on failure, with no doctor, or with none open, it is one quiet row and no See all", () => {
    const failed = renderToStaticMarkup(h(DoctorsView, { doctors: null }));
    expect(failed).toContain(HOME_COPY.doctorsFailed.replace("'", "&#x27;"));
    expect(failed).toContain("<button");
    expect(renderToStaticMarkup(h(DoctorsView, { doctors: [] }))).toContain(HOME_COPY.doctorsNone);
    const closed = renderToStaticMarkup(h(DoctorsView, { doctors: [doc("x", null)] }));
    expect(closed).toContain(HOME_COPY.doctorsNoOpenDay);
    expect(closed).not.toContain(HOME_COPY.seeAll);
  });
});
