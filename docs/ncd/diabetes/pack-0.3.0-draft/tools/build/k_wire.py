"""Wiring outside the NCD catalog: orderables, test menu, formulary classes, CFC concepts."""
from k_model import orderable

# ── orderables (NcdCatalog LabOrder) and their test-menu ids ────────────────
E, N = "exists", "new"
for code, disp, fills, because, cap, menu, st in [
    ("glucose_fasting", "Fasting plasma glucose", ["fasting_pg"], "The WHO test for an adult without symptoms.", "lab.glucose", ("test.glucose_fasting", E), "reconcile"),
    ("glucose_random", "Random plasma glucose", ["random_pg"], "With symptoms, one diabetes-range value is diagnostic.", "lab.glucose", ("test.glucose_random", E), "reconcile"),
    ("glucose_capillary", "Capillary glucose (meter)", ["capillary_glucose"], "Available at every level; WHO accepts it for diagnosis where there is no laboratory.", "device.glucometer", ("test.glucose_capillary", N), "new"),
    ("ogtt_75g", "75 g oral glucose tolerance test", ["fasting_pg", "ogtt_1h_pg", "ogtt_2h_pg"], "The most sensitive test; the only test for gestational diabetes.", "lab.ogtt", ("test.ogtt_75g", N), "new"),
    ("hba1c", "HbA1c", ["hba1c"], "Diagnosis where no caveat holds; the measure of control.", "lab.hba1c", ("test.hba1c", E), "reconcile"),
    ("ketones_urine", "Urine ketones (strip)", ["urine_ketones"], "Decides referral when glucose is 18 mmol/L or more.", "lab.ketones_urine", ("test.urinalysis_dipstick", E), "reconcile"),
    ("ketones_blood", "Blood ketones (beta-hydroxybutyrate)", ["bohb"], "The preferred ketone test: urine strips lag behind.", "lab.ketones_blood", ("test.ketones_blood", N), "new"),
    ("venous_gas", "Venous blood gas", ["venous_ph", "bicarbonate"], "Confirms acidosis in suspected ketoacidosis.", "lab.blood_gas", ("test.venous_gas", N), "new"),
    ("urea_electrolytes", "Urea and electrolytes", ["sodium", "urea", "potassium", "bicarbonate"], "Osmolality, potassium and bicarbonate.", "lab.electrolytes", ("test.urea_electrolytes", E), "reconcile"),
    ("creatinine_egfr", "Creatinine with eGFR", ["egfr"], "Yearly kidney check; needed before metformin and ACE inhibitor decisions.", "lab.creatinine", ("test.creatinine", E), "reconcile"),
    ("uacr", "Urine albumin-to-creatinine ratio", ["urine_acr", "uacr_abnormal_count"], "Yearly kidney check; a first-morning sample is preferred.", "lab.urine_acr", ("test.uacr", E), "reconcile"),
    ("urine_dipstick", "Urine reagent strip", ["urine_protein_strip", "haematuria_strip", "urine_ketones"], "The fallback where ACR is unavailable; a positive needs a laboratory ratio.", "lab.urine_dipstick", ("test.urinalysis_dipstick", E), "reconcile"),
    ("lipid_panel", "Lipid profile", ["total_cholesterol", "ldl_cholesterol", "triglycerides"], "Total cholesterol is an input to the WHO laboratory risk chart.", "lab.lipids", ("test.lipid_panel", E), "reconcile"),
    ("c_peptide", "C-peptide with paired glucose", ["c_peptide"], "Separates insulin deficiency from insulin resistance in a person on insulin.", "lab.c_peptide", ("test.c_peptide", N), "new"),
    ("islet_autoantibodies", "Islet autoantibodies (GAD first)", ["islet_autoantibodies"], "A positive result supports type 1; a negative does not exclude it.", "lab.islet_autoantibodies", ("test.gad_antibodies", N), "new"),
    ("vitamin_b12", "Vitamin B12", ["b12_deficiency"], "Long-term metformin with neuropathy or anaemia.", "lab.vitamin_b12", ("test.vitamin_b12", N), "new"),
    ("retinal_examination", "Retinal examination (photograph or dilated)", ["retinopathy_stage", "macular_oedema", "retina_view", "fundus_method"], "At diagnosis and every 2 years (WHO).", "imaging.fundus", ("test.retinal_photograph", N), "new"),
    ("ankle_brachial_index", "Ankle-brachial index", ["abi"], "Absent pulses with an ulcer, or claudication.", "device.doppler_abi", ("test.abi", N), "new"),
    ("pancreas_imaging", "Abdominal X-ray or ultrasound for pancreatic calcification", ["pancreatic_calcification"], "A lean young person with abdominal pain and diabetes.", "imaging.plain_xray", ("test.xray_abdomen", N), "new"),
]:
    orderable(code, disp, fills, because, status=st, capability=cap, test_menu={"id": menu[0], "status": menu[1]})

TEST_MENU_SHAPE = ("These entries say WHAT to add. The live menu's shape (components[], fasting_required, capability_id) was not visible in the briefing: Phase 0 rewrites each entry in the live shape. "
                   "Each entry lists the result concepts it must return so that nothing the rules read is left without an orderable source (review G23).")
TEST_MENU_ADD = [
    {"id": "test.glucose_capillary", "display": "Capillary glucose (meter)", "kind": "point_of_care", "why": "The Plan notes 'No capillary test is on the menu yet'. The glucose chart and every district pathway need it.", "result_concept": "obs.glucose", "qualifiers": {"specimen": "capillary_whole_blood", "context": ["random", "fasting", "two_hours_after_food", "two_hours_after_glucose"]}},
    {"id": "test.ogtt_75g", "display": "Oral glucose tolerance test, 75 g", "kind": "laboratory", "fasting_required": True, "why": "WHO retains the OGTT; it is the only test for gestational diabetes and the next step after an impaired fasting result.", "result_concept": "obs.glucose",
     "components": ["fasting", "1 hour (pregnancy)", "2 hours"], "qualifiers": {"context": ["fasting", "ogtt_1h", "ogtt_2h"]}},
    {"id": "test.ketones_blood", "display": "Blood ketones (beta-hydroxybutyrate)", "kind": "point_of_care", "why": "Preferred over urine strips by the 2024 consensus.", "result_concept": "obs.ketones_blood"},
    {"id": "test.venous_gas", "display": "Venous blood gas", "kind": "laboratory", "why": "pH and bicarbonate for ketoacidosis.", "result_concept": "obs.ph_venous", "components": ["obs.ph_venous", "obs.bicarbonate"]},
    {"id": "test.c_peptide", "display": "C-peptide", "kind": "laboratory", "why": "Classification at referral sites.", "result_concept": "obs.c_peptide"},
    {"id": "test.gad_antibodies", "display": "GAD antibodies", "kind": "laboratory", "why": "Classification at referral sites.", "result_concept": "obs.islet_autoantibody"},
    {"id": "test.vitamin_b12", "display": "Vitamin B12", "kind": "laboratory", "why": "Metformin with neuropathy or anaemia.", "result_concept": "obs.vitamin_b12"},
    {"id": "test.retinal_photograph", "display": "Retinal photograph or dilated retinal examination", "kind": "procedure", "why": "Retinopathy screening.", "result_concept": "exam.retinopathy_grade",
     "components": ["exam.retinopathy_grade", "exam.macular_oedema", "exam.retinal_view"]},
    {"id": "test.abi", "display": "Ankle-brachial index", "kind": "procedure", "why": "Peripheral artery disease; read by the limb-ischaemia referral rule.", "result_concept": "obs.abi"},
    {"id": "test.xray_abdomen", "display": "Abdominal X-ray", "kind": "imaging", "why": "Pancreatic calcification in a lean young person with diabetes and abdominal pain.", "result_concept": None, "status": "hold",
     "note": "Held until a result concept exists for the finding; a free-text report cannot feed a rule."},
    {"id": "test.urine_pcr", "display": "Urine protein-to-creatinine ratio", "kind": "laboratory", "why": "WHO's first fallback where ACR is unavailable. No rule reads it yet: add it only with a kidney rule that does.", "result_concept": "obs.upcr", "status": "hold"},
]

# ── formulary: classes and generics to add. NO strengths, NO doses. ─────────
FORMULARY_ADD = {
    "note": "MS-RX-CAT-001 holds classes and generic names only. Every dose stays 'to-verify' until verified from a primary source with a verbatim quote and CSO-signed. This list adds names; it adds no dose.",
    "incomplete": "These entries name the drug and its class and nothing more. The live entry shape (routes, renal flag, high-alert flag, chart rule, dose skeleton) was not visible. Phase 0 completes each one, and until it does: "
                  "the kidney check does not run for the new medicines, insulin aspart is not marked high-alert, and glimepiride does not open the glucose chart. The chart rule moves from 'oral_glucose_lowering' to the sulfonylurea class, and the old class is retired explicitly, not left dangling (review G24).",
    "classes": [
        {"id": "sulfonylurea", "label": "Sulfonylurea", "split_from": "oral_glucose_lowering", "why": "Hypoglycaemia checks, the rifampicin interaction and the age-60 flag are class-specific."},
        {"id": "biguanide", "label": "Biguanide", "split_from": "oral_glucose_lowering", "why": "The eGFR checks are metformin-specific."},
        {"id": "sglt2_inhibitor", "label": "SGLT2 inhibitor", "why": "On the WHO Model List since 2021; dapagliflozin added to EMHSLU 2023."},
        {"id": "dpp4_inhibitor", "label": "DPP-4 inhibitor", "why": "WHO 2018 alternative where insulin is unsuitable."},
        {"id": "glp1_receptor_agonist", "label": "GLP-1 receptor agonist", "why": "WHO Model List 2025 (semaglutide) for type 2 diabetes with cardiovascular or kidney disease and BMI 30 or more."},
        {"id": "thiazolidinedione", "label": "Thiazolidinedione", "why": "WHO 2018 alternative; the heart-failure flag needs the class."},
    ],
    "drugs": [
        {"id": "glimepiride", "generic": "Glimepiride", "class": "sulfonylurea", "source": "A1-31", "emhslu2023": "primary care (secondary source)"},
        {"id": "gliclazide", "generic": "Gliclazide", "class": "sulfonylurea", "source": "A1-30", "emhslu2023": "added 2023; tertiary (secondary source)", "exists": True},
        {"id": "glibenclamide", "generic": "Glibenclamide", "class": "sulfonylurea", "source": "A1-29", "emhslu2023": "DELETED in 2023", "exists": True,
         "flag": "Keep the entry (patients still take it) and set onEmhsluDraft false. See D-DM-22."},
        {"id": "metformin", "generic": "Metformin", "class": "biguanide", "source": "A2-51", "exists": True},
        {"id": "dapagliflozin", "generic": "Dapagliflozin", "class": "sglt2_inhibitor", "source": "A1-30", "emhslu2023": "added 2023; tertiary (secondary source)"},
        {"id": "empagliflozin", "generic": "Empagliflozin", "class": "sglt2_inhibitor", "source": "A2-48", "emhslu2023": "not confirmed"},
        {"id": "vildagliptin", "generic": "Vildagliptin", "class": "dpp4_inhibitor", "source": "A1-31", "emhslu2023": "tertiary (secondary source)"},
        {"id": "sitagliptin", "generic": "Sitagliptin", "class": "dpp4_inhibitor", "source": "A1-43", "emhslu2023": "not confirmed"},
        {"id": "pioglitazone", "generic": "Pioglitazone", "class": "thiazolidinedione", "source": "A1-31", "emhslu2023": "tertiary (secondary source)"},
        {"id": "semaglutide", "generic": "Semaglutide", "class": "glp1_receptor_agonist", "source": "A2-49", "emhslu2023": "not listed"},
        {"id": "insulin_aspart", "generic": "Insulin aspart", "class": "insulin", "source": "A1-30", "emhslu2023": "added 2023"},
        {"id": "insulin_biphasic_aspart", "generic": "Biphasic insulin aspart", "class": "insulin", "source": "A1-30", "emhslu2023": "added 2023"},
        {"id": "bendroflumethiazide", "generic": "Bendroflumethiazide", "class": "diuretic.thiazide", "source": None, "why": "A history quick pick with no formulary entry (briefing 7.3)."},
    ],
    "diagnosisLinks": [
        {"dx": "dx.dm_type2", "add": ["biguanide", "sulfonylurea", "sglt2_inhibitor", "dpp4_inhibitor", "glp1_receptor_agonist", "thiazolidinedione", "arb"], "keep": ["insulin", "statin", "acei"],
         "note": "No antiplatelet link: it is for secondary prevention only and would show on every type 2 card (review G25)."},
        {"dx": "dx.diabetic_kidney_disease", "add": ["acei", "arb", "sglt2_inhibitor", "statin"]},
        {"dx": "dx.diabetic_neuropathy", "add": ["gabapentinoid", "snri", "tricyclic_antidepressant"], "status": "hold", "note": "Classes named by ADA. Held: the classes may not exist in the formulary and this pack adds no drugs to them. No opioid link."},
        {"dx": "dx.gestational_diabetes", "add": ["biguanide", "insulin"], "note": "WHO 2025: metformin or insulin. Specialist-led."},
    ],
    "prescribingChecks": [
        {"id": "check.metformin_egfr", "outcome": "stop", "when": "metformin and latest eGFR below REF-DM-RX-METFORMIN-STOP-EGFR", "ref": "REF-DM-RX-METFORMIN-STOP-EGFR", "status": "proposed",
         "note": "The kidney check today reads only the latest creatinine and has no eGFR threshold. This check runs when a prescription is written; the catalog's red therapy flag metformin_egfr_below_30 covers the person already taking it."},
        {"id": "check.metformin_egfr_start", "outcome": "check", "when": "new metformin prescription and latest eGFR below REF-DM-RX-METFORMIN-NOSTART-EGFR", "ref": "REF-DM-RX-METFORMIN-NOSTART-EGFR", "status": "proposed"},
        {"id": "check.metformin_no_egfr", "outcome": "check", "when": "metformin and no eGFR in the last 12 months, at a site that has lab.creatinine", "ref": "REF-DM-KID-SCREEN-INTERVAL", "status": "proposed",
         "note": "Where the site has no creatinine the check would fire for ever: there it is shown once as 'kidney function not known; refer for creatinine'."},
        {"id": "check.glibenclamide_age", "outcome": "check", "when": "glibenclamide and age at or above REF-DM-RX-GLIB-AGE", "ref": "REF-DM-RX-GLIB-AGE", "status": "proposed"},
        {"id": "check.ras_pregnancy", "outcome": "stop", "when": "ACE inhibitor or ARB and a current pregnancy fact", "ref": "REF-DM-CVD-PREG-CONTRA", "status": "proposed"},
        {"id": "check.statin_pregnancy", "outcome": "check", "when": "statin and a current pregnancy fact", "ref": "REF-DM-CVD-PREG-CONTRA", "status": "proposed", "note": "ADA: stopped in most circumstances, not an absolute contraindication."},
        {"id": "check.glucose_lowering_pregnancy", "outcome": "check", "when": "a sulfonylurea, SGLT2 inhibitor, GLP-1 receptor agonist, DPP-4 inhibitor or pioglitazone and a current pregnancy fact", "ref": "REF-DM-RX-PREG", "status": "proposed"},
        {"id": "check.dual_ras", "outcome": "stop", "when": "ACE inhibitor and ARB both active", "ref": "REF-DM-CVD-RASI-ALBUMINURIA", "status": "proposed"},
        {"id": "check.ras_monitoring", "outcome": "note", "when": "new or increased ACE inhibitor or ARB: propose creatinine and potassium in 2 to 4 weeks", "ref": "REF-DM-KID-RASI-CHECK", "status": "proposed"},
        {"id": "check.sglt2_egfr", "outcome": "check", "when": "new SGLT2 inhibitor and eGFR below REF-DM-RX-SGLT2-EGFR", "ref": "REF-DM-RX-SGLT2-EGFR", "status": "proposed"},
        {"id": "check.pioglitazone_hf", "outcome": "stop", "when": "pioglitazone and heart failure on the problem list", "ref": "REF-DM-RX-PIO-HF", "status": "proposed"},
        {"id": "check.sulfonylurea_rifampicin", "outcome": "note", "when": "sulfonylurea and rifampicin both active", "ref": "REF-DM-RX-TB-RIFAMPICIN", "status": "proposed", "restrictedClass": "tb"},
        {"id": "check.insulin_glucagon", "outcome": "note", "when": "insulin prescribed and no glucagon or hypoglycaemia plan recorded", "ref": "REF-DM-RX-GLUCAGON", "status": "proposed"},
    ],
    "chartRules": [
        {"id": "chart.glucose.sglt2_unwell", "status": "proposed", "when": "SGLT2 inhibitor active and the patient is admitted", "opens": "glucose chart with a ketone row", "ref": "REF-DM-RX-SGLT2-HOLD"},
        {"id": "chart.glucose.steroid", "status": "proposed", "when": "systemic steroid prescribed to an inpatient", "opens": "glucose chart, readings after lunch or before the evening meal", "ref": "REF-DM-SUS-STEROID"},
    ],
}

# ── CFC: concepts to propose in an addendum (v1.5 or the next free number) ──
def C(code, kind, valueType, unit=None, why="", restricted=None, **k):
    d = {"code": code, "kind": kind, "valueType": valueType, "unit": unit, "why": why, "status": "propose"}
    if restricted: d["restrictedClass"] = restricted
    d.update(k)
    return d

CFC_PROPOSE = [
    C("obs.ph_venous", "observation", "quantity", "[pH]", "Ketoacidosis criterion and severity."),
    C("derived.osmolality_effective", "derived", "quantity", "mosm/kg", "HHS criterion: 2 x sodium + glucose. Computed, with its inputs' ids."),
    C("obs.c_peptide", "observation", "quantity", "pmol/L", "Classification. Requires a paired glucose and the 'on insulin' context."),
    C("obs.islet_autoantibody", "observation", "coded", None, "positive | negative, with the antibody named (GAD, IA-2, ZnT8)."),
    C("obs.chol_total", "observation", "quantity", "mmol/L", "Input to the WHO laboratory risk chart. LDL, HDL, triglycerides and non-HDL exist; total does not."),
    C("obs.vitamin_b12", "observation", "quantity", "pmol/L", "Metformin; neuropathy differential; HbA1c validity."),
    C("obs.upcr", "observation", "quantity", "mg/mmol", "WHO's first fallback for ACR."),
    C("obs.abi", "observation", "quantity", "{ratio}", "Per leg (laterality required)."),
    C("obs.visual_acuity", "observation", "coded", None, "Snellen line per eye, with a pinhole flag. Retinopathy referral rule."),
    C("exam.macular_oedema", "examination", "coded", None, "none | non_centre | centre_involving; worse eye."),
    C("exam.retinal_view", "examination", "coded", None, "adequate | inadequate | not_attempted, with method and dilation. Makes 'looked and could not see' different from 'did not look'."),
    C("exam.pinprick_foot", "examination", "coded", None, "normal | reduced; laterality."),
    C("exam.ankle_reflex", "examination", "coded", None, "present | reduced_or_absent; laterality."),
    C("exam.ipswich_touch", "examination", "quantity", "{sites}", "Sites not felt, 0 to 6."),
    C("sign.lipohypertrophy", "sign", "presence", None, "Injection-site lumps."),
    C("sign.foot_hot_swollen", "sign", "presence", None, "Possible active Charcot foot; laterality."),
    C("derived.cvd_risk_who", "derived", "quantity", "%", "10-year risk band midpoint with chart (laboratory | non_laboratory), region and chart version as qualifiers."),
    C("derived.kdigo_gfr_category", "derived", "coded", None, "G1 to G5, with the equation label."),
    C("derived.kdigo_albuminuria_category", "derived", "coded", None, "A1 to A3."),
    C("derived.iwgdf_risk", "derived", "coded", None, "0 to 3; reconcile with whatever the exam classifier already writes."),
    C("event.hypoglycaemia", "event", "coded", None, "level_1 | level_2 | level_3, with 'needed help' and the reporter. Feeds the control axis without averaging."),
    C("hx.dm_type_reported", "history", "coded", None, "type_1 | type_2 | gestational | other | not_sure, with the source (patient, card, letter). Never a diagnosis fact."),
    C("hx.dm_year_diagnosed", "history", "quantity", "a", "Year of diagnosis as reported."),
    C("hx.prior_gdm", "history", "presence", None, "Gestational diabetes in a previous pregnancy.", restricted="sexual_reproductive_health"),
    C("proc.retinal_examination", "procedure", "event", None, "Date, method, grade reference. Drives screened / overdue."),
    C("proc.foot_risk_assessment", "procedure", "event", None, "Date and the resulting category."),
    C("soc.physical_activity", "social", "coded", None, "active | inactive against the WHO 150 minutes."),
    C("soc.food_security", "social", "coded", None, "secure | not_always_enough. A major hypoglycaemia risk factor on insulin or a sulfonylurea."),
    C("target.hba1c", "target", "quantity", "%", "The clinician-accepted individual target and tier; owned by the monitoring engine."),
    C("target.bp", "target", "quantity", "mm[Hg]", "Accepted blood pressure target (systolic and diastolic components)."),
]
PROBABLY_EXIST = {"obs.c_peptide", "obs.islet_autoantibody", "obs.chol_total", "exam.ankle_reflex", "soc.physical_activity"}
for _c in CFC_PROPOSE:
    if _c["code"] in PROBABLY_EXIST: _c["status"] = "verify: the reviewer found this concept in the briefing's list of existing concepts"
    if _c["code"] == "exam.macular_oedema": _c["status"] = "verify: exam.maculopathy exists; extend or map to it, do not add a second macula concept"
CFC_NOTE = ("Diff this list against the generated concept catalogue before writing the addendum (review G22). Option ids are the catalog's: urine ketones neg, trace, 1plus, 2plus, 3plus; macula none, non_centre, centre_involving, cannot_assess. "
            "Per-condition history answers (EC-2) are note text and evidence references only: the hx.* concepts below are for the problem-list proposal the clinician confirms, not for charting the answer.")
CFC_QUALIFIERS = [
    {"concept": "obs.glucose", "qualifier": "context", "values_needed": ["random", "fasting", "ogtt_1h", "ogtt_2h", "two_hours_after_food"], "why": "A diagnostic rule may not read a glucose whose context is unknown."},
    {"concept": "obs.glucose", "qualifier": "specimen", "values_needed": ["venous_plasma", "capillary_whole_blood"], "why": "The 2-hour capillary threshold differs (12.2 against 11.1 mmol/L)."},
    {"concept": "obs.hba1c", "qualifier": "method", "values_needed": ["laboratory_ngsp", "point_of_care", "unknown"], "why": "Diagnostic use needs a quality-assured method."},
    {"concept": "derived.egfr", "qualifier": "equation", "values_needed": ["ckd_epi_2021_creatinine"], "why": "The equation label is shown beside every eGFR (D-CFC-06)."},
]
CONDITION_CONCEPTS = [
    {"dx": d, "concept": c, "status": s} for d, c, s in [
        ("dx.dm_type1", "cond.dm_type1", "map"), ("dx.dm_type2", "cond.dm_type2", "map"), ("dx.dm_type_unknown", "cond.dm_unclassified", "map"),
        ("dx.dka", "cond.dka", "map"), ("dx.hhs", "cond.hhs", "map"), ("dx.hypoglycaemia_dm", "cond.hypoglycaemia_diabetes", "map"),
        ("dx.diabetic_foot", "cond.diabetic_foot", "map"), ("dx.ckd", "cond.ckd", "map"),
        ("dx.intermediate_hyperglycaemia", "cond.intermediate_hyperglycaemia", "new"), ("dx.gestational_diabetes", "cond.gestational_diabetes", "new"),
        ("dx.diabetes_in_pregnancy", "cond.diabetes_in_pregnancy", "new"), ("dx.diabetic_retinopathy", "cond.diabetic_retinopathy", "new"),
        ("dx.diabetic_kidney_disease", "cond.diabetic_kidney_disease", "new"), ("dx.diabetic_neuropathy", "cond.diabetic_neuropathy", "new"),
        ("dx.hyperglycaemia_unconfirmed", "cond.hyperglycaemia_unconfirmed", "new"), ("dx.steroid_induced_hyperglycaemia", "cond.drug_associated_hyperglycaemia", "new"),
    ]
]
