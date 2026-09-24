import type { LevelExtras } from "@/lib/resus/closeout/level-of-care";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { levelInputFromRecord, suggestLevel } from "@/lib/resus/closeout/level-of-care";
import { arrest, context, decision, ev, NORMAL_VITALS, rosc, vitals } from "./fixtures";

const ADULT: LevelExtras = { ageYears: 50 };
const input = (tl: TimelineEvent[]) => levelInputFromRecord(tl, ADULT);
const obeys = (minsAgo: number, value: boolean) =>
  decision(minsAgo, { decision: "obeys_commands", value });
const artefact = (minsAgo: number, vital: TimelineEvent, fields: string[]) =>
  ev("note", null, minsAgo, {
    noteKind: "vital_annotation",
    vitalEventId: vital.id,
    fields,
    artefact: true,
    label: "Artefact",
  });
const cAssess = (minsAgo: number, present: string[], ctx: Record<string, unknown> = {}) =>
  ev("assessment", "C", minsAgo, { circulation: { state: null, present, context: ctx } });

describe("CO-R1/CO-R2 — post-ROSC answers belong to the current ROSC", () => {
  it("CO-R2: an 'obeys' answer before a re-arrest does not count after the next ROSC", () => {
    const tl = [arrest(120), rosc(100), obeys(90, true), arrest(40, 2), rosc(20, 2)];
    const r = input(tl);
    expect(r).toMatchObject({ postRosc: true, obeysCommands: null });
    expect(suggestLevel(r, []).reasons.map((x) => x.ruleId)).not.toContain("CO-R2");
  });

  it("CO-R1: a fresh answer after the second ROSC counts", () => {
    const tl = [
      arrest(120),
      rosc(100),
      obeys(90, true),
      arrest(40, 2),
      rosc(20, 2),
      obeys(10, false),
    ];
    expect(suggestLevel(input(tl), []).level).toBe("l3");
  });

  it("CO-DST-01: PR-C-05 done before a re-arrest does not flag STEMI after it", () => {
    const done = decision(90, { decision: "post_rosc_item", itemId: "PR-C-05", state: "done" });
    expect(input([arrest(120), rosc(100), done, arrest(40, 2), rosc(20, 2)]).stemi).toBe(false);
  });
});

describe("CO-R11/CO-R12 — NEWS2 is scored on one resus vital set", () => {
  it("CO-R12: an artefact SpO₂ leaves the score", () => {
    const set = vitals(5, { ...NORMAL_VITALS, spo2: 72 });
    const withArtefact = input([set, artefact(4, set, ["spo2"])]);
    expect(input([set]).news2!.hasSingleParameterThree).toBe(true);
    // The set now lacks SpO₂, and it is not filled from elsewhere.
    expect(withArtefact.news2).toBeNull();
  });

  it("CO-R12: an artefact normal SBP never hides the real low one", () => {
    const low = vitals(20, { ...NORMAL_VITALS, systolicBp: 85 });
    const bogus = vitals(5, { ...NORMAL_VITALS, systolicBp: 125 });
    const r = input([low, bogus, artefact(4, bogus, ["systolicBp"])]);
    expect(r.news2).toBeNull();
    expect(suggestLevel(r, []).level).not.toBe("ward");
  });

  it("CO-R12: a missing parameter is not filled from an older set", () => {
    const { temperature: _t, ...noTemp } = NORMAL_VITALS;
    const r = input([vitals(240, NORMAL_VITALS), vitals(5, noTemp)]);
    expect(r.news2).toBeNull();
    expect(suggestLevel(r, []).level).toBeNull();
  });

  it("CO-R12: a newer partial reading is not ignored in favour of an older full set", () => {
    const r = input([vitals(60, NORMAL_VITALS), vitals(5, { spo2: 85 })]);
    expect(r.news2).toBeNull();
    expect(suggestLevel(r, []).level).toBeNull();
  });

  it("CO-R12: a set with no NEWS2 parameter (EtCO₂ only) does not displace the last set", () => {
    const r = input([vitals(10, NORMAL_VITALS), vitals(2, { etco2: 4.5 })]);
    expect(r.news2).toEqual({ total: 0, hasSingleParameterThree: false });
  });

  it("CO-R12: the carried-in triage reading is not a close-out set", () => {
    const triage = ev("vital", null, 90, {
      label: "Vitals carried from triage",
      snapshot: NORMAL_VITALS,
      carriedFromTriage: true,
    });
    expect(input([triage]).news2).toBeNull();
  });
});

describe("CO-DST — destinations after an arrest", () => {
  it("CO-DST-02: a haemorrhagic C recorded during CPR still flags theatre after ROSC", () => {
    const c = cAssess(15, ["external_haemorrhage", "cold_peripheries", "no_pulse"], {
      trauma: true,
      noPulse: true,
    });
    const r = input([arrest(20), c, rosc(10)]);
    expect(r.haemorrhage).toBe(true);
    expect(suggestLevel(r, []).extraDestinations.map((d) => d.ruleId)).toContain("CO-DST-02");
  });

  it("CO-DST-04: suspected PE in an arrest → CT first", () => {
    expect(input([context(30, { peSuspected: true }), arrest(20)]).nonCoronaryCause).toBe(true);
  });

  it("CO-DST-04: suspected PE without an arrest is not an arrest cause", () => {
    expect(input([context(30, { peSuspected: true })]).nonCoronaryCause).toBe(false);
  });

  it("CO-DST-04: a thrombosis tile with PE evidence (not ischaemia) counts", () => {
    const tile = decision(4, {
      decision: "reversible_cause",
      arrestSeq: 1,
      cause: "thrombosis",
      state: "suspected",
    });
    expect(input([arrest(20), cAssess(10, ["us_rv_strain"]), tile]).nonCoronaryCause).toBe(true);
    const mixed = cAssess(10, ["ecg_pe", "ecg_ischaemia"]);
    expect(input([arrest(20), mixed, tile]).nonCoronaryCause).toBe(false);
  });
});
