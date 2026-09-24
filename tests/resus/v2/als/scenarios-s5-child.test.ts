import type { ArrestContext, BayProfile } from "@/lib/resus/model";
import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import { tMs } from "@/lib/resus/als/timing";
import { check, ctxOf, drug, proc, sec, shock, started } from "./fixtures";

/**
 * Scenario S5 — a 9-year-old in VF then asystole, on a fake clock (ALS-MOD-16).
 * Clocks and logging work; adrenaline, antiarrhythmic and energy are suppressed, and no
 * numeric dose or energy appears anywhere in the state — checked by walking the whole
 * object at every 15 s of the script, across several contexts (a registered bay profile,
 * anaphylaxis + LAST flags, hypothermia bands).
 */

const profile: BayProfile = {
  id: "bay-2",
  label: "Bay 2 · biphasic RLB",
  waveform: "rectilinear_biphasic",
  energySequenceJ: [150, 200, 250],
  capnography: true,
  ultrasound: false,
  mechanicalCpr: false,
  ecpr: false,
};
const child = (over: Partial<ArrestContext> = {}, flags = {}) =>
  ctxOf({ ageYears: 9, weightKg: 28, ...over }, flags);
const CONTEXTS: ArrestContext[] = [
  child(),
  child({ bayProfile: profile }),
  child({ coreTempC: 28 }, { allergenTrigger: true, localAnaestheticToxicity: true }),
  child({ coreTempC: 33, bayProfile: profile }),
];

const script = [
  ...started(),
  check(sec(10), "vf_pvt"),
  shock(sec(15)),
  check(sec(135), "vf_pvt"),
  shock(sec(140)),
  check(sec(260), "vf_pvt"),
  shock(sec(265)),
  // Logged by the team without an amount: the adult flat dose is not offered for a child.
  drug(sec(270), "adrenaline_arrest_iv", "adrenaline", null),
  proc(sec(300), "airway_ett", { ettTrace: "yes" }),
  check(sec(385), "vf_pvt"),
  shock(sec(390)),
  check(sec(510), "vf_pvt"),
  shock(sec(515)),
  check(sec(640), "asystole"),
];
const upTo = (s: number) => script.filter((e) => tMs(e) <= sec(s));
const at = (s: number, ctx = CONTEXTS[1]!, nowMs = sec(s)) =>
  computeArrestState(upTo(s), nowMs, ctx);

/** Fields that would carry a dose or an energy amount. Counts of logged doses are not amounts. */
const DOSE_KEY = /dose|joule|energy|mg$/i;
const COUNT_KEYS = new Set(["doses", "dosesGiven"]);
/** Paths of dose/energy-named fields that hold any digit (a number, or a number in text). */
function doseNumbers(v: unknown, path = "state"): string[] {
  if (typeof v !== "object" || v === null) return [];
  return Object.entries(v).flatMap(([k, x]) => {
    const p = `${path}.${k}`;
    if (DOSE_KEY.test(k) && !COUNT_KEYS.has(k) && /\d/.test(JSON.stringify(x) ?? "")) return [p];
    return doseNumbers(x, p);
  });
}
/** Every string in the state (reasons, prompt texts, modifier labels). */
const strings = (v: unknown): string[] =>
  typeof v === "string"
    ? [v]
    : typeof v === "object" && v !== null
      ? Object.values(v).flatMap(strings)
      : [];
const DOSE_TEXT = /\d+(?:[.,]\d+)?\s*(?:mg|µg|mcg|micrograms?|mL\/kg|ml\/kg|J\b|joules?)/i;

describe("S5: age 9 — clocks and logging only (ALS-MOD-16)", () => {
  it("S5: the 2-min cycle runs and is restarted by each shock", () => {
    const s = at(15);
    expect(s.paediatric).toBe(true);
    expect(s.status).toBe("in_arrest");
    expect(s.cycle).toMatchObject({ startedAtMs: sec(15), dueAtMs: sec(135), status: "running" });
    expect(at(15, CONTEXTS[1], sec(15 + 105)).cycle.status).toBe("prepare");
    expect(at(15, CONTEXTS[1], sec(15 + 120)).cycle.status).toBe("due");
    expect(at(15, CONTEXTS[1], sec(15 + 135) + 1).cycle.status).toBe("overdue");
  });

  it("S5: rhythms, shocks and the logged drug are recorded", () => {
    const s = at(640);
    expect(s.rhythms.map((r) => r.rhythm)).toEqual([
      "vf_pvt",
      "vf_pvt",
      "vf_pvt",
      "vf_pvt",
      "vf_pvt",
      "asystole",
    ]);
    expect(s.firstRhythm).toBe("vf_pvt");
    expect(s.currentRhythm).toBe("asystole");
    expect(s.cycle).toMatchObject({ number: 7, startedAtMs: sec(640) });
    expect(s.shocks).toMatchObject({ count: 5, lastAtMs: sec(515) });
    expect(s.adrenaline).toMatchObject({ doses: 1, lastAtMs: sec(270) });
    expect(s.airway.level).toBe("ett");
    expect(s.episodeTotalsMg).toEqual({});
  });

  it("S5: adrenaline, antiarrhythmic and energy are suppressed_child at every stage", () => {
    for (const ctx of CONTEXTS) {
      for (const s of [at(10, ctx), at(265, ctx), at(515, ctx), at(640, ctx)]) {
        expect(s.adrenaline).toMatchObject({
          status: "suppressed_child",
          opensAtMs: null,
          overdueAtMs: null,
          ruleIds: ["ALS-MOD-16"],
        });
        expect(s.antiarrhythmic).toMatchObject({
          status: "suppressed_child",
          nextDoseMg: null,
          ruleIds: ["ALS-MOD-16"],
        });
        expect(s.shocks.energy).toEqual({ kind: "suppressed_child" });
        const ids = s.prompts.map((p) => p.id);
        expect(ids).toContain("paediatric");
        expect(ids).not.toContain("adrenaline");
        expect(ids).not.toContain("antiarrhythmic");
      }
    }
  });

  it("S5: no numeric dose or energy anywhere in the state (whole-object walk)", () => {
    for (const ctx of CONTEXTS) {
      for (let s = 0; s <= 700; s += 15) {
        const state = at(s, ctx);
        expect(doseNumbers(state), `t=${s}s`).toEqual([]);
        expect(
          strings(state).filter((t) => DOSE_TEXT.test(t)),
          `t=${s}s`,
        ).toEqual([]);
      }
    }
  });

  it("S5: control — the same walk flags the adult state (the checks can fail)", () => {
    const adult = ctxOf({ bayProfile: profile }, { allergenTrigger: true });
    const s = computeArrestState(upTo(265), sec(265), adult);
    expect(doseNumbers(s)).toEqual(
      expect.arrayContaining(["state.shocks.energy", "state.antiarrhythmic.nextDoseMg"]),
    );
    expect(strings(s).some((t) => DOSE_TEXT.test(t))).toBe(true);
  });
});
