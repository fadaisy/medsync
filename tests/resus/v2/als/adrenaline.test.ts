import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import { adrenaline, check, ctxOf, drug, MIN, min, rosc, sec, shock, started } from "./fixtures";

/** ALS engine — adrenaline window (ALS-ADR-*) and its temperature / LAST / child modifiers. */

const vf3 = [
  check(sec(120), "vf_pvt"),
  shock(sec(125)),
  check(sec(245), "vf_pvt"),
  shock(sec(250)),
  check(sec(370), "vf_pvt"),
  shock(sec(375)),
];
const peaDose = [...started(), check(sec(120), "pea"), adrenaline(sec(130))];
const adr = (events: Parameters<typeof computeArrestState>[0], nowMs: number, ctx = ctxOf()) =>
  computeArrestState(events, nowMs, ctx).adrenaline;

describe("first dose", () => {
  it("ALS-ADR-02: PEA → adrenaline due as soon as possible", () => {
    const a = adr([...started(), check(sec(120), "pea")], sec(121));
    expect(a.status).toBe("due_now");
    expect(a.opensAtMs).toBe(sec(120));
    expect(a.overdueAtMs).toBeNull();
    expect(a.ruleIds).toContain("ALS-ADR-02");
    expect(a.reason).toMatch(/1 mg IV/);
  });

  it("ALS-ADR-02: asystole → adrenaline due now, with a due prompt", () => {
    const s = computeArrestState([...started(), check(sec(120), "asystole")], sec(121), ctxOf());
    expect(s.adrenaline.status).toBe("due_now");
    expect(s.prompts.find((p) => p.id === "adrenaline")?.severity).toBe("due");
  });

  it("ALS-ADR-01: shockable with 2 shocks → not yet eligible, after the 3rd shock", () => {
    const a = adr([...started(), ...vf3.slice(0, 4)], sec(300));
    expect(a.status).toBe("not_yet_eligible");
    expect(a.reason).toMatch(/after the 3rd shock/);
  });

  it("ALS-ADR-01: shockable → due now after the 3rd shock", () => {
    const a = adr([...started(), ...vf3], sec(380));
    expect(a.status).toBe("due_now");
    expect(a.opensAtMs).toBe(sec(375));
    expect(a.ruleIds).toContain("ALS-ADR-01");
  });

  it("ALS-ADR-01: a stacked stack counts once toward the 3rd shock", () => {
    const stacked = [shock(sec(5), 1, true), shock(sec(15), 1, true), shock(sec(25), 1, true)];
    const a = adr(
      [
        ...started(),
        check(sec(3), "vf_pvt"),
        ...stacked,
        check(sec(150), "vf_pvt"),
        shock(sec(155)),
      ],
      sec(160),
    );
    expect(a.status).toBe("not_yet_eligible");
  });

  it("ALS-ADR-05: shockable → non-shockable before the 3rd shock makes adrenaline due now", () => {
    const a = adr(
      [...started(), check(sec(120), "vf_pvt"), shock(sec(125)), check(sec(245), "asystole")],
      sec(246),
    );
    expect(a.status).toBe("due_now");
    expect(a.ruleIds).toEqual(expect.arrayContaining(["ALS-ADR-02", "ALS-ADR-05"]));
  });

  it("ALS-ADR-01: before any rhythm check the reason names both pathways", () => {
    const a = adr(started(), sec(30));
    expect(a.status).toBe("not_yet_eligible");
    expect(a.reason).toMatch(/Rhythm not yet checked/);
  });
});

describe("repeat window", () => {
  it("ALS-ADR-03: waiting before +3:00, window open from +3:00, overdue after +5:00", () => {
    expect(adr(peaDose, sec(130) + 2 * MIN).status).toBe("waiting");
    expect(adr(peaDose, sec(130) + 3 * MIN).status).toBe("window_open");
    expect(adr(peaDose, sec(130) + 5 * MIN).status).toBe("window_open");
    expect(adr(peaDose, sec(130) + 5 * MIN + 1).status).toBe("overdue");
  });

  it("ALS-ADR-03: the window times are last dose +3:00 and +5:00", () => {
    const a = adr(peaDose, sec(140));
    expect(a.doses).toBe(1);
    expect(a.lastAtMs).toBe(sec(130));
    expect(a.opensAtMs).toBe(sec(130) + 3 * MIN);
    expect(a.overdueAtMs).toBe(sec(130) + 5 * MIN);
  });

  it("ALS-ADR-03: an overdue dose raises an overdue prompt", () => {
    const s = computeArrestState(peaDose, sec(130) + 6 * MIN, ctxOf());
    expect(s.prompts.find((p) => p.id === "adrenaline")?.severity).toBe("overdue");
  });

  it('ALS-ADR-04: the repeat reason carries the "about every second loop" cue', () => {
    const a = adr(peaDose, sec(140));
    expect(a.reason).toMatch(/about every second loop/);
    expect(a.ruleIds).toContain("ALS-ADR-04");
  });

  it("ALS-ADR-03: a molecule-key IO dose counts; an IM dose (anaphylaxis) does not", () => {
    const io = drug(sec(130), "custom", "adrenaline", 1, "io");
    expect(adr([...started(), check(sec(120), "pea"), io], sec(140)).doses).toBe(1);
    const im = drug(sec(130), "adrenaline_im", "adrenaline", 0.5, "im");
    expect(adr([...started(), check(sec(120), "pea"), im], sec(140)).doses).toBe(0);
  });

  it("ALS-ADR-06: no small-increment adrenaline default is ever suggested", () => {
    const a = adr(peaDose, sec(140));
    expect(a.reason).not.toMatch(/µg|mcg|microgram/);
  });

  it("ALS-ADR-03: after ROSC no adrenaline is due (no arrest in progress)", () => {
    const a = adr([...peaDose, rosc(min(4))], min(10));
    expect(a.status).toBe("not_yet_eligible");
    expect(a.opensAtMs).toBeNull();
  });
});

describe("modifiers on adrenaline", () => {
  it("ALS-MOD-01: core < 30 °C withholds adrenaline, with the reason", () => {
    const s = computeArrestState(
      [...started(), check(sec(120), "pea")],
      sec(125),
      ctxOf({ coreTempC: 28 }),
    );
    expect(s.adrenaline.status).toBe("withheld");
    expect(s.adrenaline.reason).toMatch(/30 °C/);
    expect(s.adrenaline.ruleIds).toEqual(["ALS-MOD-01"]);
    expect(s.prompts.find((p) => p.id === "adrenaline")?.ruleId).toBe("ALS-MOD-01");
  });

  it("ALS-MOD-01: once core reaches 30 °C adrenaline becomes due", () => {
    const a = adr([...started(), check(sec(120), "pea")], sec(125), ctxOf({ coreTempC: 30 }));
    expect(a.status).toBe("due_now");
  });

  it("ALS-MOD-04: core 30–35 °C opens the window at +6:00 and is overdue after +10:00", () => {
    const ctx = ctxOf({ coreTempC: 33 });
    const a = adr(peaDose, sec(130) + 5 * MIN, ctx);
    expect(a.status).toBe("waiting");
    expect(a.opensAtMs).toBe(sec(130) + 6 * MIN);
    expect(a.overdueAtMs).toBe(sec(130) + 10 * MIN);
    expect(adr(peaDose, sec(130) + 10 * MIN, ctx).status).toBe("window_open");
    expect(adr(peaDose, sec(130) + 10 * MIN + 1, ctx).status).toBe("overdue");
    expect(a.ruleIds).toContain("ALS-MOD-04");
  });

  it("ALS-MOD-04: 35.0 °C is inside the band; 35.1 °C uses the standard 3–5 min", () => {
    expect(adr(peaDose, sec(140), ctxOf({ coreTempC: 35 })).overdueAtMs).toBe(sec(130) + 10 * MIN);
    expect(adr(peaDose, sec(140), ctxOf({ coreTempC: 35.1 })).overdueAtMs).toBe(sec(130) + 5 * MIN);
  });

  it("ALS-MOD-06: a peripheral < 32 °C never withholds — standard timing plus a core prompt", () => {
    const s = computeArrestState(peaDose, sec(140), ctxOf({ otherTempC: 28 }));
    expect(s.adrenaline.status).toBe("waiting");
    expect(s.adrenaline.overdueAtMs).toBe(sec(130) + 5 * MIN);
    expect(s.adrenaline.ruleIds).toContain("ALS-MOD-06");
    expect(s.prompts.find((p) => p.ruleId === "ALS-MOD-06")?.text).toMatch(/core temperature now/);
  });

  it("ALS-MOD-10: LAST keeps the timing but the dose reads ≤ 1 µg/kg via the weight dialog", () => {
    const ctx = ctxOf({}, { localAnaestheticToxicity: true });
    const a = adr(peaDose, sec(140), ctx);
    expect(a.overdueAtMs).toBe(sec(130) + 5 * MIN);
    expect(a.reason).toMatch(/≤ 1 µg\/kg — use the dialog with weight/);
    expect(a.reason).not.toMatch(/1 mg/);
    expect(a.ruleIds).toContain("ALS-MOD-10");
  });

  it("ALS-MOD-16: a child gets no adrenaline window — logging only", () => {
    const a = adr(peaDose, sec(140), ctxOf({ ageYears: 9 }));
    expect(a.status).toBe("suppressed_child");
    expect(a.doses).toBe(1);
    expect(a.opensAtMs).toBeNull();
    expect(a.reason).toMatch(/PLS module not built/);
  });
});
