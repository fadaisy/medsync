/** PEOPLE-ROSTER §17: every branch of the pure roster rules (lib/pharmacy/derive/roster.ts). Fixtures only. */
import type { Duty, Person, Place, SwapRequest } from "@/lib/pharmacy/derive/roster";
import { describe, expect, it } from "vitest";

import {
  attendanceOf,
  breaksFor,
  candidates,
  canEditPlace,
  canPublish,
  coverage,
  easter,
  effStatus,
  fillGaps,
  holidays,
  judge,
  licState,
  load,
  monthCells,
  needsWitness,
  newBreaks,
  onDutyNow,
  ROSTER_DEFAULTS as P,
  restWhy,
} from "@/lib/pharmacy/derive/roster";

const MON = "2026-11-02";
const store: Place = { id: "store", name: "Main store", kind: "store", shifts: ["day", "call"] };
const opd: Place = { id: "opd", name: "OPD dispensary", kind: "dispensing_point", shifts: ["day"] };
const epi: Place = { id: "epi", name: "EPI clinic", kind: "clinic", shifts: ["day"] };
const ward: Place = { id: "w3", name: "Ward 3", kind: "ward", shifts: ["day", "night", "call"] };
const lic = (expiresOn: string) => ({ body: "PSU" as const, number: "PSU/P/1", expiresOn });
const person = (
  userId: string,
  cadre: Person["cadre"],
  places = ["store", "opd"],
  licence = lic("2027-12-31"),
) => ({ userId, name: userId, cadre, places, licence }) as Person;
const grace = person("grace", "pharmacist");
const brian = person("brian", "pharmacist");
const moses = person("moses", "store_keeper", ["store"], null as never);
const duty = (
  userId: string,
  date: string,
  shift: Duty["shift"] = "day",
  placeId = "store",
): Duty => ({
  userId,
  placeId,
  date,
  shift,
});

describe("witnessing and coverage", () => {
  it("a store keeper cannot witness; clinics and on call are exempt", () => {
    expect(needsWitness([grace, moses], "day", store)).toBe(true);
    expect(needsWitness([grace, brian], "day", store)).toBe(false);
    expect(needsWitness([grace], "day", epi)).toBe(false);
    expect(needsWitness([grace], "call", ward)).toBe(false);
  });
  it("counts empty and unwitnessed slots as gaps", () => {
    const R = [duty("grace", MON), duty("moses", MON)];
    const c = coverage(R, [store], [MON], new Map([grace, moses].map((p) => [p.userId, p])));
    expect(c).toMatchObject({ slots: 2, filled: 1, empty: 1, unwitnessed: 1 });
    expect(c.days[0]).toMatchObject({ day: 2, night: 0, gaps: 2 });
  });
});

describe("rest and hours", () => {
  it("day after a night (across a week boundary too), day and night on one date, more than 6 a week", () => {
    const R = [duty("grace", "2026-11-01", "night", "w3"), duty("grace", MON)];
    expect(breaksFor(R, MON, "grace", P)).toEqual([{ kind: "after_night", date: MON }]);
    const same = [duty("grace", MON), duty("grace", MON, "night", "w3")];
    expect(breaksFor(same, MON, "grace", P)).toEqual([{ kind: "same_date", date: MON }]);
    const seven = [0, 1, 2, 3, 4, 5, 6].map((d) => duty("grace", `2026-11-0${2 + d}`));
    expect(breaksFor(seven, MON, "grace", P)).toEqual([{ kind: "too_many", n: 7 }]);
    expect(breaksFor(seven, MON, "grace", { ...P, maxWeek: 7 })).toEqual([]);
    // On call does not count.
    expect(
      breaksFor([...seven.slice(0, 6), duty("grace", "2026-11-08", "call")], MON, "grace", P),
    ).toEqual([]);
  });
  it("restWhy names each reason", () => {
    const R = [duty("grace", MON, "night", "w3"), duty("grace", "2026-11-04")];
    expect(restWhy(R, "grace", "2026-11-03", "day", true, P)).toEqual([{ kind: "night_before" }]);
    expect(restWhy(R, "grace", "2026-11-03", "night", true, P)).toEqual([{ kind: "day_after" }]);
    expect(restWhy(R, "grace", MON, "day", true, P)).toEqual([{ kind: "also_night" }]);
    expect(restWhy([duty("grace", MON)], "grace", MON, "night", true, P)).toEqual([
      { kind: "also_day" },
    ]);
    const six = [0, 1, 2, 3, 4, 5].map((d) => duty("grace", `2026-11-0${2 + d}`));
    expect(restWhy(six, "grace", "2026-11-08", "day", true, P)).toEqual([
      { kind: "too_many", n: 7 },
    ]);
    expect(restWhy(six, "grace", "2026-11-08", "call", true, P)).toEqual([]);
  });
});

describe("licences", () => {
  it("na, missing, expired, soon at the warning edge, ok", () => {
    expect(licState(moses, MON, P)).toBe("na");
    expect(licState({ cadre: "technician", licence: null }, MON, P)).toBe("missing");
    expect(licState(person("x", "pharmacist", [], lic("2026-11-01")), MON, P)).toBe("expired");
    expect(licState(person("x", "pharmacist", [], lic("2026-12-02")), MON, P)).toBe("soon");
    expect(licState(person("x", "pharmacist", [], lic("2026-12-03")), MON, P)).toBe("ok");
  });
});

describe("judge and best fit", () => {
  const ctx = { people: [grace, brian, moses], leaves: [], params: P };
  it("blocks in order: not here, on leave, licence expired, missing, already on the shift", () => {
    const j = (p: Person, R: Duty[] = [], leaves = ctx.leaves as never[]) =>
      judge(R, { ...ctx, leaves }, MON, "opd", "day", p, []).block;
    expect(j(moses)).toBe("not_here");
    expect(
      j(grace, [], [{ id: "l", userId: "grace", from: MON, to: MON, status: "approved" }] as never),
    ).toBe("on_leave");
    expect(j(person("x", "pharmacist", ["opd"], lic("2026-11-01")))).toBe("lic_expired");
    expect(j({ ...person("x", "technician", ["opd"]), licence: null })).toBe("lic_missing");
    expect(j(grace, [duty("grace", MON)])).toEqual({ already: "day" });
    expect(j(grace)).toBeNull();
  });
  it("scores: rest breaks, pending leave, another shift, load, this week, a non-witness second", () => {
    const base = judge([], ctx, MON, "store", "day", grace, []).score;
    expect(base).toBe(0);
    const pend = {
      ...ctx,
      leaves: [{ id: "l", userId: "grace", from: MON, to: MON, status: "pending" as const }],
    };
    expect(judge([], pend, MON, "store", "day", grace, []).score).toBe(40);
    expect(judge([duty("grace", MON, "call")], ctx, MON, "store", "day", grace, []).score).toBe(
      25 + 1,
    );
    expect(judge([duty("grace", "2026-11-03")], ctx, MON, "store", "day", grace, []).score).toBe(
      1 + 4,
    );
    expect(judge([], ctx, MON, "store", "day", moses, ["grace"]).score).toBe(60);
    const night = judge(
      [duty("grace", "2026-11-01", "night", "w3")],
      ctx,
      MON,
      "store",
      "day",
      grace,
      [],
    );
    expect(night.breaks).toEqual([{ kind: "after_night", date: MON }]);
    expect(night.score).toBeGreaterThanOrEqual(100);
  });
  it("best fit is the top unblocked candidate under 100", () => {
    const list = candidates([duty("brian", "2026-11-03")], ctx, MON, "store", "day");
    expect(list[0]).toMatchObject({ person: grace, best: true });
    expect(list.at(-1)!.best).toBe(false);
  });
});

describe("fill gaps", () => {
  const ctx = { people: [grace, brian, moses], leaves: [], params: P };
  it("never breaks a rule, counts each pick, leaves impossible slots open", () => {
    const r = fillGaps([], ctx, MON, MON, [store]);
    if (r.over) throw new Error("not over");
    // 7 day slots × 2 + 7 call × 1 = 21; three people, at most 6 day shifts each → some left.
    for (const p of [grace, brian, moses]) expect(breaksFor(r.added, MON, p.userId, P)).toEqual([]);
    expect(r.added.length + r.left).toBeGreaterThan(0);
    expect(r.added.every((d) => d.date >= MON)).toBe(true);
    const byCell = new Map<string, number>();
    for (const d of r.added)
      byCell.set(`${d.date}|${d.shift}`, (byCell.get(`${d.date}|${d.shift}`) ?? 0) + 1);
    for (const [k, n] of byCell) expect(n).toBeLessThanOrEqual(k.endsWith("call") ? 1 : 2);
  });
  it("skips past days this week and refuses a week that is over", () => {
    const r = fillGaps([], ctx, MON, "2026-11-05", [opd]);
    if (r.over) throw new Error("not over");
    expect(r.added.every((d) => d.date >= "2026-11-05")).toBe(true);
    expect(fillGaps([], ctx, "2026-10-26", MON, [opd])).toEqual({ over: true });
  });
});

describe("swaps", () => {
  const rq: SwapRequest = {
    id: "r",
    fromUser: "grace",
    toUser: "brian",
    kind: "swap",
    give: { placeId: "store", date: "2026-11-04", shift: "day" },
    take: { placeId: "store", date: "2026-11-05", shift: "day" },
    status: "colleague",
  };
  const R = [duty("grace", "2026-11-04"), duty("brian", "2026-11-05")];
  it("expired once the shift started; stale once the roster moved; closed states stand", () => {
    expect(effStatus(rq, R, { date: MON, min: 600 })).toBe("colleague");
    expect(effStatus(rq, R, { date: "2026-11-04", min: 479 })).toBe("colleague");
    expect(effStatus(rq, R, { date: "2026-11-04", min: 480 })).toBe("expired");
    expect(effStatus(rq, [R[0]!], { date: MON, min: 600 })).toBe("stale");
    expect(effStatus({ ...rq, status: "approved" }, [], { date: "2027-01-01", min: 0 })).toBe(
      "approved",
    );
  });
  it("newBreaks reports what the swap would add", () => {
    const night = [...R, duty("brian", "2026-11-03", "night", "w3")];
    expect(newBreaks(night, rq, P)).toEqual([
      { userId: "brian", b: { kind: "after_night", date: "2026-11-04" } },
    ]);
  });
});

describe("who makes the roster", () => {
  const dels = [{ toUser: "brian", places: ["opd"], until: "2026-11-30", canPublish: false }];
  it("in-charge edits every pharmacy place, never a ward; a delegate only theirs, until the end date", () => {
    expect(canEditPlace({ userId: "grace", inCharge: true }, store, [], MON)).toBe(true);
    expect(canEditPlace({ userId: "grace", inCharge: true }, ward, [], MON)).toBe(false);
    expect(canEditPlace({ userId: "brian", inCharge: false }, opd, dels, MON)).toBe(true);
    expect(canEditPlace({ userId: "brian", inCharge: false }, store, dels, MON)).toBe(false);
    expect(canEditPlace({ userId: "brian", inCharge: false }, opd, dels, "2026-11-30")).toBe(true);
    expect(canEditPlace({ userId: "brian", inCharge: false }, opd, dels, "2026-12-01")).toBe(false);
    expect(canPublish({ userId: "brian", inCharge: false }, dels, MON)).toBe(false);
    expect(
      canPublish(
        { userId: "brian", inCharge: false },
        [{ ...dels[0]!, places: [], canPublish: true }],
        MON,
      ),
    ).toBe(true);
  });
});

describe("attendance and on duty now", () => {
  it("ok within the late limit, late after it, not in only from the alert minute, none on call or wards", () => {
    const now = { date: "2026-11-03", min: 13 * 60 };
    expect(attendanceOf(470, "2026-11-03", "day", store, now, P)).toEqual({
      kind: "ok",
      at: "07:50",
    });
    expect(attendanceOf(490, "2026-11-03", "day", store, now, P)).toEqual({
      kind: "ok",
      at: "08:10",
    });
    expect(attendanceOf(491, "2026-11-03", "day", store, now, P)).toEqual({
      kind: "late",
      at: "08:11",
    });
    expect(
      attendanceOf(null, "2026-11-03", "day", store, { date: "2026-11-03", min: 494 }, P),
    ).toBeNull();
    expect(
      attendanceOf(null, "2026-11-03", "day", store, { date: "2026-11-03", min: 495 }, P),
    ).toEqual({
      kind: "none",
      today: true,
    });
    expect(attendanceOf(null, MON, "day", store, now, P)).toEqual({ kind: "none", today: false });
    expect(attendanceOf(null, "2026-11-04", "day", store, now, P)).toBeNull();
    expect(attendanceOf(null, MON, "call", store, now, P)).toBeNull();
    expect(attendanceOf(null, MON, "day", ward, now, P)).toBeNull();
  });
  it("before 08:00 is the previous night", () => {
    expect(onDutyNow({ date: "2026-11-03", min: 300 })).toEqual({
      date: MON,
      shifts: ["night", "call"],
    });
    expect(onDutyNow({ date: "2026-11-03", min: 788 })).toEqual({
      date: "2026-11-03",
      shifts: ["day"],
    });
    expect(onDutyNow({ date: "2026-11-03", min: 1020 })).toEqual({
      date: "2026-11-03",
      shifts: ["night", "call"],
    });
  });
});

describe("load", () => {
  it("five weeks, weekends and holidays, heavy at 1.25 × average and light at 0.75 ×", () => {
    const R = [
      ...[0, 1, 2, 3, 4].map((d) => duty("grace", `2026-11-0${2 + d}`)),
      duty("brian", "2026-11-07"),
      duty("brian", "2026-11-08", "call"),
      duty("moses", "2026-11-03"),
      duty("moses", "2026-11-04"),
      duty("moses", "2026-09-01"),
    ];
    const rows = load(R, [grace, brian, moses], MON, (d) => d === "2026-11-08");
    expect(rows.map((r) => [r.userId, r.total, r.flag])).toEqual([
      ["grace", 5, "heavy"],
      ["brian", 2, "light"],
      ["moses", 2, "light"],
    ]);
    expect(rows[1]).toMatchObject({ weekend: 2, holiday: 1, call: 1, pct: 40 });
  });
});

describe("holidays and the month grid", () => {
  it("computes Easter 2025–2030 and the fixed days", () => {
    expect([2025, 2026, 2027, 2028, 2029, 2030].map(easter)).toEqual([
      "2025-04-20",
      "2026-04-05",
      "2027-03-28",
      "2028-04-16",
      "2029-04-01",
      "2030-04-21",
    ]);
    const h = holidays(2026, [{ day: "2026-03-20", name: "Eid al-Fitr", confirmed: false }]);
    expect(h.get("2026-04-03")?.name).toBe("Good Friday");
    expect(h.get("2026-04-06")?.name).toBe("Easter Monday");
    expect(h.get("2026-10-09")?.name).toBe("Independence Day");
    expect(h.get("2026-03-20")).toEqual({ name: "Eid al-Fitr", confirmed: false });
    expect(h.size).toBe(13);
  });
  it("whole weeks, Monday first", () => {
    const c = monthCells(2026, 10);
    expect(c.length % 7).toBe(0);
    expect(c[0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(c.filter((x) => x.inMonth)).toHaveLength(30);
  });
});

describe("rules registry", async () => {
  const { ruleText, validateParam, ruleNumbers, rosterParams } =
    await import("@/lib/pharmacy/rules/registry");
  const { RULE_REGISTRY } = await import("@/content/pharmacy-rules");
  const rule = (g: string, k: string) =>
    RULE_REGISTRY.find((x) => x.key === g)!.rules.find((r) => r.key === k)!;
  it("pluralises units, keeps % tight, keeps the step's decimals", () => {
    expect(ruleText(rule("cold", "expiry_warning"))).toBe("Warn 90 days before expiry");
    expect(ruleText(rule("ord", "covers"), 2)).toBe("The cycle plus a 2 month buffer");
    expect(ruleText(rule("cd", "offline"), 1)).toBe("Must reach the server within 1 hour");
    expect(ruleText(rule("price", "markup"))).toBe("Received cost + 25%, rounded to UGX 50");
    expect(ruleText(rule("cold", "near_limit"))).toBe(
      "Within 0.5 °C of 2 or 8 °C shows as near the limit",
    );
    expect(ruleText(rule("rx", "allergy"))).toBe("Penicillin allergy blocks amoxicillin");
  });
  it("validates a number: not a number, out of range, unchanged", () => {
    const p = rule("cold", "expiry_warning").param!;
    expect(validateParam("x", p, 90)).toBe("nan");
    expect(validateParam("", p, 90)).toBe("nan");
    expect(validateParam("20", p, 90)).toBe("range");
    expect(validateParam("90", p, 90)).toBe("same");
    expect(validateParam("120", p, 90)).toBeNull();
  });
  it("83 rules in 11 groups; a signed number wins over the default", () => {
    expect(RULE_REGISTRY).toHaveLength(11);
    expect(RULE_REGISTRY.reduce((n, g) => n + g.rules.length, 0)).toBe(83);
    const n = ruleNumbers([
      { rule_group: "roster", key: "shifts_week", text: "", params: { n: 5 } },
    ]);
    expect(rosterParams(n)).toEqual({ ...P, maxWeek: 5 });
    expect(() => n("roster", "rest")).toThrow(/no number/);
  });
});
