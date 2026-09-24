import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import { tMs } from "@/lib/resus/als/timing";
import { adrenaline, amiodarone, check, ctxOf, MIN, rosc, sec, shock, started } from "./fixtures";

/**
 * Scenario S1 — shockable arrest, scripted on a fake clock (catalog §3–§5, §8).
 * VF → shocks 1–3 on 2-min cycles → adrenaline + amiodarone 300 → shocks 4–5 →
 * amiodarone 150 → organised rhythm with a pulse → ROSC. Adult, no bay profile.
 * At each clock time the engine sees only the events recorded so far.
 */

const ctx = ctxOf();
const script = [
  ...started(),
  check(sec(10), "vf_pvt"),
  shock(sec(15)),
  check(sec(135), "vf_pvt"),
  shock(sec(140)),
  check(sec(260), "vf_pvt"),
  shock(sec(265)),
  adrenaline(sec(270)),
  amiodarone(sec(275), 300),
  check(sec(385), "vf_pvt"),
  shock(sec(390)),
  check(sec(510), "vf_pvt"),
  shock(sec(515)),
  adrenaline(sec(520)),
  amiodarone(sec(525), 150),
  check(sec(640), "organised", 1, true),
  rosc(sec(645)),
];
const upTo = (s: number) => script.filter((e) => tMs(e) <= sec(s));
/** The state at clock second `s` (events recorded up to `s`), optionally viewed later. */
const at = (s: number, nowMs = sec(s)) => computeArrestState(upTo(s), nowMs, ctx);
const promptIds = (s: ReturnType<typeof at>) => s.prompts.map((p) => p.id);

describe("S1: VF — shocks, adrenaline, amiodarone, ROSC", () => {
  it("S1: first check VF — the rhythm is logged, energy is 'highest', no drug is due yet", () => {
    const s = at(10);
    expect(s.status).toBe("in_arrest");
    expect(s.firstRhythm).toBe("vf_pvt");
    expect(s.currentRhythm).toBe("vf_pvt");
    expect(s.shocks.count).toBe(0);
    expect(s.shocks.energy).toEqual({ kind: "highest" });
    expect(s.adrenaline.status).toBe("not_yet_eligible");
    expect(s.antiarrhythmic.status).toBe("not_eligible");
  });

  it("S1: each shock restarts the 2-min cycle (prepare 1:45, due 2:00, overdue after 2:15)", () => {
    const s = at(15);
    expect(s.shocks.count).toBe(1);
    expect(s.cycle).toMatchObject({ startedAtMs: sec(15), dueAtMs: sec(135), status: "running" });
    expect(at(15, sec(15 + 105)).cycle.status).toBe("prepare");
    expect(at(15, sec(15 + 120)).cycle.status).toBe("due");
    expect(at(15, sec(15 + 135)).cycle.status).toBe("due");
    expect(at(15, sec(15 + 135) + 1).cycle.status).toBe("overdue");
    expect(at(140).cycle).toMatchObject({ startedAtMs: sec(140), dueAtMs: sec(260) });
  });

  it("S1: after 2 shocks adrenaline and amiodarone are still not eligible", () => {
    const s = at(140);
    expect(s.shocks).toMatchObject({ count: 2, consecutive: 2, refractoryVf: false });
    expect(s.adrenaline.status).toBe("not_yet_eligible");
    expect(s.adrenaline.reason).toBe("Shockable rhythm: after the 3rd shock");
    expect(s.antiarrhythmic).toMatchObject({ status: "not_eligible", nextDoseMg: null });
  });

  it("S1: after the 3rd shock adrenaline is due now and amiodarone 300 mg is due", () => {
    const s = at(265);
    expect(s.shocks).toMatchObject({ count: 3, consecutive: 3, refractoryVf: true });
    expect(s.adrenaline).toMatchObject({ status: "due_now", doses: 0, opensAtMs: sec(265) });
    expect(s.adrenaline.ruleIds).toContain("ALS-ADR-01");
    expect(s.antiarrhythmic).toMatchObject({
      drug: "amiodarone",
      status: "due",
      nextDoseMg: 300,
      dosesGiven: 0,
      ruleIds: ["ALS-AA-01", "ALS-AA-04"],
    });
    expect(promptIds(s)).toEqual(
      expect.arrayContaining(["adrenaline", "antiarrhythmic", "refractory_vf"]),
    );
  });

  it("S1: both given — adrenaline waits, amiodarone waits for the 5th shock", () => {
    const s = at(275);
    expect(s.adrenaline).toMatchObject({
      doses: 1,
      lastAtMs: sec(270),
      status: "waiting",
      opensAtMs: sec(270) + 3 * MIN,
      overdueAtMs: sec(270) + 5 * MIN,
    });
    expect(s.antiarrhythmic).toMatchObject({
      dosesGiven: 1,
      status: "not_eligible",
      nextDoseMg: null,
    });
    expect(promptIds(s)).not.toContain("adrenaline");
    expect(promptIds(s)).not.toContain("antiarrhythmic");
  });

  it("S1: the adrenaline window opens 3:00 after the dose and is overdue after 5:00", () => {
    const status = (nowMs: number) => at(275, nowMs).adrenaline.status;
    expect(status(sec(270) + 3 * MIN - 1)).toBe("waiting");
    expect(status(sec(270) + 3 * MIN)).toBe("window_open");
    expect(status(sec(270) + 5 * MIN)).toBe("window_open");
    expect(status(sec(270) + 5 * MIN + 1)).toBe("overdue");
    const overdue = at(275, sec(270) + 5 * MIN + 1).prompts.find((p) => p.id === "adrenaline");
    expect(overdue).toMatchObject({ severity: "overdue", ruleId: "ALS-ADR-03" });
  });

  it("S1: shock 4 — amiodarone second dose not yet eligible", () => {
    const s = at(390);
    expect(s.shocks.count).toBe(4);
    expect(s.antiarrhythmic).toMatchObject({ status: "not_eligible", dosesGiven: 1 });
  });

  it("S1: shock 5 — amiodarone 150 mg due; the adrenaline window is open", () => {
    const s = at(515);
    expect(s.shocks.count).toBe(5);
    expect(s.antiarrhythmic).toMatchObject({
      status: "due",
      nextDoseMg: 150,
      ruleIds: ["ALS-AA-02", "ALS-AA-04"],
    });
    expect(s.adrenaline.status).toBe("window_open");
  });

  it("S1: second adrenaline and amiodarone 150 given — antiarrhythmic complete", () => {
    const s = at(525);
    expect(s.adrenaline).toMatchObject({
      doses: 2,
      lastAtMs: sec(520),
      status: "waiting",
      opensAtMs: sec(520) + 3 * MIN,
      overdueAtMs: sec(520) + 5 * MIN,
    });
    expect(s.antiarrhythmic).toMatchObject({
      status: "complete",
      dosesGiven: 2,
      nextDoseMg: null,
      ruleIds: ["ALS-AA-02"],
    });
    expect(promptIds(s)).not.toContain("antiarrhythmic");
  });

  it("S1: organised rhythm with a pulse, then ROSC — clocks stop, the record stays", () => {
    expect(promptIds(at(640))).not.toContain("pulse_check");
    const s = at(645, sec(700));
    expect(s.status).toBe("rosc");
    expect(s.rosc).toEqual({
      atMs: sec(645),
      sustainedAtMs: sec(645) + 20 * MIN,
      sustained: false,
      intermittentCount: 0,
    });
    expect(s.shocks.count).toBe(5);
    expect(s.adrenaline.doses).toBe(2);
    expect(s.antiarrhythmic.dosesGiven).toBe(2);
    expect(s.firstRhythm).toBe("vf_pvt");
    expect(s.currentRhythm).toBe("organised");
    expect(s.arrestElapsedMs).toBe(sec(645) - sec(0));
    expect(s.cprElapsedMs).toBe(sec(645) - sec(0));
    expect(s.cycle).toMatchObject({ startedAtMs: null, dueAtMs: null });
    expect(promptIds(s)).toEqual(["rosc_sustain"]);
    expect(s.episodeTotalsMg).toEqual({ adrenaline: 2, amiodarone: 450 });
  });
});
