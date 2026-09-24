import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import { CAUSE_KEYS } from "@/lib/resus/model";
import { artefact, assess, cause, ctxOf, ev, sec, started, T0, vital } from "./fixtures";

/** ALS engine — the 4 Hs & 4 Ts tiles (catalog §6, ALS-RC-01..08; RC-09 in the capnography file). */

type Events = Parameters<typeof computeArrestState>[0];
const tiles = (extra: Events, ctx = ctxOf()) =>
  computeArrestState([...extra, ...started()], sec(30), ctx).causes;
const tile = (extra: Events, key: (typeof CAUSE_KEYS)[number], ctx = ctxOf()) =>
  tiles(extra, ctx).find((c) => c.key === key)!;
const pre = T0 - 60_000;
const A = (patency: string, context = {}) =>
  assess(pre, "A", { patency, present: [], difficulty: [], context });
const B = (state: string | null, present: string[] = []) =>
  assess(pre, "B", { state, present, context: {} });
const C = (present: string[], state: string | null = null) =>
  assess(pre, "C", { state, present, context: { noPulse: true } });
const D = (glucoseMmol: number | null, present: string[] = [], gcs: object | null = null) =>
  assess(pre, "D", { state: null, gcs, avpu: null, glucoseMmol, present, context: {} });
const E = (present: string[]) =>
  assess(pre, "E", { state: null, present, coreTempC: null, context: {} });

describe("tiles", () => {
  it("ALS-RC-01: eight tiles in catalog order, all not assessed without evidence (never auto-excluded)", () => {
    const t = tiles([]);
    expect(t.map((c) => c.key)).toEqual([...CAUSE_KEYS]);
    expect(t.map((c) => c.ruleId)).toEqual([
      "ALS-RC-01",
      "ALS-RC-02",
      "ALS-RC-03",
      "ALS-RC-04",
      "ALS-RC-05",
      "ALS-RC-06",
      "ALS-RC-07",
      "ALS-RC-08",
    ]);
    expect(t.every((c) => c.state === "not_assessed")).toBe(true);
  });

  it("ALS-RC-01: a recorded state wins over the pre-fill and the latest record wins", () => {
    const events = [
      B("failure_decompensating"),
      cause(sec(10), "hypoxia", "treating"),
      cause(sec(20), "hypoxia", "treated"),
    ];
    const t = tile(events, "hypoxia");
    expect(t.state).toBe("treated");
    expect(t.evidence.length).toBeGreaterThan(0);
  });

  it("ALS-RC-01: evidence never marks a tile excluded; a recorded exclusion stays excluded", () => {
    expect(tile([A("completely_obstructed")], "hypoxia").state).toBe("suspected");
    expect(
      tile([A("completely_obstructed"), cause(sec(5), "hypoxia", "excluded")], "hypoxia").state,
    ).toBe("excluded");
  });
});

describe("pre-fill from survey evidence", () => {
  it("ALS-RC-01: hypoxia ← A completely obstructed, with the assessment's event id", () => {
    const a = A("completely_obstructed");
    const t = tile([a], "hypoxia");
    expect(t.state).toBe("suspected");
    expect(t.evidence[0]).toEqual({ eventId: a.id, label: "A: airway completely obstructed" });
  });

  it("ALS-RC-01: hypoxia ← A apnoeic, read without the arrest's no-signs-of-life flag", () => {
    expect(tile([A("apnoeic", { noSignsOfLife: true })], "hypoxia").evidence[0]?.label).toBe(
      "A: apnoeic",
    );
  });

  it("ALS-RC-01: hypoxia ← B failure / peri-arrest / SpO₂ < 92 %", () => {
    expect(tile([B("failure_decompensating")], "hypoxia").state).toBe("suspected");
    expect(tile([B("peri_arrest")], "hypoxia").state).toBe("suspected");
    expect(tile([B("adequate", ["spo2_lt92"])], "hypoxia").state).toBe("suspected");
    expect(tile([B("adequate")], "hypoxia").state).toBe("not_assessed");
  });

  it("ALS-RC-02: hypovolaemia ← C haemorrhagic shock type (arrest flag removed first)", () => {
    const t = tile([C(["external_haemorrhage"], "decompensated_shock")], "hypovolaemia");
    expect(t.state).toBe("suspected");
    expect(t.evidence[0]?.label).toMatch(/^C: Hypovolaemic/);
  });

  it("ALS-RC-02: hypovolaemia ← E occult haemorrhage and the trauma / bleeding context", () => {
    expect(tile([E(["external_haemorrhage"])], "hypovolaemia").evidence[0]?.label).toBe(
      "E: occult / major haemorrhage",
    );
    const ctx = ctxOf({}, { trauma: true, activeBleeding: true });
    expect(tile([], "hypovolaemia", ctx).evidence.map((e) => e.label)).toEqual([
      "Context: trauma",
      "Context: active bleeding",
    ]);
  });

  it("ALS-RC-03: metabolic ← D hypoglycaemia and renal / dialysis context", () => {
    expect(tile([D(2.1)], "potassium_metabolic").evidence[0]?.label).toMatch(/^D: Hypoglycaemia/);
    expect(tile([], "potassium_metabolic", ctxOf({}, { renalDialysis: true })).state).toBe(
      "suspected",
    );
  });

  it("ALS-RC-03: metabolic ← a low glucose in the latest vitals, citing the vital event", () => {
    const v = vital(pre, { glucose: 2.5 });
    const t = tile([v], "potassium_metabolic");
    expect(t.evidence[0]?.eventId).toBe(v.id);
    expect(tile([vital(pre, { glucose: 6 })], "potassium_metabolic").state).toBe("not_assessed");
  });

  it("SV-VIT-16 / ALS-RC-03: a glucose marked artefact does not pre-fill the metabolic tile", () => {
    const v = vital(pre, { glucose: 2.5 });
    const t = tile([v, artefact(pre + 1000, v.id, ["glucose"])], "potassium_metabolic");
    expect(t.state).toBe("not_assessed");
    expect(t.evidence).toEqual([]);
  });

  it("ALS-RC-04: temperature ← an abnormal core temperature or environmental exposure", () => {
    expect(tile([], "temperature", ctxOf({ coreTempC: 28 })).evidence[0]?.label).toMatch(
      /core 28 °C/,
    );
    expect(tile([], "temperature", ctxOf({ coreTempC: 41 })).state).toBe("suspected");
    expect(tile([], "temperature", ctxOf({ coreTempC: 37 })).state).toBe("not_assessed");
    expect(tile([], "temperature", ctxOf({}, { environmentalExposure: true })).state).toBe(
      "suspected",
    );
  });

  it("ALS-RC-05: thrombosis ← suspected-PE context and C ECG / ultrasound codes", () => {
    const ctxEv = ev("context", pre, { flags: {} }, null);
    const t = tile([ctxEv], "thrombosis", ctxOf({}, { peSuspected: true }));
    expect(t.evidence[0]).toEqual({ eventId: ctxEv.id, label: "Context: suspected PE" });
    expect(tile([C(["ecg_pe"])], "thrombosis").state).toBe("suspected");
    expect(tile([C(["us_rv_strain", "ecg_ischaemia"])], "thrombosis").evidence).toHaveLength(2);
  });

  it("ALS-RC-06: tension ← B trachea deviated, or reduced breath sounds + hyper-resonance, or C signs", () => {
    expect(tile([B(null, ["trachea_deviated_away"])], "tension").state).toBe("suspected");
    expect(tile([B(null, ["reduced_breath_sounds", "hyper_resonant"])], "tension").state).toBe(
      "suspected",
    );
    expect(tile([B(null, ["reduced_breath_sounds"])], "tension").state).toBe("not_assessed");
    expect(tile([C(["unilateral_absent_breath_sounds"])], "tension").state).toBe("suspected");
  });

  it("ALS-RC-07: tamponade ← C ultrasound / muffled sounds / raised JVP / ECG", () => {
    for (const code of ["us_tamponade", "muffled_heart_sounds", "raised_jvp", "ecg_tamponade"]) {
      expect(tile([C([code])], "tamponade").state).toBe("suspected");
    }
  });

  it("ALS-RC-08: toxins ← E opioid patch, D opioid syndrome, opioid / serotonergic context", () => {
    expect(tile([E(["transdermal_opioid_patch"])], "toxins").state).toBe("suspected");
    const opioid = D(6, ["pinpoint_pupils"], { eye: 1, verbal: 1, motor: 1 });
    expect(tile([opioid], "toxins").evidence[0]?.label).toMatch(/^D: Opioid/);
    expect(tile([], "toxins", ctxOf({}, { serotonergicOrNeuroleptic: true })).state).toBe(
      "suspected",
    );
    expect(tile([], "toxins", ctxOf({}, { opioidsSuspected: true })).state).toBe("suspected");
  });
});
