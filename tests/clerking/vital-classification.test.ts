import type { BpScheme, VitalCtx } from "@/lib/clerking/vital-classification";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { deriveExam } from "@/components/clerking/exam/model";
import { VitalsCard } from "@/components/clerking/exam/vitals-card";
import { bodyRows, historyOf, vitalsView } from "@/components/clerking/model";
import { ClerkingRail } from "@/components/clerking/rail";
import { formatters } from "@/components/emr/format";
import { EXAM_CATALOGUE as ecat } from "@/lib/clerking/exam/load";
import { linkedAnswers } from "@/lib/clerking/linkage";
import { classifyVital } from "@/lib/clerking/vital-classification";
import { scoreNews2 } from "@/lib/triage/scoring/news2";
import { cat, THREE3_VITALS, v2Payload } from "./fixtures";
import { text } from "./press";

/**
 * Standard vital-sign classifications beside NEWS2 (data/clerking/vital-classification.v1.json):
 * every band edge of every scheme, the higher-category rule, adults only, SpO₂ scale 2, and the
 * rail showing the label while keeping its NEWS2 sub-score. Then the anthropometry fix: a saved
 * weight and height stay in sight in the card and appear in the rail with BMI and its WHO class.
 */

const ADULT: VitalCtx = { ageYears: 40 };
const bp = (sbp: number, dbp: number, bpScheme: BpScheme = "aha") =>
  classifyVital("bp", { sbp, dbp }, { ...ADULT, bpScheme });
const label = (r: ReturnType<typeof classifyVital>) => r && `${r.label}|${r.tone}`;

describe("blood pressure, each scheme band by band", () => {
  it("AHA/ACC 2017 (the default)", () => {
    expect(classifyVital("bp", { sbp: 119, dbp: 79 }, ADULT)?.scheme).toBe("ACC/AHA 2017");
    expect(label(bp(119, 79))).toBe("Normal|normal");
    expect(label(bp(120, 79))).toBe("Elevated|caution");
    expect(label(bp(129, 79))).toBe("Elevated|caution");
    expect(label(bp(130, 79))).toBe("Stage 1 hypertension|caution");
    expect(label(bp(119, 80))).toBe("Stage 1 hypertension|caution");
    expect(label(bp(130, 80))).toBe("Stage 1 hypertension|caution");
    expect(label(bp(139, 89))).toBe("Stage 1 hypertension|caution");
    expect(label(bp(140, 89))).toBe("Stage 2 hypertension|caution");
    expect(label(bp(139, 90))).toBe("Stage 2 hypertension|caution");
    expect(label(bp(180, 120))).toBe("Stage 2 hypertension|caution");
    expect(label(bp(181, 100))).toBe("Hypertensive crisis|critical");
    expect(label(bp(150, 121))).toBe("Hypertensive crisis|critical");
  });

  it("ESC/ESH 2018, with isolated systolic hypertension graded by systolic", () => {
    expect(label(bp(119, 79, "esh"))).toBe("Optimal|normal");
    expect(label(bp(120, 79, "esh"))).toBe("Normal|normal");
    expect(label(bp(119, 84, "esh"))).toBe("Normal|normal");
    expect(label(bp(130, 84, "esh"))).toBe("High-normal|caution");
    expect(label(bp(139, 89, "esh"))).toBe("High-normal|caution");
    expect(label(bp(140, 85, "esh"))).toBe("Grade 1 hypertension (isolated systolic)|caution");
    expect(label(bp(139, 90, "esh"))).toBe("Grade 1 hypertension|caution");
    expect(label(bp(159, 99, "esh"))).toBe("Grade 1 hypertension|caution");
    expect(label(bp(160, 99, "esh"))).toBe("Grade 2 hypertension|caution");
    expect(label(bp(150, 100, "esh"))).toBe("Grade 2 hypertension|caution");
    expect(label(bp(179, 109, "esh"))).toBe("Grade 2 hypertension|caution");
    expect(label(bp(180, 80, "esh"))).toBe("Grade 3 hypertension (isolated systolic)|caution");
    expect(label(bp(150, 110, "esh"))).toBe("Grade 3 hypertension|caution");
  });

  it("ISH 2020", () => {
    expect(label(bp(129, 84, "ish"))).toBe("Normal|normal");
    expect(label(bp(130, 84, "ish"))).toBe("High-normal|caution");
    expect(label(bp(129, 85, "ish"))).toBe("High-normal|caution");
    expect(label(bp(140, 89, "ish"))).toBe("Grade 1 hypertension|caution");
    expect(label(bp(159, 99, "ish"))).toBe("Grade 1 hypertension|caution");
    expect(label(bp(160, 80, "ish"))).toBe("Grade 2 hypertension|caution");
    expect(label(bp(200, 130, "ish"))).toBe("Grade 2 hypertension|caution");
  });

  it("Uganda Clinical Guidelines 2023 (160/100 assigned to stage 2, a CSO ruling)", () => {
    expect(label(bp(119, 79, "ucg"))).toBe("Normal|normal");
    expect(label(bp(120, 79, "ucg"))).toBe("Pre-hypertension|caution");
    expect(label(bp(119, 80, "ucg"))).toBe("Pre-hypertension|caution");
    expect(label(bp(139, 89, "ucg"))).toBe("Pre-hypertension|caution");
    expect(label(bp(140, 70, "ucg"))).toBe("Hypertension, stage 1|caution");
    expect(label(bp(159, 99, "ucg"))).toBe("Hypertension, stage 1|caution");
    expect(label(bp(160, 99, "ucg"))).toBe("Hypertension, stage 2|caution");
    expect(label(bp(150, 100, "ucg"))).toBe("Hypertension, stage 2|caution");
  });

  it("the higher category applies when systolic and diastolic disagree", () => {
    expect(label(bp(118, 95))).toBe("Stage 2 hypertension|caution");
    expect(label(bp(165, 70, "esh"))).toBe("Grade 2 hypertension (isolated systolic)|caution");
    expect(label(bp(125, 105, "ish"))).toBe("Grade 2 hypertension|caution");
  });

  it("no label in pregnancy, under 18, or with age unknown", () => {
    expect(classifyVital("bp", { sbp: 150, dbp: 95 }, { ageYears: 30, pregnant: true })).toBeNull();
    expect(classifyVital("bp", { sbp: 150, dbp: 95 }, { ageYears: 17 })).toBeNull();
    expect(classifyVital("pulse", 130, { ageYears: 17 })).toBeNull();
    expect(classifyVital("temp", 39, { ageYears: null })).toBeNull();
    expect(classifyVital("pulse", 80, { ageYears: 18 })?.label).toBe("Normal");
  });
});

describe("pulse, respiratory rate, temperature, SpO₂, glucose", () => {
  const one = (kind: Parameters<typeof classifyVital>[0], n: number | string, ctx = ADULT) =>
    label(classifyVital(kind, n, ctx));

  it("pulse: below 60, 60–100, above 100", () => {
    expect(one("pulse", 59)).toBe("Bradycardia|caution");
    expect(one("pulse", 60)).toBe("Normal|normal");
    expect(one("pulse", 100)).toBe("Normal|normal");
    expect(one("pulse", 101)).toBe("Tachycardia|caution");
  });

  it("respiratory rate: below 12, 12–20, above 20", () => {
    expect(one("rr", 11)).toBe("Bradypnoea|caution");
    expect(one("rr", 12)).toBe("Normal|normal");
    expect(one("rr", 20)).toBe("Normal|normal");
    expect(one("rr", 21)).toBe("Tachypnoea|caution");
  });

  it("temperature: hypothermia is critical; raised and fever amber", () => {
    expect(one("temp", 34.9)).toBe("Hypothermia|critical");
    expect(one("temp", 35.0)).toBe("Normal|normal");
    expect(one("temp", 37.4)).toBe("Normal|normal");
    expect(one("temp", 37.5)).toBe("Raised|caution");
    expect(one("temp", 37.9)).toBe("Raised|caution");
    expect(one("temp", 38.0)).toBe("Fever|caution");
    expect(one("temp", 41)).toBe("Fever|caution");
  });

  it("SpO₂ scale 1: below 90 is hypoxaemia (critical), 90–94 low, 95 and over normal", () => {
    expect(one("spo2", 89)).toBe("Hypoxaemia|critical");
    expect(one("spo2", 90)).toBe("Low|caution");
    expect(one("spo2", 94)).toBe("Low|caution");
    expect(one("spo2", 95)).toBe("Normal|normal");
  });

  it("SpO₂ scale 2: against the 88–92% target, above it only a concern on oxygen", () => {
    const s2 = (n: number, oxygen: "air" | "oxygen" | null) =>
      one("spo2", n, { ...ADULT, spo2Scale: "scale2", oxygen });
    expect(s2(87, "oxygen")).toBe("Below target|caution");
    expect(s2(88, "oxygen")).toBe("On target|normal");
    expect(s2(92, "air")).toBe("On target|normal");
    expect(s2(93, "oxygen")).toBe("Above target on oxygen|caution");
    expect(s2(93, null)).toBe("Above target on oxygen|caution");
    expect(s2(96, "air")).toBe("Above 92% on air|normal");
  });

  it("glucose: hypoglycaemia levels and the meter's HI/LO only; no label from 3.9", () => {
    expect(one("glucose", 2.9)).toBe("Hypoglycaemia, level 2|critical");
    expect(one("glucose", 3.0)).toBe("Hypoglycaemia, level 1|caution");
    expect(one("glucose", "3.8")).toBe("Hypoglycaemia, level 1|caution");
    expect(one("glucose", 3.9)).toBeNull();
    expect(one("glucose", 25)).toBeNull();
    expect(one("glucose", "LO")).toBe("Meter reads LO|critical");
    expect(one("glucose", "hi")).toBe("Meter reads HI|critical");
  });
});

/* ─── The rail ───────────────────────────────────────────────────── */

function exam(p = v2Payload()) {
  const content = p.draft!.content;
  const history = historyOf(content);
  return deriveExam({
    ecat,
    cat,
    p,
    content,
    history,
    linked: linkedAnswers(cat, history.complaints),
  });
}

describe("the rail: the classification beside NEWS2, with the BP switch", () => {
  const p = v2Payload();
  const vitals = { ...THREE3_VITALS, systolicBp: 150 };
  const rail = (bpScheme: BpScheme) => {
    const v = vitalsView(vitals, p.context.vitals, { ageYears: 76, bpScheme, dbp: 85 });
    return {
      v,
      m: renderToStaticMarkup(
        h(ClerkingRail, {
          p,
          fmt: formatters(p.timeZone),
          vitals: v,
          alarm: true,
          bp: { scheme: bpScheme, onScheme: () => {} },
        }),
      ),
    };
  };

  it("labels each reading and keeps every NEWS2 sub-score and the banner", () => {
    const { v, m } = rail("aha");
    const t = text(m);
    expect(v.rows.find((r) => r.key === "systolic_bp")).toMatchObject({
      value: "150/85",
      cls: { label: "Stage 2 hypertension", tone: "caution", scheme: "ACC/AHA 2017" },
    });
    expect(v.rows.find((r) => r.key === "pulse")?.cls?.label).toBe("Bradycardia");
    expect(v.rows.find((r) => r.key === "respiratory_rate")?.cls?.label).toBe("Normal");
    expect(v.rows.find((r) => r.key === "spo2")?.cls?.label).toBe("Normal");
    expect(v.rows.find((r) => r.key === "temperature")?.cls).toMatchObject({
      label: "Hypothermia",
      tone: "critical",
    });
    expect(t).toContain("Bradycardia");
    expect(t).toContain("Hypothermia");
    expect(t).toContain("Temperature 32.5 °C scores 3 on its own. Re-measure now.");
    expect(m).toMatch(/title="NEWS2 score 3" class="[^"]*status-critical/);
    expect(m).toMatch(/title="NEWS2 score 1" class="[^"]*status-caution/);
    // NEWS2 is untouched by the classification.
    expect(v.news2).toEqual(vitalsView(vitals, p.context.vitals).news2);
  });

  it("the switch sits by blood pressure and changes only its label", () => {
    const aha = rail("aha");
    const esh = rail("esh");
    expect(text(aha.m)).toMatch(/AHA ESH ISH Uganda/);
    expect(aha.m).toMatch(/aria-label="Blood pressure classification"/);
    expect(aha.m).toMatch(/aria-pressed="true"[^>]*>AHA</);
    expect(esh.m).toMatch(/aria-pressed="true"[^>]*>ESH</);
    expect(esh.v.rows.find((r) => r.key === "systolic_bp")?.cls).toMatchObject({
      label: "Grade 1 hypertension (isolated systolic)",
      scheme: "ESC/ESH 2018",
    });
    expect(esh.v.rows.find((r) => r.key === "pulse")?.cls).toEqual(
      aha.v.rows.find((r) => r.key === "pulse")?.cls,
    );
  });

  it("no ctx (and so no age) leaves the rail as it was", () => {
    expect(vitalsView(vitals, p.context.vitals).rows.every((r) => !r.cls)).toBe(true);
  });
});

/* ─── Anthropometry stays in sight after a save ─────────────────── */

describe("a saved weight and height (72 kg, 170 cm)", () => {
  const p = v2Payload();
  const latest = { ...p.clerking!.exam.latest, weight: 72, height: 170 };
  p.clerking!.exam.latest = latest;
  const ev = exam(p);

  it("the card shows each under its now-empty field with the last-set label", () => {
    const m = renderToStaticMarkup(
      h(VitalsCard, {
        v: ev,
        editable: true,
        act: true,
        onExam: () => {},
        onSave: async () => true,
        onGo: () => {},
        triage: {
          label: "Last set 11:23",
          at: "2026-09-27T08:23:00.000Z",
          values: latest,
          news2: scoreNews2(THREE3_VITALS),
          acvpu: null,
          oxygen: null,
        },
        time: () => "11:23",
      }),
    );
    const t = text(m);
    expect(t).toContain("Last set 11:23: 72 kg");
    expect(t).toContain("Last set 11:23: 170 cm");
    expect(t).toContain("Last set 11:23: not recorded"); // waist
    expect(t).toContain("24.9");
  });

  it("the rail lists weight, height and BMI 24.9 with its WHO class", () => {
    const body = bodyRows(latest, ev.x, p.clerking!.exam.signoff);
    expect(body.map((r) => `${r.label} ${r.value}`)).toEqual([
      "Weight 72",
      "Height 170",
      "BMI 24.9",
    ]);
    expect(body[2]!.cls).toMatchObject({ label: "Normal weight", tone: "normal" });
    const t = text(
      renderToStaticMarkup(
        h(ClerkingRail, { p, fmt: formatters(p.timeZone), vitals: null, body, alarm: false }),
      ),
    );
    expect(t).toMatch(/Weight 72 kg Height 170 cm BMI 24\.9 kg\/m² Normal weight/);
  });

  it("without the exam catalogue the numbers still show, unclassified", () => {
    expect(bodyRows(latest).map((r) => r.cls ?? null)).toEqual([null, null, null]);
  });
});
