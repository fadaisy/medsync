import type { HandoverInput } from "@/lib/resus/closeout/handover";
import { describe, expect, it } from "vitest";

import { buildSbar } from "@/lib/resus/closeout/handover";
import { NO_SUGGESTION_TEXT } from "@/lib/resus/reference/levels-of-care";

const FULL: HandoverInput = {
  patient: { label: "Bed 3", ageYears: 54, sex: "Female" },
  trigger: "Triage Red (rapid)",
  phase: "post_rosc",
  outcome: "rosc_sustained",
  treatmentLimitation: null,
  ample: {
    allergies: ["Penicillin"],
    medications: "Metformin",
    past: "Type 2 diabetes",
    lastMeal: "08:00",
    events: "Collapsed at home",
  },
  weightKg: 70,
  steps: [
    { step: "B", state: "Threatened", findings: ["Crackles"] },
    { step: "A", state: "Secure", findings: [] },
    { step: "C", state: "Compensated shock", findings: ["Cold peripheries", "CRT > 2 s"] },
    { step: "D", state: "Severe impairment", findings: [] },
    { step: "E", state: null, findings: [] },
  ],
  lastVitals: {
    snapshot: { hr: 110, rr: 22, spo2: 95, systolicBp: 104, consciousness: "V", oxygen: "oxygen" },
    atLabel: "16:55",
    trend: "HR falling",
  },
  news2: 8,
  arrest: {
    firstRhythm: "vf_pvt",
    shocks: 2,
    drugs: ["Adrenaline 1 mg IV ×1", "Amiodarone 300 mg IV ×1"],
    timeToRoscMin: 12,
    totalCprMin: 11,
    sustained: true,
  },
  devices: ["ETT 7.5", "IV 16G left ACF"],
  outstandingActions: ["12-lead ECG"],
  targets: ["SpO₂ 94–98 %", "MAP ≥ 65 and SBP > 100"],
  pendingInvestigations: ["ABG"],
  level: { suggested: "l3", chosen: "l2" },
  escortNeeds: ["Doctor with airway skills"],
};

const EMPTY: HandoverInput = {
  patient: { label: "Unknown patient", ageYears: null, sex: null },
  trigger: "In-resus deterioration",
  phase: "survey",
  outcome: null,
  treatmentLimitation: null,
  ample: null,
  weightKg: null,
  steps: [],
  lastVitals: null,
  news2: null,
  arrest: null,
  devices: [],
  outstandingActions: [],
  targets: [],
  pendingInvestigations: [],
  level: { suggested: null, chosen: null },
  escortNeeds: [],
};

const sbar = buildSbar(FULL);

describe("CO-HO — SBAR draft", () => {
  it("CO-HO-01: the draft has all four SBAR sections", () => {
    expect(Object.keys(sbar)).toEqual(["situation", "background", "assessment", "recommendation"]);
  });

  it("CO-HO-02: S — who, trigger, mode and outcome", () => {
    expect(sbar.situation).toBe(
      "Bed 3, 54 y, Female.\nTrigger: Triage Red (rapid).\nMode: post-ROSC; outcome: ROSC, sustained.",
    );
  });

  it("CO-HO-02: S — a treatment-limitation decision is stated when present", () => {
    const s = buildSbar({ ...FULL, treatmentLimitation: "Not for re-intubation" }).situation;
    expect(s.endsWith("Treatment limitation: Not for re-intubation.")).toBe(true);
  });

  it("CO-HO-02: S — missing age and sex are simply left out", () => {
    expect(buildSbar(EMPTY).situation).toBe(
      "Unknown patient.\nTrigger: In-resus deterioration.\nMode: primary survey.",
    );
  });

  it("CO-HO-02: B — AMPLE and weight", () => {
    expect(sbar.background).toBe(
      [
        "Allergies: Penicillin.",
        "Medications: Metformin.",
        "Past history: Type 2 diabetes.",
        "Last meal: 08:00.",
        "Events: Collapsed at home.",
        "Weight: 70 kg.",
      ].join("\n"),
    );
  });

  it("CO-HO-02: B — no AMPLE reads 'not recorded'; no weight line", () => {
    const b = buildSbar(EMPTY).background;
    expect(b).toContain("Allergies: not recorded.");
    expect(b).not.toContain("Weight");
  });

  it("CO-HO-02: A — steps in A–E order with key findings", () => {
    const lines = sbar.assessment.split("\n");
    expect(lines.slice(0, 5)).toEqual([
      "A: Secure.",
      "B: Threatened (Crackles).",
      "C: Compensated shock (Cold peripheries, CRT > 2 s).",
      "D: Severe impairment.",
      "E: not recorded.",
    ]);
  });

  it("CO-HO-02: A — last vitals, trend and NEWS2", () => {
    expect(sbar.assessment).toContain(
      "Last vitals at 16:55: HR 110 /min · RR 22 /min · SpO₂ 95 % · SBP 104 mmHg · ACVPU V · on O₂.",
    );
    expect(sbar.assessment).toContain("Trend: HR falling.");
    expect(sbar.assessment).toContain("NEWS2: 8.");
  });

  it("CO-HO-02: A — no vitals and no NEWS2 read 'not recorded'", () => {
    const a = buildSbar(EMPTY).assessment;
    expect(a).toContain("Last vitals: not recorded.");
    expect(a).toContain("NEWS2: not recorded.");
  });

  it("CO-HO-02: A — the arrest summary", () => {
    expect(sbar.assessment).toContain(
      "Arrest: first rhythm VF/pVT, shocks 2, drugs Adrenaline 1 mg IV ×1; Amiodarone 300 mg IV ×1, time to ROSC 12 min, total CPR 11 min, ROSC sustained.",
    );
  });

  it("CO-HO-02: A — no arrest → no arrest line", () => {
    expect(buildSbar(EMPTY).assessment).not.toContain("Arrest:");
  });

  it("CO-HO-02: A — lines, tubes and devices", () => {
    expect(sbar.assessment.endsWith("Lines, tubes, devices: ETT 7.5; IV 16G left ACF.")).toBe(true);
  });

  it("CO-HO-02: R — outstanding, targets, investigations, levels, escort", () => {
    expect(sbar.recommendation).toBe(
      [
        "Outstanding actions: 12-lead ECG.",
        "Targets: SpO₂ 94–98 %; MAP ≥ 65 and SBP > 100.",
        "Pending investigations: ABG.",
        "Level of care: suggested Level 3; chosen Level 2.",
        "Escort: Doctor with airway skills.",
      ].join("\n"),
    );
  });

  it("CO-HO-02: R — nothing outstanding reads 'none'; no suggestion reads the signed text", () => {
    const r = buildSbar(EMPTY).recommendation;
    expect(r).toContain("Outstanding actions: none.");
    expect(r).toContain(`Level of care: suggested ${NO_SUGGESTION_TEXT}; chosen not chosen.`);
    expect(r).not.toContain("suggested none");
  });

  it("CO-HO-02: R — after a death no level-of-care line is written", () => {
    for (const outcome of ["died_after_cpr", "died_cpr_not_attempted"] as const)
      expect(buildSbar({ ...EMPTY, outcome }).recommendation).not.toContain("Level of care");
  });

  it("CO-HO-02: uncollected devices, investigations and escort read 'not recorded', never 'none'", () => {
    const text = Object.values(buildSbar(EMPTY)).join("\n");
    expect(text).toContain("Lines, tubes, devices: not recorded.");
    expect(text).toContain("Pending investigations: not recorded.");
    expect(text).toContain("Escort: not recorded.");
  });

  it("CO-HO-02: B — a v2 AMPLE (pastHistory) prints its past history", () => {
    const ample = { allergies: [], pastHistory: "Hypertension" };
    expect(buildSbar({ ...EMPTY, ample }).background).toContain("Past history: Hypertension.");
  });

  it("CO-HO-02: B — an explicit NKDA reads 'none known', not 'not recorded'", () => {
    const b = buildSbar({ ...EMPTY, ample: { allergies: [], nkda: true } }).background;
    expect(b).toContain("Allergies: none known (NKDA).");
  });

  it("CO-HO-03: the same record gives the same text", () => {
    expect(buildSbar(structuredClone(FULL))).toEqual(sbar);
  });

  it("CO-HO-03: the draft does not mutate its input", () => {
    const copy = structuredClone(FULL);
    buildSbar(copy);
    expect(copy).toEqual(FULL);
  });

  it("CO-HO-03: step order in the input does not change the text", () => {
    const reversed = { ...FULL, steps: [...FULL.steps].reverse() };
    expect(buildSbar(reversed).assessment).toBe(sbar.assessment);
  });

  it("CO-HO-02: nothing outside the input appears (no invented numbers)", () => {
    const text = Object.values(buildSbar(EMPTY)).join("\n");
    expect(text.replaceAll("NEWS2", "NEWS")).not.toMatch(/\d/);
  });
});
