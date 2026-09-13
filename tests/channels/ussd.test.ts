import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DayOption, UssdData, UssdState } from "@/lib/channels/ussd";
import { describe, expect, it } from "vitest";

import { t } from "@/lib/channels/strings";
import {
  applyInput,
  DAYS_PER_SCREEN,
  INITIAL_STATE,
  lastSegment,
  level,
  MAX_LEVELS,
  PAGE_SIZE,
  parseNameAge,
  render,
  SCREEN_MAX,
} from "@/lib/channels/ussd";

/**
 * The USSD menu (Gate F, ADR 0091) — pure, so every screen is a call. The
 * budget (≤ 160 ASCII, ≤ 6 levels), paging, invalid input, resume, the
 * three other roots, and "every word from strings.ts".
 */

const H = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `h${i}`, name: `Hospital ${i + 1}` }));
const L = [
  { id: "l1", name: "Diabetes Clinic", capacityMode: "session" as const },
  { id: "l2", name: "General Medicine", capacityMode: "slot" as const },
];
const DAYS: DayOption[] = [
  { label: "Tue 22 Sep", sessionId: "s1" },
  { label: "Thu 24 Sep", sessionId: "s2" },
  { label: "Tue 29 Sep", sessionId: "s3" },
  { label: "Thu 1 Oct", sessionId: "s4" },
];
const SLOTS: DayOption[] = [
  {
    label: "Mon 21 Sep 9:30 AM",
    slot: {
      clinician_user_id: "c1",
      department_id: "d1",
      starts_at: "2026-09-21T06:30:00Z",
      ends_at: "2026-09-21T07:00:00Z",
    },
  },
];

const NAMES = {
  hospitalName: "Mulago National Referral Hospital",
  lineName: "Diabetes Clinic",
  dayLabel: "Tue 22 Sep",
};

/** Walk the booking path with the given data; returns every screen and the final state/effect. */
function walk(inputs: string[], data: (s: UssdState) => UssdData) {
  let state = INITIAL_STATE;
  const screens: string[] = [render(state, data(state))];
  let effect = null;
  for (const input of inputs) {
    const r = applyInput(state, input, data(state));
    state = r.state;
    effect = r.effect ?? effect;
    screens.push(render(state, data(state), r.invalid));
  }
  return { state, screens, effect };
}

const bookingData = (s: UssdState): UssdData => {
  switch (s.step) {
    case "hospital":
      return { hospitals: H(2) };
    case "line":
      return { lines: L };
    case "day":
      return { days: s.selections.lineId === "l2" ? SLOTS : DAYS };
    case "name":
      return { known: null };
    case "confirm":
      return NAMES;
    case "done":
      return {
        booked: {
          ok: true,
          code: "K7M2XQ",
          position: 12,
          window: "9:30 AM and 11:00 AM",
          day: "Tue 22 Sep",
          time: null,
        },
      };
    default:
      return {};
  }
};

describe("the booking path — six levels, every screen inside the budget", () => {
  it("root → language → hospital → clinic → day → name+age → confirm → END, with the effect", () => {
    const { state, screens, effect } = walk(
      ["1", "1", "1", "1", "1", "Amina 34", "1"],
      bookingData,
    );
    expect(screens[0]).toMatch(
      /^CON MedSync\n1 Book a visit\n2 My next visit\n3 Cancel my visit\n4 Confirm I'm coming\nIf very sick go to emergency now\.$/,
    );
    expect(screens[1]).toContain("Choose a language");
    expect(screens[2]).toContain("Choose a hospital");
    expect(screens[3]).toContain("Choose a clinic");
    expect(screens[4]).toContain("Choose a day");
    expect(screens[5]).toContain("Your name and age");
    expect(screens[6]).toBe(
      "CON Book Diabetes Clinic at Mulago National Referral Hospital, Tue 22 Sep? 1 Yes 2 No",
    );
    expect(screens[7]).toBe(
      "END Booked. Position 12, arrive 9:30 AM and 11:00 AM. Code K7M2XQ. The desk will ask for it.",
    );
    expect(state.step).toBe("done");
    expect(effect).toEqual({
      kind: "book",
      hospitalId: "h0",
      lineId: "l1",
      sessionId: "s1",
      name: "Amina",
      age: 34,
    });
  });

  it("every screen on the path is ≤ 160 ASCII characters and starts with CON or END", () => {
    const { screens } = walk(["1", "1", "1", "1", "1", "Amina 34", "1"], bookingData);
    for (const s of screens) {
      expect(s.length, s).toBeLessThanOrEqual(SCREEN_MAX);
      expect(s, s).toMatch(/^[\x20-\x7E\n]+$/);
      expect(s).toMatch(/^(CON|END) /);
    }
  });

  it("the confirm step is level 6 and nothing deeper exists", () => {
    const { state } = walk(["1", "1", "1", "1", "1", "Amina 34"], bookingData);
    expect(state.step).toBe("confirm");
    expect(level(state.step)).toBe(MAX_LEVELS);
    for (const step of [
      "root",
      "language",
      "hospital",
      "line",
      "day",
      "name",
      "confirm",
      "cancel_code",
      "confirm_code",
      "done",
    ] as const) {
      expect(level(step)).toBeLessThanOrEqual(MAX_LEVELS);
    }
  });

  it("a slot-mode clinic lists day and time on ONE screen (still six levels) and books a slot", () => {
    const { screens, effect } = walk(["1", "1", "1", "2", "1", "Okello 51", "1"], bookingData);
    expect(screens[4]).toContain("1 Mon 21 Sep 9:30 AM");
    expect(effect).toMatchObject({
      kind: "book",
      lineId: "l2",
      slot: SLOTS[0]?.slot,
      name: "Okello",
      age: 51,
    });
  });

  it("2 No on the confirm screen books nothing", () => {
    const { screens, effect } = walk(["1", "1", "1", "1", "1", "Amina 34", "2"], bookingData);
    expect(effect).toBeNull();
    expect(screens.at(-1)).toBe(`END ${t("en", "cancelled_by_user")}`);
  });

  it("a failed booking says the server's sentence", () => {
    const data = (s: UssdState): UssdData =>
      s.step === "done"
        ? { booked: { ok: false, reason: "This clinic day is full." } }
        : bookingData(s);
    const { screens } = walk(["1", "1", "1", "1", "1", "Amina 34", "1"], data);
    expect(screens.at(-1)).toBe("END Could not book: This clinic day is full.");
  });
});

describe("paging, invalid input, long names", () => {
  it("shows 5 hospitals per screen with '0 More', pages forward and wraps", () => {
    const data = (s: UssdState): UssdData => (s.step === "hospital" ? { hospitals: H(12) } : {});
    let { state } = walk(["1", "1"], data);
    let screen = render(state, data(state));
    expect(screen).toContain("1 Hospital 1");
    expect(screen).toContain("5 Hospital 5");
    expect(screen).not.toContain("Hospital 6");
    expect(screen).toContain("0 More");
    state = applyInput(state, "0", data(state)).state;
    screen = render(state, data(state));
    expect(screen).toContain("1 Hospital 6");
    state = applyInput(state, "0", data(state)).state;
    expect(render(state, data(state))).toContain("1 Hospital 11");
    state = applyInput(state, "0", data(state)).state;
    expect(render(state, data(state))).toContain("1 Hospital 1"); // wrapped
    // Picking 3 on page 2 is hospital 8.
    state = applyInput(state, "0", data(state)).state;
    const picked = applyInput(state, "3", data(state)).state;
    expect(picked.selections.hospitalId).toBe("h7");
    expect(PAGE_SIZE).toBe(5);
    expect(DAYS_PER_SCREEN).toBe(3);
  });

  it("an invalid choice keeps the screen and says so once", () => {
    const data = (s: UssdState): UssdData => (s.step === "hospital" ? { hospitals: H(2) } : {});
    const { state } = walk(["1", "1"], data);
    const r = applyInput(state, "9", data(state));
    expect(r.invalid).toBe(true);
    expect(r.state.step).toBe("hospital");
    const screen = render(r.state, data(r.state), true);
    expect(screen.startsWith("CON Not a valid choice.\nChoose a hospital")).toBe(true);
    expect(screen.length).toBeLessThanOrEqual(SCREEN_MAX);
  });

  it("cuts long hospital names to keep the screen inside 160, never the heading or the paging line", () => {
    const long = Array.from({ length: 6 }, (_, i) => ({
      id: `h${i}`,
      name: `Saint Francis Hospital Nsambya Outpatient Department Annex Building ${i + 1}`,
    }));
    const data = (s: UssdState): UssdData => (s.step === "hospital" ? { hospitals: long } : {});
    const { state } = walk(["1", "1"], data);
    const screen = render(state, data(state));
    expect(screen.length).toBeLessThanOrEqual(SCREEN_MAX);
    expect(screen).toContain("Choose a hospital");
    expect(screen.endsWith("0 More")).toBe(true);
    expect(screen.split("\n")).toHaveLength(7);
  });

  it("no hospitals / no lines / no days each END with their sentence", () => {
    const none = (s: UssdState): UssdData =>
      s.step === "hospital"
        ? { hospitals: [] }
        : s.step === "line"
          ? { lines: [] }
          : s.step === "day"
            ? { days: [] }
            : {};
    expect(walk(["1", "1"], none).screens.at(-1)).toBe(`END ${t("en", "no_hospitals")}`);
    const someH = (s: UssdState): UssdData =>
      s.step === "hospital" ? { hospitals: H(1) } : none(s);
    expect(walk(["1", "1", "1"], someH).screens.at(-1)).toBe(`END ${t("en", "no_lines")}`);
    const someL = (s: UssdState): UssdData => (s.step === "line" ? { lines: L } : someH(s));
    expect(walk(["1", "1", "1", "1"], someL).screens.at(-1)).toBe(`END ${t("en", "no_days")}`);
  });
});

describe("name and age on one screen", () => {
  it("parses 'Amina 34', 'Okello Peter 51'; refuses no age, silly ages, one-letter names", () => {
    expect(parseNameAge("Amina 34")).toEqual({ name: "Amina", age: 34 });
    expect(parseNameAge("  Okello   Peter 51 ")).toEqual({ name: "Okello Peter", age: 51 });
    expect(parseNameAge("Amina")).toBeNull();
    expect(parseNameAge("Amina 200")).toBeNull();
    expect(parseNameAge("A 30")).toBeNull();
    expect(parseNameAge("34")).toBeNull();
  });

  it("a bad answer asks again with the example, on the same screen", () => {
    const { state, screens } = walk(["1", "1", "1", "1", "1", "Amina"], bookingData);
    expect(state.step).toBe("name");
    expect(screens.at(-1)).toBe(`CON ${t("en", "name_age_invalid")}`);
  });

  it("a recognised phone is OFFERED 'Booking as {name}' — 1 takes it with the date of birth, 2 asks to type", () => {
    const known = (s: UssdState): UssdData =>
      s.step === "name"
        ? { known: { firstName: "Amina", dateOfBirth: "1992-03-04" } }
        : bookingData(s);
    const offered = walk(["1", "1", "1", "1", "1"], known);
    expect(offered.screens.at(-1)).toBe("CON Booking as Amina. 1 Yes 2 Another name");
    const yes = walk(["1", "1", "1", "1", "1", "1", "1"], known);
    expect(yes.effect).toMatchObject({ kind: "book", name: "Amina", dateOfBirth: "1992-03-04" });
    expect(yes.effect).not.toHaveProperty("age");
    const another = walk(["1", "1", "1", "1", "1", "2"], known);
    expect(another.state.step).toBe("name");
    expect(another.screens.at(-1)).toBe(`CON ${t("en", "ask_name_age")}`);
    // After "2", a typed "1" is not the offer any more.
    const typed = applyInput(another.state, "1", known(another.state));
    expect(typed.invalid).toBe(true);
  });
});

describe("the other roots", () => {
  it("2 My next visit ENDs with the visit and the emergency line, or the no-visit sentence", () => {
    const data = (s: UssdState): UssdData =>
      s.step === "done"
        ? {
            nextVisit: {
              dayLabel: "Tue 22 Sep",
              timeLabel: "",
              hospitalName: "Mulago",
              code: "K7M2XQ",
            },
          }
        : {};
    const { screens } = walk(["2"], data);
    expect(screens.at(-1)).toBe(
      "END Your next visit: Tue 22 Sep at Mulago. Code K7M2XQ.\nIf very sick go to emergency now.",
    );
    const none = walk(["2"], (s) => (s.step === "done" ? { nextVisit: null } : {}));
    expect(none.screens.at(-1)).toBe(`END ${t("en", "next_none")}`);
  });

  it("3 Cancel: asks for the code, refuses a malformed one, then emits the cancel effect", () => {
    const { state, screens } = walk(["3"], () => ({}));
    expect(state.step).toBe("cancel_code");
    expect(screens.at(-1)).toBe(`CON ${t("en", "ask_code_cancel")}`);
    const bad = applyInput(state, "K7M2X", {});
    expect(bad.invalid).toBe(true);
    const good = applyInput(state, " k7m2xq ", {});
    expect(good.effect).toEqual({ kind: "cancel", code: "K7M2XQ" });
    expect(render(good.state, { acted: { ok: true, code: "K7M2XQ" } })).toBe(
      "END Cancelled. Your place is released. Code K7M2XQ.",
    );
    expect(render(good.state, { acted: { ok: false, key: "code_unknown" } })).toBe(
      `END ${t("en", "code_unknown")}`,
    );
    expect(render(good.state, { acted: { ok: false, key: "not_cancellable" } })).toBe(
      "END This visit cannot be cancelled now. Code K7M2XQ.",
    );
  });

  it("4 Confirm: the same shape with the confirm effect", () => {
    const { state } = walk(["4"], () => ({}));
    const r = applyInput(state, "K7M2XQ", {});
    expect(r.effect).toEqual({ kind: "confirm", code: "K7M2XQ" });
    expect(render(r.state, { acted: { ok: true, code: "K7M2XQ" } })).toBe(
      "END Thank you. The clinic expects you. Code K7M2XQ.",
    );
  });

  it("the rate-limit END and the emergency line are the strings table's", () => {
    expect(render(INITIAL_STATE, { tooMany: true })).toBe(`END ${t("en", "too_many")}`);
  });
});

describe("resume and idempotency (the route's contract)", () => {
  it("lastSegment reads only the newest key press from AT's *-joined history", () => {
    expect(lastSegment("")).toBe("");
    expect(lastSegment("1")).toBe("1");
    expect(lastSegment("1*1*2*Amina 34")).toBe("Amina 34");
  });

  it("the same (state, input, data) yields the same state — a replay applies nothing new", () => {
    const s0 = walk(["1", "1", "1"], bookingData).state;
    const a = applyInput(s0, "1", bookingData(s0));
    const b = applyInput(s0, "1", bookingData(s0));
    expect(a).toEqual(b);
  });

  it("an empty input (the first callback) changes nothing", () => {
    const s = walk(["1", "1"], bookingData).state;
    expect(applyInput(s, "", bookingData(s)).state).toEqual(s);
  });
});

describe("every word comes from strings.ts", () => {
  it("ussd.ts holds no sentence literal (two or more words in a string)", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/channels/ussd.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const literals = [...src.matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2] ?? "");
    const sentences = literals.filter((l) => /[a-z]+ [a-z]+/i.test(l) && !l.includes("${"));
    expect(sentences).toEqual([]);
  });
});
