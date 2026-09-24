import { describe, expect, it } from "vitest";

import { FINDING_GROUPS, STEP_PRESENTATION } from "@/lib/resus/reference/presentation";
import { promotedCodes, searchFindings, visibleFindings } from "@/lib/resus/survey/disclosure";
import { ABCDE_LETTERS } from "@/lib/resus/types";
import { flags } from "./survey-fixtures";

/** GATE A §3 — overall / key / promoted / more / search (SV-DIS-01..07). */

const view = (step: (typeof ABCDE_LETTERS)[number], over = {}, selected: string[] = [], q = "") =>
  visibleFindings(step, { flags: flags(over), selected, query: q });

describe("tiers", () => {
  it("SV-DIS-01: overall is the step's state (patency) codes; C leaves arrest to the arrest state", () => {
    expect(view("A").overall).toEqual([
      "patent_talking",
      "patent_at_risk",
      "partially_obstructed",
      "completely_obstructed",
      "apnoeic",
    ]);
    expect(view("C").overall).not.toContain("arrest");
    expect(view("D").overall).toHaveLength(5);
    expect(view("E").overall).toHaveLength(4);
  });
  it("SV-DIS-02: every step has at most 8 key signs, A's as signed", () => {
    for (const s of ABCDE_LETTERS) expect(view(s).key.length).toBeLessThanOrEqual(8);
    expect(view("A").key).toContain("gcs_le8");
    expect(view("E").key).toHaveLength(7);
  });
  it("SV-DIS-07: derived lists the step's vitals-derived codes", () => {
    expect(view("C").derived).toContain("narrow_pulse_pressure");
    expect(view("E").derived).toEqual([]);
  });
});

describe("SV-DIS-03 — promotion by context", () => {
  it("SV-DIS-03: no flags → nothing promoted", () => {
    for (const s of ABCDE_LETTERS) expect(view(s).promoted).toEqual([]);
  });
  it("SV-DIS-03: Trauma promotes A facial/neck trauma and neck swelling", () => {
    expect(view("A", { trauma: true }).promoted).toEqual(["facial_neck_trauma", "swelling_neck"]);
  });
  it("SV-DIS-03: two active flags share the cap round-robin (each leads with its first code)", () => {
    expect(promotedCodes("C", flags({ trauma: true, allergenTrigger: true }))).toEqual([
      "pelvic_instability",
      "urticaria_angioedema",
      "long_bone_deformity",
      "abdominal_distension",
    ]);
  });
  it("SV-DIS-03: B at maximum promotion shows 4 — one per active flag", () => {
    const f = { chestTrauma: true, knownAsthma: true, copdRisk: true, allergenTrigger: true };
    expect(view("B", f).promoted).toEqual([
      "flail_segment",
      "pef_33_50",
      "resp_acidosis",
      "stridor",
    ]);
  });
  it("SV-DIS-03: D is capped at 2 (Head injury)", () => {
    expect(view("D", { headInjury: true }).promoted).toEqual([
      "bilateral_fixed_dilated",
      "cushings_triad",
    ]);
  });
  it("SV-DIS-03: Active bleeding alone promotes the C bleeding signs; pregnancy promotes β-hCG", () => {
    expect(view("C", { activeBleeding: true }).promoted).toHaveLength(4);
    expect(view("C", { pregnancy: "possible" }).promoted).toEqual(["bhcg_positive"]);
  });
  it("SV-DIS-03: E trauma + environmental exposure → back, burns, pelvis, long bone", () => {
    expect(view("E", { trauma: true, environmentalExposure: true }).promoted).toEqual([
      "back_finding",
      "burns_blistering",
      "pelvic_instability",
      "long_bone_deformity",
    ]);
  });
  it("SV-DIS-03: promotion never exceeds any step's cap with every flag on", () => {
    const all = flags({
      trauma: true,
      chestTrauma: true,
      headInjury: true,
      activeBleeding: true,
      allergenTrigger: true,
      pregnancy: "confirmed",
      knownAsthma: true,
      copdRisk: true,
      febrileChild: true,
      environmentalExposure: true,
    });
    for (const s of ABCDE_LETTERS)
      expect(promotedCodes(s, all).length).toBeLessThanOrEqual(STEP_PRESENTATION[s].promotionCap);
  });
});

describe("SV-DIS-04 / 05 — more signs and selected findings", () => {
  it("SV-DIS-04: key + promoted + more cover every catalog code exactly once", () => {
    for (const s of ABCDE_LETTERS) {
      const v = view(s, { trauma: true, allergenTrigger: true });
      const listed = [...v.key, ...v.promoted, ...FINDING_GROUPS.flatMap((g) => v.more[g])];
      expect(new Set(listed).size).toBe(listed.length);
      expect(new Set(listed)).toEqual(new Set(STEP_PRESENTATION[s].findings.map((f) => f.code)));
    }
  });
  it("SV-DIS-04: labs / ECG / ultrasound sit under Results; derived codes under Measure", () => {
    const c = view("C");
    expect(c.more.results).toEqual(
      expect.arrayContaining(["lactate_raised", "ecg_pe", "us_tamponade"]),
    );
    expect(c.more.measure).toEqual(expect.arrayContaining(["tachycardia", "hypotension"]));
    expect(view("B").more.measure).toContain("rr_raised");
  });
  it("SV-DIS-04: a promoted code leaves More", () => {
    expect(view("A").more.feel.concat(view("A").more.look)).toContain("facial_neck_trauma");
    expect(view("A", { trauma: true }).more.look).not.toContain("facial_neck_trauma");
  });
  it("SV-DIS-05: a selected More code is surfaced in selectedExtra and leaves More", () => {
    const v = view("C", {}, ["lactate_severe"]);
    expect(v.selectedExtra).toEqual(["lactate_severe"]);
    expect(v.more.results).not.toContain("lactate_severe");
  });
  it("SV-DIS-05: a selected key or promoted code is not duplicated", () => {
    expect(view("A", { trauma: true }, ["gurgling", "swelling_neck"]).selectedExtra).toEqual([]);
  });
  it("SV-DIS-05: a selected code outside the catalog (legacy) is still visible", () => {
    expect(view("A", {}, ["legacy_code"]).selectedExtra).toEqual(["legacy_code"]);
  });
});

describe("SV-DIS-06 — search", () => {
  it("SV-DIS-06: 'tension' finds the B tension signs by synonym", () => {
    expect(searchFindings("B", "tension")).toEqual(
      expect.arrayContaining(["trachea_deviated_away", "reduced_breath_sounds", "hyper_resonant"]),
    );
  });
  it("SV-DIS-06: synonyms are per step — 'tension' in C finds C's own codes only", () => {
    const c = searchFindings("C", "tension");
    expect(c).toEqual(
      expect.arrayContaining(["tracheal_deviation", "unilateral_absent_breath_sounds"]),
    );
    expect(c).not.toContain("trachea_deviated_away"); // a B code
    expect(c).toContain("abdominal_distension"); // label substring "dis-tension"
  });
  it("SV-DIS-06: labels match case-insensitively by substring", () => {
    expect(searchFindings("A", "STRIDOR")).toEqual(["stridor_inspiratory"]);
    expect(searchFindings("C", "cap refill")).toEqual(["cap_refill_delayed", "cap_refill_poor"]);
  });
  it("SV-DIS-06: a partial synonym term matches ('anaph' → anaphylaxis)", () => {
    expect(searchFindings("E", "anaph")).toContain("urticaria_angioedema");
  });
  it("SV-DIS-06: an empty or blank query matches nothing", () => {
    expect(view("A", {}, [], "   ").matches).toEqual([]);
  });
});
