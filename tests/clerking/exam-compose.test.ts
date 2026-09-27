import type { Patient } from "./exam-patients";
import { describe, expect, it } from "vitest";

import * as A from "@/lib/clerking/exam/answers";
import { composeExam, examText } from "@/lib/clerking/exam/compose";
import { evaluateExamFlags } from "@/lib/clerking/exam/flags";
import { ALL_SIGNED, ecat, scenario, toCtx } from "./exam-fixtures";
import { PATIENTS } from "./exam-patients";

/**
 * The examination paragraph and badges for the seven fixtures (snapshots, D-EX-17), and the
 * composer's properties: every positive appears, nothing unrecorded appears, links and mirrors
 * once, hints never, restricted items never in patient text.
 */

const signoff = { ...ALL_SIGNED, withheld: [] as string[] };

function run(p: Patient, audience: "clinician" | "patient" = "clinician") {
  const x = toCtx(p.s);
  const { flags, results } = evaluateExamFlags(x, signoff);
  const blocks = composeExam({ x: { ...x, results }, results, saved: p.saved, audience });
  return { flags, results, blocks, text: examText(blocks) };
}

describe("the seven fixtures", () => {
  it.each(Object.entries(PATIENTS))("%s: note and badges", (name, make) => {
    const r = run(make());
    expect({
      note: r.text,
      badges: r.flags.map((f) => `${f.level}: ${f.badge}`),
    }).toMatchSnapshot();
  });

  it("chest pain: the arm difference and the absent pulses", () => {
    const r = run(PATIENTS.chestPain());
    expect(r.results.get("inter_arm_difference")!.text).toBe("Difference 24 mmHg: repeat");
    expect(r.flags.map((f) => f.badge)).toContain("Absent left radial and left femoral pulse");
    expect(r.text).toMatch(/Pulses: absent left radial, absent left femoral/);
  });

  it("diabetic foot: IWGDF 3 with active ulcer, infection grade 3, SINBAD 3", () => {
    const r = run(PATIENTS.diabeticFoot());
    expect(r.results.get("iwgdf_risk")!.result).toBe("3");
    expect(r.results.get("dfi_iwgdf_idsa")!.result).toBe("3");
    expect(r.results.get("sinbad")!.value).toBe(3);
  });

  it("asthma: life-threatening, with the criteria that fired", () => {
    const r = run(PATIENTS.asthma());
    const a = r.results.get("acute_asthma_severity")!;
    expect(a.result).toBe("life_threatening");
    expect(a.reason).toBe("PEF 30% of best or predicted, SpO₂ 91%");
  });

  it("pneumonia: CRB65 4", () => {
    expect(run(PATIENTS.pneumonia()).results.get("crb65")!.value).toBe(4);
  });

  it("stroke: ROSIER +3", () => {
    expect(run(PATIENTS.stroke()).results.get("rosier")!.text).toBe("ROSIER +3");
  });

  it("the badges name findings, values and scales, never an unmade diagnosis (E5, D-EX-16)", () => {
    for (const make of Object.values(PATIENTS))
      for (const f of run(make()).flags)
        expect(f.badge).not.toMatch(/\b(possible|probable|suspected|likely)\b/i);
  });
});

describe("composer properties", () => {
  const presenceItems = ecat.items.filter(
    (i) => ["presence", "test", "state"].includes(i.response.type) && i.sensitivity === "standard",
  );

  it("every positive appears; no unrecorded item appears; hints never (200 random sets)", () => {
    for (let n = 0; n < 200; n++) {
      const s = scenario();
      const picked = presenceItems.filter(() => Math.random() < 0.08);
      for (const it of picked)
        s.exam = A.setState(ecat, s.exam, it.id, Math.random() < 0.5 ? "positive" : "negative");
      if (!Object.keys(s.exam.entries).length) continue;
      const { text } = run({ s, saved: { values: s.vitals } });
      for (const it of picked) {
        const e = s.exam.entries[it.id]!;
        const phrase = e.state === "positive" ? it.phrase!.positive : it.phrase!.negative;
        expect(text.toLowerCase(), `${it.id} ${e.state}`).toContain(phrase.toLowerCase());
      }
      const written = picked
        .flatMap((i) => [i.phrase!.positive, i.phrase!.negative])
        .join(" | ")
        .toLowerCase();
      for (const it of presenceItems.filter((i) => !picked.includes(i))) {
        const neg = it.phrase!.negative.toLowerCase();
        if (neg.length > 12 && !written.includes(neg))
          expect(text.toLowerCase(), it.id).not.toContain(neg);
      }
      for (const it of ecat.items) if (it.hint?.text) expect(text).not.toContain(it.hint.text);
      expect(text).not.toMatch(/GTFCC plan|stage \d hint|motor neurone pattern/i);
    }
  });

  it("links and mirrors are written once, by their owner", () => {
    const s = scenario();
    s.exam = A.setAttr(ecat, s.exam, "ex.general.hiv_associated_signs", "seen", "oral_candidiasis");
    s.exam = A.setAttr(ecat, s.exam, "ex.general.hand_signs", "signs", "palmar_erythema");
    s.exam = A.setState(ecat, s.exam, "ex.abdomen.liver_stigmata", "positive");
    const { text } = run({ s, saved: { values: s.vitals } });
    expect(text.match(/oral thrush|oral candidiasis/gi)).toHaveLength(1);
    expect(text.match(/palmar erythema/gi)).toHaveLength(1);
  });

  it("restricted items and options never reach patient-facing text", () => {
    const s = scenario({ patient: { ageYears: 40, sex: "male", pregnant: null } });
    s.exam = A.setAttr(
      ecat,
      s.exam,
      "ex.general.hiv_associated_signs",
      "seen",
      "oral_hairy_leukoplakia",
    );
    s.exam = A.setAttr(ecat, s.exam, "ex.general.mouth", "signs", "purple_kaposi_like_lesion");
    s.exam = A.setAttr(ecat, s.exam, "ex.abdomen.liver_stigmata", "seen", "testicular_atrophy");
    s.exam = A.setState(ecat, s.exam, "ex.rectal_genital.scrotum_testes", "positive");
    const clinician = run({ s, saved: { values: s.vitals } }).text;
    const patient = run({ s, saved: { values: s.vitals } }, "patient").text;
    expect(clinician).toMatch(/HIV-associated signs/);
    expect(clinician).toMatch(/Kaposi/i);
    for (const word of [/HIV/, /Kaposi/i, /testicular/i, /scrot/i, /leukoplakia/i])
      expect(patient).not.toMatch(word);
  });
});
