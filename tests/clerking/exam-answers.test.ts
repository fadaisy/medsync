import type { ExamDraft } from "@/lib/clerking/exam/payload";
import { describe, expect, it } from "vitest";

import * as A from "@/lib/clerking/exam/answers";
import { emptyExam, ExamSchema } from "@/lib/clerking/exam/payload";
import * as V from "@/lib/clerking/exam/vitals";
import { scoreNews2 } from "@/lib/triage/scoring/news2";
import { ecat, gcs, scenario } from "./exam-fixtures";

/** The answer model and vital signs (PROMPT-CLERKING-EXAM-V2 §7 answers.ts, vitals.ts; E1–E8). */

const d0 = () => emptyExam(ecat.version);

describe("answers by response type", () => {
  it("presence, test, state and device: the item's words, tap again clears, negative keeps no attributes", () => {
    for (const id of [
      "ex.general.clubbing",
      "ex.nervous.kernig",
      "ex.respiratory.trachea",
      "ex.general.urinary_catheter",
    ]) {
      let d = A.setState(ecat, d0(), id, "positive");
      expect(d.entries[id]).toEqual({ state: "positive" });
      d = A.setState(ecat, d, id, "positive");
      expect(d.entries[id]).toBeUndefined();
      const words = A.pairWords(ecat.item(id)!)!;
      expect(words.negative).not.toBe(words.positive);
    }
    expect(A.pairWords(ecat.item("ex.respiratory.trachea")!)).toEqual({
      negative: "Central",
      positive: "Deviated",
    });
    expect(A.pairWords(ecat.item("ex.general.urinary_catheter")!)).toEqual({
      negative: "None",
      positive: "In place",
    });
    let d = A.setAttr(ecat, d0(), "ex.general.clubbing", "grade", "3");
    expect(d.entries["ex.general.clubbing"]!.state).toBe("positive"); // a property implies the finding
    d = A.setState(ecat, d, "ex.general.clubbing", "negative");
    expect(d.entries["ex.general.clubbing"]).toEqual({ state: "negative" });
  });

  it("Normal/Abnormal words appear only on state items (E1)", () => {
    for (const it of ecat.items) {
      const w = A.pairWords(it);
      if (!w || it.response.type === "state") continue;
      expect(`${w.negative} ${w.positive}`, it.id).not.toMatch(/\b(Normal|Abnormal)\b/);
    }
  });

  it("choice: expected options record negative; the same option clears; attributes follow the option", () => {
    let d = A.setChoice(ecat, d0(), "ex.general.oxygen", "room_air");
    expect(d.entries["ex.general.oxygen"]).toEqual({ state: "negative", choice: "room_air" });
    d = A.setChoice(ecat, d, "ex.general.oxygen", "supplemental_oxygen");
    d = A.setAttr(ecat, d, "ex.general.oxygen", "modality", "nasal_cannula");
    d = A.setAttr(ecat, d, "ex.general.oxygen", "flow_nasal", 2);
    expect(d.entries["ex.general.oxygen"]).toEqual({
      state: "positive",
      choice: "supplemental_oxygen",
      attrs: { modality: "nasal_cannula", flow_nasal: 2 },
    });
    // Changing the modality hides the nasal flow, which is dropped (E8).
    d = A.setAttr(ecat, d, "ex.general.oxygen", "modality", "cpap");
    expect(d.entries["ex.general.oxygen"]!.attrs).toEqual({ modality: "cpap" });
    d = A.setChoice(ecat, d, "ex.general.oxygen", "supplemental_oxygen");
    expect(d.entries["ex.general.oxygen"]).toBeUndefined();
  });

  it("an untouched stepper stores nothing; steppers respect min and max", () => {
    const a = ecat.attribute("ex.general.nutrition", "muac")!;
    expect(A.stepperValue(a, undefined)).toEqual({ value: 24, touched: false });
    let d = A.setAttr(ecat, d0(), "ex.general.nutrition", "signs", "muscle_wasting");
    expect(d.entries["ex.general.nutrition"]!.attrs!.muac).toBeUndefined();
    d = A.setAttr(ecat, d, "ex.general.nutrition", "muac", 99);
    expect(d.entries["ex.general.nutrition"]!.attrs!.muac).toBe(60);
  });

  it("mirrors write their owner once; a read-only mirror does nothing; shared attributes edit one fact", () => {
    let d = A.setAttr(ecat, d0(), "ex.general.hiv_associated_signs", "seen", "oral_candidiasis");
    expect(d.entries["ex.general.mouth"]!.attrs!.signs).toEqual(["oral_thrush"]);
    expect(d.entries["ex.general.hiv_associated_signs"]!.attrs).toBeUndefined();
    expect(A.readAttr(ecat, d, "ex.general.hiv_associated_signs", "seen")).toEqual([
      "oral_candidiasis",
    ]);
    d = A.setAttr(ecat, d, "ex.general.hiv_associated_signs", "seen", "oral_candidiasis");
    expect(d.entries["ex.general.mouth"]).toBeUndefined(); // untick clears an owner left empty
    // Kaposi-like lesions are read-only under HIV signs (two owners).
    const before = d;
    d = A.setAttr(ecat, d, "ex.general.hiv_associated_signs", "seen", "kaposi_sarcoma_lesions");
    expect(d).toBe(before);
    d = A.setAttr(ecat, d, "ex.skin.lesions", "type", "purple_plaque_or_nodule");
    expect(A.readAttr(ecat, d, "ex.general.hiv_associated_signs", "seen")).toEqual([
      "kaposi_sarcoma_lesions",
    ]);
    // Distress (respiratory) and work of breathing are one fact.
    d = A.setAttr(ecat, d0(), "ex.general.distress", "type", "respiratory");
    d = A.setAttr(ecat, d, "ex.general.distress", "respiratory_signs", "grunting");
    expect(d.entries["ex.respiratory.work_of_breathing"]).toEqual({
      state: "positive",
      attrs: { signs: ["grunting"] },
    });
    expect(A.readAttr(ecat, d, "ex.general.distress", "respiratory_signs")).toEqual(["grunting"]);
    d = A.setAttr(ecat, d, "ex.respiratory.work_of_breathing", "signs", "grunting");
    expect(A.readAttr(ecat, d, "ex.general.distress", "respiratory_signs")).toBeUndefined();
  });

  it("the oedema mirror records pitting oedema of both legs on its owner", () => {
    let d = A.setAttr(
      ecat,
      d0(),
      "ex.general.nutrition",
      "signs",
      "bilateral_pitting_oedema_of_the_feet",
    );
    expect(d.entries["ex.general.oedema"]).toEqual({
      state: "positive",
      attrs: { type: "pitting", side: "both_legs" },
    });
    d = A.setAttr(ecat, d, "ex.general.nutrition", "signs", "bilateral_pitting_oedema_of_the_feet");
    expect(d.entries["ex.general.oedema"]).toBeUndefined();
  });
});

describe("Everything else normal (E2)", () => {
  it("answers only unrecorded presence, test, state and single-expected choices; never links, devices, classified, measured, blocks or oxygen", () => {
    let d = A.setState(ecat, d0(), "ex.general.pallor", "positive");
    const r = A.everythingElseNormal(ecat, d, "general", { sex: "male" });
    d = r.draft;
    expect(d.entries["ex.general.pallor"]!.state).toBe("positive"); // never changes a recorded answer
    for (const id of r.set) {
      const t = ecat.item(id)!.response.type;
      expect(["presence", "test", "state", "choice"]).toContain(t);
    }
    for (const id of [
      "ex.general.oxygen",
      "ex.general.vascular_access",
      "ex.general.hydration",
      "ex.general.nutrition",
    ])
      expect(r.set, id).not.toContain(id);
    expect(d.blocks).toEqual({});
    expect(r.set).toContain("ex.general.build"); // one expected option
    expect(r.set).not.toContain("ex.general.posture"); // three expected options: the clinician chooses
  });

  it("is idempotent and undone exactly", () => {
    const base = A.setState(ecat, d0(), "ex.respiratory.crackles", "positive");
    const once = A.everythingElseNormal(ecat, base, "respiratory", { sex: "female" });
    const twice = A.everythingElseNormal(ecat, once.draft, "respiratory", { sex: "female" });
    expect(twice.set).toEqual([]);
    expect(twice.draft.entries).toEqual(once.draft.entries);
    expect(A.applyUndo(once.draft, once.undo)).toEqual(base);
  });

  it("does nothing behind an incomplete gate, and skips items for the other sex", () => {
    expect(A.everythingElseNormal(ecat, d0(), "rectal_genital", { sex: "male" }).set).toEqual([]);
    const open = A.everythingElseNormal(ecat, d0(), "rectal_genital", {
      sex: "female",
      gateOpen: true,
    });
    expect(open.set).not.toContain("ex.rectal_genital.prostate");
  });

  it("Clear removes a system's answers and undo restores them", () => {
    let d = A.setState(ecat, d0(), "ex.abdomen.liver", "positive");
    d = A.setAttr(ecat, d, "ex.abdomen.liver", "edge", "rounded");
    const c = A.clearSystem(ecat, d, "abdomen");
    expect(c.draft.entries).toEqual({});
    expect(A.applyUndo(c.draft, c.undo)).toEqual(d);
  });
});

describe("the payload", () => {
  it("round-trips through the trust-boundary schema, ids only", () => {
    const s = scenario();
    gcs(s, 3, 4, 6, { orientation: { time: "no" } });
    let d: ExamDraft = A.setChoice(ecat, s.exam, "ex.general.oxygen", "room_air");
    d = A.setAttr(ecat, d, "ex.respiratory.crackles", "where", "r_lower_back");
    d = A.setNotExamined(d, "ex.eyes_ent_neck.fundoscopy", {
      id: "equipment_unavailable",
      equipment: "Ophthalmoscope",
    });
    d = A.fillGrid(
      d,
      "power",
      ecat.grids.power.map((r) => r.movement),
      "5",
    );
    expect(ExamSchema.parse(d)).toEqual(d);
    expect(JSON.stringify(d)).not.toMatch(/Crackles|Room air/);
  });
});

describe("vital signs", () => {
  it("parses one-field BP and decimal commas", () => {
    expect(V.parseBp("118/76")).toEqual({ sbp: 118, dbp: 76 });
    expect(V.parseBp(" 118 / 76 ")).toEqual({ sbp: 118, dbp: 76 });
    for (const bad of ["118", "118/", "76/118", "118-76", "1180/76", "abc"])
      expect(V.parseBp(bad), bad).toHaveProperty("error");
    expect(V.parseBp("")).toBeNull();
    expect(V.parseDecimal("36,8")).toBe(36.8);
    expect(V.parseDecimal("36.8")).toBe(36.8);
    expect(V.parseDecimal("3a")).toBeNull();
  });

  it("an implausible value counts only once confirmed; mg/dL becomes mmol/L", () => {
    let p = V.parseVitalsDraft(ecat, { temp: "46", glucose: "108", glucoseUnit: "mg/dL" });
    expect(p.implausible).toEqual(["temp"]);
    expect(p.values.temp).toBeNull();
    expect(p.values.glucose).toBe(6);
    p = V.parseVitalsDraft(ecat, { temp: "46", confirmed: ["temp"] });
    expect(p.values.temp).toBe(46);
  });

  it("NEWS2 is the triage engine's on 200 random sets, with air or oxygen and ACVPU from General", () => {
    for (let n = 0; n < 200; n++) {
      const r = (lo: number, hi: number) => Math.round(lo + Math.random() * (hi - lo));
      const s = scenario();
      const oxygen = Math.random() < 0.5 ? "room_air" : "supplemental_oxygen";
      s.exam = A.setChoice(ecat, s.exam, "ex.general.oxygen", oxygen);
      s.exam = {
        ...s.exam,
        blocks: {
          consciousness: { method: "acvpu", acvpu: (["A", "C", "V", "P", "U"] as const)[r(0, 4)] },
        },
      };
      const vals = {
        ...s.vitals,
        sbp: r(60, 230),
        dbp: 50,
        pulse: r(30, 160),
        rr: r(6, 40),
        spo2: r(80, 100),
        temp: r(340, 400) / 10,
      };
      const expected = scoreNews2({
        respiratoryRate: vals.rr,
        spo2: vals.spo2,
        spo2Scale: "scale1",
        oxygen: oxygen === "room_air" ? "air" : "oxygen",
        systolicBp: vals.sbp,
        pulse: vals.pulse,
        consciousness: s.exam.blocks.consciousness!.acvpu!,
        temperature: vals.temp,
      });
      expect(V.news2Of(vals, s.exam)).toEqual(expected);
      expect(expected.missing).toEqual([]);
    }
  });

  it("Save needs air or oxygen and consciousness, and glucose needs its context (E2, E6)", () => {
    const s = scenario();
    s.exam = { ...s.exam, vitalsDraft: { bp: "118/76", pulse: "58", glucose: "6.1" } };
    const no = V.saveLines(ecat, s.exam, "set-1");
    expect(no.ok).toBe(false);
    expect(!no.ok && no.missing).toEqual([
      "air or oxygen (General, attachments)",
      "consciousness (General)",
      "the glucose context",
    ]);
    s.exam = A.setChoice(ecat, s.exam, "ex.general.oxygen", "room_air");
    gcs(s, 4, 5, 6);
    s.exam = {
      ...s.exam,
      vitalsDraft: {
        ...s.exam.vitalsDraft,
        glucoseContext: "two_hours_after_food",
        position: "lying",
      },
    };
    const yes = V.saveLines(ecat, s.exam, "set-1");
    expect(yes.ok).toBe(true);
    if (!yes.ok) return;
    const by = (id: string) => yes.lines.find((l) => l.conceptId === id)!;
    expect(by("obs.bp_systolic").context).toMatchObject({
      readingSetId: "set-1",
      position: "supine",
      arm: "right",
      cuffSize: "adult",
    });
    expect(by("obs.glucose")).toMatchObject({
      fastingState: "non_fasting",
      challenge: "meal",
      challengeMinutes: 120,
      specimen: "capillary_whole_blood",
    });
    expect(by("obs.avpu").value).toEqual({ type: "coded", code: "alert" });
    expect(by("obs.gcs").value).toMatchObject({ value: 15 });
    expect(yes.lines.some((l) => l.conceptId === "obs.spo2")).toBe(false); // SpO₂ not typed
  });
});

describe("one owner per fact (E3, property)", () => {
  it("mirrored and shared facts never disagree between views after random taps", () => {
    const edges = ecat.mirrors.filter((m) => !m.readOnly && m.to[0]!.attribute && m.to[0]!.option);
    for (let n = 0; n < 200; n++) {
      let d = emptyExam(ecat.version);
      for (let k = 0; k < 12; k++) {
        const e = edges[Math.floor(Math.random() * edges.length)]!;
        const t = e.to[0]!;
        d =
          Math.random() < 0.5
            ? A.setAttr(ecat, d, e.from.item, e.from.attribute, e.from.option)
            : A.setAttr(ecat, d, t.item, t.attribute!, t.option!);
        if (Math.random() < 0.2)
          d = A.setAttr(ecat, d, "ex.general.distress", "respiratory_signs", "grunting");
        if (Math.random() < 0.2)
          d = A.setAttr(ecat, d, "ex.respiratory.work_of_breathing", "signs", "grunting");
      }
      for (const e of edges) {
        const t = e.to[0]!;
        const reader = A.readAttr(ecat, d, e.from.item, e.from.attribute);
        const owner = A.readAttr(ecat, d, t.item, t.attribute!);
        const has = (v: unknown, o: string) => (Array.isArray(v) ? v.includes(o) : v === o);
        expect(has(reader, e.from.option), `${e.from.item}:${e.from.option}`).toBe(
          has(owner, t.option!) && d.entries[t.item]?.state === "positive",
        );
        // The mirror is never stored on the reader.
        expect(has(d.entries[e.from.item]?.attrs?.[e.from.attribute], e.from.option)).toBe(false);
      }
      expect(A.readAttr(ecat, d, "ex.general.distress", "respiratory_signs")).toEqual(
        d.entries["ex.respiratory.work_of_breathing"]?.state === "positive"
          ? d.entries["ex.respiratory.work_of_breathing"]!.attrs?.signs
          : undefined,
      );
    }
  });
});

describe("payload bounds", () => {
  it("accepts an adult peak flow up to 1000 L/min", () => {
    const d = { ...emptyExam(ecat.version), panels: { peakFlow: { best: 620, reference: 700 } } };
    expect(ExamSchema.safeParse(d).success).toBe(true);
  });
});

describe("tap budgets (§4, §14)", () => {
  const NON_INTIMATE = [
    "general",
    "cardiovascular",
    "respiratory",
    "abdomen",
    "nervous",
    "spine_joints",
    "skin",
    "eyes_ent_neck",
  ];

  it("a complete normal adult examination of General and seven systems takes 25 taps (budget 26)", () => {
    let d = emptyExam(ecat.version);
    let taps = 0;
    const tap = (fn: () => void) => (fn(), taps++);
    for (const sys of NON_INTIMATE) {
      tap(() => {}); // the system's pill
      tap(() => (d = A.everythingElseNormal(ecat, d, sys, { sex: "male" }).draft)); // Everything else normal
    }
    tap(() => {}); // General: Consciousness tab
    tap(() => (d = A.setBlocks(d, { consciousness: { method: "gcs", E: 4, V: 5, M: 6 } }))); // GCS 15/15
    tap(() => {}); // General: Attachments tab
    tap(() => (d = A.setChoice(ecat, d, "ex.general.oxygen", "room_air"))); // Room air
    tap(() => {}); // Cardiovascular: Palpation tab
    tap(() => (d = A.fillGrid(d, "pulses", ecat.grids.pulses, "present"))); // All present
    tap(() => {}); // Nervous: Motor tab
    tap(
      () =>
        (d = A.fillGrid(
          d,
          "power",
          ecat.grids.power.map((r) => r.movement),
          "5",
        )),
    ); // All 5
    tap(
      () =>
        (d = A.fillGrid(
          d,
          "reflexes",
          ecat.grids.reflexes.map((r) => r.reflex),
          2,
        )),
    ); // All 2
    expect(taps).toBe(25);
    // Complete: every item with a normal answer is answered; oxygen, consciousness and grids too.
    for (const sys of NON_INTIMATE)
      for (const it of ecat.itemsOf(sys))
        if (A.normalAnswerFor(it) && it.applies_to_sex !== "female")
          expect(d.entries[it.id], it.id).toBeDefined();
    expect(d.entries["ex.general.oxygen"]?.choice).toBe("room_air");
    expect(Object.keys(d.blocks.pulses!)).toHaveLength(ecat.grids.pulses.length);
  });

  it("the back-pain focused examination takes 19 taps (budget 28)", () => {
    let d = emptyExam(ecat.version);
    let taps = 0;
    const tap = (fn: () => void = () => {}) => (fn(), taps++);
    tap(); // Spine and joints pill
    tap(); // Feel tab
    tap(() => (d = A.setState(ecat, d, "ex.spine_joints.spinal_tenderness", "negative")));
    tap(() => (d = A.everythingElseNormal(ecat, d, "spine_joints", { sex: "male" }).draft));
    tap(); // Nervous system pill
    tap(); // Motor tab
    tap(
      () =>
        (d = A.fillGrid(
          d,
          "power",
          ecat.grids.power.map((r) => r.movement),
          "5",
        )),
    );
    tap(
      () =>
        (d = A.fillGrid(
          d,
          "reflexes",
          ecat.grids.reflexes.map((r) => r.reflex),
          2,
        )),
    );
    tap(() => (d = A.setBlocks(d, { plantars: { R: "flexor" } })));
    tap(() => (d = A.setBlocks(d, { plantars: { R: "flexor", L: "flexor" } })));
    tap(); // Sensory tab
    tap(() => (d = A.setState(ecat, d, "ex.nervous.saddle_sensation", "negative")));
    tap(); // Rectal and genital pill
    // The gate: reason prefilled from the back-pain suggestion; the chaperone's name is typed.
    tap(); // Verbal consent given
    tap(); // Offered and present
    tap(
      () =>
        (d = {
          ...d,
          gate: {
            reason: "Back pain with red flags",
            consent: "verbal",
            chaperone: "present",
            name: "N. Akello",
            role: "nurse",
            at: "t",
            by: "doctor",
          },
        }),
    ); // Record and unlock
    tap(); // Digital rectal tab
    tap(() => (d = A.setState(ecat, d, "ex.rectal_genital.anal_tone", "negative")));
    tap(() => (d = A.setState(ecat, d, "ex.rectal_genital.prostate", "negative")));
    expect(taps).toBe(19);
    expect(d.entries["ex.rectal_genital.prostate"]?.state).toBe("negative");
  });
});

describe("the standard visit (clinical reference 2.12, step 6)", () => {
  it("General's seven signs take 2 taps (15 before), 6 with consciousness and air or oxygen", () => {
    let d = emptyExam(ecat.version);
    d = A.everythingElseNormal(ecat, d, "general", { sex: "male" }).draft; // pill + Everything else normal
    for (const id of [
      "ex.general.pallor",
      "ex.general.jaundice",
      "ex.general.cyanosis",
      "ex.general.clubbing",
      "ex.general.lymph_nodes",
      "ex.general.oedema",
    ])
      expect(d.entries[id]?.state, id).toBe("negative");
    // Hydration is classified: E2 leaves it for an explicit "No signs" (one more tap), as it must.
    expect(d.entries["ex.general.hydration"]).toBeUndefined();
  });
});
