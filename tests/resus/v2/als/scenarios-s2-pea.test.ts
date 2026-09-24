import { describe, expect, it } from "vitest";

import { arrestSeqForDeclaration, computeArrestState } from "@/lib/resus/als/engine";
import { stopAuthority, terminationReview } from "@/lib/resus/als/termination";
import { tMs } from "@/lib/resus/als/timing";
import { deathObservation } from "@/lib/resus/death/confirmation";
import { adrenaline, check, ctxOf, declare, MIN, min, rosc, sec, started, stop } from "./fixtures";

/**
 * Scenario S2 — non-shockable arrest to confirmation of death, on a fake clock
 * (catalog §4, §9, §10). PEA at the first check → adrenaline at once, then every 4 min →
 * asystole at every 2-min check → termination review (information only) → the team stops
 * at 46:00 → the 5-minute observation; any return of function invalidates it.
 */

const ctx = ctxOf();
const STOP_AT = min(46);
const doses = Array.from({ length: 12 }, (_, k) => adrenaline(sec(40 + 240 * k)));
const checks = Array.from({ length: 23 }, (_, k) => check(min(2 * (k + 1)), "asystole"));
const script = [...started(), check(sec(10), "pea"), ...doses, ...checks].sort(
  (a, b) => tMs(a) - tMs(b),
);
const upTo = (t: number) => script.filter((e) => tMs(e) <= t);
const at = (t: number, nowMs = t) => computeArrestState(upTo(t), nowMs, ctx);
const review = (t: number) => terminationReview(upTo(t), at(t), ctx, t);
const stopped = [...script, stop(STOP_AT)];

describe("S2: PEA → asystole → stop → confirmation of death", () => {
  it("S2: before the first check nothing is due; PEA makes adrenaline due at once", () => {
    expect(at(sec(5)).adrenaline.reason).toMatch(/Rhythm not yet checked/);
    const s = at(sec(10));
    expect(s.firstRhythm).toBe("pea");
    expect(s.adrenaline).toMatchObject({ status: "due_now", doses: 0, opensAtMs: sec(10) });
    expect(s.adrenaline.ruleIds[0]).toBe("ALS-ADR-02");
    expect(s.prompts[0]).toMatchObject({ id: "adrenaline", severity: "due" });
    expect(s.antiarrhythmic.status).toBe("not_eligible");
  });

  it("S2: each 2-min asystole check restarts the cycle and prompts for P waves", () => {
    for (let k = 1; k <= 11; k++) {
      const s = at(min(2 * k));
      expect(s.currentRhythm).toBe("asystole");
      expect(s.cycle).toMatchObject({
        number: 2 + k,
        startedAtMs: min(2 * k),
        dueAtMs: min(2 * k + 2),
        status: "running",
      });
      expect(s.prompts.some((p) => p.id === "p_waves" && p.ruleId === "ALS-RHY-01")).toBe(true);
    }
    expect(at(min(20), min(22)).cycle.status).toBe("due");
  });

  it("S2: adrenaline repeats on a 3–5 min window after each dose", () => {
    for (let k = 0; k < 11; k++) {
      const given = sec(40 + 240 * k);
      const s = at(given);
      expect(s.adrenaline).toMatchObject({
        doses: k + 1,
        status: "waiting",
        opensAtMs: given + 3 * MIN,
        overdueAtMs: given + 5 * MIN,
      });
      expect(at(given, given + 4 * MIN).adrenaline.status).toBe("window_open");
    }
  });

  it("S2: 20 min of persistent asystole → the ERC chip is met (information only)", () => {
    const early = review(min(22) - 1);
    expect(early.criteria.erc.met).toBe(false);
    const r = review(min(22));
    expect(r.facts.persistentAsystoleMs).toBe(20 * MIN);
    expect(r.facts.adrenalineDoses).toBe(6);
    expect(r.facts.shocks).toBe(0);
    expect(r.continueFlags).toEqual([]);
    expect(r.criteria.erc).toMatchObject({ minutes: 20, met: true });
    expect(r.criteria.erc.text).toMatch(/team decision/);
  });

  it("S2: the RCUK 45-min detail is not met before 45 min from confirmation of arrest", () => {
    expect(review(min(22)).criteria.rcuk).toMatchObject({ minutes: 45, met: false });
    expect(review(min(45) - 1).criteria.rcuk.met).toBe(false);
    expect(review(min(45)).criteria.rcuk.met).toBe(true);
  });

  it("S2: resuscitation stopped — the clocks freeze at the stop, prompts clear", () => {
    const now = STOP_AT + 3 * MIN;
    const s = computeArrestState(stopped, now, ctx);
    expect(s.status).toBe("stopped");
    expect(s.arrestElapsedMs).toBe(46 * MIN);
    expect(s.cprElapsedMs).toBe(46 * MIN);
    expect(s.cycle).toMatchObject({ startedAtMs: null, dueAtMs: null });
    expect(s.prompts).toEqual([]);
    expect(s.adrenaline.doses).toBe(12);
    const r = terminationReview(stopped, s, ctx, now);
    expect(r.facts.arrestDurationMs).toBe(46 * MIN);
    expect(r.criteria.erc.met).toBe(true);
    // "Signs of life — resume" (ALS-DTH-05) continues arrest 1 — no sustained ROSC (ALS-ROSC-04).
    expect(arrestSeqForDeclaration(stopped, now)).toBe(1);
  });

  it("S2: who may stop — doctor/CO recommended; a nurse records with a senior co-sign pending", () => {
    expect(stopAuthority("MEDICAL_OFFICER")).toEqual({
      recommended: true,
      seniorCosignPending: false,
    });
    expect(stopAuthority("NURSE")).toEqual({ recommended: false, seniorCosignPending: true });
  });

  it("S2: death observation — incomplete at 4:59, complete at 5:00", () => {
    const early = deathObservation(stopped, STOP_AT + 4 * MIN + 59_000);
    expect(early).toMatchObject({
      startedAtMs: STOP_AT,
      complete: false,
      elapsedMs: 299_000,
      remainingMs: 1_000,
    });
    const done = deathObservation(stopped, STOP_AT + 5 * MIN);
    expect(done).toMatchObject({ complete: true, remainingMs: 0, invalidated: false });
  });

  it("S2: a ROSC after the stop invalidates the observation; the next stop restarts 5:00", () => {
    const back = [...stopped, rosc(STOP_AT + 2 * MIN)];
    expect(deathObservation(back, STOP_AT + 5 * MIN)).toMatchObject({
      invalidated: true,
      complete: false,
      elapsedMs: 0,
      remainingMs: 5 * MIN,
    });
    const again = [...back, stop(STOP_AT + 10 * MIN)];
    expect(deathObservation(again, STOP_AT + 15 * MIN - 1).complete).toBe(false);
    expect(deathObservation(again, STOP_AT + 15 * MIN)).toMatchObject({
      complete: true,
      restarts: 1,
    });
  });

  it("S2: a re-arrest declaration after the stop invalidates the observation", () => {
    const back = [...stopped, declare(STOP_AT + 2 * MIN, 2)];
    expect(deathObservation(back, STOP_AT + 5 * MIN)).toMatchObject({
      invalidated: true,
      complete: false,
    });
    expect(computeArrestState(back, STOP_AT + 3 * MIN, ctx)).toMatchObject({
      arrestSeq: 2,
      status: "in_arrest",
    });
  });
});
