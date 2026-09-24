import type { StepState } from "@/lib/resus/model";
import type { DoNowInput } from "@/lib/resus/survey/do-now";
import type { BoardAction, SurveySignals } from "@/lib/resus/survey/floor";
import type { AbcdeLetter } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { computeDoNow } from "@/lib/resus/survey/do-now";
import { computeSurvey } from "@/lib/resus/survey/floor";
import { ABCDE_LETTERS } from "@/lib/resus/types";
import { NOW, SHOCKED, vitals } from "./survey-fixtures";

/** Prompt §5.5 / GATE A §7 — the cross-step Do-now queue (SV-DN-01..11). */

const sig = (over: Partial<SurveySignals> = {}): SurveySignals => ({
  gcsTotal: null,
  gcsFalling: false,
  opioid: false,
  coreTempMissing: false,
  glucoseMissing: false,
  vitalsStale: false,
  ...over,
});
const act = (step: AbcdeLetter, code: string, over: Partial<BoardAction> = {}): BoardAction => ({
  step,
  code,
  label: code,
  rationale: `why ${code}`,
  emergency: false,
  priority: 1,
  ...over,
});
const st = (step: AbcdeLetter, over: Partial<StepState> = {}): StepState => ({
  step,
  engineState: null,
  recordedState: null,
  assessed: false,
  fromVitals: false,
  derivedCodes: [],
  visual: "pending",
  outstanding: 0,
  ...over,
});
const input = (
  over: Omit<Partial<DoNowInput>, "actions"> & {
    actions?: Partial<Record<AbcdeLetter, BoardAction[]>>;
  } = {},
): DoNowInput => ({
  states: ABCDE_LETTERS.map((s) => st(s)),
  signals: sig(),
  vitals: {},
  allergiesRecorded: true,
  firstDrugPending: false,
  ...over,
  actions: { A: [], B: [], C: [], D: [], E: [], ...over.actions },
});
const ids = (i: DoNowInput) => {
  const r = computeDoNow(i);
  return [...r.top, ...r.rest].map((x) => x.id);
};

describe("bands", () => {
  it("SV-DN-01: a failed action ranks above an assess prompt and an emergency action", () => {
    const i = input({
      states: [st("C", { fromVitals: true, derivedCodes: ["tachycardia"] })],
      actions: {
        A: [act("A", "a_suction", { state: "failed", priority: 2 })],
        B: [act("B", "b_bag_mask_ventilation", { emergency: true, priority: 0 })],
      },
    });
    expect(ids(i)).toEqual(["action:A:a_suction", "assess:C", "action:B:b_bag_mask_ventilation"]);
  });
  it("SV-DN-01: failed actions across steps keep the engine priority order", () => {
    const i = input({
      actions: {
        A: [act("A", "a_opa", { state: "failed", priority: 2 })],
        C: [act("C", "c_iv_access", { state: "failed", priority: 1 })],
      },
    });
    expect(ids(i)).toEqual(["action:C:c_iv_access", "action:A:a_opa"]);
  });
  it("SV-DN-02: Assess C carries the real values ('because … SBP 70, MAP 63 …')", () => {
    const s = computeSurvey([vitals(3, SHOCKED)], { ageYears: 40, nowMs: NOW });
    const r = computeDoNow({
      ...s,
      vitals: s.measure.values,
      allergiesRecorded: true,
      firstDrugPending: false,
    });
    expect(r.top.slice(0, 2).map((x) => x.label)).toEqual(["Assess B", "Assess C"]);
    expect(r.top[0]!.because).toBe("because SpO₂ 67 %");
    expect(r.top[1]!.because).toBe("because HR 130, SBP 70, MAP 63, SI 1.86, PP 10");
  });
  it("SV-DN-02: no assess prompt for an assessed step or a pending step with nothing derived", () => {
    const i = input({
      states: [
        st("C", { assessed: true, fromVitals: true, derivedCodes: ["tachycardia"] }),
        st("B"),
      ],
    });
    expect(ids(i)).toEqual([]);
  });
  it("SV-DN-02: an unclassifiable derived code (D glucose 2.5) still prompts Assess D", () => {
    const r = computeDoNow(
      input({ states: [st("D", { derivedCodes: ["hypoglycaemia"] })], vitals: { glucose: 2.5 } }),
    );
    expect(r.top[0]).toMatchObject({ kind: "assess", step: "D", because: "because glucose 2.5" });
  });
  it("SV-DN-03: indicated emergency actions rank by engine priority across steps", () => {
    const i = input({
      actions: {
        B: [act("B", "b_high_flow_o2", { emergency: true, priority: 3 })],
        C: [act("C", "c_stop_bleeding", { emergency: true, priority: 0 })],
        E: [act("E", "e_monitoring", { priority: 0 })],
      },
    });
    expect(ids(i)).toEqual([
      "action:C:c_stop_bleeding",
      "action:B:b_high_flow_o2",
      "action:E:e_monitoring",
    ]);
  });
  it("SV-DN-03: an in-progress emergency action falls to the rest band", () => {
    const i = input({
      signals: sig({ vitalsStale: true }),
      actions: { C: [act("C", "c_blood_mhp", { emergency: true, state: "in_progress" })] },
    });
    expect(ids(i)).toEqual(["vitals_stale:-", "action:C:c_blood_mhp"]);
  });
});

describe("returns", () => {
  it("SV-DN-04: GCS 7 → Return to A, absorbing D's back-to-A action", () => {
    const i = input({
      signals: sig({ gcsTotal: 7 }),
      actions: { D: [act("D", "d_back_to_a_airway", { emergency: true, priority: 0 })] },
    });
    const r = computeDoNow(i);
    expect(r.top).toHaveLength(1);
    expect(r.top[0]).toMatchObject({ kind: "return_to_a", step: "A", because: "because GCS 7" });
  });
  it("SV-DN-04: a falling GCS returns to A with its reason", () => {
    const r = computeDoNow(input({ signals: sig({ gcsTotal: 12, gcsFalling: true }) }));
    expect(r.top[0]!.because).toBe("because GCS falling");
  });
  it("SV-DN-04: returns rank after emergency actions and before system prompts", () => {
    const i = input({
      signals: sig({ gcsTotal: 6, vitalsStale: true }),
      actions: { C: [act("C", "c_haemorrhage_control", { emergency: true, priority: 0 })] },
    });
    expect(ids(i)).toEqual(["action:C:c_haemorrhage_control", "return_to_a:A", "vitals_stale:-"]);
  });
  it("SV-DN-05: opioid toxicity → 'Naloxone → back to B' with the engine's reason", () => {
    const nal = act("D", "d_naloxone", { emergency: true, priority: 0, rationale: "titrate" });
    const r = computeDoNow(input({ signals: sig({ opioid: true }), actions: { D: [nal] } }));
    expect(r.top).toEqual([
      expect.objectContaining({
        label: "Naloxone → back to B",
        because: "titrate",
        kind: "action",
      }),
    ]);
  });
  it("SV-DN-05: no naloxone item once naloxone is performed", () => {
    const nal = act("D", "d_naloxone", { emergency: true, state: "performed" });
    expect(ids(input({ signals: sig({ opioid: true }), actions: { D: [nal] } }))).toEqual([]);
  });
});

describe("system prompts and the rest", () => {
  it("SV-DN-06: allergies prompt only when not recorded AND a first drug is pending", () => {
    expect(ids(input({ allergiesRecorded: false, firstDrugPending: true }))).toEqual([
      "allergies:E",
    ]);
    expect(ids(input({ allergiesRecorded: false, firstDrugPending: false }))).toEqual([]);
    expect(ids(input({ allergiesRecorded: true, firstDrugPending: true }))).toEqual([]);
  });
  it("SV-DN-07: glucose prompt only when the D board lacks its check-glucose action", () => {
    expect(ids(input({ signals: sig({ glucoseMissing: true }) }))).toEqual(["glucose:D"]);
    const chk = act("D", "d_check_glucose", { emergency: true, priority: -1 });
    expect(ids(input({ signals: sig({ glucoseMissing: true }), actions: { D: [chk] } }))).toEqual([
      "action:D:d_check_glucose",
    ]);
  });
  it("SV-DN-08: an intervention after the last vitals → Re-check vitals", () => {
    const r = computeDoNow(input({ signals: sig({ vitalsStale: true }) }));
    expect(r.top[0]).toMatchObject({ kind: "vitals_stale", label: "Re-check vitals" });
  });
  it("SV-DN-09: core temperature prompt unless E already carries its measure action", () => {
    expect(ids(input({ signals: sig({ coreTempMissing: true }) }))).toEqual(["core_temp:E"]);
    const m = act("E", "e_measure_temp", { emergency: true, priority: -1, state: "failed" });
    expect(ids(input({ signals: sig({ coreTempMissing: true }), actions: { E: [m] } }))).toEqual([
      "action:E:e_measure_temp",
    ]);
  });
  it("SV-DN-10: every outstanding action appears once; done / deferred / N/A never", () => {
    const i = input({
      actions: {
        B: [
          act("B", "b1", { state: "performed" }),
          act("B", "b2", { state: "deferred" }),
          act("B", "b3", { state: "not_indicated" }),
          act("B", "b4"),
          act("B", "b5", { state: "in_progress" }),
        ],
      },
    });
    expect(ids(i)).toEqual(["action:B:b4", "action:B:b5"]);
  });
  it("SV-DN-11: top holds the first 3; ranks run 0…n-1; same input → same output", () => {
    const i = input({
      signals: sig({ vitalsStale: true, coreTempMissing: true, glucoseMissing: true }),
      allergiesRecorded: false,
      firstDrugPending: true,
    });
    const r = computeDoNow(i);
    expect(r.top.map((x) => x.kind)).toEqual(["allergies", "glucose", "vitals_stale"]);
    expect([...r.top, ...r.rest].map((x) => x.rank)).toEqual([0, 1, 2, 3]);
    expect(computeDoNow(i)).toEqual(r);
  });
});
