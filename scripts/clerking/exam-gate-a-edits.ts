/**
 * The GATE A (examination) edits, signed by Fadhul on 2026-09-27 (SC1–SC8, TM1–TM5 in
 * docs/emr/clerking-v2/exam/gate-a-proposal.md), as code: the handoff catalogue in
 * docs/emr/clerking-v2/exam/ is never edited; the runtime copy is the handoff plus these edits.
 * tests/clerking/exam-catalogue.test.ts holds that equality.
 *
 *   npx tsx scripts/clerking/exam-gate-a-edits.ts   # rewrites data/clerking/clerking-exam-catalogue.v1.json
 */
import { readFileSync, writeFileSync } from "node:fs";

/* eslint-disable @typescript-eslint/no-explicit-any -- a one-off edit over untyped JSON */
export function applyGateAEdits(handoff: any): any {
  const c = structuredClone(handoff);
  const log: { id: string; change: string }[] = [];
  const note = (id: string, change: string) => log.push({ id, change });
  const item = (id: string) => {
    const it = c.items[id];
    if (!it) throw new Error(`no item ${id}`);
    return it;
  };
  const attr = (id: string, a: string) => {
    const x = item(id).attributes.find((t: any) => t.id === a);
    if (!x) throw new Error(`no attribute ${id}.${a}`);
    return x;
  };
  const opt = (id: string, a: string, o: string) => {
    const x = attr(id, a).options.find((t: any) => t.id === o);
    if (!x) throw new Error(`no option ${id}.${a}=${o}`);
    return x;
  };
  const rule = (id: string) => {
    const r = c.flag_rules.find((x: any) => x.id === id);
    if (!r) throw new Error(`no rule ${id}`);
    return r;
  };

  c.version = "1.0.1-draft";
  c.status = "signed-gate-a";

  /* ── Sources verified at Phase 0 (source-check.md) ── */
  for (const [id, extra] of Object.entries({
    "UCG-2023": {
      note: "Section 1.1.6 (p. 24-25): symptoms generally occur below 3.0 mmol/L. No equivalent of ADA level 1.",
    },
    ROSIER: {
      note: "Weights, the >0 cut-off and the <3.5 mmol/L pre-check checked against the NHS form (the Lancet full text was not accessible). The +1 signs count only when new.",
    },
    ITT: {
      note: "Tips of toes 1, 3 and 5 on both feet; 2 or more of 6 not felt = at risk (Rayman 2011). The count spans both feet.",
    },
    "WHO-BMI": { note: "TRS 854 (1995) p. 363: thinness grades 16, 17, 18.5." },
  })) {
    Object.assign(c.sources[id], { verified: true, checked: "2026-09-27" }, extra);
  }
  c.sources["HYPERGLYCAEMIC-CRISIS"] = {
    title:
      "ADA Standards of Care in Diabetes 2026, section 16, Table 16.1: DKA and HHS criteria (glucose 11.1 mmol/L with ketones)",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690180/",
    checked: "2026-09-27",
    verified: true,
    note: "About 10% of DKA presents with glucose below 11.1 mmol/L (euglycaemic DKA).",
  };
  note(
    "SC2",
    "HYPERGLYCAEMIC-CRISIS points to ADA 2026 §16 Table 16.1; UCG-2023, ROSIER, ITT and WHO-BMI verified.",
  );

  /* ── SC7: missing sources; unused source; blank parity sources ── */
  Object.assign(c.sources, {
    "WHO-EVD-CASEDEF": {
      title:
        "WHO. Case definition recommendations for Ebola or Marburg virus diseases, interim guideline WHO/EVD/CaseDef/14.1 (9 Aug 2014)",
      url: "https://iris.who.int/handle/10665/146397",
      checked: "2026-09-27",
      verified: true,
      note: 'Says "fever" with no number. The 38.0 °C threshold is an operational CSO value (SC5).',
    },
    "UG-IDSR-2021": {
      title:
        "MoH Uganda. National Technical Guidelines for IDSR, 3rd edition (Sep 2021): acute haemorrhagic fever syndrome, Ebola or Marburg",
      url: "https://www.afro.who.int/sites/default/files/2021-09/2_Uganda%203rd%20IDSR%20Tech%20Guideline_PrintVersion_10Sep2021.pdf",
      checked: "2026-09-27",
      verified: true,
      note: "During an outbreak, unexplained bleeding alone is a suspected case.",
    },
    "NICE-CG95": {
      title:
        "NICE CG95. Recent-onset chest pain of suspected cardiac origin (2010, updated 2016), recommendations 1.2.2.8 and 1.2.4.2",
      url: "https://www.nice.org.uk/guidance/cg95/chapter/Recommendations",
      checked: "2026-09-27",
      verified: true,
    },
    "WHO-MALARIA": {
      title:
        "WHO guidelines for malaria (13 Aug 2025); Uganda Clinical Guidelines 2023 §2.5.2 (complete physical examination in any patient with fever)",
      url: "https://www.who.int/publications/i/item/guidelines-for-malaria",
      checked: "2026-09-27",
      verified: true,
    },
    "WHO-TB-SCREEN-2021": {
      title: "WHO consolidated guidelines on tuberculosis, Module 2: screening (2021), §3.1",
      url: "https://iris.who.int/handle/10665/340255",
      checked: "2026-09-27",
      verified: true,
      note: "Lists haemoptysis as a TB symptom; no examination content. UCG 2023 §5.3.1 supports the node, clubbing and MUAC suggestions.",
    },
  });
  delete c.sources["WHO-O2-CHILD"];
  for (const p of c.prototype_parity as any[]) if (!p.source) p.source = "OPERATIONAL";
  note(
    "SC7",
    "Added WHO-EVD-CASEDEF, UG-IDSR-2021, NICE-CG95, WHO-MALARIA, WHO-TB-SCREEN-2021; removed WHO-O2-CHILD (unused); five parity entries sourced OPERATIONAL.",
  );

  /* ── SC1: hypoglycaemia levels ── */
  c.medicine_groups = {
    glucose_lowering: {
      label: "Glucose-lowering medicine",
      drug_class: "glucose_lowering_any",
      name_stems: [
        "insulin",
        "metformin",
        "glibenclamide",
        "gliclazide",
        "glimepiride",
        "glipizide",
        "tolbutamide",
        "sitagliptin",
        "vildagliptin",
        "linagliptin",
        "saxagliptin",
        "alogliptin",
        "pioglitazone",
        "empagliflozin",
        "dapagliflozin",
        "canagliflozin",
        "liraglutide",
        "semaglutide",
        "dulaglutide",
        "exenatide",
        "acarbose",
        "repaglinide",
        "nateglinide",
      ],
    },
  };
  const diabetes = {
    any: [{ past_condition: "diabetes", answer: "yes" }, { medicine_group: "glucose_lowering" }],
  };
  const l1 = rule("FLAG-EX-HYPO-L1");
  const l1Index = c.flag_rules.indexOf(l1);
  c.flag_rules.splice(
    l1Index,
    1,
    {
      ...l1,
      id: "FLAG-EX-HYPO-L1-DM",
      level: "urgent",
      reason: "Level 1 hypoglycaemia in a patient with diabetes: treat now",
      when: { all: [{ classifier: "hypoglycaemia_level", any_of: ["level_1"] }, diabetes] },
      also_source: "UCG-2023",
    },
    {
      ...l1,
      level: "caution",
      reason: "Glucose below 3.9 mmol/L: recheck and treat if symptomatic",
      when: {
        all: [{ classifier: "hypoglycaemia_level", any_of: ["level_1"] }, { not: diabetes }],
      },
      also_source: "UCG-2023",
    },
  );
  rule("FLAG-EX-HYPO-L2").also_source = "UCG-2023";
  c.classifiers.hypoglycaemia_level.note =
    "Level 2 (below 3.0 mmol/L) matches UCG 2023 §1.1.6 for everyone. Level 1 (3.0 to 3.8) is urgent only in a patient with diabetes (history or glucose-lowering medicine), caution otherwise (GATE A, SC1).";
  note(
    "SC1",
    "FLAG-EX-HYPO-L1 split: urgent with diabetes (FLAG-EX-HYPO-L1-DM), caution otherwise; medicine_groups.glucose_lowering and the medicine_group atom added.",
  );

  /* ── SC2: Kussmaul or ketotic breath without high glucose ── */
  const glucoseHigh = { vital: "vs.glucose", gte_ref: "REF-EX-GLU-HIGH" };
  const kussIndex = c.flag_rules.findIndex((r: any) => r.id === "FLAG-EX-KUSSMAUL");
  c.flag_rules.splice(
    kussIndex + 1,
    0,
    {
      id: "FLAG-EX-KUSSMAUL-CHECK",
      level: "caution",
      badge: "Kussmaul breathing",
      reason:
        "Kussmaul breathing: check glucose and ketones (DKA can occur with glucose below 11.1 mmol/L)",
      when: {
        all: [
          {
            item: "ex.respiratory.breathing_pattern",
            attribute: "pattern",
            equals: "kussmaul_deep_sighing",
          },
          { not: glucoseHigh },
        ],
      },
      source: "HYPERGLYCAEMIC-CRISIS",
      status: "draft-verified-source",
      shown_in: "flags_panel",
      section: "examination",
    },
    {
      id: "FLAG-EX-KETONES-CHECK",
      level: "caution",
      badge: "Ketotic breath",
      reason:
        "Ketotic breath: check glucose and ketones (DKA can occur with glucose below 11.1 mmol/L)",
      when: {
        all: [
          { item: "ex.general.odour", attribute: "smells", equals: "ketones_fruity" },
          { not: glucoseHigh },
        ],
      },
      source: "HYPERGLYCAEMIC-CRISIS",
      status: "draft-verified-source",
      shown_in: "flags_panel",
      section: "examination",
    },
  );
  c.reference_entries["REF-EX-GLU-HIGH"].status = "draft-verified-source";
  note(
    "SC2",
    "Added FLAG-EX-KUSSMAUL-CHECK and FLAG-EX-KETONES-CHECK (caution) for Kussmaul breathing or ketotic breath without glucose ≥ 11.1.",
  );

  /* ── SC3: ROSIER counts only new signs ── */
  for (const p of c.classifiers.rosier.points as any[]) if (p.points > 0) p.requires_new = true;
  c.classifiers.rosier.status = "draft-verified-source";
  c.classifiers.rosier.note +=
    " Each +1 sign scores only when the clinician confirms in the panel that it is new since the symptoms began (GATE A, SC3).";
  note("SC3", "ROSIER +1 points carry requires_new: the panel confirms each sign is new.");

  /* ── SC4: Ipswich touch test spans both feet ── */
  c.classifiers.iwgdf_risk.derived.lops =
    "monofilament not felt at a site on that foot, or vibration not felt on that side, or an Ipswich touch test at or above REF-EX-ITT-LOPS (the test counts both feet, so it marks loss of protective sensation on both)";
  c.reference_entries["REF-EX-ITT-LOPS"].status = "draft-verified-source";
  note("SC4", "An Ipswich touch test of 2 or more of 6 marks LOPS on both feet.");

  /* ── SC5: fever with bleeding ── */
  Object.assign(c.reference_entries["REF-EX-FEVER-TEMP"], {
    source: "OPERATIONAL",
    status: "draft",
    meaning:
      'Fever threshold for the fever-with-bleeding flag. An operational CSO value: the WHO and Uganda IDSR case definitions say "fever" with no number; Uganda VHF surveillance uses > 38 °C.',
  });
  const fb = rule("FLAG-EX-FEVER-BLEEDING");
  fb.when = {
    all: [
      { finding: "ex.general.bleeding_signs", is: "positive" },
      {
        any: [
          { symptom: "sym.fever", answer: "yes" },
          { vital: "vs.temp", gte_ref: "REF-EX-FEVER-TEMP" },
          { setting: "outbreak_mode", equals: true },
        ],
      },
    ],
  };
  fb.source = "UG-IDSR-2021";
  fb.also_source = "WHO-EVD-CASEDEF";
  fb.note = "With outbreak mode on, bleeding signs alone fire the flag (IDSR outbreak definition).";
  note(
    "SC5",
    "REF-EX-FEVER-TEMP is operational; FLAG-EX-FEVER-BLEEDING also fires on bleeding alone in outbreak mode; the setting atom added.",
  );

  /* ── SC6: no separate chest-pain arm difference ── */
  delete c.reference_entries["REF-EX-ARM-DIFF-CHEST"];
  const json = JSON.stringify(c.flag_rules).replaceAll("REF-EX-ARM-DIFF-CHEST", "REF-EX-ARM-DIFF");
  c.flag_rules = JSON.parse(json);
  note(
    "SC6",
    "REF-EX-ARM-DIFF-CHEST removed; chest pain uses REF-EX-ARM-DIFF (15 mmHg, NICE NG136).",
  );

  c.flag_rule_language.atoms.push(
    "medicine_group {glucose_lowering}",
    "setting {outbreak_mode, equals: true} (as in the history catalogue)",
  );

  /* ── TM1: mirrors for findings recorded in two places ── */
  const mirror = (from: [string, string, string], to: any, rule?: string) => {
    const [id, a, o] = from;
    const x = opt(id, a, o);
    x.mirror_of = to;
    if (rule) x.mirror_rule = rule;
  };
  mirror(["ex.cardiovascular.peripheral_stigmata", "seen", "malar_flush"], {
    item: "ex.general.facies",
    attribute: "type",
    option: "malar_flush",
  });
  mirror(["ex.cardiovascular.peripheral_stigmata", "seen", "splinter_haemorrhages"], {
    item: "ex.general.hand_signs",
    attribute: "signs",
    option: "splinter_haemorrhages",
  });
  mirror(["ex.abdomen.liver_stigmata", "seen", "bruising"], {
    item: "ex.general.bleeding_signs",
    attribute: "seen",
    option: "bruising_or_ecchymoses",
  });
  mirror(["ex.rectal_genital.glove", "found", "fresh_blood"], {
    item: "ex.general.bleeding_signs",
    attribute: "seen",
    option: "blood_from_the_rectum_on_examination",
  });
  mirror(["ex.general.bleeding_signs", "seen", "blood_in_urine_catheter"], {
    item: "ex.general.urinary_catheter",
    attribute: "urine",
    option: "blood_stained",
  });
  mirror(["ex.respiratory.chest_shape", "seen", "chest_drain"], {
    item: "ex.general.drains_stomas_splints",
    attribute: "what",
    option: "chest_drain",
  });
  mirror(["ex.abdomen.wall_findings", "seen", "stoma"], {
    item: "ex.general.drains_stomas_splints",
    attribute: "what",
    option: "stoma_bag",
  });
  mirror(["ex.nervous.cn_ii", "found", "papilloedema"], {
    item: "ex.eyes_ent_neck.fundoscopy",
    attribute: "seen",
    option: "papilloedema",
  });
  mirror(
    ["ex.nervous.cn_ii", "found", "field_defect"],
    { item: "ex.nervous.visual_fields" },
    "The visual fields item owns the finding; this option reads and writes it.",
  );
  mirror(
    ["ex.general.nutrition", "signs", "bilateral_pitting_oedema_of_the_feet"],
    { item: "ex.general.oedema", attrs: { type: "pitting", side: "both_legs" } },
    "Oedema owns the finding: ticking it here records pitting oedema of both legs there.",
  );
  mirror(["ex.general.hiv_associated_signs", "seen", "recurrent_oral_ulcers"], {
    item: "ex.general.mouth",
    attribute: "signs",
    option: "ulcers",
  });
  mirror(["ex.general.hiv_associated_signs", "seen", "fungal_nail_infection"], {
    item: "ex.feet.skin_nails",
    attribute: "seen",
    option: "fungal_nails",
  });
  note(
    "TM1",
    "Twelve mirrors declared (malar flush, splinter haemorrhages, bruising, fresh blood per rectum, catheter haematuria, chest drain, stoma, papilloedema, field defect, bilateral pitting oedema, oral ulcers, fungal nails).",
  );

  /* ── TM2: sensitivity ── */
  opt("ex.general.mouth", "signs", "purple_kaposi_like_lesion").sensitivity = "hiv";
  opt("ex.skin.lesions", "type", "purple_plaque_or_nodule").sensitivity = "hiv";
  opt("ex.abdomen.liver_stigmata", "seen", "testicular_atrophy").sensitivity =
    "sexual_reproductive_health";
  opt("ex.nervous.behaviour", "seen", "responding_to_unseen_stimuli").sensitivity = "mental_health";
  c.conventions.sensitivity +=
    " An option may carry its own restricted class (GATE A, TM2): the option is withheld from patient-facing text wherever it is recorded.";
  note(
    "TM2",
    "Option-level sensitivity: Kaposi-like lesions (hiv) in Mouth and Skin, testicular atrophy (sexual_reproductive_health), responding to unseen stimuli (mental_health). The history catalogue's sym.scrotal becomes sexual_reproductive_health.",
  );

  /* ── TM3: required CFC context ── */
  item("ex.cardiovascular.capillary_refill").attributes.unshift({
    id: "site",
    label: "Site",
    kind: "one",
    options: [
      { id: "fingertip", label: "Fingertip" },
      { id: "sternum", label: "Sternum" },
    ],
    in_prototype: false,
  });
  item("ex.feet.skin_nails").attributes.push({
    id: "side",
    label: "Side",
    kind: "one",
    options: [
      { id: "right", label: "Right" },
      { id: "left", label: "Left" },
      { id: "both", label: "Both" },
    ],
    in_prototype: false,
  });
  c.vital_signs.fields.find((f: any) => f.id === "vs.waist").protocol =
    "who_midpoint: midway between the lowest rib and the iliac crest (written by the app as the CFC protocol context)";
  note(
    "TM3",
    "Capillary refill gains a site; Feet skin and nails gains a side; waist carries the WHO midpoint protocol.",
  );

  /* ── TM5 ── */
  item("ex.abdomen.liver").phrase.positive = "liver palpable";
  note("TM5", 'Palpable liver is written "liver palpable", not "hepatomegaly".');

  c.decisions_signed = c.decisions_needed.map((d: string, i: number) => ({
    decision: d,
    resolution: [
      "AMTS cut-off 6 (BGS), signed.",
      "At or above (IDF), as drafted: signed with the pack.",
      "MedSync respiratory grading signed as drafted.",
      "The four-grade pitting scale in scales.pitting_oedema, signed as the house standard.",
      "SC1: below 3.0 urgent for everyone; 3.0 to 3.8 urgent with diabetes, caution otherwise.",
      "Verified (SC3); +1 signs count only when new.",
      "Verified (SC4); the count spans both feet.",
      "Signed as drafted; local validation planned.",
      "Dropped (SC6): REF-EX-ARM-DIFF applies.",
      "Operational 38.0 °C (SC5); bleeding alone in outbreak mode.",
    ][i],
  }));
  c.change_log = [
    {
      version: "1.0.1-draft",
      date: "2026-09-27",
      gate: "GATE A (examination), signed by Fadhul",
      changes: log,
    },
  ];

  return c;
}

if (process.argv[1]?.endsWith("exam-gate-a-edits.ts")) {
  const handoff = JSON.parse(
    readFileSync("docs/emr/clerking-v2/exam/clerking-exam-catalogue.v1.json", "utf8"),
  );
  writeFileSync(
    "data/clerking/clerking-exam-catalogue.v1.json",
    JSON.stringify(applyGateAEdits(handoff), null, 1) + "\n",
  );
}
