import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import {
  STOP_RECOMMENDED_CADRE_CODES,
  stopAuthority,
  terminationReview,
} from "@/lib/resus/als/termination";
import { ALS_REFS } from "@/lib/resus/reference/als-catalog";
import {
  adrenaline,
  cause,
  check,
  ctxOf,
  declare,
  min,
  proc,
  rosc,
  sec,
  started,
  surveyAction,
  vital,
} from "./fixtures";

/** Termination review (catalog §9, ALS-TOR-01..10) — information, never a directive. */

type Events = Parameters<typeof computeArrestState>[0];
const review = (events: Events, nowMs: number, ctx = ctxOf()) =>
  terminationReview(events, computeArrestState(events, nowMs, ctx), ctx, nowMs);
/** PEA → adrenaline → asystole from 2:00, checked every 2 min up to `upToMin`. */
const asystole = (upToMin: number): Events => [
  ...started(),
  check(sec(0), "pea"),
  adrenaline(sec(30)),
  ...Array.from({ length: upToMin / 2 }, (_, i) => check(min(2 * (i + 1)), "asystole")),
];
const flagIds = (events: Events, nowMs: number, ctx = ctxOf()) =>
  review(events, nowMs, ctx).continueFlags.map((f) => f.id);

describe("criteria (informational only)", () => {
  it("ALS-TOR-03: the ERC chip is met after 20 min of persistent asystole with nothing against", () => {
    const r = review(asystole(22), min(22));
    expect(r.facts.persistentAsystoleMs).toBe(20 * 60_000);
    expect(r.criteria.erc).toMatchObject({ minutes: 20, met: true });
    expect(r.criteria.erc.text).toMatch(/may be considered/);
  });

  it("ALS-TOR-03: not met at 19 min of asystole", () => {
    expect(review(asystole(20), min(21) - 1).criteria.erc.met).toBe(false);
  });

  it("ALS-TOR-03: the RCUK detail needs 45 min from confirmation of arrest", () => {
    expect(review(asystole(44), min(44)).criteria.rcuk).toMatchObject({ minutes: 45, met: false });
    expect(review(asystole(46), min(46)).criteria.rcuk.met).toBe(true);
  });

  it("ALS-TOR-03: a non-asystole check breaks the run — persistence restarts", () => {
    const events = [...asystole(20), check(min(21), "pea"), check(min(23), "asystole")];
    const r = review(events, min(25));
    expect(r.facts.persistentAsystoleMs).toBe(2 * 60_000);
    expect(r.criteria.erc.met).toBe(false);
  });

  it("ALS-TOR-03: the criteria text is never a prompt to stop", () => {
    const r = review(asystole(46), min(46));
    for (const c of [r.criteria.erc, r.criteria.rcuk]) {
      expect(c.text).toMatch(/team decision/);
      expect(c.text).not.toMatch(/^stop|stop now|should stop/i);
    }
  });

  it("ALS-ETC-03: a low ETCO₂ alone never meets a criterion", () => {
    const r = review([...asystole(10), vital(min(10), { etco2: 0.4 })], min(10));
    expect(r.criteria.erc.met).toBe(false);
    expect(r.facts.etco2Last3).toEqual([0.4]);
  });
});

describe("facts and cautions", () => {
  it("ALS-TOR-01: facts list durations, shocks, adrenaline, airway and capnography", () => {
    const events = [...asystole(10), proc(min(3), "airway_ett", { ettTrace: "yes" })];
    const r = review(events, min(12));
    expect(r.facts).toMatchObject({
      arrestDurationMs: 12 * 60_000,
      cprDurationMs: 12 * 60_000,
      shocks: 0,
      adrenalineDoses: 1,
      airway: "ett",
      capnography: "yes",
    });
    expect(r.cautions.find((c) => c.ruleId === "ALS-TOR-01")?.text).toMatch(/team decision/);
  });

  it("ALS-TOR-02: termination rules are not used in hospital (caution shown)", () => {
    expect(review(asystole(4), min(4)).cautions.some((c) => c.ruleId === "ALS-TOR-02")).toBe(true);
  });

  it("ALS-TOR-04: the last three ETCO₂ values are shown, with the never-in-isolation caution", () => {
    const events = [
      ...asystole(6),
      ...[2.1, 1.9, 1.5, 1.2].map((v, i) => vital(min(3 + i), { etco2: v })),
    ];
    const r = review(events, min(7));
    expect(r.facts.etco2Last3).toEqual([1.9, 1.5, 1.2]);
    expect(r.cautions.find((c) => c.ruleId === "ALS-TOR-04")?.text).toMatch(/never in isolation/);
  });

  it("ALS-TOR-05: ultrasound, gases and pupils are listed as not a basis for stopping", () => {
    expect(
      review(asystole(4), min(4)).cautions.find((c) => c.ruleId === "ALS-TOR-05")?.text,
    ).toMatch(/pupil/);
  });

  it("ALS-TOR-06: the team is asked and objections recorded (caution shown)", () => {
    expect(
      review(asystole(4), min(4)).cautions.find((c) => c.ruleId === "ALS-TOR-06")?.text,
    ).toMatch(/objection/);
  });

  it("ALS-TOR-08: causes not yet excluded come first", () => {
    const events = [
      ...asystole(4),
      cause(min(1), "hypoxia", "excluded"),
      cause(min(1), "toxins", "treating"),
    ];
    const r = review(events, min(4));
    expect(r.causes[r.causes.length - 1]?.key).toBe("hypoxia");
    expect(r.notExcluded.map((c) => c.key)).not.toContain("hypoxia");
    expect(r.notExcluded).toHaveLength(7);
  });

  it("ALS-TOR-10: debrief immediately after termination (reference row)", () => {
    expect(ALS_REFS["ALS-TOR-10"]!.text).toMatch(/Debrief immediately/);
  });
});

describe("continue-flags", () => {
  it("ALS-TOR-07: hypothermia — rewarm before deciding; a flag stops the chip being met", () => {
    const r = review(asystole(22), min(22), ctxOf({ coreTempC: 31 }));
    expect(r.continueFlags.map((f) => f.id)).toContain("hypothermia");
    expect(r.continueFlags[0]?.ruleId).toBe("ALS-TOR-07");
    expect(r.criteria.erc.met).toBe(false);
  });

  it("ALS-TOR-07: toxins suspected or LAST → plan > 1 h", () => {
    expect(flagIds(asystole(4), min(4), ctxOf({}, { opioidsSuspected: true }))).toContain("toxins");
    expect(flagIds(asystole(4), min(4), ctxOf({}, { localAnaestheticToxicity: true }))).toContain(
      "toxins",
    );
  });

  it("ALS-TOR-07: PE after lysis (the recorded C-step thrombolysis) — shown for 90 min after", () => {
    const events = [...asystole(4), surveyAction(min(1), "C", "c_thrombolysis")];
    expect(flagIds(events, min(60))).toContain("pe_lysis");
    expect(flagIds(events, min(91))).not.toContain("pe_lysis");
  });

  it("ALS-TOR-07: persistent or recurrent shockable rhythm", () => {
    expect(flagIds([...started(), check(min(2), "vf_pvt")], min(3))).toContain("shockable");
    const recurrent = [
      ...started(),
      check(min(2), "asystole"),
      check(min(4), "vf_pvt"),
      check(min(6), "asystole"),
    ];
    expect(review(recurrent, min(7)).continueFlags.find((f) => f.id === "shockable")?.text).toMatch(
      /Recurrent/,
    );
  });

  it("ALS-TOR-07: intermittent ROSC and rising ETCO₂", () => {
    const events = [
      ...asystole(4),
      rosc(min(5)),
      declare(min(8)),
      vital(min(9), { etco2: 1 }),
      vital(min(10), { etco2: 2 }),
    ];
    expect(flagIds(events, min(10))).toEqual(
      expect.arrayContaining(["intermittent_rosc", "etco2_rising"]),
    );
  });

  it("ALS-TOR-07: pregnancy > 20 weeks with hysterotomy pending, cleared once performed", () => {
    const ctx = ctxOf({}, { pregnancy: "confirmed", gestationWeeks: 30 });
    expect(flagIds(asystole(4), min(4), ctx)).toContain("hysterotomy");
    expect(flagIds([...asystole(4), proc(min(3), "hysterotomy")], min(4), ctx)).not.toContain(
      "hysterotomy",
    );
  });

  it("ALS-TOR-07: a reversible cause being treated now", () => {
    expect(flagIds([...asystole(4), cause(min(1), "tension", "treating")], min(4))).toContain(
      "treating_tension",
    );
  });
});

describe("who may stop", () => {
  it("ALS-TOR-09: doctors and clinical officers are recommended; others record with a co-sign pending", () => {
    expect(stopAuthority("MEDICAL_OFFICER")).toEqual({
      recommended: true,
      seniorCosignPending: false,
    });
    expect(stopAuthority("CLINICAL_OFFICER").recommended).toBe(true);
    expect(stopAuthority("ENROLLED_NURSE")).toEqual({
      recommended: false,
      seniorCosignPending: true,
    });
    expect(stopAuthority(null).seniorCosignPending).toBe(true);
  });

  it("ALS-TOR-09: the cadre list equals RESUS_LEADER_CADRE_CODES in lib/resus/scope.ts", () => {
    const src = readFileSync(resolve(__dirname, "../../../../lib/resus/scope.ts"), "utf8");
    const block = /RESUS_LEADER_CADRE_CODES = \[([^\]]*)\]/.exec(src)?.[1] ?? "";
    const codes = [...block.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(codes).toEqual([...STOP_RECOMMENDED_CADRE_CODES]);
  });
});
