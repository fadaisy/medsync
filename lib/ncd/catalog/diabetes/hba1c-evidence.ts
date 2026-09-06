/**
 * Evidence for the conditions that make an HbA1c unsafe to read.
 *
 * ── Why a tick was not enough ────────────────────────────────────────────────
 * Every condition in this section changes whether a number can be trusted, and
 * each was a bare boolean. "Anaemia: yes" is an assertion with no basis attached
 * — it could be a full blood count, a glance at a conjunctiva, or something the
 * patient was told years ago, and those are not the same claim. The caveat that
 * reads it is doing serious work (it can BLOCK a diagnosis), so it deserves to
 * know what it is standing on.
 *
 * So each condition now carries how it was established, and the values behind
 * it. The booleans are unchanged and every existing validity caveat still reads
 * them, so nothing that worked before had to be rewritten.
 *
 * ── Where the evidence is missing ────────────────────────────────────────────
 * Recording "anaemia on pallor alone" is a legitimate answer, not a failure —
 * clinical suspicion is how most anaemia is found at the bedside. What follows
 * is a lab ORDER rather than a nag: `orderedBy` names the test that would settle
 * it, and the ordering module (not yet built) picks it up from there.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-06";

/* ── sources ─────────────────────────────────────────────────────────────── */

/**
 * WHO 2024 — the first substantive revision of the anaemia cutoffs since 1968.
 * Table 3 read directly; the adult rows are reproduced in the option labels so
 * the clinician classifies against the number rather than from memory.
 */
const WHO_ANAEMIA = {
  standard: "WHO" as const,
  version: "Guideline on haemoglobin cutoffs to define anaemia, 2024 (Table 3)",
  title: "Guideline on haemoglobin cutoffs to define anaemia in individuals and populations",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK602183/table/fm-ch1.tab2/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Adults, 15–65 years, nonpregnant women ≥120 | 110–119 | 80–109 | <80. Adults, 15–65, years men ≥130 | 110–129 | 80–109 | <80.",
};

/** NGSP — the canonical list of what interferes with an HbA1c result. */
const NGSP = {
  standard: "local" as const,
  version: "NGSP — Factors that Interfere with HbA1c Test Results",
  title: "Factors that Interfere with HbA1c Test Results — NGSP",
  url: "https://ngsp.org/factors.asp",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Iron deficiency anemia, a major public health problem in developing countries, is associated with higher HbA1c and higher fructosamine",
};

/**
 * The antiretroviral finding. A primary study rather than a guideline, so it is
 * cited as one and carries needsCsoInput — but it is the study everyone cites,
 * and the effect is large: A1C underestimated glucose by 29 mg/dL.
 */
const ARV_A1C = {
  standard: "local" as const,
  version: "Kim PS et al. Diabetes Care 2009;32(9):1591–1593",
  title: "A1C Underestimates Glycemia in HIV Infection",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2732167/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "A1C underestimates glycemia in HIV-infected patients and is related to NRTI use. Use of abacavir and increased MCV were key correlates in multivariate analyses. Fructosamine may be more appropriate in this setting.",
  needsCsoInput:
    "A single prospective study, not a guideline position. Widely cited and the effect is large, but the CSO should decide whether it may gate a diagnosis.",
};

/** Morphology and the obstetric date rule are conventions, not guidelines. */
const CONVENTION: Citation = {
  standard: "local",
  version: "MedSync clinical reasoning",
  title: "Laboratory and obstetric convention — not a guideline position",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    "Standard laboratory reference conventions (MCV/MCH morphology) and Naegele's rule. Universally taught, but no guideline was retrieved stating them. CSO to ratify.",
};

const KDIGO_RRT: Citation = {
  standard: "KDIGO",
  version: "KDIGO 2012 Clinical Practice Guideline for Acute Kidney Injury",
  title: "KDIGO AKI guideline — timing of renal replacement therapy",
  url: "https://kdigo.org/wp-content/uploads/2016/10/KDIGO-2012-AKI-Guideline-English.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Initiate RRT emergently when life-threatening changes in fluid, electrolyte, and acid-base balance exist.",
  needsCsoInput:
    "KDIGO states the emergent principle; the AEIOU option list below is the conventional teaching expansion of it, not KDIGO's own enumeration. CSO to ratify.",
};

/* ── helper ──────────────────────────────────────────────────────────────── */

const SX = "hba1c_validity";

const prop = (parent: string, f: Omit<Feature, "section" | "parent" | "kind">): Feature => ({
  ...f,
  kind: "investigation",
  section: SX,
  parent,
});

/** How a condition was established. The same question wherever it is asked. */
const basis = (parent: string, code: string, labLabel: string, citation: Citation): Feature =>
  prop(parent, {
    code,
    display: "Established by",
    valueType: "single_select",
    citation,
    options: [
      { value: "lab", display: labLabel },
      { value: "clinical", display: "Clinical assessment only" },
      { value: "reported", display: "Reported by the patient or another facility" },
    ],
  });

/* ── the evidence ────────────────────────────────────────────────────────── */

export const HBA1C_EVIDENCE_FEATURES: Feature[] = [
  /* ── anaemia — the count, the severity, and the shape of the cells ────── */
  basis("anaemia", "anaemia_basis", "Full blood count", WHO_ANAEMIA),
  prop("anaemia", {
    /**
     * The number the whole classification rests on, in g/dL — the unit it is
     * reported and spoken in at the bedside. WHO's table is written in g/L, so
     * the cutoffs below are converted (a tenth) and the alt unit carries g/L
     * back for anyone reading against the source.
     */
    code: "anaemia_hb",
    display: "Haemoglobin",
    valueType: "number",
    unit: "g/dL",
    altUnit: { unit: "g/L", factor: 10 },
    refRange: { low: 12, high: 16 },
    orderedBy: "cbc",
    showWhenAll: [{ feature: "anaemia_basis", op: "==", value: "lab" }],
    citation: WHO_ANAEMIA,
  }),
  prop("anaemia", {
    /**
     * WHO's own cutoffs, reproduced in the labels so the clinician classifies
     * against the table rather than from memory — and so the two adult rows,
     * which differ only at the mild boundary, are visible side by side.
     *
     * Not derived from the haemoglobin, deliberately: the threshold depends on
     * sex and on pregnancy trimester, and this catalog captures neither. Guessing
     * a row would be worse than asking.
     */
    code: "anaemia_severity",
    display: "Severity",
    valueType: "single_select",
    orderedBy: "cbc",
    showWhenAll: [{ feature: "anaemia_basis", op: "==", value: "lab" }],
    citation: WHO_ANAEMIA,
    options: [
      { value: "mild", display: "Mild — 11.0–11.9 women, 11.0–12.9 men g/dL" },
      { value: "moderate", display: "Moderate — 8.0–10.9 g/dL" },
      { value: "severe", display: "Severe — below 8.0 g/dL" },
    ],
  }),
  prop("anaemia", {
    code: "anaemia_mcv",
    display: "MCV",
    valueType: "number",
    unit: "fL",
    refRange: { low: 80, high: 100 },
    orderedBy: "cbc",
    showWhenAll: [{ feature: "anaemia_basis", op: "==", value: "lab" }],
    citation: CONVENTION,
  }),
  prop("anaemia", {
    code: "anaemia_mch",
    display: "MCH",
    valueType: "number",
    unit: "pg",
    refRange: { low: 27, high: 33 },
    orderedBy: "cbc",
    showWhenAll: [{ feature: "anaemia_basis", op: "==", value: "lab" }],
    citation: CONVENTION,
  }),
  prop("anaemia", {
    /**
     * Size from the MCV, colour from the MCH. The two together are what point at
     * a cause: microcytic hypochromic is iron deficiency or thalassaemia,
     * macrocytic is B12/folate or — relevant three fields down — zidovudine.
     *
     * It matters twice over here, because iron deficiency RAISES HbA1c while the
     * anaemia itself lowers it. A microcytic hypochromic picture is the clue that
     * both caveats are in play at once and pulling in opposite directions.
     */
    code: "anaemia_morphology",
    display: "Morphology",
    valueType: "single_select",
    orderedBy: "cbc",
    showWhenAll: [{ feature: "anaemia_basis", op: "==", value: "lab" }],
    citation: CONVENTION,
    options: [
      { value: "microcytic_hypochromic", display: "Microcytic hypochromic — MCV <80, MCH <27" },
      { value: "normocytic_normochromic", display: "Normocytic normochromic — MCV 80–100" },
      { value: "normocytic_hypochromic", display: "Normocytic hypochromic — MCV 80–100, MCH <27" },
      { value: "macrocytic", display: "Macrocytic — MCV >100" },
    ],
  }),
  prop("anaemia", {
    /**
     * The bedside answer, and a legitimate one: most anaemia in this setting is
     * found on examination first. Recording it as clinical-only is what lets the
     * count be ORDERED rather than the field simply sitting empty.
     */
    code: "anaemia_clinical_signs",
    display: "Clinical signs",
    valueType: "multi_select",
    showWhenAll: [{ feature: "anaemia_basis", op: "==", value: "clinical" }],
    citation: CONVENTION,
    options: [
      { value: "conjunctival_pallor", display: "Conjunctival pallor" },
      { value: "palmar_pallor", display: "Palmar pallor" },
      { value: "mucosal_pallor", display: "Mucosal pallor" },
      { value: "tachycardia", display: "Tachycardia" },
      { value: "exertional_dyspnoea", display: "Breathless on exertion" },
    ],
  }),

  /* ── iron deficiency — the studies, or the order for them ─────────────── */
  basis("iron_deficiency", "iron_basis", "Iron studies", NGSP),
  prop("iron_deficiency", {
    /**
     * Ferritin is the first-line test and an acute-phase reactant, which is why
     * the transferrin saturation sits beside it: in infection or inflammation —
     * common in exactly this population — a normal ferritin does not exclude iron
     * deficiency.
     */
    code: "ferritin",
    display: "Ferritin",
    valueType: "number",
    unit: "µg/L",
    refRange: { low: 30, high: 300 },
    orderedBy: "iron_studies",
    showWhenAll: [{ feature: "iron_basis", op: "==", value: "lab" }],
    citation: NGSP,
  }),
  prop("iron_deficiency", {
    code: "transferrin_saturation",
    display: "Transferrin saturation",
    valueType: "number",
    unit: "%",
    refRange: { low: 20, high: 45 },
    orderedBy: "iron_studies",
    showWhenAll: [{ feature: "iron_basis", op: "==", value: "lab" }],
    citation: NGSP,
  }),

  /* ── haemolysis — what actually points to it ──────────────────────────── */
  basis("haemolysis", "haemolysis_basis", "Laboratory markers", NGSP),
  prop("haemolysis", {
    /**
     * The four that make the diagnosis, and they travel together: cells break
     * open, so the contents rise (bilirubin, LDH), the scavenger falls
     * (haptoglobin), and the marrow answers (reticulocytes). A haptoglobin that
     * is low with a raised LDH is close to definitive — which is also why
     * haptoglobin appears in the antiretroviral study three fields down.
     *
     * The film and the direct antiglobulin test are here because they say WHICH
     * haemolysis: fragments mean a mechanical or microangiopathic process,
     * spherocytes with a positive DAT mean autoimmune, and sickle cells point
     * back at the variant field at the top of this section.
     */
    code: "haemolysis_markers",
    display: "Markers",
    valueType: "multi_select",
    orderedBy: "haemolysis_screen",
    showWhenAll: [{ feature: "haemolysis_basis", op: "==", value: "lab" }],
    citation: CONVENTION,
    options: [
      { value: "raised_unconjugated_bilirubin", display: "Raised unconjugated bilirubin" },
      { value: "raised_ldh", display: "Raised LDH" },
      { value: "low_haptoglobin", display: "Low or absent haptoglobin" },
      { value: "reticulocytosis", display: "Reticulocytosis" },
      { value: "film_fragments", display: "Blood film — fragments or schistocytes" },
      { value: "film_spherocytes", display: "Blood film — spherocytes" },
      { value: "film_sickle", display: "Blood film — sickle cells" },
      { value: "positive_dat", display: "Positive direct antiglobulin (Coombs) test" },
      { value: "haemoglobinuria", display: "Haemoglobinuria" },
    ],
  }),
  prop("haemolysis", {
    code: "haemolysis_clinical_signs",
    display: "Clinical signs",
    valueType: "multi_select",
    showWhenAll: [{ feature: "haemolysis_basis", op: "==", value: "clinical" }],
    citation: CONVENTION,
    options: [
      { value: "jaundice", display: "Jaundice" },
      { value: "dark_urine", display: "Dark urine" },
      { value: "pallor", display: "Pallor" },
      { value: "splenomegaly", display: "Splenomegaly" },
      { value: "gallstones", display: "Known pigment gallstones" },
    ],
  }),
  prop("haemolysis", {
    /**
     * The cause changes what is done about it, and three of these are already
     * captured elsewhere in this section — the variant at the top, malaria two
     * fields down, the drug list in the regimen. Recording it here is what links
     * them into one picture rather than four ticks.
     */
    code: "haemolysis_cause",
    display: "Cause, if known",
    valueType: "single_select",
    citation: CONVENTION,
    options: [
      { value: "sickle_cell", display: "Sickle-cell disease" },
      { value: "g6pd", display: "G6PD deficiency" },
      { value: "malaria", display: "Malaria" },
      { value: "autoimmune", display: "Autoimmune" },
      { value: "mechanical", display: "Mechanical — valve or microangiopathy" },
      { value: "drug_induced", display: "Drug-induced" },
      { value: "other", display: "Other" },
      { value: "unknown", display: "Not known" },
    ],
  }),

  /* ── malaria — parasitological confirmation, or none ──────────────────── */
  prop("malaria_current", {
    /**
     * Distinct from `malaria_confirmation` on the precipitants screen, and the
     * difference is the window: that field asks what set off THIS crisis, while
     * this one asks whether malaria in the last few months makes the HbA1c
     * unreadable. A patient can answer them differently and both be true.
     */
    code: "malaria_current_test",
    display: "Confirmed how",
    valueType: "single_select",
    orderedBy: "malaria_test",
    citation: NGSP,
    options: [
      { value: "rdt", display: "Rapid diagnostic test" },
      { value: "microscopy", display: "Blood slide microscopy" },
      { value: "not_confirmed", display: "Not confirmed — treated on suspicion" },
    ],
  }),
  prop("malaria_current", {
    code: "malaria_weeks_ago",
    display: "How long ago",
    valueType: "duration",
    unit: "weeks",
    citation: NGSP,
  }),

  /* ── transfusion — which blood, and when ──────────────────────────────── */
  prop("recent_transfusion", {
    /**
     * Transfused blood carries the DONOR's glycation, so a post-transfusion
     * HbA1c is partly somebody else's average. The group is recorded because a
     * transfusion history without it cannot be acted on at the next crossmatch.
     */
    code: "transfusion_blood_group",
    display: "Blood group",
    valueType: "single_select",
    orderedBy: "blood_group",
    citation: NGSP,
    options: [
      { value: "o_pos", display: "O positive" },
      { value: "o_neg", display: "O negative" },
      { value: "a_pos", display: "A positive" },
      { value: "a_neg", display: "A negative" },
      { value: "b_pos", display: "B positive" },
      { value: "b_neg", display: "B negative" },
      { value: "ab_pos", display: "AB positive" },
      { value: "ab_neg", display: "AB negative" },
      { value: "unknown", display: "Not known" },
    ],
  }),
  prop("recent_transfusion", {
    code: "transfusion_weeks_ago",
    display: "How long ago",
    valueType: "duration",
    unit: "weeks",
    citation: NGSP,
  }),
  prop("recent_transfusion", {
    code: "transfusion_units",
    display: "Units given",
    valueType: "number",
    unit: "units",
    citation: NGSP,
  }),

  /* ── antiretrovirals — and the one that moves the number ──────────────── */
  prop("hiv_on_art", {
    /**
     * The REGIMEN, not a drug list — antiretrovirals are prescribed, dispensed
     * and spoken about as fixed combinations, and a clinician asked to tick
     * three ingredients will reach for the regimen name anyway. TLD is the WHO
     * preferred first line and dominates in this setting.
     *
     * ABACAVIR is why the field exists at all. A1C underestimates glucose in HIV
     * by around 29 mg/dL, and in multivariate analysis only MCV and current NRTI
     * use — abacavir in particular — survived. Every ABC-containing regimen is
     * therefore enumerated separately so the caveat can match it; zidovudine is
     * marked beside them because the macrocytosis it causes is the other half of
     * that same finding.
     *
     * THE LIMIT, stated rather than hidden: "Other" takes free text, and free
     * text is inert here as everywhere else in this catalog. An ABC-containing
     * regimen entered that way will NOT raise the caveat. Enumerating the
     * combinations that actually circulate is the mitigation; if a site's
     * formulary carries one this list misses, it belongs in the list.
     */
    code: "art_regimen",
    display: "Regimen",
    valueType: "single_select",
    citation: ARV_A1C,
    options: [
      { value: "tdf_3tc_dtg", display: "TDF + 3TC + DTG (TLD)" },
      { value: "taf_ftc_dtg", display: "TAF + FTC + DTG" },
      { value: "tdf_3tc_efv", display: "TDF + 3TC + EFV (TLE)" },
      { value: "abc_3tc_dtg", display: "ABC + 3TC + DTG" },
      { value: "abc_3tc_efv", display: "ABC + 3TC + EFV" },
      { value: "abc_3tc_lpvr", display: "ABC + 3TC + LPV/r" },
      { value: "azt_3tc_dtg", display: "AZT + 3TC + DTG" },
      { value: "azt_3tc_efv", display: "AZT + 3TC + EFV" },
      { value: "azt_3tc_lpvr", display: "AZT + 3TC + LPV/r" },
      { value: "tdf_3tc_lpvr", display: "TDF + 3TC + LPV/r" },
      { value: "tdf_3tc_atvr", display: "TDF + 3TC + ATV/r" },
      {
        value: "other",
        display: "Other",
        // Free text, and therefore invisible to the caveat above. Named so.
        detail: { label: "Regimen", placeholder: "Drugs, if known" },
      },
      { value: "unknown", display: "Not known", noDetail: true },
    ],
    optionEffectsLabel: "Effect on HbA1c",
    /**
     * Tabulated rather than annotated. Three of these combinations move the
     * number and the rest do not, which is a fact worth reading in one glance —
     * buried in an option label it is a fact nobody reads.
     *
     * Every option appears, including the ones with no effect: an option missing
     * from the table would read as "no effect" without anyone having said so,
     * and the validator rejects that.
     */
    optionEffects: [
      { option: "tdf_3tc_dtg", effect: "No established effect", direction: "none" },
      { option: "taf_ftc_dtg", effect: "No established effect", direction: "none" },
      { option: "tdf_3tc_efv", effect: "No established effect", direction: "none" },
      {
        option: "abc_3tc_dtg",
        effect: "Abacavir — HbA1c reads LOW for the glucose",
        direction: "masks",
      },
      {
        option: "abc_3tc_efv",
        effect: "Abacavir — HbA1c reads LOW for the glucose",
        direction: "masks",
      },
      {
        option: "abc_3tc_lpvr",
        effect: "Abacavir — HbA1c reads LOW for the glucose",
        direction: "masks",
      },
      {
        option: "azt_3tc_dtg",
        effect: "Zidovudine — macrocytosis, the other predictor of a low reading",
        direction: "masks",
      },
      {
        option: "azt_3tc_efv",
        effect: "Zidovudine — macrocytosis, the other predictor of a low reading",
        direction: "masks",
      },
      {
        option: "azt_3tc_lpvr",
        effect: "Zidovudine — macrocytosis, the other predictor of a low reading",
        direction: "masks",
      },
      { option: "tdf_3tc_lpvr", effect: "No established effect", direction: "none" },
      { option: "tdf_3tc_atvr", effect: "No established effect", direction: "none" },
      {
        option: "other",
        effect: "Not identified here — check for abacavir or zidovudine",
        direction: "unpredictable",
      },
      {
        option: "unknown",
        effect: "Not identified here — check for abacavir or zidovudine",
        direction: "unpredictable",
      },
    ],
  }),

  /* ── erythropoietin — for how long, and what for ──────────────────────── */
  prop("erythropoietin", {
    /**
     * New red cells are young cells, and young cells have had less time to
     * glycate — so an HbA1c during an erythropoietin response reads low for
     * reasons that have nothing to do with the glucose. How long it has been
     * running is what says whether that effect is still active.
     */
    code: "epo_duration",
    display: "For how long",
    valueType: "duration",
    unit: "weeks",
    citation: NGSP,
  }),
  prop("erythropoietin", {
    /**
     * The indication matters beyond bookkeeping: anaemia of chronic kidney
     * disease brings its own HbA1c caveat with it, and zidovudine-induced
     * anaemia points straight back at the antiretroviral field above. The
     * indication is often the second caveat in disguise.
     */
    code: "epo_indication",
    display: "Given for",
    valueType: "single_select",
    citation: NGSP,
    options: [
      { value: "ckd_anaemia", display: "Anaemia of chronic kidney disease" },
      { value: "dialysis", display: "Anaemia on dialysis" },
      { value: "chemotherapy", display: "Chemotherapy-induced anaemia" },
      { value: "zidovudine", display: "Zidovudine-induced anaemia" },
      { value: "mds", display: "Myelodysplastic syndrome" },
      { value: "perioperative", display: "To reduce perioperative transfusion" },
      { value: "other", display: "Other" },
    ],
  }),

  /* ── pregnancy — the date, and what follows from it ───────────────────── */
  prop("pregnant", {
    /**
     * The last menstrual period, from which gestational age and an estimated
     * delivery date are DISPLAYED rather than stored. Both are pure functions of
     * this date, so a stored copy could only drift — and gestational age drifts
     * every single morning.
     *
     * It matters here because WHO's anaemia cutoff moves by trimester (110, 105,
     * 110 g/L) and because HbA1c falls in late pregnancy for reasons of iron
     * status rather than glycaemia.
     */
    code: "lnmp",
    display: "Last menstrual period",
    valueType: "date",
    derives: "gestation_from_lnmp",
    citation: CONVENTION,
  }),
  prop("pregnant", {
    code: "pregnancy_confirmed_by",
    display: "Confirmed by",
    valueType: "single_select",
    orderedBy: "hcg",
    citation: CONVENTION,
    options: [
      { value: "urine_hcg", display: "Urine hCG" },
      { value: "serum_bhcg", display: "Serum beta-hCG" },
      { value: "ultrasound", display: "Ultrasound" },
      { value: "clinical", display: "Clinical only — not confirmed" },
    ],
  }),

  /* ── dialysis — modality, and why it was started ──────────────────────── */
  prop("on_dialysis", {
    code: "dialysis_modality",
    display: "Modality",
    valueType: "single_select",
    citation: KDIGO_RRT,
    options: [
      { value: "haemodialysis", display: "Haemodialysis" },
      { value: "peritoneal", display: "Peritoneal dialysis" },
      { value: "crrt", display: "Continuous renal replacement" },
    ],
  }),
  prop("on_dialysis", {
    /**
     * KDIGO's own instruction is a principle — start emergently when there are
     * life-threatening disturbances of fluid, electrolyte or acid-base balance —
     * rather than a list. The options below are the conventional teaching
     * expansion of that principle (AEIOU), and are marked as ours rather than
     * attributed to KDIGO, because KDIGO does not enumerate them this way.
     */
    code: "dialysis_indication",
    display: "Started for",
    valueType: "multi_select",
    citation: KDIGO_RRT,
    options: [
      { value: "acidosis", display: "Refractory metabolic acidosis" },
      { value: "electrolytes", display: "Refractory hyperkalaemia" },
      { value: "intoxication", display: "A dialysable poison or drug" },
      { value: "overload", display: "Fluid overload not responding to diuretics" },
      { value: "uraemia", display: "Uraemia — pericarditis, encephalopathy or bleeding" },
      { value: "esrd_maintenance", display: "Maintenance for end-stage kidney disease" },
    ],
  }),
];

/**
 * What can be requested when the evidence is not there.
 *
 * Deliberately thin. The catalog says which test would answer which questions;
 * the requisition, the specimen and the result coming back are the laboratory
 * module's problem and none of it exists yet. What this buys today is that a
 * blank field stops being a reproach and becomes something somebody can order.
 */
export const ORDERABLES = [
  {
    code: "cbc",
    display: "Full blood count",
    because: "Anaemia recorded on clinical grounds — the count would settle it and classify it.",
    fills: ["anaemia_hb", "anaemia_severity", "anaemia_mcv", "anaemia_mch", "anaemia_morphology"],
  },
  {
    code: "haemolysis_screen",
    display: "Haemolysis screen",
    because:
      "Broken red cells shorten the window an HbA1c averages over, so the number reads low for reasons that have nothing to do with the glucose.",
    fills: ["haemolysis_markers"],
  },
  {
    code: "iron_studies",
    display: "Iron studies",
    because:
      "Iron deficiency raises HbA1c while the anaemia lowers it — the two pull opposite ways, so which is present changes the reading.",
    fills: ["ferritin", "transferrin_saturation"],
  },
  {
    code: "malaria_test",
    display: "Malaria test",
    because: "WHO requires parasitological confirmation before treating.",
    fills: ["malaria_current_test"],
  },
  {
    code: "blood_group",
    display: "Blood group and crossmatch",
    because: "A transfusion history without a group cannot be acted on at the next crossmatch.",
    fills: ["transfusion_blood_group"],
  },
  {
    code: "hcg",
    display: "Pregnancy test (hCG)",
    because: "Pregnancy moves the anaemia cutoff and lowers HbA1c independently of glycaemia.",
    fills: ["pregnancy_confirmed_by"],
  },
];
