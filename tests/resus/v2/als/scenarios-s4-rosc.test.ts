import { describe, expect, it } from "vitest";

import { arrestSeqForDeclaration, computeArrestState } from "@/lib/resus/als/engine";
import { terminationReview } from "@/lib/resus/als/termination";
import {
  adrenaline,
  amiodarone,
  check,
  cpr,
  ctxOf,
  declare,
  MIN,
  min,
  rosc,
  sec,
  shock,
  started,
} from "./fixtures";

/**
 * Scenarios S4 / S4b — ROSC and re-arrest, on a fake clock (catalog §8, ALS-ROSC-03..05).
 * Common start: VF, 3 shocks, adrenaline + amiodarone 300, organised rhythm with a pulse,
 * ROSC at 6:30. S4: re-arrest at 8:00 (intermittent) → the same arrest, counters intact.
 * S4b: sustained ROSC (20:00) → re-arrest at 30:00 opens arrest 2 with fresh counters.
 */

const ctx = ctxOf();
const ROSC_AT = sec(390);
const history = [
  ...started(),
  check(sec(10), "vf_pvt"),
  shock(sec(15)),
  check(sec(135), "vf_pvt"),
  shock(sec(140)),
  check(sec(260), "vf_pvt"),
  shock(sec(265)),
  adrenaline(sec(270)),
  amiodarone(sec(275), 300),
  check(sec(385), "organised", 1, true),
  rosc(ROSC_AT),
];

describe("S4: ROSC then re-arrest at 8:00 — intermittent ROSC, one arrest", () => {
  const RE = min(8);
  const reArrest = [...history, declare(RE, 1)];

  it("S4: during ROSC the sustain timer runs; a declaration at 8:00 keeps arrest 1", () => {
    const during = computeArrestState(history, min(7), ctx);
    expect(during.status).toBe("rosc");
    expect(during.rosc).toMatchObject({ sustained: false, sustainedAtMs: ROSC_AT + 20 * MIN });
    expect(during.prompts.map((p) => p.id)).toEqual(["rosc_sustain"]);
    expect(arrestSeqForDeclaration(history, RE)).toBe(1);
    expect(arrestSeqForDeclaration(history, ROSC_AT + 20 * MIN - 1)).toBe(1);
  });

  it("S4: after the re-arrest the counters are intact and intermittentCount is 1", () => {
    const s = computeArrestState(reArrest, RE + 30_000, ctx);
    expect(s).toMatchObject({ arrestSeq: 1, status: "in_arrest", arrestAtMs: sec(0) });
    expect(s.shocks.count).toBe(3);
    expect(s.adrenaline).toMatchObject({ doses: 1, lastAtMs: sec(270) });
    expect(s.antiarrhythmic.dosesGiven).toBe(1);
    expect(s.rosc).toEqual({
      atMs: ROSC_AT,
      sustainedAtMs: null,
      sustained: false,
      intermittentCount: 1,
    });
    expect(s.firstRhythm).toBe("vf_pvt");
    expect(s.cycle).toMatchObject({ number: 5, startedAtMs: RE, status: "running" });
    expect(s.cprElapsedMs).toBe(ROSC_AT - sec(0) + 30_000);
    expect(s.arrestElapsedMs).toBe(RE + 30_000 - sec(0));
  });

  it("S4: adrenaline keeps its repeat clock from the last dose (no fresh first dose)", () => {
    const s = computeArrestState(reArrest, RE + 30_000, ctx);
    expect(s.adrenaline).toMatchObject({
      status: "window_open",
      opensAtMs: sec(270) + 3 * MIN,
      overdueAtMs: sec(270) + 5 * MIN,
    });
    expect(s.adrenaline.ruleIds[0]).toBe("ALS-ADR-03");
  });

  it("S4: shocks keep counting across the ROSC — the 5th shock makes amiodarone 150 due", () => {
    const events = [
      ...reArrest,
      check(RE + 5_000, "vf_pvt"),
      shock(RE + 10_000),
      check(RE + 130_000, "vf_pvt"),
      shock(RE + 135_000),
    ];
    const now = RE + 140_000;
    const s = computeArrestState(events, now, ctx);
    expect(s.shocks).toMatchObject({ count: 5, consecutive: 2, refractoryVf: false });
    expect(s.antiarrhythmic).toMatchObject({ status: "due", nextDoseMg: 150 });
    const flags = terminationReview(events, s, ctx, now).continueFlags.map((f) => f.id);
    expect(flags).toContain("intermittent_rosc");
  });
});

describe("S4b: sustained ROSC then re-arrest at 30:00 — a new arrest", () => {
  const RE = min(30);
  const arrest2 = [...history, declare(RE, 2), cpr(RE, 2)];

  it("S4b: ROSC is sustained 20:00 after it began; the sustain prompt clears", () => {
    expect(computeArrestState(history, ROSC_AT + 20 * MIN - 1, ctx).rosc.sustained).toBe(false);
    const s = computeArrestState(history, ROSC_AT + 20 * MIN, ctx);
    expect(s.rosc.sustained).toBe(true);
    expect(s.prompts).toEqual([]);
  });

  it("S4b: a declaration at 30:00 opens arrest 2", () => {
    expect(arrestSeqForDeclaration(history, RE)).toBe(2);
  });

  it("S4b: arrest 2 restarts the per-arrest counters", () => {
    const s = computeArrestState(arrest2, RE + MIN, ctx);
    expect(s).toMatchObject({
      arrestSeq: 2,
      status: "in_arrest",
      arrestAtMs: RE,
      cprStartMs: RE,
      arrestElapsedMs: MIN,
      cprElapsedMs: MIN,
      rhythms: [],
      firstRhythm: null,
    });
    expect(s.shocks).toMatchObject({ count: 0, lastAtMs: null, consecutive: 0 });
    expect(s.adrenaline).toMatchObject({ doses: 0, lastAtMs: null, status: "not_yet_eligible" });
    expect(s.antiarrhythmic).toMatchObject({ dosesGiven: 0, status: "not_eligible" });
    expect(s.rosc).toMatchObject({ atMs: null, intermittentCount: 0 });
    expect(s.cycle).toMatchObject({ number: 1, startedAtMs: RE });
    expect(s.episodeTotalsMg).toEqual({ adrenaline: 1, amiodarone: 300 });
  });

  it("S4b: arrest 2 counts its own 3 shocks; episode totals keep both arrests' adrenaline", () => {
    const events = [
      ...arrest2,
      check(RE + 10_000, "vf_pvt", 2),
      shock(RE + 15_000, 2),
      check(RE + 135_000, "vf_pvt", 2),
      shock(RE + 140_000, 2),
    ];
    const two = computeArrestState(events, RE + 145_000, ctx);
    expect(two.shocks.count).toBe(2);
    expect(two.adrenaline.status).toBe("not_yet_eligible");
    const three = [...events, check(RE + 260_000, "vf_pvt", 2), shock(RE + 265_000, 2)];
    const s = computeArrestState(three, RE + 266_000, ctx);
    expect(s.shocks.count).toBe(3);
    expect(s.adrenaline).toMatchObject({ status: "due_now", opensAtMs: RE + 265_000 });
    expect(s.antiarrhythmic).toMatchObject({ status: "due", nextDoseMg: 300, dosesGiven: 0 });
    const given = computeArrestState([...three, adrenaline(RE + 270_000, 2)], RE + 271_000, ctx);
    expect(given.adrenaline.doses).toBe(1);
    expect(given.episodeTotalsMg).toEqual({ adrenaline: 2, amiodarone: 300 });
  });
});
