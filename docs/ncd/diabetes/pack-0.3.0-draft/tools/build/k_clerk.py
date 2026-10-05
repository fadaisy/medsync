"""Clerking desk v2 amendments: history (04), exam (07), impression (09), plan (10).

Shapes follow the verbatim samples in the briefing (Part 2). Everything is `status: draft`.
Three engine changes are needed and are listed first; the rest is catalogue data.
"""
from lib import REFS, CLAIMS

SOURCES = {
    "WHO-HEARTS-D-2020": "A2-02", "WHO-PEN-TRAINING": "A9-48", "ADA-SOC-2026": "A3-01", "ADA-EASD-CRISES-2024": "A9-01",
    "KDIGO-CKD-2024": "A6-03", "KDIGO-DM-CKD-2022": "A6-26", "IWGDF-2023": "A8-27", "ICDR-2003": "A7-04", "ICO-2017": "A7-16",
    "WHO-GDM-2013": "A10-03", "WHO-DIP-2025": "A10-05", "TREND-UK-2020": "A9-51", "NICE-NG18": "A9-31", "UG-EYE-2016": "A7-62",
    "WHO-TB-DM-2025": "A10-31", "WHO-HBA1C-2011": "A2-06", "NGSP-2026": "A11-26", "ES-INPATIENT-2012": "A11-37", "ADA-EASD-T1-2021": "A10-49",
    "TORONTO-2010": "A8-12", "EADSG-2019": "A12-73", "UG-HIV-2022": "A1-23", "CONSENSUS-REMISSION-2021": "A10-54", "WHO-CVD-CHARTS-2019": "A5-55",
}
def sources_block():
    out = {}
    for key, cid in SOURCES.items():
        c = CLAIMS[cid]
        out[key] = {"title": c["document"], "edition": c["version"], "url": c["url"], "retrieved": c["retrieved"], "claim": cid}
    return out

def xref(ref_dm, source, meaning=None, value=None, unit=None):
    """A clerking REF entry that mirrors a REF-DM entry. One number, two addresses; the catalogue check compares them."""
    e = REFS[ref_dm]
    v = {"value": e["value"] if value is None else value, "unit": e["unit"] if unit is None else unit,
         "meaning": meaning or e["text"], "source": source,
         "status": "draft" if e["x"]["verified"] else "draft-unverified", "mirrors": ref_dm}
    return v

ENGINE_CHANGES = [
    {"id": "EC-1", "title": "A result atom in the shared evaluator",
     "where": "lib/clerking/exam/context.ts evalCond; lib/clerking/impression/facts.ts (new finding ref 'res:<concept>')",
     "spec": {"atom": {"result": "<CFC concept id>", "qualifiers": "<optional: the fact model's own qualifier keys, e.g. fastingState, challenge, specimen>", "gte_ref|gt_ref|lt_ref|lte_ref": "<REF id>", "max_age_ref": "<REF id, days>", "min_trust": "1..4"},
              "semantics": ["Reads the latest non-superseded observation fact for the concept THAT MATCHES THE QUALIFIERS, at or before the note time. A later random glucose must not hide an earlier fasting one.",
                            "Qualifier names and values in this pack ('fastingState: fasting', 'challenge: ogtt_75g_2h', 'specimen: capillary') are placeholders. Phase 0 maps them to MS-DATA-CFC-001 section 4.1; no second vocabulary is created.",
                            "HbA1c: the atom is UNKNOWN for a diagnostic rule while a blocking validity caveat holds (pregnancy, HIV on ART, a haemoglobin variant, haemolysis, recent malaria or transfusion, iron or B12 deficiency, eGFR below the reference) or the method is not a certified laboratory method. The matrix still shows the value, marked 'not usable for diagnosis' with the reason; a restricted reason is shown only in views that hold that class.",
                            "TRUE or FALSE only when a fact exists inside max_age and at or above min_trust; otherwise UNKNOWN. Unknown never satisfies an atom and never counts against a diagnosis.",
                            "Both bounds may be given (a band).",
                            "The evidence matrix shows the value, its date, its age in days and the trust badge.",
                            "A restricted concept can never be evidence on a standard diagnosis (existing check.ts rule)."]},
     "why": "Gap 3 of the briefing: HbA1c, eGFR, UACR and laboratory glucose cannot be evidence today.",
     "tests": "Both ways for every rule that uses it; an empty record stays silent; an out-of-window result is unknown, not false."},
    {"id": "EC-2", "title": "Per-condition detail in Past history",
     "where": "data/clerking/clerking-history-catalogue.v1.json past_history.condition_details; lib/clerking/answers.ts HistorySchema; compose.ts; a new atom past_detail",
     "spec": {"answerShape": "past.conditions.<id>.details: { <propertyId>: value }", "atom": {"past_detail": "<condition id>", "property": "<property id>", "equals|any_of|includes_any": "..."},
              "rules": ["Shown only when the condition is answered yes.", "Uses the existing property kinds (one, many, year, text) and phrase grammar.", "Unanswered properties are absent keys.",
                        "Nothing is charted from these answers: they are note text and evidence refs ('pmh:diabetes#type'). The problem-list proposal carries them as qualifiers for the clinician to confirm."]},
     "why": "Gap 2: Past history is a bare yes/no with 'since'."},
    {"id": "EC-3", "title": "A context qualifier on the glucose vital atom",
     "where": "lib/clerking/exam/context.ts evalCond (vital atom)",
     "spec": {"atom": {"vital": "vs.glucose", "context": "random|fasting|two_hours_after_food|two_hours_after_glucose", "gte_ref": "<REF>"},
              "rules": ["One vocabulary: the values the vital already stores. The laboratory result atom (EC-1) uses the fact model's qualifiers; the two are mapped once, in code, and tested.",
                        "A capillary value is never read against a venous 2-hour threshold: the capillary threshold has its own reference (REF-DX-GLU-2H-DM-CAP)."]},
     "why": "vs.glucose already stores a required context. A fasting threshold must not fire on a random value."},
    {"id": "EC-4", "title": "A signed suggested-care list for the Plan",
     "where": "data/clerking/plan-care.v1.json (new); lib/clerking/plan/problems.ts",
     "spec": {"item": {"id": "CARE-…", "problems": ["dx.…"], "label": "…", "kind": "test|screen|refer|recall|educate|review", "when": "<atoms, optional>", "opens": {"tests": ["test.…"], "followUp": "…", "disposition": "…"},
                       "requiresPrescribing": "boolean", "source": "<source key>", "refs": ["REF-…"], "status": "draft"}},
     "why": "Suggested care is empty until a signed list exists. A ticked item is stored as plan.problems[id].care[itemId] = true, which the schema already allows.",
     "rules": ["'opens' adds to the basket; it never overwrites a disposition or follow-up the clinician has already set.",
               "An item with min_age_ref is hidden below that age; an item with max_age_ref is hidden at or above it.",
               "'due: later' items create a follow-up task, not a test in today's basket.",
               "refs_dm is provenance for the dossier and is ignored by the clerking sign-off; the references that gate a rule are the REF-EX and REF-DX entries, which are generated from the dossier and never typed twice."]},
    {"id": "EC-5", "title": "A pregnancy atom",
     "where": "lib/clerking/exam/context.ts evalCond; the pregnancy episode in the fact model",
     "spec": {"atom": {"pregnancy": "current|not_pregnant|unknown"}, "rules": ["'unknown' when the patient could be pregnant and nobody has recorded the answer.", "Results offered as evidence on a pregnancy diagnosis are bounded to the current pregnancy episode.", "Restricted class handling follows D-DM-30."]},
     "why": "Without it the two pregnancy profiles cannot be gated, a pregnant woman with a fasting glucose of 7.0 is offered the wrong diagnosis, and the statin and ACE inhibitor items cannot exclude pregnancy (review G10). Both pregnancy profiles and DDX-PREGNANCY-GLUCOSE are withheld until it exists."},
    {"id": "EC-6", "title": "Glucose entry: units, and readings that are not numbers",
     "where": "vs.glucose in the exam catalogue and the vitals form",
     "spec": {"fields": {"unit": "mmol/L | mg/dL (converted by the platform, stored in mmol/L with the entered unit kept)", "reads": "number | HI | LO"},
              "rules": ["HI satisfies every 'at or above' glucose atom; LO satisfies every 'below' atom. No number is invented for either.", "A plausibility range, signed as a reference entry, rejects a mg/dL value typed as mmol/L."]},
     "why": "The two most dangerous meter readings cannot be recorded today, so every rule is silent for the sickest patients at meter-only sites (reviews F25, G17)."},
    {"id": "EC-7", "title": "Smaller evaluator and catalogue additions this pack uses",
     "where": "see each line",
     "spec": {"history": ["applies_to: 'past_history' on a flag rule", "shown_when and includes_any on a history property", "a per-condition composer that omits any clause whose property is unanswered"],
              "exam": ["the vs.ketones panel and its save path", "panel atoms: {panel, field, gte_ref|lt_ref|any_of} and {panel, recorded}", "medicine atom reading adherence: {medicine, adherence_any}",
                       "two classifiers (ketone_band, dr_review); classifiers live in code, so these are specifications to implement, not data to load", "exam option_sets with options_ref", "token map entries with value_from_option", "the 'undilated' composer rule on fundoscopy"],
              "diagnosis": ["setting as a list in a DDX rule", "ask kinds 'panel' and 'past_detail'", "amend operations (EC-8)", "a 'requires' gate on a profile (EC-5)"],
              "plan": ["patient age atoms min_age_ref and max_age_ref", "opens.disposition and opens.followUp, add-only", "item keys refs_dm, ncd_step, where_unavailable, due"],
              "formulary": ["a ketone row on the glucose chart"]},
     "why": "Each was used by the first draft without being declared (review G18). Any that Phase 0 finds already present is struck from this list; any the owner declines removes the rules that depend on it, which the catalogue check then reports."},
    {"id": "EC-8", "title": "What 'amend' means in a catalogue amendment",
     "where": "the loader for data/clerking/*.amendment.json (new), or by hand in Phase 2",
     "spec": {"rules": ["_op 'add' creates a new entry and fails if the id exists.", "_op 'amend' MERGES: listed atoms are appended to suggest_for, suggest_against, ask and tests_to_decide if not already present; scalar fields are changed only where the amendment lists them under '_changes'. Nothing is removed.",
                        "The six diabetes profiles marked 'amend' were written without sight of the live profiles. Phase 0 produces a per-profile diff against the live catalogue for the CSO; nothing is applied blind."]},
     "why": "'Replace' would wipe signed content, for example the live dx.ckd profile (review G11)."},
]

# ═══ 04 Past history: diabetes detail ═══════════════════════════════════════
HISTORY = {
    "past_history.condition_details": {
        "diabetes": {"label": "About the diabetes", "shown_when": {"past_condition": "diabetes", "answer": "yes"}, "properties": [
            {"id": "type", "label": "Type", "kind": "one", "options": [
                {"id": "type_1", "label": "Type 1"}, {"id": "type_2", "label": "Type 2"},
                {"id": "other", "label": "Another type"}, {"id": "not_sure", "label": "Not sure"}], "phrase": {"pre": "", "post": ""}},
            {"id": "year_diagnosed", "label": "Year diagnosed", "kind": "year", "phrase": {"pre": "diagnosed ", "post": ""}},
            {"id": "treatment", "label": "Treatment now", "kind": "many", "options": [
                {"id": "diet_only", "label": "Diet only"}, {"id": "tablets", "label": "Tablets"}, {"id": "insulin", "label": "Insulin"},
                {"id": "herbal", "label": "Herbal or traditional"}, {"id": "none", "label": "None"}], "exclusive_options": ["none"], "phrase": {"pre": "on ", "post": ""}},
            {"id": "insulin_from_start", "label": "On insulin since diagnosis", "kind": "one", "shown_when": {"property": "treatment", "includes_any": ["insulin"]},
             "options": [{"id": "yes", "label": "Yes"}, {"id": "no", "label": "No"}, {"id": "not_sure", "label": "Not sure"}]},
            {"id": "complications_told", "label": "Told of problems with", "kind": "many", "options": [
                {"id": "eyes", "label": "Eyes"}, {"id": "kidneys", "label": "Kidneys"}, {"id": "nerves_or_feet", "label": "Nerves or feet"},
                {"id": "heart", "label": "Heart"}, {"id": "stroke", "label": "Stroke"}, {"id": "foot_ulcer", "label": "Foot ulcer"},
                {"id": "amputation", "label": "Amputation"}, {"id": "none_told", "label": "None told"}], "exclusive_options": ["none_told"], "phrase": {"pre": "known problems: ", "post": ""}},
            {"id": "last_eye_check", "label": "Last eye check", "kind": "one", "options_ref": "last_check",
             "phrase": {"pre": "last eye check ", "post": ""}},
            {"id": "last_foot_check", "label": "Last foot check", "kind": "one", "options_ref": "last_check", "phrase": {"pre": "last foot check ", "post": ""}},
            {"id": "last_kidney_test", "label": "Last urine and kidney test", "kind": "one", "options_ref": "last_check", "phrase": {"pre": "last kidney test ", "post": ""}},
            {"id": "lows_12_months", "label": "Low blood sugar in the last 12 months", "kind": "one", "options": [
                {"id": "none", "label": "None"}, {"id": "self_treated", "label": "Once, managed without help"}, {"id": "repeated", "label": "More than once, managed without help"},
                {"id": "measured_below_3", "label": "A reading below 3.0 mmol/L"}, {"id": "needed_help", "label": "Needed someone's help"}, {"id": "not_sure", "label": "Not sure"}],
             "phrase": {"pre": "lows in the last year: ", "post": ""}},
            {"id": "admitted_for_sugar", "label": "Admitted for very high sugar or ketoacidosis", "kind": "one", "options": [
                {"id": "never", "label": "Never"}, {"id": "over_1_year", "label": "More than a year ago"}, {"id": "within_1_year", "label": "In the last year"}, {"id": "not_sure", "label": "Not sure"}],
             "phrase": {"pre": "admitted for high sugar ", "post": ""}},
            {"id": "tests_at_home", "label": "Tests sugar at home", "kind": "one", "options": [{"id": "yes", "label": "Yes"}, {"id": "no", "label": "No"}]},
            {"id": "regular_clinic", "label": "Attends a diabetes clinic", "kind": "one", "options": [{"id": "yes", "label": "Yes"}, {"id": "no", "label": "No"}]},
        ],
        "composer": "Diabetes ({type}) {year_diagnosed}, {treatment}; {complications_told}; {last_eye_check}; {lows_12_months}.",
        "composer_rule": "A clause whose property is unanswered is omitted with its punctuation. An unanswered property is an absent key and leaves no mark in the note.",
        "rule": "Reported, not verified. Nothing here is charted; the type and the complications become qualifiers on the problem-list proposal the clinician confirms.",
        "not_here": "Gestational diabetes in a previous pregnancy is NOT an option under 'type': it would make the woman a known diabetic to every rule. It is a separate past-history question (below), a risk factor, and its restricted class is D-DM-30.",
        "source": "ADA-SOC-2026", "status": "draft"},
    },
    "option_sets.add": {"last_check": [{"id": "within_1_year", "label": "In the last year"}, {"id": "1_to_2_years", "label": "1 to 2 years ago"},
                                        {"id": "over_2_years", "label": "More than 2 years ago"}, {"id": "never", "label": "Never"}, {"id": "not_sure", "label": "Not sure"}]},
    "past_history.questions.propose": [{"id": "gestational_diabetes_before", "label": "Diabetes in a previous pregnancy", "kind": "yes_no", "feeds": "hx.prior_gdm", "restricted_class": "sexual_reproductive_health (proposed; D-DM-30)",
                                        "rule": "A risk factor for testing. Never answers 'past condition: diabetes'."}],
    "medicines.quick_picks.add": ["gliclazide", "glimepiride", "dapagliflozin", "prednisolone"],
    "medicines.quick_picks.note": "glibenclamide stays: patients still take it although EMHSLU 2023 deleted it.",
    "flag_rules.add": [
        {"id": "FLAG-DM-LOW-NEEDED-HELP", "level": "caution", "badge": "Low needing help in the last year",
         "reason": "A low needing someone's help in the last year: review the treatment and the target at this visit",
         "applies_to": "past_history", "when": {"past_detail": "diabetes", "property": "lows_12_months", "equals": "needed_help"},
         "source": "ADA-SOC-2026", "status": "draft", "shown_in": "flags_panel", "needs": ["EC-2"], "refs_dm": ["REF-DM-HYPO-DEINTENSIFY"]},
        {"id": "FLAG-DM-ADMITTED-RECENT", "level": "caution", "badge": "Admitted for high sugar in the last year",
         "reason": "Admitted for very high sugar or ketoacidosis in the last year: ask what led to it and review sick-day rules",
         "applies_to": "past_history", "when": {"past_detail": "diabetes", "property": "admitted_for_sugar", "equals": "within_1_year"},
         "source": "ADA-SOC-2026", "status": "draft", "shown_in": "flags_panel", "needs": ["EC-2"], "refs_dm": ["REF-DM-ACU-PRECIPITANTS"]},
    ],
}

# ═══ 07 Examination ═════════════════════════════════════════════════════════
DR_RECALL = {"none": "REF-DM-EYE-RECALL-NONE-MILD-MAX", "mild_npdr": "REF-DM-EYE-RECALL-MILD-MIN", "moderate_npdr": "REF-DM-EYE-RECALL-MODERATE-MIN", "severe_npdr": "REF-DM-EYE-RECALL-SEVERE",
             "pdr": "REF-DM-EYE-RECALL-PDR", "dme_centre": "REF-DM-EYE-RECALL-DME-CI", "dme_non_centre": "REF-DM-EYE-RECALL-DME-NCI"}
FUNDUS = "ex.eyes_ent_neck.fundoscopy"
FA = lambda attr, vals: {"item": FUNDUS, "attribute": attr, "any_of": vals}
EXAM = {
    "medicine_groups.add": {
        "sulfonylurea": ["glibenclamide", "gliclazide", "glimepiride", "glipizide"],
        "insulin": ["insulin"],
        "metformin": ["metformin"],
        "sglt2_inhibitor": ["dapagliflozin", "empagliflozin", "canagliflozin"],
        "ras_blocker": ["enalapril", "lisinopril", "captopril", "ramipril", "perindopril", "losartan", "valsartan", "telmisartan", "candesartan"],
        "statin": ["atorvastatin", "simvastatin", "rosuvastatin"],
        "systemic_steroid": ["prednisolone", "prednisone", "dexamethasone", "hydrocortisone", "methylprednisolone"],
    },
    "medicine_groups.rules": ["Membership comes from the formulary's drug class on the recorded medicine wherever the record has one; the name stems above are the fallback for free text and need signed brand stems before they are relied on (review G16).",
                              "systemic_steroid matches oral and injected routes only: a cream, inhaler or eye drop is not a systemic steroid."],
    "vital_signs.panels.add": [
        {"id": "vs.ketones", "label": "Ketones", "on_demand": True, "fields": [
            {"id": "blood", "label": "Blood ketones", "unit": "mmol/L", "plausible": [0, 12], "concept": "obs.ketones_blood"},
            {"id": "urine", "label": "Urine ketones", "kind": "one", "options": [{"id": "neg", "label": "Negative"}, {"id": "trace", "label": "Trace"}, {"id": "1plus", "label": "1+"}, {"id": "2plus", "label": "2+"}, {"id": "3plus", "label": "3+ or more"}], "concept": "obs.ketones_urine"}],
         "rule": "Either field may be recorded. Saved with the vital set. Offered by SUG-GLU-KETONES; never required."},
    ],
    "reference_entries.add": {
        "REF-EX-GLU-KETONE-TEST": xref("REF-DM-ACU-KETONE-TEST-GLU", "WHO-PEN-TRAINING"),
        "REF-EX-KETONE-DKA": xref("REF-DM-ACU-DKA-BOHB", "ADA-EASD-CRISES-2024"),
        "REF-EX-KETONE-RISK": xref("REF-DM-ACU-KETONE-RISK", "TREND-UK-2020"),
        "REF-EX-KETONE-RAISED": xref("REF-DM-ACU-KETONE-LOW", "TREND-UK-2020", meaning="Blood ketones at or above this value are raised"),
        "REF-EX-DR-RECALL": {"value": {k: REFS[r]["value"] for k, r in DR_RECALL.items()}, "unit": "months",
                             "meaning": "Re-examination interval by grade. Mild and moderate use the near end of ICO's range; the far end applies only where control is confirmed at target.", "source": "ICO-2017", "status": "draft",
                             "mirrors": list(DR_RECALL.values())},
    },
    "items.add": {
        "ex.skin.injection_sites": {"id": "ex.skin.injection_sites", "label": "Injection sites",
            "response": {"type": "state", "negative_label": "No lumps", "positive_label": "Lumps or thickening"},
            "attributes": [{"id": "where", "label": "Where", "kind": "many", "options": [{"id": "abdomen", "label": "Abdomen"}, {"id": "thigh", "label": "Thigh"}, {"id": "arm", "label": "Upper arm"}, {"id": "buttock", "label": "Buttock"}]}],
            "phrase": {"negative": "no lumps at injection sites", "positive": "lumps or thickening at injection sites"}, "sensitivity": "standard", "applies_to_sex": None,
            "hint": {"text": "Look and feel at every site the patient uses. Insulin injected into a lump is absorbed unpredictably."}, "system": "skin", "concept": "sign.lipohypertrophy", "source": "EADSG-2019"},
        "ex.eyes_ent_neck.visual_acuity": {"id": "ex.eyes_ent_neck.visual_acuity", "label": "Visual acuity", "reconcile": "Add only if no acuity item exists.",
            "response": {"type": "measured"},
            "attributes": [{"id": "right", "label": "Right eye", "kind": "one", "options_ref": "snellen"}, {"id": "left", "label": "Left eye", "kind": "one", "options_ref": "snellen"},
                           {"id": "pinhole", "label": "With pinhole", "kind": "one", "options": [{"id": "yes", "label": "Yes"}, {"id": "no", "label": "No"}]}],
            "phrase": {"positive": "visual acuity right {right}, left {left}", "one_eye": "visual acuity {side} {value}"}, "system": "eyes_ent_neck", "concept": "obs.visual_acuity", "source": "ICO-2017"},
    },
    "items.amend": {
        "ex.eyes_ent_neck.fundoscopy": {"attributes.add": [
            {"id": "method", "label": "How", "kind": "one", "options": [{"id": "dilated", "label": "Pupils dilated"}, {"id": "undilated", "label": "Not dilated"}, {"id": "photograph", "label": "Retinal photograph"}]},
            {"id": "view", "label": "View", "kind": "one", "options": [{"id": "adequate", "label": "Adequate to grade"}, {"id": "inadequate", "label": "Inadequate"}],
             "reconcile": "The live item has 'seen = not_visualised'. Keep one way of saying 'looked and could not see': merge these in Phase 0 and make the classifier read the survivor."},
            {"id": "dr_grade", "label": "Retinopathy grade (worse eye)", "kind": "one",
             "shown_when": {"all": [{"attribute": "view", "any_of": ["adequate"]}, {"attribute": "method", "any_of": ["dilated", "photograph"]}]},
             "options": [{"id": "none", "label": "No retinopathy seen"}, {"id": "mild_npdr", "label": "Mild: small red dots only"}, {"id": "moderate_npdr", "label": "Moderate"},
                         {"id": "severe_npdr", "label": "Severe"}, {"id": "pdr", "label": "Proliferative: new vessels or bleeding into the eye"}],
             "hint_from": "dossier entry REF-DM-EYE-ICDR", "hint_rule": "The grade definitions are shown from the signed reference entry, in plain words; no threshold is typed into the hint."},
            {"id": "macula", "label": "Macula", "kind": "one", "shown_when": {"all": [{"attribute": "view", "any_of": ["adequate"]}, {"attribute": "method", "any_of": ["dilated", "photograph"]}]},
             "options": [{"id": "none", "label": "No swelling or hard exudate"}, {"id": "non_centre", "label": "Swelling or exudate, centre spared"}, {"id": "centre_involving", "label": "Involving the centre"}, {"id": "cannot_assess", "label": "Cannot assess"}]}],
            "commit": {"dr_grade": "exam.retinopathy_grade", "macula": "exam.macular_oedema", "view": "exam.retinal_view"},
            "rule": "A grade can be recorded only on an adequate view through dilated pupils or on a photograph. 'No retinopathy seen' on such a view is a real result and clears the screening prompt. "
                    "An undilated look that seems normal composes as 'no retinopathy seen (undilated, not a screen)', commits no grade, and leaves the eyes counted as not screened.",
            "source": "ICDR-2003"},
        "ex.feet.foot_risk_history": {"note": "No change. IWGDF 2023 re-read (REF-DM-FOOT-IWGDF)."},
    },
    "option_sets.add": {"snellen": [{"id": s.replace("/", "_").lower(), "label": s} for s in ["6/6", "6/9", "6/12", "6/18", "6/24", "6/36", "6/60", "CF", "HM", "PL", "NPL"]]
                                    + [{"id": "not_tested", "label": "Not tested (no chart)"}]},
    "classifiers.add": {
        "acuity_band": {"label": "Visual acuity", "input": "ex.eyes_ent_neck.visual_acuity", "source": "ICO-2017", "rules": [
            {"result": "worse_than_6_12", "when": {"any": [{"item": "ex.eyes_ent_neck.visual_acuity", "attribute": "right", "any_of": ["6_18", "6_24", "6_36", "6_60", "cf", "hm", "pl", "npl"]}, {"item": "ex.eyes_ent_neck.visual_acuity", "attribute": "left", "any_of": ["6_18", "6_24", "6_36", "6_60", "cf", "hm", "pl", "npl"]}]}}],
            "note": "Either eye. ICO refers when acuity is worse than 6/12 whatever the retinal grade; the line is the dossier's REF-DM-EYE-REFER-VA."},
        "ketone_band": {"label": "Ketones", "input": "vs.ketones", "source": "ADA-EASD-CRISES-2024", "rules": [
            {"result": "high", "when": {"any": [{"panel": "vs.ketones", "field": "blood", "gte_ref": "REF-EX-KETONE-DKA"}, {"panel": "vs.ketones", "field": "urine", "any_of": ["2plus", "3plus"]}]}},
            {"result": "moderate", "when": {"panel": "vs.ketones", "field": "blood", "gte_ref": "REF-EX-KETONE-RISK"}},
            {"result": "raised", "when": {"any": [{"panel": "vs.ketones", "field": "blood", "gte_ref": "REF-EX-KETONE-RAISED"}, {"panel": "vs.ketones", "field": "urine", "any_of": ["trace", "1plus"]}]}}],
            "note": "First match wins. The bands are named as findings (high, moderate, raised), not as diagnoses: a fasting or vomiting person without diabetes can have high ketones. "
                    "Urine strips lag behind blood ketones: a low strip with a ketoacidotic picture is not reassurance. The urine cut (2+) is the dossier's REF-DM-ACU-DKA-UKET."},
        "dr_review": {"label": "Retinopathy: next step", "input": FUNDUS, "source": "ICO-2017", "rules": [
            {"result": "refer_within_1_month", "when": {"any": [FA("dr_grade", ["pdr"]), FA("macula", ["centre_involving"])]}},
            {"result": "refer_within_3_months", "when": FA("dr_grade", ["severe_npdr"])},
            {"result": "refer_cannot_assess", "when": {"any": [FA("macula", ["cannot_assess"]), FA("view", ["inadequate"]), FA("seen", ["not_visualised"]),
                                                              {"classifier": "acuity_band", "any_of": ["worse_than_6_12"]}, {"symptom": "sym.blurred_vision", "answer": "yes"}]}},
            {"result": "re_examine_3_months", "when": FA("macula", ["non_centre"])},
            {"result": "refer_routine", "when": FA("dr_grade", ["moderate_npdr"])},
            {"result": "re_examine_by_grade", "when": {"all": [FA("dr_grade", ["none", "mild_npdr"]), FA("view", ["adequate"]), FA("method", ["dilated", "photograph"]), {"item": "ex.eyes_ent_neck.visual_acuity", "recorded": True}]}},
            {"result": "incomplete", "when": FA("dr_grade", ["none", "mild_npdr"])}],
            "ref": "REF-EX-DR-RECALL",
            "note": "First match wins, most urgent first. ICO: refer when acuity is worse than 6/12 or there are visual symptoms, whatever the grade, and when the retina cannot be seen. "
                    "'re_examine_by_grade' needs an adequate dilated or photographic view AND a recorded acuity; without them the result is 'incomplete', never a reassuring interval. "
                    "Uganda's Eye Care Guidelines 2016 refer everyone with diabetes to a retina clinic: the CSO chooses between that rule and ICO's (D-DM-14). The acuity classifier is new.",
            "reconcile": "sym.blurred_vision id; the 'recorded' atom on an item"},
    },
    "flag_rules.add": [
        {"id": "FLAG-EX-KETONES-HIGH-DM", "level": "urgent", "badge": "Ketones {ketones}", "reason": "High ketones with diabetes or a raised glucose: possible ketoacidosis. Venous gas or bicarbonate and senior review now, or refer now where there is no gas",
         "when": {"all": [{"classifier": "ketone_band", "any_of": ["high"]}, {"any": [{"vital": "vs.glucose", "gte_ref": "REF-EX-GLU-HIGH"}, {"past_condition": "diabetes", "answer": "yes"}, {"medicine_group": "insulin"}, {"medicine_group": "sulfonylurea"},
                                                                                       {"medicine_group": "metformin"}, {"medicine_group": "sglt2_inhibitor"}, {"finding": {"item": "ex.respiratory.breathing_pattern", "is": "kussmaul"}}]}]},
         "source": "ADA-EASD-CRISES-2024", "status": "draft", "refs_dm": ["REF-DM-ACU-DKA-BOHB", "REF-DM-ACU-DKA-UKET", "REF-DM-ACU-DKA-GLU"], "reconcile": "breathing_pattern finding shape"},
        {"id": "FLAG-EX-KETONES-HIGH", "level": "caution", "badge": "Ketones {ketones}", "reason": "High ketones without known diabetes or a raised glucose: fasting, vomiting, alcohol and pregnancy do this too. Check the glucose",
         "when": {"classifier": "ketone_band", "any_of": ["high"]}, "source": "ADA-EASD-CRISES-2024", "status": "draft", "refs_dm": ["REF-DM-ACU-DKA-UKET"],
         "note": "Same badge text as the urgent flag, so the two merge and the higher level wins."},
        {"id": "FLAG-EX-KETONES-RISK", "level": "caution", "badge": "Ketones {ketones}", "reason": "Raised ketones: at risk of ketoacidosis. Recheck and look for the cause",
         "when": {"classifier": "ketone_band", "any_of": ["moderate"]}, "source": "TREND-UK-2020", "status": "draft", "refs_dm": ["REF-DM-ACU-KETONE-RISK"]},
        {"id": "FLAG-EX-GLU-KETONE-TEST", "level": "caution", "badge": "Glucose {glucose}: test ketones", "reason": "Glucose 18 mmol/L or more: test urine ketones today. No strip here: refer if the patient is unwell, dry or drowsy",
         "when": {"all": [{"vital": "vs.glucose", "gte_ref": "REF-EX-GLU-KETONE-TEST"}, {"not": {"panel": "vs.ketones", "recorded": True}}]}, "source": "WHO-PEN-TRAINING", "status": "draft",
         "refs_dm": ["REF-DM-ACU-KETONE-TEST-GLU"], "note": "Clears once a ketone result is recorded. 'recorded' on a panel may need adding to evalCond."},
        {"id": "FLAG-EX-INSULIN-STOPPED", "level": "urgent", "badge": "Medicine stopped: insulin", "reason": "Insulin stopped in a person who depends on it or is unwell: risk of ketoacidosis. Check glucose and ketones now",
         "when": {"all": [{"medicine": "insulin", "adherence_any": ["stopped"]},
                          {"any": [{"past_detail": "diabetes", "property": "type", "equals": "type_1"}, {"past_detail": "diabetes", "property": "insulin_from_start", "equals": "yes"},
                                   {"vital": "vs.glucose", "gte_ref": "REF-EX-GLU-HIGH"}, {"symptom": "sym.vomiting", "answer": "yes"}, {"classifier": "ketone_band", "any_of": ["high", "moderate", "raised"]}]}]},
         "source": "ADA-SOC-2026", "status": "draft", "refs_dm": ["REF-DM-ACU-SICKDAY-INSULIN", "REF-DM-ACU-PRECIPITANTS"], "needs": ["EC-2", "EC-7 (medicine atom reading adherence)"],
         "note": "The existing FLAG-MED-ADHERENCE already raises a caution for any stopped medicine, insulin included. This one raises it to urgent only where stopping is dangerous; its badge must match the existing flag's badge text so the two merge (set in Phase 0)."},
        {"id": "FLAG-EX-SGLT2-UNWELL", "level": "urgent", "badge": "SGLT2 inhibitor and vomiting", "reason": "On an SGLT2 inhibitor with vomiting or abdominal pain: ketoacidosis can occur with a normal glucose. Check ketones now",
         "when": {"all": [{"medicine_group": "sglt2_inhibitor"}, {"any": [{"symptom": "sym.vomiting", "answer": "yes"}, {"symptom": "sym.abdominal_pain", "answer": "yes"}, {"finding": {"item": "ex.respiratory.breathing_pattern", "is": "kussmaul"}}]}]},
         "source": "ADA-EASD-CRISES-2024", "status": "draft", "refs_dm": ["REF-DM-ACU-EDKA"], "reconcile": "sym.vomiting, sym.abdominal_pain and the breathing_pattern finding shape"},
        {"id": "FLAG-EX-DR-SIGHT", "level": "caution", "badge": "Retinopathy needs referral", "reason": "Refer to an ophthalmologist: within 1 month for new vessels or swelling at the centre of the macula, within 3 months for severe retinopathy",
         "when": {"classifier": "dr_review", "any_of": ["refer_within_1_month", "refer_within_3_months"]}, "source": "ICO-2017", "status": "draft", "refs_dm": ["REF-DM-EYE-RECALL-PDR", "REF-DM-EYE-RECALL-SEVERE"]},
    ],
    "suggestion_rules.add": [
        {"id": "SUG-PMH-DIABETES", "when": {"past_condition": "diabetes", "answer": "yes"},
         "targets": ["vs.glucose", "vs.bp", "vs.weight", "vs.waist", "ex.feet", "ex.eyes_ent_neck.visual_acuity", "ex.eyes_ent_neck.fundoscopy"],
         "why": "Known diabetes: glucose, blood pressure, weight and feet at every review; eyes when due", "source": "WHO-HEARTS-D-2020", "status": "draft", "refs_dm": ["REF-DM-ACT-EVERY-VISIT", "REF-DM-FOOT-EVERY-VISIT"],
         "note": "SUG-POLYURIA's past-diabetes branch is NOT removed: it offers hydration, breathing pattern and odour, which this rule does not. If the two chips duplicate a target, the suggester's existing de-duplication handles it."},
        {"id": "SUG-DM-UNWELL", "when": {"all": [{"past_condition": "diabetes", "answer": "yes"}, {"any": [{"symptom": "sym.vomiting", "answer": "yes"}, {"symptom": "sym.abdominal_pain", "answer": "yes"}, {"symptom": "sym.confusion", "answer": "yes"}]}]},
         "targets": ["vs.glucose", "vs.ketones", "ex.general.hydration", "ex.respiratory.breathing_pattern", "ex.general.odour"], "why": "Diabetes and unwell: glucose, ketones, hydration and breathing", "source": "ADA-EASD-CRISES-2024", "status": "draft",
         "refs_dm": ["REF-DM-ACU-REFER-ALL"], "reconcile": "sym.vomiting, sym.abdominal_pain, sym.confusion ids"},
        {"id": "SUG-DM-INSULIN-SITES", "when": {"medicine_group": "insulin"}, "targets": ["ex.skin.injection_sites"], "why": "On insulin: check the injection sites", "source": "EADSG-2019", "status": "draft", "refs_dm": ["REF-DM-ACT-EDU-INJECTION"]},
        {"id": "SUG-DM-POSTURAL", "when": {"all": [{"past_condition": "diabetes", "answer": "yes"}, {"symptom": "sym.dizziness", "answer": "yes"}]}, "targets": ["vs.postural"],
         "why": "Diabetes with dizziness: lying and standing blood pressure", "source": "ADA-SOC-2026", "status": "draft", "refs_dm": ["REF-DM-NEU-OH-SBP"], "reconcile": "sym.dizziness id"},
        {"id": "SUG-DM-NEURO", "when": {"all": [{"past_condition": "diabetes", "answer": "yes"}, {"symptom": "sym.numbness", "answer": "yes"}]},
         "targets": ["ex.feet.monofilament", "ex.feet.vibration_128", "ex.feet.ipswich_touch", "ex.nervous.reflexes"], "why": "Diabetes with numb or burning feet: sensation and ankle reflexes",
         "source": "ADA-SOC-2026", "status": "draft", "refs_dm": ["REF-DM-NEU-TESTS"], "reconcile": "sym.numbness and ex.nervous.reflexes ids"},
        {"id": "SUG-GLU-KETONES", "when": {"vital": "vs.glucose", "gte_ref": "REF-EX-GLU-KETONE-TEST"}, "targets": ["vs.ketones", "ex.general.hydration", "ex.respiratory.breathing_pattern", "ex.general.odour"],
         "why": "Glucose 18 mmol/L or more: ketones, hydration and breathing", "source": "WHO-PEN-TRAINING", "status": "draft", "refs_dm": ["REF-DM-ACU-KETONE-TEST-GLU"]},
        {"id": "SUG-SGLT2-KETONES", "when": {"all": [{"medicine_group": "sglt2_inhibitor"}, {"any": [{"symptom": "sym.vomiting", "answer": "yes"}, {"symptom": "sym.abdominal_pain", "answer": "yes"}]}]},
         "targets": ["vs.ketones", "vs.glucose", "ex.respiratory.breathing_pattern"], "why": "On an SGLT2 inhibitor and unwell: ketones even if glucose is normal", "source": "ADA-EASD-CRISES-2024", "status": "draft", "refs_dm": ["REF-DM-ACU-EDKA"]},
    ],
    "token_map.add": {"items": {"ex.skin.injection_sites": "sign.lipohypertrophy", "ex.eyes_ent_neck.visual_acuity": "obs.visual_acuity"},
                      "options": [{"item": "ex.eyes_ent_neck.fundoscopy", "attribute": "dr_grade", "concept": "exam.retinopathy_grade", "value_from_option": True},
                                  {"item": "ex.eyes_ent_neck.fundoscopy", "attribute": "macula", "concept": "exam.macular_oedema", "value_from_option": True, "reconcile": "exam.maculopathy already exists: extend it or map to it; do not create a second macula concept"}]},
}

# ═══ 09 Impression: REF-DX, named scales, profiles, differential rules ══════
def A(text, atom):
    return {"text": text, "atom": atom}
QUAL = {"fasting": {"fastingState": "fasting"}, "ogtt_1h": {"challenge": "ogtt_75g_1h"}, "ogtt_2h": {"challenge": "ogtt_75g_2h"}}
def RES(concept, context=None, **k):
    """A laboratory result atom (EC-1). Qualifier names are placeholders for the fact model's own (Phase 0)."""
    d = {"result": concept, **k}
    if context: d["qualifiers"] = QUAL[context]
    if concept == "obs.glucose": d.setdefault("max_age_ref", "REF-DX-RESULT-AGE-GLUCOSE")
    return d
GLU = lambda ref, ctx=None: {"vital": "vs.glucose", "gte_ref": ref, **({"context": ctx} if ctx else {})}

DX_REFS = {
    "REF-DX-GLU-FASTING-DM": xref("REF-DM-DX-FPG", "WHO-HEARTS-D-2020"),
    "REF-DX-GLU-RANDOM-DM": xref("REF-DM-DX-RANDOM", "WHO-HEARTS-D-2020"),
    "REF-DX-GLU-2H-DM": xref("REF-DM-DX-OGTT2H", "WHO-HEARTS-D-2020"),
    "REF-DX-HBA1C-DM": xref("REF-DM-DX-HBA1C", "WHO-HBA1C-2011"),
    "REF-DX-GLU-FASTING-IFG": xref("REF-DM-IH-IFG-WHO", "WHO-HEARTS-D-2020"),
    "REF-DX-GLU-2H-IGT": xref("REF-DM-IH-IGT", "WHO-HEARTS-D-2020"),
    "REF-DX-GLU-HOSPITAL": xref("REF-DM-SUS-HOSP-GLU", "ES-INPATIENT-2012"),
    "REF-DX-GLU-HHS": xref("REF-DM-ACU-HHS-GLU", "ADA-EASD-CRISES-2024"),
    "REF-DX-KETONE-NORMAL": xref("REF-DM-ACU-KETONE-LOW", "TREND-UK-2020"),
    "REF-DX-BICARB-DKA": xref("REF-DM-ACU-DKA-HCO3", "ADA-EASD-CRISES-2024"),
    "REF-DX-PH-DKA": xref("REF-DM-ACU-DKA-PH", "ADA-EASD-CRISES-2024"),
    "REF-DX-OSM-EFF-HHS": xref("REF-DM-ACU-HHS-OSM-EFF", "ADA-EASD-CRISES-2024"),
    "REF-DX-GLU-2H-DM-CAP": xref("REF-DM-DX-OGTT2H-CAP", "WHO-HEARTS-D-2020"),
    "REF-DX-EGFR-REDUCED": xref("REF-DM-KID-GFR-G3A", "KDIGO-CKD-2024"),
    "REF-DX-UACR-A2": xref("REF-DM-KID-ACR-A2", "KDIGO-CKD-2024"),
    "REF-DX-GDM-FASTING": xref("REF-DM-PREG-GDM-FPG", "WHO-GDM-2013"),
    "REF-DX-GDM-1H": xref("REF-DM-PREG-GDM-1H", "WHO-GDM-2013"),
    "REF-DX-GDM-2H": xref("REF-DM-PREG-GDM-2H", "WHO-GDM-2013"),
    "REF-DX-RESULT-AGE-GLUCOSE": {"value": None, "unit": "days", "meaning": "How old a glucose result may be and still count as evidence at this visit", "source": None, "status": "needs-cso",
                                  "note": "A product parameter, not a guideline number (D-DM-08). No value is proposed here, so every atom that carries it is UNKNOWN until the CSO signs one: the laboratory glucose rules are dark by design, not by accident."},
    "REF-DX-ADULT-AGE": {"value": 16, "unit": "years", "meaning": "Below this age the Plan offers recognition and referral only; no adult target, interval or treatment review is shown", "source": None, "status": "needs-cso",
                         "note": "MedSync's own rule (briefing Part 4), not a guideline number. It must match the age band the NCD catalog calls 'adult'."},
    "REF-DX-RESULT-AGE-KIDNEY": {"value": 365, "unit": "days", "meaning": "How old an eGFR or ACR may be and still count for the yearly kidney check", "source": "WHO-HEARTS-D-2020", "status": "draft", "mirrors": "REF-DM-KID-SCREEN-INTERVAL"},
}

NAMED_SCALES = {
    "icdr_dr": {"label": "Retinopathy (ICDR)", "options": ["no apparent retinopathy", "mild non-proliferative", "moderate non-proliferative", "severe non-proliferative", "proliferative"], "source": "ICDR-2003", "status": "draft", "ref_dm": "REF-DM-EYE-ICDR"},
    "kdigo_albuminuria": {"label": "Albuminuria (KDIGO)", "options": ["A1", "A2", "A3"], "source": "KDIGO-CKD-2024", "status": "draft", "ref_dm": ["REF-DM-KID-ACR-A2", "REF-DM-KID-ACR-A3"]},
    "dka_severity": {"label": "DKA severity (2024 consensus)", "options": ["mild", "moderate", "severe"], "source": "ADA-EASD-CRISES-2024", "status": "draft",
                     "ref_dm": ["REF-DM-ACU-DKA-MOD-PH", "REF-DM-ACU-DKA-SEV-PH", "REF-DM-ACU-DKA-MOD-HCO3", "REF-DM-ACU-DKA-SEV-HCO3", "REF-DM-ACU-DKA-SEV-BOHB"]},
}

SYM_OSM = [A("sym:polyuria", {"symptom": "sym.polyuria", "answer": "yes"}), A("sym:polydipsia", {"symptom": "sym.polydipsia", "answer": "yes"}),
           A("sym:weight_loss", {"symptom": "sym.weight_loss", "answer": "yes"})]
GLU_EVID = [A("vs.glucose(random)>=REF-DX-GLU-RANDOM-DM", GLU("REF-DX-GLU-RANDOM-DM", "random")), A("vs.glucose(fasting)>=REF-DX-GLU-FASTING-DM", GLU("REF-DX-GLU-FASTING-DM", "fasting")),
            A("vs.glucose(2h after 75 g, meter)>=REF-DX-GLU-2H-DM-CAP", GLU("REF-DX-GLU-2H-DM-CAP", "two_hours_after_glucose")),
            A("res:obs.glucose(fasting)>=REF-DX-GLU-FASTING-DM", RES("obs.glucose", context="fasting", gte_ref="REF-DX-GLU-FASTING-DM", max_age_ref="REF-DX-RESULT-AGE-GLUCOSE", min_trust=3)),
            A("res:obs.glucose(ogtt_2h)>=REF-DX-GLU-2H-DM", RES("obs.glucose", context="ogtt_2h", gte_ref="REF-DX-GLU-2H-DM", max_age_ref="REF-DX-RESULT-AGE-GLUCOSE", min_trust=3)),
            A("res:obs.hba1c>=REF-DX-HBA1C-DM", RES("obs.hba1c", gte_ref="REF-DX-HBA1C-DM", min_trust=3))]
OGTT_NORMAL = A("res:obs.glucose(ogtt_2h)<REF-DX-GLU-2H-IGT", RES("obs.glucose", context="ogtt_2h", lt_ref="REF-DX-GLU-2H-IGT", max_age_ref="REF-DX-RESULT-AGE-GLUCOSE", min_trust=3))
HBA1C_NOTE = ("HbA1c is not diagnostic evidence in pregnancy, on ART, with sickle cell disease or trait, haemolysis, recent malaria or transfusion, iron or B12 deficiency, or an eGFR below 30: use glucose. "
              "The engine shows the HbA1c with its date and marks it 'not usable for diagnosis' with the reason; where the reason is a restricted fact the reason text is shown in clinical views only.")

def profile(pid, category, kind, onset, mnm, tc, severity, suggest_for, suggest_against, ask, tests, problem_list, related, note, sources, new=False, restricted=None, reconcile=None, requires=None):
    p = {"id": pid, "display_ref": "REF-DX-TERMS", "category": category, "kind": kind, "restricted_class": restricted,
         "onset": onset, "must_not_miss": mnm, "time_critical": tc, "severity": severity, "suggest_for": suggest_for, "suggest_against": suggest_against,
         "ask": ask, "tests_to_decide": tests, "problem_list": problem_list, "related": related, "note": note, "sources": sources, "status": "draft"}
    p["_op"] = "add" if new else "amend"
    if reconcile: p["_reconcile"] = reconcile
    if requires: p["requires"] = requires
    return p

ASK = lambda kind, i: {"kind": kind, "id": i}
PROFILES = [
    profile("dx.dm_type_unknown", "endocrine_metabolic", "disease", {"allowed": ["chronic", "subacute", "acute"], "default": "chronic"}, False, False, {"kind": "none"},
        SYM_OSM + GLU_EVID + [A("sym:blurred_vision", {"symptom": "sym.blurred_vision", "answer": "yes"}), A("sym:recurrent_infections", {"symptom": "sym.recurrent_infections", "answer": "yes"}),
         A("fh:diabetes", {"family_condition": "diabetes", "answer": "yes"}), A("med:glucose_lowering", {"medicine_group": "glucose_lowering"}),
         A("ex.eyes_ent_neck.fundoscopy.seen=diabetic_retinopathy", {"item": "ex.eyes_ent_neck.fundoscopy", "attribute": "seen", "includes_any": ["diabetic_retinopathy"]})],
        [],
        [ASK("vital", "vs.glucose"), ASK("symptom", "sym.polydipsia"), ASK("symptom", "sym.weight_loss"), ASK("family_condition", "diabetes"), ASK("vital", "vs.waist"), ASK("panel", "vs.ketones"), ASK("exam_item", "ex.feet.monofilament")],
        ["test.glucose_fasting", "test.glucose_random", "test.ogtt_75g", "test.hba1c", "test.urinalysis_dipstick"], "offer_when_final",
        ["dx.dm_type2", "dx.dm_type1", "dx.dka", "dx.hyperglycaemia_unconfirmed", "dx.intermediate_hyperglycaemia"],
        "With thirst, polyuria or weight loss, one glucose of 11.1 mmol/L or more is diagnostic. Without symptoms one abnormal value is not: repeat on another day (WHO). "
        "Nothing is listed against: a normal fasting glucose or HbA1c alone is a weak negative, and a normal 2-hour value counts only with a normal fasting value in a person off all glucose-lowering medicine, which one atom cannot say (review G07). "
        "Leave the type as 'unknown' until there is evidence for one: build alone does not decide it in Uganda. " + HBA1C_NOTE,
        ["WHO-HEARTS-D-2020", "WHO-HBA1C-2011", "ADA-SOC-2026"]),
    profile("dx.dm_type2", "endocrine_metabolic", "disease", {"allowed": ["chronic"], "default": "chronic"}, False, False,
        {"kind": "clinician", "options": ["no known complications", "with complications"]},
        [A("pmh:diabetes#type=type_2", {"past_detail": "diabetes", "property": "type", "equals": "type_2"}), A("fh:diabetes", {"family_condition": "diabetes", "answer": "yes"}), A("med:metformin", {"medicine_group": "metformin"})],
        [A("cls:ketone_band", {"classifier": "ketone_band", "any_of": ["high", "moderate"]})],
        [ASK("past_condition", "hypertension"), ASK("family_condition", "diabetes"), ASK("vital", "vs.bp"), ASK("vital", "vs.waist"), ASK("panel", "vs.ketones"),
         ASK("exam_item", "ex.feet.monofilament"), ASK("exam_item", "ex.eyes_ent_neck.fundoscopy"), ASK("social", "tobacco")],
        ["test.hba1c", "test.glucose_fasting", "test.creatinine", "test.uacr", "test.lipid_panel", "test.urinalysis_dipstick"], "offer_when_final",
        ["dx.dm_type_unknown", "dx.dm_type1", "dx.hypertension", "dx.ckd", "dx.diabetic_kidney_disease", "dx.diabetic_retinopathy", "dx.diabetic_neuropathy", "dx.diabetic_foot", "dx.dyslipidaemia"],
        "Ketones argue against uncomplicated type 2: think insulin deficiency. Build is not evidence either way: lean type 2 is common in Uganda, so waist and BMI bands are not listed for or against. "
        "The glucose and HbA1c atoms that establish DIABETES sit on 'diabetes, type not yet known' only; listing them here and not on type 1 would tilt every raised glucose towards type 2 (review G08).",
        ["WHO-HEARTS-D-2020", "ADA-SOC-2026", "ADA-EASD-T1-2021"]),
    profile("dx.dm_type1", "endocrine_metabolic", "disease", {"allowed": ["acute", "subacute", "chronic"], "default": "subacute"}, True, False, {"kind": "none"},
        [A("cls:ketone_band", {"classifier": "ketone_band", "any_of": ["high", "moderate"]}), A("sym:weight_loss", {"symptom": "sym.weight_loss", "answer": "yes"}),
         A("pmh:diabetes#type=type_1", {"past_detail": "diabetes", "property": "type", "equals": "type_1"}),
         A("pmh:diabetes#insulin_from_start", {"past_detail": "diabetes", "property": "insulin_from_start", "equals": "yes"}),
         A("ex.general.odour=ketones", {"item": "ex.general.odour", "attribute": "smells", "includes_any": ["ketones_fruity"]})] + SYM_OSM[:2],
        [],
        [ASK("panel", "vs.ketones"), ASK("vital", "vs.weight"), ASK("symptom", "sym.weight_loss"), ASK("past_detail", "diabetes.insulin_from_start")],
        ["test.urinalysis_dipstick", "test.ketones_blood", "test.glucose_random", "test.gad_antibodies", "test.c_peptide"], "offer_when_final", ["dx.dka", "dx.dm_type_unknown", "dx.dm_type2"],
        "Must not miss: untreated it becomes ketoacidosis. A newly diagnosed person in whom type 1 is suspected is a same-day referral (WHO). A negative antibody does not exclude it; most young Ugandans with clinical type 1 are antibody negative. "
        "Ketosis-prone type 2 presents the same way and is told apart later, off insulin, by a specialist. No C-peptide atom is listed for or against: the thresholds are held out of the pack until a person reads the source figure, "
        "and C-peptide is preserved early in type 1 and raised in kidney impairment (review G05). Must-not-miss is set true here: if the live profile differs, that is a change for the CSO (D-DM-35).",
        ["WHO-HEARTS-D-2020", "ADA-EASD-T1-2021", "ADA-SOC-2026"]),
    profile("dx.dka", "endocrine_metabolic", "acute_event", {"allowed": ["acute"], "default": "acute"}, True, True, {"kind": "named_scale", "id": "dka_severity"},
        [A("cls:ketone_band=high", {"classifier": "ketone_band", "any_of": ["high"]}), A("vs.glucose>=REF-DX-GLU-RANDOM-DM", GLU("REF-DX-GLU-RANDOM-DM")),
         A("pmh:diabetes", {"past_condition": "diabetes", "answer": "yes"}), A("sym:vomiting", {"symptom": "sym.vomiting", "answer": "yes"}), A("sym:abdominal_pain", {"symptom": "sym.abdominal_pain", "answer": "yes"}),
         A("ex.respiratory.breathing_pattern=kussmaul", {"item": "ex.respiratory.breathing_pattern", "attribute": "pattern", "includes_any": ["kussmaul"]}),
         A("ex.general.odour=ketones", {"item": "ex.general.odour", "attribute": "smells", "includes_any": ["ketones_fruity"]}),
         A("med:sglt2_inhibitor", {"medicine_group": "sglt2_inhibitor"}),
         A("res:obs.bicarbonate<REF-DX-BICARB-DKA", RES("obs.bicarbonate", lt_ref="REF-DX-BICARB-DKA", min_trust=3)), A("res:obs.ph_venous<REF-DX-PH-DKA", RES("obs.ph_venous", lt_ref="REF-DX-PH-DKA", min_trust=3))],
        [A("vs.ketones.blood<REF-DX-KETONE-NORMAL", {"panel": "vs.ketones", "field": "blood", "lt_ref": "REF-DX-KETONE-NORMAL"})],
        [ASK("panel", "vs.ketones"), ASK("vital", "vs.glucose"), ASK("exam_item", "ex.respiratory.breathing_pattern"), ASK("exam_item", "ex.general.hydration"), ASK("exam_item", "ex.general.odour"), ASK("medicine", "insulin")],
        ["test.ketones_blood", "test.urinalysis_dipstick", "test.venous_gas", "test.urea_electrolytes", "test.glucose_random"], "offer", ["dx.hhs", "dx.dm_type1", "dx.sepsis"],
        "A normal or near-normal glucose does NOT argue against ketoacidosis (SGLT2 inhibitors, pregnancy, starvation, alcohol), so it is deliberately not in the 'against' list. Only a normal BLOOD ketone taken now, before treatment, does: "
        "the evidence text must show when it was taken. "
        "Urine ketones lag: a low strip early on is not reassurance. Look for the precipitant: infection and missed insulin. In a child it is mistaken for malaria or gastroenteritis.",
        ["ADA-EASD-CRISES-2024", "WHO-HEARTS-D-2020"], reconcile="breathing_pattern attribute and option ids"),
    profile("dx.hhs", "endocrine_metabolic", "acute_event", {"allowed": ["acute", "subacute"], "default": "subacute"}, True, True, {"kind": "none"},
        [A("vs.glucose>=REF-DX-GLU-HHS", GLU("REF-DX-GLU-HHS")), A("pmh:diabetes", {"past_condition": "diabetes", "answer": "yes"}),
         A("ex.general.hydration=dehydrated", {"finding": {"item": "ex.general.hydration", "is": "positive"}}), A("sym:confusion", {"symptom": "sym.confusion", "answer": "yes"}),
         A("res:derived.osmolality_effective>REF-DX-OSM-EFF-HHS", RES("derived.osmolality_effective", gt_ref="REF-DX-OSM-EFF-HHS", min_trust=3))],
        [],
        [ASK("vital", "vs.glucose"), ASK("panel", "vs.ketones"), ASK("exam_item", "ex.general.hydration"), ASK("vital", "vs.consciousness")],
        ["test.urea_electrolytes", "test.glucose_random", "test.ketones_blood", "test.venous_gas"], "offer", ["dx.dka", "dx.sepsis", "dx.stroke"],
        "Nothing is listed against. High ketones do not argue against a hyperosmolar state: they mean a mixed picture, which is common and more dangerous, so both stay on the board (review G04). "
        "The osmolality atom reads EFFECTIVE osmolality against the effective threshold; the total-osmolality threshold is a different number.", ["ADA-EASD-CRISES-2024"]),
    profile("dx.hypoglycaemia_dm", "endocrine_metabolic", "acute_event", {"allowed": ["acute"], "default": "acute"}, True, True, {"kind": "classifier", "id": "hypoglycaemia_level"},
        [A("cls:hypoglycaemia_level", {"classifier": "hypoglycaemia_level", "any_of": ["level_1", "level_2"]}), A("med:glucose_lowering", {"medicine_group": "glucose_lowering"}),
         A("pmh:diabetes#lows", {"past_detail": "diabetes", "property": "lows_12_months", "any_of": ["self_treated", "needed_help"]})],
        [],
        [ASK("vital", "vs.glucose"), ASK("medicine", "insulin"), ASK("social", "alcohol"), ASK("past_detail", "diabetes.lows_12_months")],
        ["test.glucose_random", "test.creatinine"], "offer", ["dx.hypoglycaemia_no_dm", "dx.sepsis", "dx.malaria_severe"],
        "NO glucose atom is listed against, on purpose (review G01). Most patients have been given sugar before the clerking glucose is taken, so a normal reading refutes nothing, and a low on glibenclamide or long-acting insulin comes back. "
        "The gap in the Summary and Impression STOP report stays open until the vital can record 'taken while symptomatic' and 'taken before any sugar, glucose or glucagon'; only a reading with both may count against. "
        "Ask what changed: a missed meal, hard work, alcohol, a new medicine, falling kidney function.",
        ["ADA-SOC-2026", "WHO-HEARTS-D-2020"]),
    profile("dx.intermediate_hyperglycaemia", "endocrine_metabolic", "disease", {"allowed": ["chronic"], "default": "chronic"}, False, False, {"kind": "none"},
        [A("res:obs.glucose(fasting) 6.1-6.9", RES("obs.glucose", context="fasting", gte_ref="REF-DX-GLU-FASTING-IFG", lt_ref="REF-DX-GLU-FASTING-DM", min_trust=3)),
         A("res:obs.glucose(ogtt_2h) 7.8-11.0", RES("obs.glucose", context="ogtt_2h", gte_ref="REF-DX-GLU-2H-IGT", lt_ref="REF-DX-GLU-2H-DM", min_trust=3))],
        [], [ASK("vital", "vs.waist"), ASK("vital", "vs.bp"), ASK("family_condition", "diabetes")], ["test.ogtt_75g", "test.glucose_fasting", "test.lipid_panel"], "offer_when_final",
        ["dx.dm_type_unknown", "dx.obesity", "dx.hypertension"],
        "WHO bands. ADA starts impaired fasting glucose at 5.6 mmol/L and adds HbA1c 5.7 to 6.4%; WHO does neither. A fasting value in this range is followed by an OGTT. Re-test every year.",
        ["WHO-HEARTS-D-2020", "ADA-SOC-2026"], new=True),
    profile("dx.hyperglycaemia_unconfirmed", "endocrine_metabolic", "symptom_level", {"allowed": ["acute", "subacute"], "default": "acute"}, False, False, {"kind": "none"},
        [A("vs.glucose>=REF-DX-GLU-HOSPITAL", GLU("REF-DX-GLU-HOSPITAL")), A("vs.glucose>=REF-DX-GLU-RANDOM-DM", GLU("REF-DX-GLU-RANDOM-DM", "random"))],
        [], [ASK("symptom", "sym.polyuria"), ASK("symptom", "sym.polydipsia"), ASK("symptom", "sym.weight_loss"), ASK("medicine", "prednisolone")],
        ["test.glucose_fasting", "test.hba1c"], "never", ["dx.dm_type_unknown", "dx.steroid_induced_hyperglycaemia"],
        "A holding label for a raised glucose that is not yet a diagnosis: acute illness, steroids, or one value without symptoms. It carries a follow-up test into the Plan so the result is not lost. Never added to the problem list.",
        ["WHO-HEARTS-D-2020", "ES-INPATIENT-2012"], new=True),
    profile("dx.steroid_induced_hyperglycaemia", "endocrine_metabolic", "disease", {"allowed": ["acute", "subacute"], "default": "subacute"}, False, False, {"kind": "none"},
        [A("med:systemic_steroid", {"medicine_group": "systemic_steroid"}), A("vs.glucose>=REF-DX-GLU-RANDOM-DM", GLU("REF-DX-GLU-RANDOM-DM"))], [],
        [ASK("vital", "vs.glucose"), ASK("medicine", "prednisolone")], ["test.glucose_random"], "offer_when_final", ["dx.dm_type_unknown", "dx.hyperglycaemia_unconfirmed"],
        "Test after lunch or before the evening meal: a fasting value can be normal. HbA1c screening waits 3 months after the steroids stop.", ["ADA-SOC-2026"], new=True),
    profile("dx.gestational_diabetes", "obstetric", "disease", {"allowed": ["subacute"], "default": "subacute"}, False, False, {"kind": "none"},
        [A("res:obs.glucose(fasting)>=REF-DX-GDM-FASTING", RES("obs.glucose", context="fasting", gte_ref="REF-DX-GDM-FASTING", lt_ref="REF-DX-GLU-FASTING-DM", min_trust=3)),
         A("res:obs.glucose(ogtt_1h)>=REF-DX-GDM-1H", RES("obs.glucose", context="ogtt_1h", gte_ref="REF-DX-GDM-1H", min_trust=3)),
         A("res:obs.glucose(ogtt_2h)>=REF-DX-GDM-2H", RES("obs.glucose", context="ogtt_2h", gte_ref="REF-DX-GDM-2H", lt_ref="REF-DX-GLU-2H-DM", min_trust=3))],
        [], [ASK("vital", "vs.bp"), ASK("vital", "vs.weight")], ["test.ogtt_75g"], "offer_when_final", ["dx.diabetes_in_pregnancy"],
        "Offered only in a pregnant patient, on results from this pregnancy. One value is enough under WHO 2013. HbA1c is not used. WHO is revising these criteria (REF-DM-PREG-REVISION): the reference entries are versioned. After the birth, re-test at 6 to 12 weeks and then at least every 3 years.",
        ["WHO-GDM-2013", "WHO-DIP-2025"], new=True, reconcile="category id", requires={"pregnancy": "current", "needs": "EC-5", "until_then": "withheld"}),
    profile("dx.diabetes_in_pregnancy", "obstetric", "disease", {"allowed": ["subacute", "chronic"], "default": "subacute"}, True, False, {"kind": "none"},
        [A("res:obs.glucose(fasting)>=REF-DX-GLU-FASTING-DM", RES("obs.glucose", context="fasting", gte_ref="REF-DX-GLU-FASTING-DM", min_trust=3)),
         A("res:obs.glucose(ogtt_2h)>=REF-DX-GLU-2H-DM", RES("obs.glucose", context="ogtt_2h", gte_ref="REF-DX-GLU-2H-DM", min_trust=3))],
        [], [ASK("exam_item", "ex.eyes_ent_neck.fundoscopy"), ASK("vital", "vs.bp")], ["test.ogtt_75g", "test.creatinine", "test.uacr"], "offer_when_final", ["dx.gestational_diabetes", "dx.dm_type_unknown"],
        "Specialised multidisciplinary care, with retinal and kidney assessment when antenatal care starts (WHO 2025). ACE inhibitors and ARBs are contraindicated; lipid-lowering medicines are, in most circumstances, stopped (ADA).",
        ["WHO-GDM-2013", "WHO-DIP-2025"], new=True, reconcile="category id", requires={"pregnancy": "current", "needs": "EC-5", "until_then": "withheld"}),
    profile("dx.diabetic_retinopathy", "eye", "complication", {"allowed": ["chronic"], "default": "chronic"}, False, False, {"kind": "named_scale", "id": "icdr_dr"},
        [A("ex.eyes_ent_neck.fundoscopy.seen=diabetic_retinopathy", {"item": "ex.eyes_ent_neck.fundoscopy", "attribute": "seen", "includes_any": ["diabetic_retinopathy"]}),
         A("pmh:diabetes", {"past_condition": "diabetes", "answer": "yes"}), A("pmh:diabetes#eyes", {"past_detail": "diabetes", "property": "complications_told", "includes_any": ["eyes"]}),
         A("sym:blurred_vision", {"symptom": "sym.blurred_vision", "answer": "yes"})],
        [], [ASK("exam_item", "ex.eyes_ent_neck.visual_acuity"), ASK("exam_item", "ex.eyes_ent_neck.fundoscopy"), ASK("vital", "vs.bp")], ["test.retinal_photograph", "test.hba1c"], "offer_when_final",
        ["dx.dm_type2", "dx.dm_type1", "dx.hypertension", "dx.cataract"],
        "No 'against' evidence is listed: a normal undilated direct ophthalmoscopy misses most retinopathy. Vision worse than 6/12 or any visual symptom is referred whatever the grade. A rapid fall in HbA1c can worsen retinopathy at first.",
        ["ICDR-2003", "ICO-2017", "WHO-HEARTS-D-2020", "UG-EYE-2016"], new=True, reconcile="category id for eye conditions"),
    profile("dx.diabetic_kidney_disease", "renal_urological", "complication", {"allowed": ["chronic"], "default": "chronic"}, False, False, {"kind": "named_scale", "id": "kdigo_ckd"},
        [A("pmh:diabetes", {"past_condition": "diabetes", "answer": "yes"}), A("res:obs.uacr>=REF-DX-UACR-A2", RES("obs.uacr", gte_ref="REF-DX-UACR-A2", max_age_ref="REF-DX-RESULT-AGE-KIDNEY", min_trust=3)),
         A("res:derived.egfr<REF-DX-EGFR-REDUCED", RES("derived.egfr", lt_ref="REF-DX-EGFR-REDUCED", max_age_ref="REF-DX-RESULT-AGE-KIDNEY", min_trust=3)),
         A("ex.eyes_ent_neck.fundoscopy.seen=diabetic_retinopathy", {"item": "ex.eyes_ent_neck.fundoscopy", "attribute": "seen", "includes_any": ["diabetic_retinopathy"]})],
        [], [ASK("vital", "vs.bp"), ASK("exam_item", "ex.general.oedema"), ASK("exam_item", "ex.eyes_ent_neck.fundoscopy"), ASK("medicine", "enalapril")],
        ["test.uacr", "test.creatinine", "test.urinalysis_dipstick", "test.urea_electrolytes"], "offer_when_final", ["dx.ckd", "dx.aki", "dx.hypertension"],
        "One result is not kidney disease: it needs 3 months and, for albumin, 2 of 3 samples. Exercise, fever, infection, menstruation and very high glucose raise albumin transiently. "
        "Creatinine-based eGFR overestimated kidney function in Ugandan adults. Blood on the strip, a nephrotic picture or a fast fall in eGFR points to another cause: refer.",
        ["KDIGO-CKD-2024", "KDIGO-DM-CKD-2022", "WHO-HEARTS-D-2020"], new=True),
    profile("dx.diabetic_neuropathy", "neurological", "complication", {"allowed": ["chronic"], "default": "chronic"}, False, False, {"kind": "clinician", "options": ["painless", "painful"]},
        [A("pmh:diabetes", {"past_condition": "diabetes", "answer": "yes"}), A("sym:numbness", {"symptom": "sym.numbness", "answer": "yes"}),
         A("ex:ex.feet.monofilament", {"finding": {"item": "ex.feet.monofilament", "is": "positive"}}), A("ex:ex.feet.vibration_128", {"finding": {"item": "ex.feet.vibration_128", "is": "positive"}}),
         A("ex:ex.feet.ipswich_touch", {"finding": {"item": "ex.feet.ipswich_touch", "is": "positive"}}), A("derived:iwgdf_risk.lops", {"derived": "iwgdf_risk.lops"})],
        [], [ASK("exam_item", "ex.feet.monofilament"), ASK("exam_item", "ex.feet.vibration_128"), ASK("social", "alcohol"), ASK("medicine", "metformin")],
        ["test.vitamin_b12", "test.thyroid", "test.creatinine"], "offer_when_final", ["dx.diabetic_foot", "dx.dm_type2"],
        "A diagnosis of exclusion: vitamin B12 deficiency (long-term metformin), alcohol, medicines, hypothyroidism and kidney disease first. Sudden, one-sided or mainly motor loss is not this: refer. Half of cases have no symptoms.",
        ["ADA-SOC-2026", "TORONTO-2010", "IWGDF-2023"], new=True, reconcile="category id; sym.numbness id"),
    profile("dx.ckd", "renal_urological", "disease", {"allowed": ["chronic"], "default": "chronic"}, False, False, {"kind": "named_scale", "id": "kdigo_ckd"},
        [A("res:derived.egfr<REF-DX-EGFR-REDUCED", RES("derived.egfr", lt_ref="REF-DX-EGFR-REDUCED", max_age_ref="REF-DX-RESULT-AGE-KIDNEY", min_trust=3)),
         A("res:obs.uacr>=REF-DX-UACR-A2", RES("obs.uacr", gte_ref="REF-DX-UACR-A2", max_age_ref="REF-DX-RESULT-AGE-KIDNEY", min_trust=3))], [],
        [ASK("past_condition", "diabetes")], ["test.uacr"], "offer_when_final", ["dx.diabetic_kidney_disease"],
        "Amendment by MERGE (EC-8): appends the two result atoms and one 'ask' to the live profile. Nothing else in this stub is applied; the live severity scale, onset and notes stand. "
        "Showing the albuminuria category beside the GFR category needs a second scale on a profile, which is not supported: it is shown through the kidney diagnosis's note until it is.", ["KDIGO-CKD-2024"]),
]

DDX_RULES = [
    {"id": "DDX-KETONES", "when": {"classifier": "ketone_band", "any_of": ["high", "moderate"]}, "why": "Raised ketones",
     "suggest": ["dx.dka", "dx.dm_type1", "dx.dm_type_unknown"], "must_not_miss_first": ["dx.dka"], "source": "ADA-EASD-CRISES-2024", "status": "draft"},
    {"id": "DDX-GLUCOSE-VERY-HIGH", "when": {"vital": "vs.glucose", "gte_ref": "REF-DX-GLU-HHS"}, "why": "Glucose 33.3 mmol/L or more",
     "suggest": ["dx.hhs", "dx.dka", "dx.dm_type_unknown"], "must_not_miss_first": ["dx.hhs", "dx.dka"], "source": "ADA-EASD-CRISES-2024", "status": "draft"},
    {"id": "DDX-SGLT2-UNWELL", "when": {"all": [{"medicine_group": "sglt2_inhibitor"}, {"any": [{"symptom": "sym.vomiting", "answer": "yes"}, {"symptom": "sym.abdominal_pain", "answer": "yes"}]}]},
     "why": "On an SGLT2 inhibitor with vomiting or abdominal pain", "suggest": ["dx.dka"], "must_not_miss_first": ["dx.dka"], "source": "ADA-EASD-CRISES-2024", "status": "draft"},
    {"id": "DDX-RESULT-HBA1C", "when": RES("obs.hba1c", gte_ref="REF-DX-HBA1C-DM", min_trust=3), "why": "HbA1c 6.5% or more",
     "suggest": ["dx.dm_type_unknown", "dx.dm_type2", "dx.dm_type1"], "must_not_miss_first": [], "source": "WHO-HBA1C-2011", "status": "draft", "needs": ["EC-1"]},
    {"id": "DDX-RESULT-GLUCOSE-FASTING", "when": RES("obs.glucose", context="fasting", gte_ref="REF-DX-GLU-FASTING-DM", max_age_ref="REF-DX-RESULT-AGE-GLUCOSE", min_trust=3), "why": "Fasting glucose 7.0 mmol/L or more",
     "suggest": ["dx.dm_type_unknown", "dx.dm_type2", "dx.dm_type1"], "must_not_miss_first": [], "source": "WHO-HEARTS-D-2020", "status": "draft", "needs": ["EC-1"]},
    {"id": "DDX-RESULT-GLUCOSE-IFG", "when": RES("obs.glucose", context="fasting", gte_ref="REF-DX-GLU-FASTING-IFG", lt_ref="REF-DX-GLU-FASTING-DM", max_age_ref="REF-DX-RESULT-AGE-GLUCOSE", min_trust=3),
     "why": "Fasting glucose 6.1 to 6.9 mmol/L", "suggest": ["dx.intermediate_hyperglycaemia"], "must_not_miss_first": [], "source": "WHO-HEARTS-D-2020", "status": "draft", "needs": ["EC-1"]},
    {"id": "DDX-RESULT-EGFR", "when": RES("derived.egfr", lt_ref="REF-DX-EGFR-REDUCED", max_age_ref="REF-DX-RESULT-AGE-KIDNEY", min_trust=3), "why": "eGFR below 60",
     "suggest": ["dx.aki", "dx.ckd", "dx.diabetic_kidney_disease"], "must_not_miss_first": [], "source": "KDIGO-CKD-2024", "status": "draft", "needs": ["EC-1"],
     "note": "Acute kidney injury is suggested, not put first as must-not-miss: the result may be up to a year old. A must-not-miss ordering needs a short result age from a signed reference (review G35)."},
    {"id": "DDX-RESULT-UACR", "when": RES("obs.uacr", gte_ref="REF-DX-UACR-A2", max_age_ref="REF-DX-RESULT-AGE-KIDNEY", min_trust=3), "why": "Urine albumin-to-creatinine ratio 3 mg/mmol or more",
     "suggest": ["dx.diabetic_kidney_disease", "dx.ckd", "dx.hypertension"], "must_not_miss_first": [], "source": "KDIGO-CKD-2024", "status": "draft", "needs": ["EC-1"]},
    {"id": "DDX-RETINOPATHY", "when": {"item": "ex.eyes_ent_neck.fundoscopy", "attribute": "seen", "includes_any": ["diabetic_retinopathy"]}, "why": "Diabetic retinopathy on fundoscopy",
     "suggest": ["dx.diabetic_retinopathy", "dx.dm_type_unknown", "dx.hypertension"], "must_not_miss_first": [], "source": "ICDR-2003", "status": "draft"},
    {"id": "DDX-GLUCOSE-IN-HOSPITAL", "when": {"all": [{"setting": ["emergency", "inpatient"]}, {"vital": "vs.glucose", "gte_ref": "REF-DX-GLU-HOSPITAL"}]}, "why": "Glucose above 7.8 mmol/L in hospital",
     "suggest": ["dx.hyperglycaemia_unconfirmed", "dx.dm_type_unknown"], "must_not_miss_first": [], "source": "ES-INPATIENT-2012", "status": "draft",
     "note": "The source says 'above 7.8'; the atom language has gte_ref. With one decimal place the difference is a reading of exactly 7.8. Add gt_ref to the vital atom or accept the boundary (D-DM-25)."},
    {"id": "DDX-STEROID-GLUCOSE", "when": {"all": [{"medicine_group": "systemic_steroid"}, {"vital": "vs.glucose", "gte_ref": "REF-DX-GLU-RANDOM-DM"}]}, "why": "On steroids with a glucose of 11.1 mmol/L or more",
     "suggest": ["dx.steroid_induced_hyperglycaemia", "dx.dm_type_unknown"], "must_not_miss_first": [], "source": "ADA-SOC-2026", "status": "draft"},
]
DDX_RULES.append({"id": "DDX-PREGNANCY-GLUCOSE", "when": {"all": [{"pregnancy": "current"}, {"any": [GLU("REF-DX-GDM-FASTING", "fasting"), GLU("REF-DX-GLU-RANDOM-DM")]}]},
                  "why": "Pregnant with a raised glucose", "suggest": ["dx.diabetes_in_pregnancy", "dx.gestational_diabetes"], "must_not_miss_first": ["dx.diabetes_in_pregnancy"],
                  "source": "WHO-GDM-2013", "status": "draft", "needs": ["EC-5", "EC-3"], "withheld_until": "EC-5",
                  "note": "A meter value is a reason to suggest and to send a laboratory glucose; it is not WHO's criterion for either diagnosis (D-DM-28)."})
DDX_AMEND = [
    {"id": "DDX-NUMBNESS", "suggest.add": ["dx.diabetic_neuropathy"], "note": "Add after the existing suggestions; keep order by must-not-miss."},
    {"id": "DDX-VISION", "suggest.add": ["dx.diabetic_retinopathy"]},
    {"id": "DDX-GLUCOSE-HIGH", "suggest.add": ["dx.hyperglycaemia_unconfirmed", "dx.steroid_induced_hyperglycaemia"]},
    {"id": "DDX-POLYURIA", "source.replace": "WHO-HEARTS-D-2020", "note": "Today it cites ADA-SOC-2025. The symptom list is WHO's and ADA's alike; cite the Uganda-first source."},
]

# ═══ 10 Plan: suggested care ════════════════════════════════════════════════
DM = ["dx.dm_type2", "dx.dm_type1", "dx.dm_type_unknown"]
def care(cid, problems, label, kind, source, refs, when=None, tests=None, followUp=None, disposition=None, rx=False, step=None, restricted=None, district=None, due="today", any_age=False, needs=None, status="draft"):
    c = {"id": cid, "problems": problems, "label": label, "kind": kind, "requiresPrescribing": rx, "source": source, "refs_dm": refs, "status": status, "due": due}
    if not any_age: c["min_age_ref"] = "REF-DX-ADULT-AGE"      # under 16: recognition and referral only (review G03)
    if when: c["when"] = when
    op = {}
    if tests: op["tests"] = tests
    if followUp: op["followUp"] = followUp
    if disposition: op["disposition"] = disposition
    if op: c["opens"] = op
    if step: c["ncd_step"] = step
    if restricted: c["restricted_class"] = restricted
    if district: c["where_unavailable"] = district
    if needs: c["needs"] = needs
    return c

NO = lambda cap, do: {"capability": cap, "do": do}
ON_ISU = {"any": [{"medicine_group": "insulin"}, {"medicine_group": "sulfonylurea"}, {"plan_basket_class": "insulin"}, {"plan_basket_class": "sulfonylurea"}]}
ON_INSULIN = {"any": [{"medicine_group": "insulin"}, {"plan_basket_class": "insulin"}]}
BASKET = ["EC-7 (an atom that reads the Plan basket, so teaching appears when the medicine is first prescribed)"]
PLAN_CARE = [
    care("CARE-DM-PAED-REFER", DM + ["dx.dka"], "Under 16 with diabetes or suspected diabetes: refer to the paediatric or diabetes team today", "refer", "NICE-NG18", ["REF-DM-SUS-PAED-SAMEDAY"], disposition="refer", any_age=True),
    care("CARE-DM-CONFIRM", DM + ["dx.hyperglycaemia_unconfirmed"], "If the diagnosis rests on one result without symptoms: repeat on another day, the same test where possible", "test", "WHO-HEARTS-D-2020", ["REF-DM-DX-REPEAT-WHO"],
         followUp="within days", due="later", step="DM-SUS-INCID-02"),
    care("CARE-DKA-KETONES", ["dx.dka", "dx.dm_type1"], "Ketones now: blood ketones, or a urine strip where there is no meter", "test", "ADA-EASD-CRISES-2024", ["REF-DM-ACU-DKA-BOHB", "REF-DM-ACU-DKA-UKET"],
         tests=["test.ketones_blood", "test.urinalysis_dipstick"], any_age=True, district=NO("lab.ketones_blood", "Urine strip. No strip either: refer on the clinical picture; do not wait.")),
    care("CARE-DM-KETONES", ["dx.dm_type2", "dx.dm_type_unknown"], "Ketones today: glucose 18 mmol/L or more, or on an SGLT2 inhibitor and unwell", "test", "WHO-PEN-TRAINING", ["REF-DM-ACU-KETONE-TEST-GLU", "REF-DM-ACU-EDKA"],
         when={"any": [{"vital": "vs.glucose", "gte_ref": "REF-EX-GLU-KETONE-TEST"}, {"medicine_group": "sglt2_inhibitor"}]}, tests=["test.urinalysis_dipstick"], step="DM-ACU-ROUTE-01", any_age=True,
         district=NO("lab.ketones_urine", "No strip: refer if the patient is unwell, dry or drowsy.")),
    care("CARE-DM-HBA1C", DM, "HbA1c, or fasting and after-meal glucose where HbA1c is unavailable or unreliable", "test", "WHO-HEARTS-D-2020", ["REF-DM-CTRL-WINDOW-AT-TARGET", "REF-DM-CTRL-FPG-SURROGATE"], tests=["test.hba1c"], step="DM-ACT-TEST-HBA1C-01",
         district=NO("lab.hba1c", "Fasting glucose (laboratory or meter) and a meter reading 2 hours after a meal.")),
    care("CARE-DM-TARGET", DM, "Agree an individual target with the patient", "review", "WHO-HEARTS-D-2020", ["REF-DM-CTRL-HBA1C-TARGET", "REF-DM-CTRL-HBA1C-RELAXED"], step="DM-ACT-TARGET-01",
         needs=["Somewhere to record the agreed target (concept target.hba1c). Until it exists the item is a prompt only."]),
    care("CARE-DM-KIDNEY", DM, "Yearly kidney check: urine albumin-to-creatinine ratio and creatinine", "test", "WHO-HEARTS-D-2020", ["REF-DM-KID-SCREEN-INTERVAL"], tests=["test.uacr", "test.creatinine"], step="DM-ACT-SCREEN-KIDNEY-01",
         district=NO("lab.urine_acr", "Urine reagent strip, and creatinine if the laboratory runs it. A positive strip is sent for a laboratory ratio. A NEGATIVE strip does not exclude early kidney disease.")),
    care("CARE-DM-EYE", ["dx.dm_type2", "dx.dm_type_unknown"], "Retinal examination: at diagnosis, then every 2 years if clear", "screen", "WHO-HEARTS-D-2020", ["REF-DM-EYE-INTERVAL-WHO"], tests=["test.retinal_photograph"], step="DM-ACT-SCREEN-EYE-01",
         district=NO("imaging.fundus", "Visual acuity here; refer for the retinal examination.")),
    care("CARE-DM-EYE-T1", ["dx.dm_type1"], "Retinal examination: from 5 years after onset, then every 2 years if clear", "screen", "ADA-SOC-2026", ["REF-DM-EYE-START-T1", "REF-DM-EYE-INTERVAL-WHO"], tests=["test.retinal_photograph"], step="DM-ACT-SCREEN-EYE-01",
         district=NO("imaging.fundus", "Visual acuity here; refer for the retinal examination.")),
    care("CARE-DM-FOOT-LOOK", DM, "Look at both feet today for ulcers", "screen", "WHO-HEARTS-D-2020", ["REF-DM-FOOT-EVERY-VISIT"]),
    care("CARE-DM-FOOT", DM, "Foot risk assessment: yearly at low risk, sooner by risk category", "screen", "IWGDF-2023", ["REF-DM-FOOT-INT-0", "REF-DM-FOOT-INT-1", "REF-DM-FOOT-INT-2", "REF-DM-FOOT-INT-3"], step="DM-ACT-SCREEN-FOOT-01",
         needs=["The interval shown comes from the exam classifier iwgdf_risk and the four reference entries; the label states no single interval."],
         district=NO("device.monofilament", "The Ipswich touch test and foot pulses.")),
    care("CARE-DM-BP-MEASURE", DM, "Measure blood pressure today", "screen", "WHO-HEARTS-D-2020", ["REF-DM-ACT-EVERY-VISIT"]),
    care("CARE-DM-BP-REVIEW", DM, "Blood pressure at or above 130/80 on two occasions: review blood pressure treatment", "review", "WHO-HEARTS-D-2020", ["REF-DM-CVD-BP-SBP", "REF-DM-CVD-BP-DBP"], rx=True, step="DM-ACT-RX-07",
         when={"not": {"pregnancy": "current"}}, needs=["EC-5"]),
    care("CARE-DM-STATIN", ["dx.dm_type2"], "Statin review: type 2 diabetes at 40 or over (not in pregnancy)", "review", "WHO-HEARTS-D-2020", ["REF-DM-CVD-STATIN-AGE", "REF-DM-CVD-PREG-CONTRA"],
         when={"all": [{"patient": {"age_gte_ref": "REF-DX-DM-STATIN-AGE"}}, {"not": {"pregnancy": "current"}}]}, rx=True, step="DM-ACT-RX-06", needs=["EC-5"]),
    care("CARE-DM-LIPIDS", DM, "Lipid profile", "test", "ADA-SOC-2026", ["REF-DM-CVD-LIPID-INTERVAL"], tests=["test.lipid_panel"], step="DM-ACT-SCREEN-LIPID-01",
         district=NO("lab.lipids", "The statin decision in type 2 diabetes at 40 or over does not wait for a lipid profile (WHO).")),
    care("CARE-DM-CVD-RISK", DM, "Cardiovascular risk: WHO chart for Eastern Sub-Saharan Africa (laboratory chart in diabetes)", "review", "WHO-CVD-CHARTS-2019", ["REF-DM-CVD-CHART", "REF-DM-CVD-NONLAB-UNDER", "REF-DM-CVD-NOT-VALIDATED"],
         district=NO("lab.lipids", "The non-laboratory chart has no diabetes input: read its band as a floor, and say so.")),
    care("CARE-DM-MEDS-REVIEW", ["dx.dm_type2"], "Review glucose-lowering treatment against the WHO ladder", "review", "WHO-HEARTS-D-2020", ["REF-DM-RX-LADDER-WHO"], rx=True, step="DM-ACT-RX-01..03", when={"not": {"pregnancy": "current"}}, needs=["EC-5"]),
    care("CARE-DM-HYPO-ASK", DM + ["dx.hypoglycaemia_dm"], "Ask about low blood sugar since the last visit", "review", "ADA-SOC-2026", ["REF-DM-HYPO-REVIEW"], when=ON_ISU, needs=BASKET),
    care("CARE-DM-HYPO-REVIEW", DM + ["dx.hypoglycaemia_dm"], "After a low needing help, a reading below 3.0 or repeated lows: review the treatment and relax the target for now", "review", "ADA-SOC-2026", ["REF-DM-HYPO-DEINTENSIFY"], rx=True, step="DM-ACT-RX-10"),
    care("CARE-HYPO-BEFORE-HOME", ["dx.hypoglycaemia_dm"], "Before the patient goes home after a low: find the cause, and plan for it coming back on a sulfonylurea or long-acting insulin", "review", "ADA-SOC-2026", ["REF-DM-HYPO-DEINTENSIFY"],
         status="needs-cso", any_age=True, needs=["Wording from UCG 2023 section 1.1.6 or another signed source: no source read for this pack states the observation period after a sulfonylurea low."]),
    care("CARE-DM-EDU-CORE", DM, "Counsel: eating, physical activity, tobacco, alcohol, taking medicines", "educate", "WHO-HEARTS-D-2020", ["REF-DM-ACT-EDU-DIET", "REF-DM-ACT-EDU-PA-MIN"], step="DM-ACT-EDU-01"),
    care("CARE-DM-EDU-FOOT", DM + ["dx.diabetic_foot", "dx.diabetic_neuropathy"], "Teach foot care: look daily, never barefoot, shoes that fit", "educate", "WHO-HEARTS-D-2020", ["REF-DM-ACT-EDU-FOOT"], step="DM-ACT-EDU-02"),
    care("CARE-DM-EDU-HYPO", ["dx.dm_type2", "dx.dm_type_unknown"], "On insulin or a sulfonylurea: how to recognise and treat a low", "educate", "WHO-HEARTS-D-2020", ["REF-DM-ACT-EDU-HYPO"], when=ON_ISU, step="DM-ACT-EDU-03", needs=BASKET),
    care("CARE-DM-EDU-SICK-DAY", ["dx.dm_type2", "dx.dm_type_unknown"], "On insulin: sick-day rules. Never stop insulin", "educate", "ADA-SOC-2026", ["REF-DM-ACU-SICKDAY-INSULIN"], when=ON_INSULIN, step="DM-ACT-EDU-04", needs=BASKET),
    care("CARE-DM-EDU-INSULIN", ["dx.dm_type2", "dx.dm_type_unknown"], "On insulin: storage and injection sites", "educate", "EADSG-2019", ["REF-DM-ACT-EDU-INJECTION", "REF-DM-ACT-EDU-INSULIN-STORE"], when=ON_INSULIN, step="DM-ACT-EDU-05", needs=BASKET),
    care("CARE-T1-EDU", ["dx.dm_type1"], "Type 1: how to treat a low; sick-day rules (never stop insulin); storage and injection sites", "educate", "ADA-SOC-2026", ["REF-DM-ACT-EDU-HYPO", "REF-DM-ACU-SICKDAY-INSULIN", "REF-DM-ACT-EDU-INJECTION"], step="DM-ACT-EDU-03..05",
         needs=["Shown whether or not insulin is on the medicine list yet: a person with type 1 needs it either way."]),
    care("CARE-DM-EDU-SGLT2", DM, "On an SGLT2 inhibitor: the signs of ketoacidosis, and when to stop the tablet", "educate", "ADA-SOC-2026", ["REF-DM-RX-SGLT2-HOLD"], when={"any": [{"medicine_group": "sglt2_inhibitor"}, {"plan_basket_class": "sglt2_inhibitor"}]}, step="DM-ACT-EDU-06", needs=BASKET),
    care("CARE-DM-REVIEW", DM, "Review in 3 months; 6 months once at target", "recall", "WHO-HEARTS-D-2020", ["REF-DM-ACT-REVIEW-MONTHS", "REF-DM-CTRL-WINDOW-AT-TARGET"], followUp="3 months", due="later", step="DM-ACT-RECALL-01"),
    care("CARE-DM-TYPE1-REFER", ["dx.dm_type1"], "Type 1 suspected and not yet under a diabetes team: refer today", "refer", "WHO-HEARTS-D-2020", ["REF-DM-CLS-T1-SAMEDAY"], disposition="refer", step="DM-CLS-T1-04", any_age=True),
    care("CARE-DKA-REFER", ["dx.dka", "dx.hhs"], "Suspected ketoacidosis or hyperosmolar state: senior review now. Admit here if this site treats it; otherwise refer now", "refer", "WHO-HEARTS-D-2020", ["REF-DM-ACU-REFER-ALL"], disposition="refer", any_age=True,
         needs=["Capability-aware disposition: 'admit' where the site has the capability, 'refer' where it does not. 'opens' never overwrites a disposition already set."]),
    care("CARE-DR-REFER", ["dx.diabetic_retinopathy"], "Refer to an ophthalmologist: within 1 month for new vessels or swelling at the centre of the macula; within 3 months for severe retinopathy; routinely for moderate", "refer", "ICO-2017",
         ["REF-DM-EYE-RECALL-PDR", "REF-DM-EYE-RECALL-DME-CI", "REF-DM-EYE-RECALL-SEVERE", "REF-DM-EYE-RECALL-MODERATE-MIN"], when={"classifier": "dr_review", "any_of": ["refer_within_1_month", "refer_within_3_months", "refer_routine"]}, disposition="refer", step="DM-ACT-REFER-EYE-01"),
    care("CARE-DR-REFER-VISION", ["dx.diabetic_retinopathy"] + DM, "Refer for an eye assessment: vision worse than 6/12, blurred vision, or the retina could not be seen or assessed", "refer", "ICO-2017", ["REF-DM-EYE-REFER-VA", "REF-DM-EYE-REFER-NOVIEW"],
         when={"classifier": "dr_review", "any_of": ["refer_cannot_assess"]}, disposition="refer", step="DM-ACT-REFER-EYE-02"),
    care("CARE-DR-RECHECK", ["dx.diabetic_retinopathy"], "Macular swelling sparing the centre: re-examine in 3 months", "recall", "ICO-2017", ["REF-DM-EYE-RECALL-DME-NCI"], when={"classifier": "dr_review", "any_of": ["re_examine_3_months"]}, followUp="3 months", due="later", step="DM-ACT-REFER-EYE-03"),
    care("CARE-DKD-EARLY-REPEAT", ["dx.diabetic_kidney_disease", "dx.ckd"], "A first low eGFR: repeat creatinine early to exclude acute kidney injury", "test", "KDIGO-CKD-2024", ["REF-DM-KID-AKI"], tests=["test.creatinine"], due="later", status="needs-cso",
         needs=["The interval for the early repeat has no reference entry in this pack. Sources to read: NICE NG203, KDIGO 2024."]),
    care("CARE-DKD-CONFIRM", ["dx.diabetic_kidney_disease", "dx.ckd"], "Before staging: repeat urine albumin (2 of 3 within 3 to 6 months) and creatinine at 3 months", "test", "KDIGO-CKD-2024", ["REF-DM-KID-UACR-CONFIRM", "REF-DM-KID-PERSIST"], tests=["test.uacr", "test.creatinine"], followUp="3 months", due="later",
         district=NO("lab.urine_acr", "Repeat the urine strip when any fever or infection has settled, and refer for a laboratory ratio.")),
    care("CARE-DKD-RASI", ["dx.diabetic_kidney_disease"], "Confirmed albuminuria with raised blood pressure (not in pregnancy): ACE inhibitor or ARB review", "review", "KDIGO-DM-CKD-2022", ["REF-DM-CVD-RASI-ALBUMINURIA", "REF-DM-CVD-PREG-CONTRA"],
         when={"not": {"pregnancy": "current"}}, rx=True, step="DM-ACT-RX-08", needs=["EC-5"]),
    care("CARE-DKD-RASI-CHECK", ["dx.diabetic_kidney_disease"], "Creatinine and potassium 2 to 4 weeks after starting or changing an ACE inhibitor or ARB", "test", "KDIGO-DM-CKD-2022", ["REF-DM-KID-RASI-CHECK"], tests=["test.urea_electrolytes", "test.creatinine"], due="later"),
    care("CARE-DKD-REFER", ["dx.diabetic_kidney_disease", "dx.ckd"], "Refer: eGFR below 30, a sustained fall, or features of another kidney disease", "refer", "KDIGO-CKD-2024", ["REF-DM-KID-REFER-EGFR", "REF-DM-KID-REFER-FALL", "REF-DM-KID-NDKD"], disposition="refer", step="DM-ACT-REFER-EGFR-01"),
    care("CARE-DPN-EXCLUDE", ["dx.diabetic_neuropathy"], "Exclude other causes: vitamin B12 (long-term metformin), alcohol, thyroid", "test", "ADA-SOC-2026", ["REF-DM-NEU-EXCLUSION", "REF-DM-NEU-B12"], tests=["test.vitamin_b12", "test.thyroid"], step="DM-STR-NEURO-01",
         district=NO("lab.vitamin_b12", "Refer the sample or the patient; record that the test was unavailable.")),
    care("CARE-IH-LIFESTYLE", ["dx.intermediate_hyperglycaemia"], "Weight and activity advice; re-test in 12 months", "educate", "ADA-SOC-2026", ["REF-DM-IH-RETEST", "REF-DM-ACT-EDU-WEIGHT", "REF-DM-ACT-EDU-PA-MIN"], followUp="12 months", due="later", step="DM-ACT-EDU-10"),
    care("CARE-GDM-REFER", ["dx.gestational_diabetes", "dx.diabetes_in_pregnancy"], "Refer to the antenatal clinic for specialised care", "refer", "WHO-DIP-2025", ["REF-DM-PREG-CARE-WHO"], disposition="refer", step="DM-ACT-SCREEN-PREG-01", any_age=True),
    care("CARE-GDM-POSTPARTUM", ["dx.gestational_diabetes"], "After the birth: glucose tolerance at 6 to 12 weeks, then at least every 3 years", "recall", "WHO-DIP-2025", ["REF-DM-PREG-POSTPARTUM-FROM", "REF-DM-PREG-POSTPARTUM-TO", "REF-DM-SUS-GDM-RETEST-MAX"], due="later", step="DM-SUS-PREG-02", any_age=True),
    care("CARE-HYPERGLYCAEMIA-FOLLOW-UP", ["dx.hyperglycaemia_unconfirmed"], "Fasting glucose after recovery (HbA1c now if it is valid for this patient)", "test", "ES-INPATIENT-2012", ["REF-DM-SUS-HOSP-GLU", "REF-DM-SUS-STRESS"], followUp="after recovery", due="later", step="DM-SUS-INPT-01"),
    care("CARE-STEROID-GLUCOSE", ["dx.steroid_induced_hyperglycaemia"], "On steroids: check glucose after lunch or before the evening meal, not fasting", "test", "ADA-SOC-2026", ["REF-DM-SUS-STEROID"], tests=["test.glucose_capillary"], step="DM-SUS-POP-STEROID-01"),
]
DX_REFS["REF-DX-DM-STATIN-AGE"] = xref("REF-DM-CVD-STATIN-AGE", "WHO-HEARTS-D-2020")

TERMS_ADD = {  # REF-DX-TERMS entries for the new diagnosis ids; plain en-GB labels, CSO to sign
    "dx.intermediate_hyperglycaemia": "Intermediate hyperglycaemia (borderline blood sugar)",
    "dx.hyperglycaemia_unconfirmed": "Raised blood glucose, not yet a diagnosis",
    "dx.steroid_induced_hyperglycaemia": "Raised blood glucose on steroid treatment",
    "dx.gestational_diabetes": "Gestational diabetes",
    "dx.diabetes_in_pregnancy": "Diabetes in pregnancy",
    "dx.diabetic_retinopathy": "Diabetic retinopathy",
    "dx.diabetic_kidney_disease": "Diabetic kidney disease",
    "dx.diabetic_neuropathy": "Diabetic neuropathy",
}
AMEND_SEMANTICS = ("'_op: add' creates an entry and fails if the id exists. '_op: amend' MERGES into the live profile: listed atoms are appended where absent; a scalar changes only if named under '_changes'; nothing is removed. "
                   "The profiles marked 'amend' were written without sight of the live ones: Phase 0 produces a per-profile diff for the CSO before anything is applied (engine change EC-8).")
