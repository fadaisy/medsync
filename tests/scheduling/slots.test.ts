import type {
  AvailabilityBlockRow,
  ClinicianSchedulingSettingsRow,
  DepartmentSchedulingPolicyRow,
  SlotContext,
} from "@/supabase/functions/_shared/slots";
import { describe, expect, it } from "vitest";

import {
  buildSlots,
  checkSlot,
  endOfLocalDay,
  expandSessionTemplate,
  localDateKey,
  localSession,
  localWeekdayAndMinutes,
  resolveSchedulingSettings,
  startOfLocalDay,
} from "@/supabase/functions/_shared/slots";

/**
 * Bookable-slot derivation. Pure, so no fixtures and no DB.
 *
 * The case that matters most is the headline one: a weekly "every Tuesday
 * 09:00-13:00" was visible on the clinician's own calendar and bookable by
 * nobody, because the read path, the write path and the calendar each had
 * their own arithmetic. Every assertion here is either one of those four
 * defects or the round-trip that keeps the two remaining paths identical.
 *
 * Every instant is an explicit UTC ISO string and the zone is passed in, so
 * nothing depends on the machine the suite runs on — which is half the point.
 */

const KAMPALA = "Africa/Kampala";
/** 2026-09-15 is a Tuesday; 2026-09-13 a Sunday. */
const TUE_0900Z = "2026-09-15T06:00:00Z"; // 09:00 EAT

/** The schema defaults: Mon-Fri, 08:00-17:00 local, 15-minute slots. */
function policy(over: Partial<DepartmentSchedulingPolicyRow> = {}): DepartmentSchedulingPolicyRow {
  return {
    defaultSlotMinutes: 15,
    defaultBufferMinutes: 0,
    defaultAutoConfirm: false,
    allowVirtual: false,
    bookableWeekdays: [1, 2, 3, 4, 5],
    bookableStartMinutesLocal: 480,
    bookableEndMinutesLocal: 1020,
    ...over,
  };
}

function settings(
  over: Partial<ClinicianSchedulingSettingsRow> = {},
): ClinicianSchedulingSettingsRow {
  return {
    defaultSlotMinutes: 15,
    bufferMinutes: 0,
    autoConfirm: false,
    allowVirtual: false,
    ...over,
  };
}

/** A one-off bookable block, Tue 09:00-10:00 EAT unless told otherwise. */
function block(over: Partial<AvailabilityBlockRow> = {}): AvailabilityBlockRow {
  return {
    kind: "bookable",
    state: "active",
    startsAt: TUE_0900Z,
    endsAt: "2026-09-15T07:00:00Z",
    recurrence: "none",
    ...over,
  };
}

function ctx(over: Partial<SlotContext> = {}): SlotContext {
  return {
    blocks: [],
    appointments: [],
    timeZone: KAMPALA,
    now: new Date("2026-09-01T00:00:00Z"),
    ...over,
  };
}

const DAY = {
  rangeStart: new Date("2026-09-15T00:00:00Z"),
  rangeEnd: new Date("2026-09-16T00:00:00Z"),
};
const THREE_WEEKS = {
  rangeStart: new Date("2026-09-14T00:00:00Z"),
  rangeEnd: new Date("2026-10-06T00:00:00Z"),
};

/**
 * "Tue, 09:00" in a named zone. Built from parts rather than `.format()`:
 * ICU builds disagree about the separator, and a test that fails on a comma
 * tells you nothing about the engine.
 */
function local(instant: Date, timeZone = KAMPALA): string {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant)) {
    bag[part.type] = part.value;
  }
  return `${bag.weekday}, ${bag.hour}:${bag.minute}`;
}

const at = (iso: string) => new Date(iso);
const labels = (slots: ReadonlyArray<{ startsAt: Date }>, tz = KAMPALA) =>
  slots.map((s) => local(s.startsAt, tz));

/* ─── defect 1 ───────────────────────────────────────────────────── */

describe("weekly recurrence — visible on the calendar, bookable by nobody", () => {
  /** The defect that started this file. If this test ever goes red, booking is broken. */
  const weeklyTuesday = block({
    endsAt: "2026-09-15T10:00:00Z", // 13:00 EAT
    recurrence: "weekly",
    recurrenceWeekday: 2, // ISO: 1 = Monday
    recurrenceUntil: null,
  });

  it("expands a weekly template into every occurrence in the range", () => {
    const slots = buildSlots({ ...ctx({ blocks: [weeklyTuesday] }), ...THREE_WEEKS });

    // Three Tuesdays (15th, 22nd, 29th) x 16 fifteen-minute slots in 09:00-13:00.
    expect(slots).toHaveLength(48);
    expect(new Set(labels(slots).map((l) => l.slice(0, 3)))).toEqual(new Set(["Tue"]));
    expect(local(slots[0]!.startsAt)).toBe("Tue, 09:00");
    expect(local(slots.at(-1)!.startsAt)).toBe("Tue, 12:45");
  });

  it("converts recurrence_weekday 7 to Sunday, not to Saturday and not to nothing", () => {
    // The one weekday where the DB's ISO 1-7 and JS's 0-6 disagree.
    const sundays = buildSlots({
      ...ctx({
        blocks: [
          block({
            startsAt: "2026-09-13T06:00:00Z", // Sun 09:00 EAT
            endsAt: "2026-09-13T07:00:00Z",
            recurrence: "weekly",
            recurrenceWeekday: 7,
          }),
        ],
      }),
      rangeStart: new Date("2026-09-13T00:00:00Z"),
      rangeEnd: new Date("2026-09-28T00:00:00Z"),
    });
    expect(new Set(labels(sundays))).toEqual(
      new Set(["Sun, 09:00", "Sun, 09:15", "Sun, 09:30", "Sun, 09:45"]),
    );
    expect(sundays).toHaveLength(12); // the 13th, the 20th and the 27th
  });

  it("produces the occurrence that STARTED before the range and runs into it", () => {
    // Tue 22:00 → Wed 02:00 EAT. A Wednesday-only query must still see it —
    // including the single-slot query `checkSlot` runs.
    const overnight = block({
      startsAt: "2026-09-15T19:00:00Z",
      endsAt: "2026-09-15T23:00:00Z",
      recurrence: "weekly",
      recurrenceWeekday: 2,
    });
    const wednesday = {
      rangeStart: new Date("2026-09-15T21:00:00Z"), // Wed 00:00 EAT
      rangeEnd: new Date("2026-09-16T21:00:00Z"),
    };
    const slots = buildSlots({ ...ctx({ blocks: [overnight] }), ...wednesday });

    expect(local(slots[0]!.startsAt)).toBe("Wed, 00:00");
    expect(
      checkSlot({
        ...ctx({ blocks: [overnight] }),
        startsAt: slots[0]!.startsAt,
        endsAt: slots[0]!.endsAt,
      }),
    ).toBeNull();
  });

  it("keeps expanding past the hundredth occurrence instead of truncating in silence", () => {
    const slots = buildSlots({
      ...ctx({ blocks: [weeklyTuesday], departmentPolicy: policy() }),
      rangeStart: new Date("2026-09-14T00:00:00Z"),
      rangeEnd: new Date("2028-09-14T00:00:00Z"),
    });
    // 105 Tuesdays in that range; 16 slots each, all inside 08:00-17:00.
    expect(slots).toHaveLength(105 * 16);
    expect(local(slots.at(-1)!.startsAt)).toBe("Tue, 12:45");
  });

  it("treats recurrence_until as an instant, so it truncates the occurrence it lands inside", () => {
    // Series ends Tue 22 Sep at 10:00 EAT, mid-occurrence.
    const slots = buildSlots({
      ...ctx({ blocks: [{ ...weeklyTuesday, recurrenceUntil: "2026-09-22T07:00:00Z" }] }),
      ...THREE_WEEKS,
    });
    const lastDay = slots.filter((s) => s.startsAt > at("2026-09-21T00:00:00Z"));
    expect(local(lastDay.at(-1)!.startsAt)).toBe("Tue, 09:45"); // 09:45-10:00, and nothing after
    expect(slots).toHaveLength(16 + 4);
  });
});

/* ─── defect 3 ───────────────────────────────────────────────────── */

describe("the grid — a hand-rolled POST must not book off it", () => {
  const base = ctx({ blocks: [block()], departmentPolicy: policy() });

  it("honours the buffer and drops the partial slot at the block's end", () => {
    // 09:00-10:00, 20-minute slots, 10-minute buffer: 09:00 and 09:30 only.
    // 10:00 would end at 10:20, past the block; the last slot carries no
    // trailing buffer, so it may end flush with the block.
    const slots = buildSlots({
      ...base,
      clinicianSettings: settings({ defaultSlotMinutes: 20, bufferMinutes: 10 }),
      ...DAY,
    });
    expect(labels(slots)).toEqual(["Tue, 09:00", "Tue, 09:30"]);
    expect(slots[0]!.endsAt.toISOString()).toBe("2026-09-15T06:20:00.000Z");
  });

  it("rejects an off-grid start, and a slot of the wrong length", () => {
    const check = (startsAt: string, endsAt: string) =>
      checkSlot({ ...base, startsAt: at(startsAt), endsAt: at(endsAt) });

    expect(check(TUE_0900Z, "2026-09-15T06:15:00Z")).toBeNull();
    // 09:07-09:22 — inside the block, which is all the old containment check asked.
    expect(check("2026-09-15T06:07:00Z", "2026-09-15T06:22:00Z")).toMatch(/bookable slots/);
    expect(check(TUE_0900Z, "2026-09-15T06:45:00Z")).toMatch(/15 minutes long/);
  });
});

/* ─── defect 4 ───────────────────────────────────────────────────── */

describe("the department's opening hours", () => {
  const sundayNight = block({
    startsAt: "2026-09-13T18:00:00Z", // Sun 21:00 EAT
    endsAt: "2026-09-13T20:00:00Z",
  });
  const weekend = {
    rangeStart: new Date("2026-09-13T00:00:00Z"),
    rangeEnd: new Date("2026-09-14T00:00:00Z"),
  };

  it("offers nothing on a day or at an hour the department is shut", () => {
    expect(
      buildSlots({ ...ctx({ blocks: [sundayNight], departmentPolicy: policy() }), ...weekend }),
    ).toEqual([]);
    expect(
      checkSlot({
        ...ctx({ blocks: [sundayNight], departmentPolicy: policy() }),
        startsAt: at("2026-09-13T18:00:00Z"),
        endsAt: at("2026-09-13T18:15:00Z"),
      }),
    ).toMatch(/bookable slots/);
  });

  it("reads Sunday as Sunday under either weekday convention", () => {
    for (const sunday of [0, 7]) {
      const slots = buildSlots({
        ...ctx({
          blocks: [sundayNight],
          departmentPolicy: policy({
            bookableWeekdays: [sunday],
            bookableStartMinutesLocal: 0,
            bookableEndMinutesLocal: 1440,
          }),
        }),
        ...weekend,
      });
      expect(slots).toHaveLength(8);
    }
  });

  it("reads an empty weekday list as closed every day, never as open every day", () => {
    expect(
      buildSlots({
        ...ctx({
          blocks: [sundayNight],
          departmentPolicy: policy({
            bookableWeekdays: [],
            bookableStartMinutesLocal: 0,
            bookableEndMinutesLocal: 1440,
          }),
        }),
        ...weekend,
      }),
    ).toEqual([]);
  });

  it("requires the WHOLE slot inside the window", () => {
    // 16:30-17:30 EAT against a 17:00 close: 16:30 and 16:45 fit, 17:00 doesn't.
    const slots = buildSlots({
      ...ctx({
        blocks: [block({ startsAt: "2026-09-15T13:30:00Z", endsAt: "2026-09-15T14:30:00Z" })],
        departmentPolicy: policy(),
      }),
      ...DAY,
    });
    expect(labels(slots)).toEqual(["Tue, 16:30", "Tue, 16:45"]);
  });

  it("no policy row means no restriction, not closed", () => {
    expect(buildSlots({ ...ctx({ blocks: [sundayNight] }), ...weekend })).toHaveLength(8);
  });

  it("resolves the window in the zone it was given, not the server's", () => {
    // 15:00Z: 18:00 in Kampala (shut) and 16:00 in London (open until 17:00).
    // Same block, same policy, two answers — and neither is the host clock's.
    const evening = block({ startsAt: "2026-09-15T15:00:00Z", endsAt: "2026-09-15T16:00:00Z" });
    const inZone = (timeZone: string) =>
      buildSlots({ ...ctx({ blocks: [evening], departmentPolicy: policy(), timeZone }), ...DAY });

    expect(inZone(KAMPALA)).toEqual([]);
    expect(labels(inZone("Europe/London"), "Europe/London")).toEqual([
      "Tue, 16:00",
      "Tue, 16:15",
      "Tue, 16:30",
      "Tue, 16:45",
    ]);
  });

  it("places a spring-forward occurrence after the gap, never an hour before it", () => {
    // Sunday 02:30-04:30 in New York; on 2026-03-08 the clock jumps 02:00→03:00,
    // so 02:30 does not exist. Shifting forward is what a calendar does;
    // shifting back would open a clinic an hour before it was declared.
    const slots = buildSlots({
      ...ctx({
        blocks: [
          block({
            startsAt: "2026-03-01T07:30:00Z", // Sun 02:30 EST
            endsAt: "2026-03-01T09:30:00Z",
            recurrence: "weekly",
            recurrenceWeekday: 7,
          }),
        ],
        timeZone: "America/New_York",
        now: new Date("2026-01-01T00:00:00Z"),
      }),
      rangeStart: new Date("2026-03-08T00:00:00Z"),
      rangeEnd: new Date("2026-03-09T00:00:00Z"),
    });
    expect(local(slots[0]!.startsAt, "America/New_York")).toBe("Sun, 03:30");
  });
});

/* ─── what is already taken, and what has already gone ───────────── */

describe("subtraction and the past", () => {
  it("drops slots a live appointment overlaps and keeps the ones a dead one does", () => {
    const slots = buildSlots({
      ...ctx({
        blocks: [block()],
        appointments: [
          { startsAt: "2026-09-15T06:10:00Z", endsAt: "2026-09-15T06:20:00Z", status: "confirmed" },
          { startsAt: "2026-09-15T06:30:00Z", endsAt: "2026-09-15T06:45:00Z", status: "cancelled" },
        ],
      }),
      ...DAY,
    });
    // 09:00 and 09:15 both overlap the confirmed 09:10-09:20; the cancelled one frees 09:30.
    expect(labels(slots)).toEqual(["Tue, 09:30", "Tue, 09:45"]);
  });

  it("never offers a slot that has already begun", () => {
    const now = new Date("2026-09-15T06:15:00Z"); // exactly 09:15 EAT
    expect(labels(buildSlots({ ...ctx({ blocks: [block()], now }), ...DAY }))).toEqual([
      "Tue, 09:30",
      "Tue, 09:45",
    ]);
    expect(
      checkSlot({
        ...ctx({ blocks: [block()], now }),
        startsAt: at("2026-09-15T06:15:00Z"),
        endsAt: at("2026-09-15T06:30:00Z"),
      }),
    ).toMatch(/already passed/);
  });

  it("only bookable, active blocks produce slots", () => {
    for (const dead of [block({ kind: "leave" }), block({ state: "cancelled" })]) {
      expect(buildSlots({ ...ctx({ blocks: [dead] }), ...DAY })).toEqual([]);
    }
  });
});

/* ─── two blocks, one clinician ──────────────────────────────────── */

describe("overlapping blocks", () => {
  // `appointments_no_double_booking` keys on `starts_at`, so it catches two
  // bookings at 09:00 and nothing about 09:00 and 09:05. Overlapping offers
  // are therefore a double-booking with no race in it.
  const overlapping = [
    block(),
    block({ startsAt: "2026-09-15T06:05:00Z", endsAt: "2026-09-15T07:05:00Z" }),
  ];

  it("never offers two slots that overlap each other", () => {
    const slots = buildSlots({ ...ctx({ blocks: overlapping }), ...DAY });
    expect(labels(slots)).toEqual(["Tue, 09:00", "Tue, 09:15", "Tue, 09:30", "Tue, 09:45"]);
    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i]!.startsAt.getTime()).toBeGreaterThanOrEqual(slots[i - 1]!.endsAt.getTime());
    }
  });

  it("refuses the slot the later block would have offered", () => {
    expect(
      checkSlot({
        ...ctx({ blocks: overlapping }),
        startsAt: at("2026-09-15T06:05:00Z"),
        endsAt: at("2026-09-15T06:20:00Z"),
      }),
    ).toMatch(/bookable slots/);
  });
});

/* ─── settings ───────────────────────────────────────────────────── */

describe("settings precedence (ADR 0029 §2)", () => {
  it("lets the clinician's row override the department's, field for field", () => {
    // Including the fields the clinician never consciously set: a real row
    // carries a concrete value in every column, so `allowVirtual: false`
    // beats the department's `true` the same way the slot length does.
    expect(
      resolveSchedulingSettings(
        settings({ defaultSlotMinutes: 45, autoConfirm: true }),
        policy({ defaultSlotMinutes: 30, defaultBufferMinutes: 5, allowVirtual: true }),
      ),
    ).toEqual({ slotMinutes: 45, bufferMinutes: 0, autoConfirm: true, allowVirtual: false });
  });

  it("falls through to the department field by field when the clinician has no row", () => {
    // Per field, not per row — but only a MISSING row can trigger it, because
    // every column in both tables is NOT NULL. A clinician who toggles
    // auto_confirm writes a concrete slot length beside it and stops
    // inheriting; that is the schema's doing, and this is the shape a real
    // SELECT returns.
    expect(
      resolveSchedulingSettings(
        null,
        policy({ defaultSlotMinutes: 30, defaultBufferMinutes: 5, defaultAutoConfirm: true }),
      ),
    ).toEqual({ slotMinutes: 30, bufferMinutes: 5, autoConfirm: true, allowVirtual: false });
  });

  it("lands on the hard defaults when neither row exists", () => {
    expect(resolveSchedulingSettings(null, null)).toEqual({
      slotMinutes: 15,
      bufferMinutes: 0,
      autoConfirm: false,
      allowVirtual: false,
    });
  });

  it("puts the clinician's slot length on the grid both paths use", () => {
    const half = ctx({
      blocks: [block({ endsAt: "2026-09-15T10:00:00Z" })],
      clinicianSettings: settings({ defaultSlotMinutes: 30 }),
      departmentPolicy: policy({ defaultSlotMinutes: 15 }),
    });
    expect(labels(buildSlots({ ...half, ...DAY })).slice(0, 3)).toEqual([
      "Tue, 09:00",
      "Tue, 09:30",
      "Tue, 10:00",
    ]);
    expect(
      checkSlot({ ...half, startsAt: at(TUE_0900Z), endsAt: at("2026-09-15T06:15:00Z") }),
    ).toMatch(/30 minutes long/);
  });
});

/* ─── rows the caller got wrong ──────────────────────────────────── */

describe("rows in the wrong shape", () => {
  // supabase-js returns snake_case and `serviceClient()` is un-generic, so
  // those rows are `any` and typecheck. Silently skipping them means an Edge
  // Function that offers nothing — or one whose `taken` list is empty and
  // which books straight over an existing appointment.
  it("throws, naming the column, rather than deriving nothing from it", () => {
    const snake = { kind: "bookable", state: "active", starts_at: TUE_0900Z, recurrence: "none" };
    expect(() =>
      buildSlots({ ...ctx({ blocks: [snake as unknown as AvailabilityBlockRow] }), ...DAY }),
    ).toThrow(/availability_blocks.startsAt/);

    expect(() =>
      buildSlots({
        ...ctx({
          blocks: [block()],
          appointments: [
            { starts_at: TUE_0900Z } as unknown as SlotContext["appointments"][number],
          ],
        }),
        ...DAY,
      }),
    ).toThrow(/appointments.startsAt/);
  });
});

/* ─── the property that keeps the two paths one path ─────────────── */

describe("the read path and the write path agree", () => {
  const cases: Array<{ name: string; slotMinutes: number; context: SlotContext }> = [
    {
      name: "weekly block, no policy",
      slotMinutes: 15,
      context: ctx({
        blocks: [
          block({
            endsAt: "2026-09-15T10:00:00Z",
            recurrence: "weekly",
            recurrenceWeekday: 2,
          }),
        ],
      }),
    },
    {
      name: "weekly block inside a Mon-Fri window, buffered",
      slotMinutes: 20,
      context: ctx({
        blocks: [
          block({
            startsAt: "2026-09-15T05:30:00Z", // 08:30 EAT
            endsAt: "2026-09-15T14:30:00Z", // 17:30 EAT — runs past closing
            recurrence: "weekly",
            recurrenceWeekday: 2,
          }),
        ],
        clinicianSettings: settings({ defaultSlotMinutes: 20, bufferMinutes: 10 }),
        departmentPolicy: policy(),
      }),
    },
    {
      name: "two overlapping one-off blocks, one taken slot",
      slotMinutes: 15,
      context: ctx({
        blocks: [
          block(),
          block({ startsAt: "2026-09-15T06:05:00Z", endsAt: "2026-09-15T07:05:00Z" }),
        ],
        appointments: [
          { startsAt: "2026-09-15T06:30:00Z", endsAt: "2026-09-15T06:45:00Z", status: "requested" },
        ],
      }),
    },
    {
      name: "block crossing local midnight, department shut for part of it",
      slotMinutes: 15,
      context: ctx({
        blocks: [block({ startsAt: "2026-09-15T19:00:00Z", endsAt: "2026-09-15T23:00:00Z" })],
        departmentPolicy: policy({ bookableStartMinutesLocal: 0, bookableEndMinutesLocal: 1440 }),
      }),
    },
    {
      name: "half-hour slots in Kathmandu (+05:45)",
      slotMinutes: 30,
      context: ctx({
        blocks: [block({ endsAt: "2026-09-15T10:00:00Z" })],
        clinicianSettings: settings({ defaultSlotMinutes: 30 }),
        departmentPolicy: policy(),
        timeZone: "Asia/Kathmandu",
      }),
    },
  ];

  for (const { name, slotMinutes, context } of cases) {
    it(`${name}: offers only what it accepts, and accepts only what it offers`, () => {
      const range = {
        rangeStart: new Date("2026-09-15T00:00:00Z"),
        rangeEnd: new Date("2026-09-17T00:00:00Z"),
      };
      const slots = buildSlots({ ...context, ...range });
      expect(slots.length).toBeGreaterThan(0);

      for (const slot of slots) {
        expect(checkSlot({ ...context, startsAt: slot.startsAt, endsAt: slot.endsAt })).toBeNull();
      }

      // The other direction, which is the one that lets a hand-rolled POST
      // through: walk the range on a 5-minute stride and require every
      // candidate that was NOT offered to be refused.
      const offered = new Set(slots.map((s) => s.startsAt.getTime()));
      for (let t = range.rangeStart.getTime(); t < range.rangeEnd.getTime(); t += 5 * 60_000) {
        if (offered.has(t)) continue;
        expect(
          checkSlot({
            ...context,
            startsAt: new Date(t),
            endsAt: new Date(t + slotMinutes * 60_000),
          }),
        ).not.toBeNull();
      }
    });
  }
});

/**
 * The walk-in door reads the SAME policy columns as the booking door, but
 * from two callers outside slot derivation: app/patient/queue/page.tsx shows
 * which departments are open now, and pt-declare-intake 409s the ones that
 * are not. Both used to ask the SERVER what day and time it was — `getDay()`
 * and `getHours()` — which on a UTC host is neither Kampala's weekday nor
 * Kampala's clock.
 *
 * Two failures, both of which close a door on a patient standing at it:
 *   - 00:00-03:00 EAT is the PREVIOUS day in UTC, so Monday's first three
 *     hours read as Sunday and a Mon-Fri department refuses walk-ins.
 *   - every local time reads three hours early, so an 08:00-17:00 department
 *     opens at 11:00 EAT and closes at 20:00.
 */
describe("localWeekdayAndMinutes — the walk-in door's clock", () => {
  it("answers in the hospital's zone, not the host's", () => {
    // 21:30Z Sunday 2026-09-13 is already 00:30 MONDAY in Kampala.
    const justAfterLocalMidnight = new Date("2026-09-13T21:30:00Z");
    expect(localWeekdayAndMinutes(justAfterLocalMidnight, KAMPALA)).toEqual({
      isoWeekday: 1, // Monday — the host clock still says Sunday.
      minutesOfDay: 30, // 00:30 — the host clock says 21:30.
    });
  });

  it("is ISO, so Sunday is 7 and matches what the policy editor stores", () => {
    // 2026-09-13 is a Sunday; 12:00 EAT = 09:00Z.
    expect(localWeekdayAndMinutes(new Date("2026-09-13T09:00:00Z"), KAMPALA)).toEqual({
      isoWeekday: 7,
      minutesOfDay: 720,
    });
    // A department that ticked Sunday stores 7 (migration 0052's CHECK makes
    // 0 unstorable), so a JS `getDay()` reader would miss it entirely.
    expect(policy({ bookableWeekdays: [7] }).bookableWeekdays).toContain(7);
  });

  it("puts an 08:00 EAT walk-in inside an 08:00-17:00 window", () => {
    // 05:00Z = 08:00 EAT, exactly opening time. Read off the host clock this
    // is 300 minutes and the department reads as shut for another 3 hours.
    const { minutesOfDay } = localWeekdayAndMinutes(new Date("2026-09-15T05:00:00Z"), KAMPALA);
    const p = policy();
    expect(minutesOfDay).toBe(480);
    expect(minutesOfDay).toBeGreaterThanOrEqual(p.bookableStartMinutesLocal);
    expect(minutesOfDay).toBeLessThan(p.bookableEndMinutesLocal);
  });
});

describe("localDateKey / localSession — the day chip and the day-part (ADR 0084 §10)", () => {
  it("keys the day and names the session in the hospital's zone, not the host's", () => {
    // 21:30Z Sunday is 00:30 Monday in Kampala: a different date AND a
    // different day-part from what the host clock would say.
    const at = new Date("2026-09-13T21:30:00Z");
    expect(localDateKey(at, KAMPALA)).toBe("2026-09-14");
    expect(localSession(at, KAMPALA)).toBe("morning");
  });

  it("splits at local noon — 12:00 EAT is the first afternoon minute", () => {
    expect(localSession(new Date("2026-09-15T08:59:00Z"), KAMPALA)).toBe("morning"); // 11:59 EAT
    expect(localSession(new Date("2026-09-15T09:00:00Z"), KAMPALA)).toBe("afternoon"); // 12:00 EAT
  });
});

/**
 * Declared leave must subtract from bookable time.
 *
 * This shipped as a documented shortcut — `leave` did not subtract, justified
 * on the grounds that manual confirm put a human in front of any collision.
 * `auto_confirm` is a knob the department-policy editor exposes, so that
 * justification does not hold: with it on, a patient books directly into a
 * clinician's annual leave and nobody sees it until the day. Found by running
 * the engine against real data, not by reading it.
 */
describe("leave and unavailable subtract from bookable time", () => {
  const now = new Date("2026-09-14T05:00:00Z");
  const ctx = {
    appointments: [],
    clinicianSettings: {
      defaultSlotMinutes: 60,
      bufferMinutes: 0,
      autoConfirm: true,
      allowVirtual: false,
    },
    departmentPolicy: null,
    timeZone: "Africa/Kampala",
    now,
    rangeStart: now,
    rangeEnd: new Date("2026-09-15T00:00:00Z"),
  };
  const bookable = {
    kind: "bookable",
    state: "active",
    recurrence: "none",
    startsAt: "2026-09-14T06:00:00Z",
    endsAt: "2026-09-14T12:00:00Z",
  };
  const hhmm = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: false,
    }).format(d);

  it("a leave block removes exactly the slots it covers", () => {
    const leave = {
      kind: "leave",
      state: "active",
      recurrence: "none",
      startsAt: "2026-09-14T08:00:00Z",
      endsAt: "2026-09-14T10:00:00Z",
    };
    const offered = buildSlots({ ...ctx, blocks: [bookable, leave] }).map((s) => hhmm(s.startsAt));
    expect(offered).toEqual(["06:00", "07:00", "10:00", "11:00"]);
  });

  it("an unavailable block does the same", () => {
    const unavailable = {
      kind: "unavailable",
      state: "active",
      recurrence: "none",
      startsAt: "2026-09-14T06:00:00Z",
      endsAt: "2026-09-14T07:00:00Z",
    };
    const offered = buildSlots({ ...ctx, blocks: [bookable, unavailable] }).map((s) =>
      hhmm(s.startsAt),
    );
    expect(offered).not.toContain("06:00");
  });

  it("a CANCELLED leave block does not subtract — it was withdrawn", () => {
    const cancelled = {
      kind: "leave",
      state: "cancelled",
      recurrence: "none",
      startsAt: "2026-09-14T08:00:00Z",
      endsAt: "2026-09-14T10:00:00Z",
    };
    const offered = buildSlots({ ...ctx, blocks: [bookable, cancelled] });
    expect(offered).toHaveLength(6);
  });

  it("teaching and ward rounds do NOT subtract — only an explicit absence does", () => {
    const teaching = {
      kind: "teaching",
      state: "active",
      recurrence: "none",
      startsAt: "2026-09-14T08:00:00Z",
      endsAt: "2026-09-14T10:00:00Z",
    };
    const offered = buildSlots({ ...ctx, blocks: [bookable, teaching] });
    expect(offered).toHaveLength(6);
  });

  it("a custom block (ADR 0095) neither produces slots nor subtracts — inert", () => {
    const custom = {
      kind: "custom",
      state: "active",
      recurrence: "none",
      startsAt: "2026-09-14T08:00:00Z",
      endsAt: "2026-09-14T10:00:00Z",
    };
    expect(buildSlots({ ...ctx, blocks: [custom] })).toHaveLength(0);
    expect(buildSlots({ ...ctx, blocks: [bookable, custom] })).toHaveLength(6);
  });

  it("the write path agrees: checkSlot refuses a slot inside leave", () => {
    const leave = {
      kind: "leave",
      state: "active",
      recurrence: "none",
      startsAt: "2026-09-14T08:00:00Z",
      endsAt: "2026-09-14T10:00:00Z",
    };
    const reason = checkSlot({
      ...ctx,
      blocks: [bookable, leave],
      startsAt: new Date("2026-09-14T08:00:00Z"),
      endsAt: new Date("2026-09-14T09:00:00Z"),
    });
    expect(reason).not.toBeNull();
  });

  it("a WEEKLY leave cancels the weekly bookable block it overlaps", () => {
    const weeklyBookable = {
      kind: "bookable",
      state: "active",
      recurrence: "weekly",
      recurrenceWeekday: 1,
      startsAt: "2026-09-07T06:00:00Z",
      endsAt: "2026-09-07T12:00:00Z",
      recurrenceUntil: null,
    };
    const weeklyLeave = {
      kind: "leave",
      state: "active",
      recurrence: "weekly",
      recurrenceWeekday: 1,
      startsAt: "2026-09-07T06:00:00Z",
      endsAt: "2026-09-07T12:00:00Z",
      recurrenceUntil: null,
    };
    const offered = buildSlots({
      ...ctx,
      blocks: [weeklyBookable, weeklyLeave],
      rangeEnd: new Date("2026-09-30T00:00:00Z"),
    });
    expect(offered).toHaveLength(0);
  });
});

describe("startOfLocalDay / endOfLocalDay — the day boundary in the hospital's zone", () => {
  it("at 00:30 EAT the day began at 21:00Z the evening before, not at 00:00Z", () => {
    // 21:30Z on the 15th is 00:30 EAT on the 16th. setUTCHours(0) says the
    // 15th; the hospital says the 16th, which began at 21:00Z.
    const at = new Date("2026-09-15T21:30:00Z");
    expect(startOfLocalDay(at, KAMPALA).toISOString()).toBe("2026-09-15T21:00:00.000Z");
    expect(endOfLocalDay(at, KAMPALA).toISOString()).toBe("2026-09-16T21:00:00.000Z");
  });

  it("accepts an ISO string and answers in the given zone, not the host's", () => {
    expect(startOfLocalDay("2026-09-15T06:00:00Z", KAMPALA).toISOString()).toBe(
      "2026-09-14T21:00:00.000Z",
    );
    expect(startOfLocalDay("2026-09-15T06:00:00Z", "UTC").toISOString()).toBe(
      "2026-09-15T00:00:00.000Z",
    );
  });

  it("is DST-safe: the day of a spring-forward is 23 hours long", () => {
    // Europe/London, 2026-03-29: 01:00Z the clocks go to 02:00 BST.
    const start = startOfLocalDay("2026-03-29T12:00:00Z", "Europe/London");
    const end = endOfLocalDay("2026-03-29T12:00:00Z", "Europe/London");
    expect(start.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-03-29T23:00:00.000Z");
  });
});

describe("expandSessionTemplate — a weekly rule into dated sessions", () => {
  /** Tuesday 08:00 EAT for four hours, from 2026-09-15 (a Tuesday). */
  const tuesday = {
    weekday: 2,
    startMinutesLocal: 480,
    durationMinutes: 240,
    validFrom: "2026-09-15",
    validUntil: null,
  };

  it("produces every Tuesday in the range at 08:00 EAT (05:00Z), ascending", () => {
    const out = expandSessionTemplate(
      tuesday,
      "2026-09-14T00:00:00Z",
      "2026-09-30T00:00:00Z",
      KAMPALA,
    );
    expect(out.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-09-15T05:00:00.000Z",
      "2026-09-22T05:00:00.000Z",
      "2026-09-29T05:00:00.000Z",
    ]);
    expect(out[0]?.endsAt.toISOString()).toBe("2026-09-15T09:00:00.000Z");
  });

  it("honours valid_from: a range that starts before it yields nothing before it", () => {
    const out = expandSessionTemplate(
      { ...tuesday, validFrom: "2026-09-22" },
      "2026-09-01T00:00:00Z",
      "2026-09-30T00:00:00Z",
      KAMPALA,
    );
    expect(out.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-09-22T05:00:00.000Z",
      "2026-09-29T05:00:00.000Z",
    ]);
  });

  it("honours valid_until inclusively: the Tuesday it names is still produced", () => {
    const out = expandSessionTemplate(
      { ...tuesday, validUntil: "2026-09-22" },
      "2026-09-01T00:00:00Z",
      "2026-10-31T00:00:00Z",
      KAMPALA,
    );
    expect(out.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-09-15T05:00:00.000Z",
      "2026-09-22T05:00:00.000Z",
    ]);
  });

  it("treats weekday 7 as Sunday", () => {
    const out = expandSessionTemplate(
      { ...tuesday, weekday: 7, validFrom: "2026-09-13" },
      "2026-09-13T00:00:00Z",
      "2026-09-21T00:00:00Z",
      KAMPALA,
    );
    // 2026-09-13 and 2026-09-20 are Sundays.
    expect(out.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-09-13T05:00:00.000Z",
      "2026-09-20T05:00:00.000Z",
    ]);
  });

  it("is half-open on the range: a session starting exactly at rangeEnd is excluded", () => {
    const out = expandSessionTemplate(
      tuesday,
      "2026-09-14T00:00:00Z",
      "2026-09-22T05:00:00Z",
      KAMPALA,
    );
    expect(out.map((s) => s.startsAt.toISOString())).toEqual(["2026-09-15T05:00:00.000Z"]);
  });

  it("keeps a session that started before the range and runs into it", () => {
    const out = expandSessionTemplate(
      tuesday,
      "2026-09-15T07:00:00Z", // 10:00 EAT, mid-session
      "2026-09-16T00:00:00Z",
      KAMPALA,
    );
    expect(out.map((s) => s.startsAt.toISOString())).toEqual(["2026-09-15T05:00:00.000Z"]);
  });

  it("refuses a date that is not YYYY-MM-DD rather than guessing", () => {
    expect(() =>
      expandSessionTemplate(
        { ...tuesday, validFrom: "15/09/2026" },
        "2026-09-14T00:00:00Z",
        "2026-09-30T00:00:00Z",
        KAMPALA,
      ),
    ).toThrow(/validFrom/);
  });
});
