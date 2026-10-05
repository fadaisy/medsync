"""Lanes ACT and ACUTE_ROUTE: what is due, who to refer, what to teach, what to review
in the treatment, and which signals leave this surface for triage.

No dose appears anywhere in this file. A drug is named only where the source names it.
Every step with a medicine in it has requiresPrescribing=True and proposal kind
therapy.review, which MS-NCD-ENG-001 reserves for v1.1 (D-DM-20).
"""
from lib import P, crit
from k_model import *

KNOWN = lambda: P("dm_status", "==", "known")
GLT = lambda v: P("glucose_lowering_therapy", "==", v)
SU = lambda: [GLT("glibenclamide"), GLT("gliclazide"), GLT("glimepiride")]
T2 = lambda: P("dm_type_recorded", "==", "type_2")
NOT = lambda v: P("glucose_lowering_therapy", "!=", v)
HIGH_GLU = lambda ref: [P("capillary_glucose", ">=", ref=ref), P("random_pg", ">=", ref=ref), P("fasting_pg", ">=", ref=ref)]

# ═══ ACT: checks that are due ═══════════════════════════════════════════════
step("DM-ACT-TEST-HBA1C-01", "HbA1c is due (6 months since the last)",
     crit("due_hba1c_6", "Confirmed diabetes, 6 months or more since the last HbA1c", all=[KNOWN(), P("months_since_hba1c", ">=", ref="REF-DM-CTRL-WINDOW-AT-TARGET")], ref_id="REF-DM-CTRL-WINDOW-AT-TARGET"),
     "A12-67", "test", "DM-ACT-TEST", proposal={"kind": "test.order", "test": "test.hba1c"},
     district="No HbA1c at this site, or a validity caveat in force: fasting and post-meal glucose are the WHO surrogates. Order those instead and say why.")
step("DM-ACT-TEST-HBA1C-02", "HbA1c is due (3 months since the last, after a treatment change)",
     crit("due_hba1c_3", "Confirmed diabetes, treatment changed, 3 months or more since the last HbA1c", all=[KNOWN(), P("therapy_changed_recently"), P("months_since_hba1c", ">=", ref="REF-DM-CTRL-WINDOW-ABOVE")], ref_id="REF-DM-CTRL-WINDOW-ABOVE"),
     "A12-67", "test", "DM-ACT-TEST", proposal={"kind": "test.order", "test": "test.hba1c"})
step("DM-ACT-SCREEN-EYE-01", "Retinal examination is due (2 years since the last)",
     crit("due_eye", "Confirmed diabetes, 24 months or more since the last retinal examination", all=[KNOWN(), P("months_since_eye_screen", ">=", ref="REF-DM-EYE-INTERVAL-WHO")], ref_id="REF-DM-EYE-INTERVAL-WHO"),
     "A2-34", "screen", "DM-ACT-SCREEN", proposal={"kind": "screening.book", "what": "retinal_examination"}, standardSet="who_hearts_d_2020",
     district="No retinal camera or trained examiner: check visual acuity with a pinhole here and refer for the retinal examination. Uganda's Eye Care Guidelines refer all people with diabetes to a retina clinic.",
     note="Never examined is a missing date, which the gaps list and Design B rule DM-ACT-SCREEN-NEVER raise; this rule covers the overdue case. Type 1: from 5 years after onset.")
step("DM-ACT-SCREEN-KIDNEY-01", "Kidney check is due (urine albumin and creatinine, 12 months since the last)",
     crit("due_kidney", "Confirmed diabetes, 12 months or more since urine albumin and creatinine were checked", all=[KNOWN(), P("months_since_kidney_screen", ">=", ref="REF-DM-KID-SCREEN-INTERVAL")], ref_id="REF-DM-KID-SCREEN-INTERVAL"),
     "A2-35", "test", "DM-ACT-SCREEN", proposal={"kind": "test.order", "test": ["test.uacr", "test.creatinine"]},
     district="No ACR: a urine protein strip, and creatinine if the laboratory runs it. A positive strip is 'abnormal, pending confirmation' and is sent for a laboratory ratio.")
step("DM-ACT-SCREEN-FOOT-01", "Foot risk assessment is due (12 months since the last)",
     crit("due_foot", "Confirmed diabetes, 12 months or more since the last foot risk assessment", all=[KNOWN(), P("months_since_foot_risk_assessment", ">=", ref="REF-DM-FOOT-INT-0")], ref_id="REF-DM-FOOT-INT-0"),
     "A2-36", "examine", "DM-ACT-SCREEN", proposal={"kind": "screening.book", "what": "foot_risk_assessment"},
     district="No monofilament or tuning fork: the Ipswich touch test and foot pulses.",
     note="Shorter intervals by IWGDF category come from the foot complication's staging. Feet are looked at for ulcers at every visit whatever the interval.")
step("DM-ACT-SCREEN-NEURO-01", "Sensation testing is due (12 months since the last)",
     crit("due_neuro", "Confirmed diabetes, 12 months or more since sensation was tested", all=[KNOWN(), P("months_since_neuropathy_screen", ">=", ref="REF-DM-NEU-INTERVAL")], ref_id="REF-DM-NEU-INTERVAL"),
     "A8-01", "examine", "DM-ACT-SCREEN", proposal={"kind": "screening.book", "what": "neuropathy_assessment"})
step("DM-ACT-SCREEN-LIPID-01", "Lipid profile is due (12 months since the last)",
     crit("due_lipids", "Confirmed diabetes, 12 months or more since the last lipid profile", all=[KNOWN(), P("months_since_lipids", ">=", ref="REF-DM-CVD-LIPID-INTERVAL")], ref_id="REF-DM-CVD-LIPID-INTERVAL"),
     "A5-18", "test", "DM-ACT-SCREEN", proposal={"kind": "test.order", "test": "test.lipid_panel"}, standardSet="ada_2026",
     district="No lipid profile: the statin decision in type 2 diabetes at 40 or over does not wait for one (WHO HEARTS-D).",
     note="ADA. WHO HEARTS-D sets no lipid testing interval. Off at district sites by default (D-DM-15).")
step("DM-ACT-SCREEN-TB-01", "Cough for more than 2 weeks in a person with diabetes: assess for TB",
     crit("tb_cough", "Confirmed diabetes with cough for more than 2 weeks", all=[KNOWN(), P("cough_over_2_weeks")], ref_id="REF-DM-ACT-TB-COUGH"),
     "A10-30", "test", "DM-ACT-SCREEN", proposal={"kind": "test.order", "test": "tb_assessment", "restrictedClass": "tb"},
     note="The history catalogue already raises FLAG-TB-PRESUMPTIVE on cough duration; this adds the diabetes context to the Plan. Restricted class: tb.")
step("DM-ACT-SCREEN-B12-01", "On metformin with numb or burning feet: check vitamin B12",
     crit("b12", "On metformin, with numbness or burning in the feet", all=[GLT("metformin"), P("foot_numbness_burning")], ref_id="REF-DM-NEU-B12"),
     "A3-56", "test", "DM-ACT-SCREEN", proposal={"kind": "test.order", "test": "test.vitamin_b12"}, district="No B12 assay: refer or treat on clinical grounds per local practice; record that the test was unavailable.")
step("DM-ACT-SCREEN-PREG-01", "Pregnant with pre-existing diabetes: retinal and kidney assessment now, and specialised antenatal care",
     crit("preg_known", "Confirmed diabetes and pregnant", all=[KNOWN(), P("pregnant")], ref_id="REF-DM-PREG-CARE-WHO"),
     "A10-11", "refer", "DM-ACT-REFER", urgency="same_day", proposal={"kind": "refer", "to": "antenatal_clinic_specialist"},
     note="WHO 2025 recommendations 3, 23 and 25. Glycaemic targets in pregnancy are individualised by the specialist team; the pack proposes no number.")

# ═══ ACT: referral (WHO HEARTS-D section 4, plus organ-specific sources) ════
step("DM-ACT-REFER-GLU-01", "Glucose 18 mmol/L or more and not improving on tablets: refer today",
     crit("ref_glu18", "Above target despite taking the tablets, with glucose 18 mmol/L or more", all=[P("glucose_goal_unmet_on_oral")], any=HIGH_GLU("REF-DM-ACU-KETONE-TEST-GLU"), ref_id="REF-DM-ACT-REFER-SAMEDAY"),
     "A2-37", "refer", "DM-ACT-REFER", urgency="same_day", proposal={"kind": "refer", "to": "higher_level"})
step("DM-ACT-REFER-VISION-01", "Sudden loss or deterioration of vision: refer today",
     crit("ref_vision", "Sudden loss or deterioration of vision", all=[P("sudden_vision_loss")], ref_id="REF-DM-ACT-REFER-SAMEDAY"),
     "A2-37", "refer", "DM-ACT-REFER", urgency="same_day", proposal={"kind": "refer", "to": "eye_unit"})
step("DM-ACT-REFER-BP-01", "Blood pressure above 200/110: refer today",
     crit("ref_bp", "Systolic above 200 or diastolic above 110 mmHg", any=[P("bp_systolic", ">", ref="REF-DM-ACU-BP-REFER-SBP"), P("bp_diastolic", ">", ref="REF-DM-ACU-BP-REFER-DBP")], ref_id="REF-DM-ACU-BP-REFER-SBP"),
     "A2-37", "refer", "DM-ACT-REFER", urgency="same_day", proposal={"kind": "refer", "to": "higher_level"},
     note="The exam catalogue's FLAG-EX-BP-SEVERE fires earlier, at 180/120 (NICE). Both stand; the hypertension pack will own this.")
step("DM-ACT-REFER-EGFR-01", "eGFR below 30: refer",
     crit("ref_egfr30", "eGFR below 30", all=[P("egfr", "<", ref="REF-DM-KID-REFER-EGFR")], ref_id="REF-DM-KID-REFER-EGFR"),
     "A2-37", "refer", "DM-ACT-REFER", urgency="same_day", proposal={"kind": "refer", "to": "kidney_care"},
     note="WHO HEARTS-D lists this under same-day referral from primary care; KDIGO lists it as a reason for specialist kidney care without a timeframe. Urgency follows WHO; see D-DM-19.")
step("DM-ACT-REFER-EGFR-02", "eGFR 30 to 59: routine referral",
     crit("ref_egfr_30_59", "eGFR 30 to 59", all=[P("egfr", ">=", ref="REF-DM-KID-GFR-G4"), P("egfr", "<", ref="REF-DM-KID-GFR-G3A")], ref_id="REF-DM-KID-ROUTINE-REFER-EGFR"),
     "A2-38", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "physician"}, level="HC4 and above")
step("DM-ACT-REFER-ALB-01", "Confirmed albuminuria: routine referral",
     crit("ref_alb", "Albuminuria on at least 2 of 3 specimens", all=[P("uacr_abnormal_count", ">=", ref="REF-DM-KID-UACR-COUNT")], ref_id="REF-DM-KID-ROUTINE-REFER-EGFR"),
     "A2-38", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "physician"},
     note="WHO HEARTS-D refers any moderate or severe albuminuria from primary care. KDIGO 2024 refers to a kidney specialist only above 70 mg/mmol, with haematuria, or when it doubles.")
step("DM-ACT-REFER-ALB-02", "ACR above 70 mg/mmol: refer to kidney care",
     crit("ref_acr70", "ACR above 70 mg/mmol", all=[P("urine_acr", ">", ref="REF-DM-KID-REFER-ACR")], ref_id="REF-DM-KID-REFER-ACR"),
     "A6-47", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "kidney_care"}, standardSet="kdigo_2024")
step("DM-ACT-REFER-BP-02", "Blood pressure above 130/80 on two medicines: routine referral",
     crit("ref_bp2", "On 2 or more blood pressure medicines, with systolic above 130 or diastolic above 80", all=[P("bp_medicines_count", ">=", ref="REF-DM-CVD-BP-REFER-MEDS")],
          any=[P("bp_systolic", ">", ref="REF-DM-CVD-BP-SBP"), P("bp_diastolic", ">", ref="REF-DM-CVD-BP-DBP")], ref_id="REF-DM-ACT-REFER-ROUTINE"),
     "A2-38", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "physician"})
step("DM-ACT-REFER-CHOL-01", "Total cholesterol above 8 mmol/L: routine referral",
     crit("ref_tc", "Total cholesterol above 8 mmol/L", all=[P("total_cholesterol", ">", ref="REF-DM-CVD-TC-REFER")], ref_id="REF-DM-CVD-TC-REFER"),
     "A2-38", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "physician"})
step("DM-ACT-REFER-EYE-01", "Moderate or worse retinopathy, or any macular oedema involving the centre: refer to an ophthalmologist",
     crit("ref_eye_grade", "Moderate, severe or proliferative retinopathy, or centre-involving macular oedema",
          any=[P("retinopathy_stage", "in", ["moderate_npdr", "severe_npdr", "pdr"]), P("macular_oedema", "==", "centre_involving")], ref_id="REF-DM-EYE-REFER-ADA"),
     "A7-16", "refer", "DM-ACT-REFER", urgency="urgent", proposal={"kind": "refer", "to": "ophthalmology"},
     note="ICO timing: severe non-proliferative within 3 months, proliferative or centre-involving oedema within 1 month, moderate at the next 6 to 12 month examination. 'urgent' here means inside those windows, not today.")
step("DM-ACT-REFER-EYE-02", "Vision worse than 6/12, or the retina could not be seen: refer",
     crit("ref_eye_va", "Visual acuity worse than 6/12, or an inadequate retinal view", any=[P("visual_acuity_worse_6_12"), P("retina_view", "==", "inadequate")], ref_id="REF-DM-EYE-REFER-VA"),
     "A7-18", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "ophthalmology"},
     note="A reduced acuity has many causes (cataract, refractive error); the referral is for assessment, not a diagnosis of retinopathy.")
step("DM-ACT-REFER-CHARCOT-01", "Foot warmer, swollen or red with intact skin: offload and refer",
     crit("ref_charcot", "A foot that is warmer, swollen or red compared with the other, skin intact", all=[P("foot_hot_swollen")], ref_id="REF-DM-FOOT-CHARCOT"),
     "A8-61", "refer", "DM-ACT-REFER", urgency="urgent", proposal={"kind": "refer", "to": "foot_service_or_orthopaedics"},
     note="Stop weight-bearing on the foot while the referral is made. Cellulitis, gout and deep vein thrombosis are the mimics.")
step("DM-ACT-REFER-FOOT-01", "Infected foot ulcer or gangrene: refer today",
     crit("ref_foot", "Gangrene, or an ulcer with infection", any=[P("foot_gangrene"), P("foot_infection_grade", "in", ["mild", "moderate", "severe"])], ref_id="REF-DM-FOOT-URGENT"),
     "A2-37", "refer", "DM-ACT-REFER", urgency="same_day", proposal={"kind": "refer", "to": "surgical_or_foot_service"},
     note="The exam catalogue's FLAG-EX-DFI-SEVERE, FLAG-EX-GANGRENE and FLAG-EX-ULCER-ISCHAEMIA already fire on the examination; this is the Plan-side proposal.")
step("DM-ACT-REFER-PVD-01", "Foot pulses reduced or absent: routine referral for vascular assessment",
     crit("ref_pvd", "Foot pulses reduced or absent", all=[KNOWN(), P("pedal_pulses", "in", ["reduced", "absent"])], ref_id="REF-DM-ACT-REFER-ROUTINE"),
     "A2-38", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "physician_or_surgeon"})
step("DM-ACT-REFER-TARGET-01", "Above target on two tablets: refer for insulin where this site does not start it",
     crit("ref_goal", "On metformin and a sulfonylurea, above target at review despite taking them", all=[P("glucose_goal_unmet_on_oral"), GLT("metformin")], any=SU(), ref_id="REF-DM-ACT-REFER-ROUTINE"),
     "A2-38", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "diabetes_clinic"}, level="Insulin level per UCG and EMHSLU: not yet read")

# ═══ ACT: education ═════════════════════════════════════════════════════════
step("DM-ACT-EDU-01", "Counsel at this visit: diet, physical activity, tobacco and alcohol, and taking medicines",
     crit("edu_core", "Confirmed diabetes", all=[KNOWN()], ref_id="REF-DM-ACT-EVERY-VISIT"), "A12-60", "educate", "DM-ACT-EDU", proposal={"kind": "education.offer", "topic": "self_management"},
     note="WHO: at all visits. Activity goal REF-DM-ACT-EDU-PA-MIN; weight REF-DM-ACT-EDU-WEIGHT. The pack carries no food list: no official Ugandan guidance on local staples was found.")
step("DM-ACT-EDU-02", "Teach foot care: look every day, never barefoot, shoes that fit",
     crit("edu_foot", "Confirmed diabetes", all=[KNOWN()], ref_id="REF-DM-ACT-EDU-FOOT"), "A12-64", "educate", "DM-ACT-EDU", proposal={"kind": "education.offer", "topic": "foot_care"})
step("DM-ACT-EDU-03", "On insulin or a sulfonylurea: teach how to recognise and treat a low, and what causes one",
     crit("edu_hypo", "On insulin or a sulfonylurea", all=[P("on_insulin_or_sulfonylurea")], ref_id="REF-DM-ACT-EDU-HYPO"), "A12-63", "educate", "DM-ACT-EDU", proposal={"kind": "education.offer", "topic": "hypoglycaemia"})
step("DM-ACT-EDU-04", "On insulin: sick-day rules. Never stop insulin; check glucose and ketones; drink; come in if vomiting",
     crit("edu_sick", "On insulin", all=[GLT("insulin")], ref_id="REF-DM-ACU-SICKDAY-INSULIN"), "A9-49", "educate", "DM-ACT-EDU", proposal={"kind": "education.offer", "topic": "sick_day_rules"})
step("DM-ACT-EDU-05", "On insulin: check storage and injection sites",
     crit("edu_insulin", "On insulin", all=[GLT("insulin")], ref_id="REF-DM-ACT-EDU-INJECTION"), "A12-77", "educate", "DM-ACT-EDU", proposal={"kind": "education.offer", "topic": "insulin_storage_and_injection"},
     note="East Africa Diabetes Study Group guidance (2019), a regional professional body. Storage wording REF-DM-ACT-EDU-INSULIN-STORE; the clay-pot advice conflicts with a field study (D-DM-26).")
step("DM-ACT-EDU-06", "On an SGLT2 inhibitor: teach the signs of ketoacidosis and when to stop the tablet",
     crit("edu_sglt2", "On an SGLT2 inhibitor", all=[GLT("sglt2_inhibitor")], ref_id="REF-DM-RX-SGLT2-HOLD"), "A4-39", "educate", "DM-ACT-EDU", proposal={"kind": "education.offer", "topic": "sglt2_ketoacidosis"})
step("DM-ACT-EDU-07", "Plans to fast for Ramadan: assess risk well before the fast",
     crit("edu_ramadan", "Confirmed diabetes and plans to fast", all=[KNOWN(), P("fasting_ramadan_planned")], ref_id="REF-DM-ACT-EDU-RAMADAN"), "A10-65", "educate", "DM-ACT-EDU", proposal={"kind": "education.offer", "topic": "fasting"})
step("DM-ACT-EDU-08", "Could become pregnant: discuss pregnancy planning and which medicines must change first",
     crit("edu_preconception", "Confirmed diabetes and could become pregnant", all=[KNOWN(), P("could_conceive")], ref_id="REF-DM-ACT-PRECONCEPTION"), "A10-08", "educate", "DM-ACT-EDU",
     proposal={"kind": "education.offer", "topic": "pregnancy_planning", "restrictedClass": "sexual_reproductive_health"})
step("DM-ACT-EDU-09", "Uses tobacco: advise stopping and offer help",
     crit("edu_tobacco", "Confirmed diabetes and currently uses tobacco", all=[KNOWN(), P("smoking_current")], claim_id="A12-59"), "A12-59", "educate", "DM-ACT-EDU", proposal={"kind": "education.offer", "topic": "tobacco_cessation"})
step("DM-ACT-EDU-10", "Intermediate hyperglycaemia: weight, activity, and a test every year",
     crit("edu_ih", "Previously in the intermediate range", all=[P("prior_intermediate_hyperglycaemia")], claim_id="A3-52"), "A3-52", "educate", "DM-ACT-EDU", proposal={"kind": "education.offer", "topic": "diabetes_prevention"})

# ═══ ACT: treatment review (class level; reserved proposal kind) ════════════
RXP = {"kind": "therapy.review"}
EGFR30 = lambda: crit("contra_egfr30", "eGFR below 30", all=[P("egfr", "<", ref="REF-DM-RX-METFORMIN-STOP-EGFR")], ref_id="REF-DM-RX-METFORMIN-STOP-EGFR")
step("DM-ACT-RX-01", "Type 2 diabetes above target and not on medicine: WHO's first medicine is metformin, with diet and activity",
     crit("rx_first", "Type 2 diabetes recorded, on no glucose-lowering medicine, with HbA1c 7.0% or more or fasting glucose 7.0 mmol/L or more",
          all=[KNOWN(), T2(), GLT("none")], any=[P("hba1c", ">=", ref="REF-DM-CTRL-HBA1C-TARGET"), P("fasting_pg", ">=", ref="REF-DM-CTRL-FPG-SURROGATE")], ref_id="REF-DM-RX-LADDER-WHO"),
     "A2-24", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP, standardSet="who_hearts_d_2020",
     contraindications=[EGFR30(), crit("contra_ketosis", "Ketosis: urine ketones 2+ or more, or ketosis at presentation", any=[P("urine_ketones", "in", ["2plus", "3plus"]), P("ketosis_at_presentation")], ref_id="REF-DM-CLS-T1-SAMEDAY")],
     level="Metformin: primary care (EMHSLU 2023, via a secondary source)",
     note="Fires only when the clinician has recorded type 2. Unclassified or type 1 never reaches this step; ketosis is a contraindication and goes to DM-CLS-T1-01. In pregnancy WHO 2025 says metformin or insulin under specialist care.")
step("DM-ACT-RX-02", "On metformin alone and above target despite taking it: WHO's next step is to add a sulfonylurea, gliclazide preferred",
     crit("rx_second", "On metformin, above target at review despite taking it", all=[T2(), GLT("metformin"), P("glucose_goal_unmet_on_oral"), NOT("glibenclamide"), NOT("gliclazide"), NOT("glimepiride"), NOT("insulin")], ref_id="REF-DM-RX-LADDER-WHO"),
     "A2-41", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP, standardSet="who_hearts_d_2020",
     level="Glimepiride: primary care; gliclazide: tertiary (EMHSLU 2023, via a secondary source)",
     note="Glibenclamide is not recommended at 60 or over and was deleted from EMHSLU 2023. On a multi-select '!=' must read as 'not selected': confirm in Phase 0.")
step("DM-ACT-RX-03", "On metformin and a sulfonylurea and still above target: WHO's next step is human insulin, or referral for it",
     crit("rx_third", "On metformin and a sulfonylurea, above target at review despite taking them", all=[T2(), GLT("metformin"), P("glucose_goal_unmet_on_oral"), NOT("insulin")], any=SU(), ref_id="REF-DM-RX-LADDER-WHO"),
     "A2-42", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP, standardSet="who_hearts_d_2020",
     note="If insulin is unsuitable WHO allows a DPP-4 inhibitor, an SGLT2 inhibitor or a thiazolidinedione (weak recommendation). Other medicines are continued when insulin starts.")
step("DM-ACT-RX-04", "Very high glucose or HbA1c, or weight loss with symptoms: ADA says consider insulin whatever the current treatment",
     crit("rx_severe", "Confirmed diabetes with any of: HbA1c above 10%; glucose 16.7 mmol/L or more; unexplained weight loss",
          all=[KNOWN()], any=[P("hba1c", ">", ref="REF-DM-CTRL-SEVERE-HBA1C")] + HIGH_GLU("REF-DM-CTRL-SEVERE-GLU") + [P("unexplained_weight_loss")], ref_id="REF-DM-CTRL-SEVERE-GLU"),
     "A4-34", "therapy_review", "DM-ACT-THERAPY", urgency="same_day", prescribing=True, proposal=RXP, standardSet="ada_2026",
     note="WHO HEARTS-D's severe stratum is fasting glucose 15 or more with symptoms, or above 18: test ketones and refer. Weight loss here may be insulin deficiency: check ketones first.")
step("DM-ACT-RX-05", "Cardiovascular disease or heart failure with type 2 diabetes: ADA recommends an SGLT2 inhibitor or GLP-1 receptor agonist whatever the HbA1c",
     crit("rx_cardio", "Type 2 diabetes recorded, with established cardiovascular disease or heart failure",
          all=[KNOWN(), T2()], any=[P("cvd_established"), P("heart_failure_known")], ref_id="REF-DM-RX-CARDIORENAL"),
     "A4-32", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP, standardSet="ada_2026", level="Dapagliflozin: tertiary (EMHSLU 2023); public-sector access was nil in a 2025 analysis",
     contraindications=[crit("contra_sglt2_egfr", "eGFR below 20 (SGLT2 inhibitor not started)", all=[P("egfr", "<", ref="REF-DM-RX-SGLT2-EGFR")], ref_id="REF-DM-RX-SGLT2-EGFR")],
     district="Not available at most public facilities: the proposal is referral for consideration, and it says so.",
     note="WHO's ladder does not include this step; the WHO Model List has carried an SGLT2 inhibitor since 2021. Off at district sites by default (D-DM-21).")
step("DM-ACT-RX-05B", "Confirmed kidney disease with type 2 diabetes: ADA and KDIGO recommend an SGLT2 inhibitor (or a GLP-1 receptor agonist) whatever the HbA1c",
     crit("rx_renal", "Type 2 diabetes recorded, the kidney abnormality present for 3 months or more, with eGFR below 60 or albuminuria on at least 2 of 3 specimens",
          all=[KNOWN(), T2(), P("kidney_abnormality_3_months")], any=[P("egfr", "<", ref="REF-DM-KID-GFR-G3A"), P("uacr_abnormal_count", ">=", ref="REF-DM-KID-UACR-COUNT")], ref_id="REF-DM-RX-CARDIORENAL"),
     "A6-32", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP, standardSet="kdigo_2022", level="Dapagliflozin: tertiary (EMHSLU 2023)",
     contraindications=[crit("contra_sglt2_egfr_b", "eGFR below 20 (SGLT2 inhibitor not started)", all=[P("egfr", "<", ref="REF-DM-RX-SGLT2-EGFR")], ref_id="REF-DM-RX-SGLT2-EGFR")],
     district="Not available at most public facilities: the proposal is referral for consideration.",
     note="One low eGFR or one raised ACR does not fire this: the persistence must be recorded. Below an eGFR of 30 ADA prefers a GLP-1 receptor agonist for glucose lowering. Off at district sites by default (D-DM-21).")
step("DM-ACT-RX-06", "Type 2 diabetes aged 40 or over, not on a statin: WHO recommends one",
     crit("rx_statin", "Type 2 diabetes recorded, aged 40 or over, not on a statin", all=[KNOWN(), T2(), P("age_years", ">=", ref="REF-DM-CVD-STATIN-AGE"), P("on_statin", "absent")], ref_id="REF-DM-CVD-STATIN-AGE"),
     "A2-32", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP, standardSet="who_hearts_d_2020",
     contraindications=[crit("contra_statin_preg", "Pregnant", all=[P("pregnant")], ref_id="REF-DM-CVD-PREG-CONTRA")],
     note="'on_statin absent' is true only when the clinician recorded that the person is NOT on one; an unanswered question never satisfies it. WHO adds: provided this does not compromise access to glucose and blood pressure medicines.")
step("DM-ACT-RX-07", "Blood pressure at or above 130/80 on two occasions: review blood pressure treatment",
     crit("rx_bp", "Raised on two or more occasions, with systolic 130 or more, or diastolic 80 or more",
          all=[KNOWN(), P("bp_raised_two_occasions")], any=[P("bp_systolic", ">=", ref="REF-DM-CVD-BP-SBP"), P("bp_diastolic", ">=", ref="REF-DM-CVD-BP-DBP")], ref_id="REF-DM-CVD-BP-SBP"),
     "A2-31", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP, standardSet="who_hearts_d_2020",
     note="WHO HEARTS-D names an ACE inhibitor first, adding a thiazide diuretic if needed. WHO's hypertension guideline treats everyone at 140/90 and makes 130 to 139 systolic in diabetes a conditional recommendation (D-DM-23).")
step("DM-ACT-RX-08", "Albuminuria with raised blood pressure and no ACE inhibitor or ARB: one of them is the recommended class",
     crit("rx_rasi", "Albuminuria on at least 2 of 3 specimens, raised blood pressure, and on neither an ACE inhibitor nor an ARB",
          all=[P("uacr_abnormal_count", ">=", ref="REF-DM-KID-UACR-COUNT"), P("bp_raised_two_occasions"), P("ras_blocker", "==", "none")], ref_id="REF-DM-CVD-RASI-ALBUMINURIA"),
     "A6-27", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP, standardSet="kdigo_2022",
     contraindications=[crit("contra_rasi_preg", "Pregnant", all=[P("pregnant")], ref_id="REF-DM-CVD-PREG-CONTRA")],
     note="Creatinine and potassium are checked 2 to 4 weeks after starting or increasing. Never the two classes together.")
step("DM-ACT-RX-09", "Established cardiovascular disease: antiplatelet treatment is for secondary prevention",
     crit("rx_antiplatelet", "Confirmed diabetes with established cardiovascular disease", all=[KNOWN(), P("cvd_established")], ref_id="REF-DM-CVD-ANTIPLATELET"),
     "A2-33", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP, standardSet="who_hearts_d_2020",
     note="WHO does not recommend it for primary prevention in diabetes.")
step("DM-ACT-RX-10", "A low needing help, or repeated lows: re-evaluate the treatment and relax the target for now",
     crit("rx_hypo", "On insulin or a sulfonylurea, with a low needing someone's help in the last year", all=[P("on_insulin_or_sulfonylurea"), P("hypo_worst_12m", "==", "needed_help")], ref_id="REF-DM-HYPO-DEINTENSIFY"),
     "A4-20", "therapy_review", "DM-ACT-THERAPY", urgency="same_day", prescribing=True, proposal=RXP,
     note="ADA: several weeks of avoiding lows, through a temporarily relaxed target, can restore awareness.")
step("DM-ACT-RX-11", "Frail, 75 or over, on a sulfonylurea, with HbA1c below 7.0%: likely overtreated",
     crit("rx_deesc", "Aged 75 or over, frail, on a sulfonylurea, HbA1c below 7.0%",
          all=[P("age_years", ">=", ref="REF-DM-HYPO-RISK-AGE"), P("frailty_or_limited_life_expectancy"), P("hba1c", "<", ref="REF-DM-RX-DEESC-HBA1C")], any=SU(), ref_id="REF-DM-RX-DEESC-HBA1C"),
     "A10-67", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP,
     note="From a consensus paper, not a guideline body; ADA makes the same point without a number.")
step("DM-ACT-RX-12", "Painful neuropathy: first-line classes are named by ADA; opioids are not among them",
     crit("rx_pain", "Probable neuropathy with numb or burning feet", all=[KNOWN(), P("foot_numbness_burning")], any=[P("monofilament_10g", "in", ["one_foot", "both_feet"]), P("ankle_reflexes", "==", "reduced_or_absent"), P("pinprick_feet", "==", "reduced")], ref_id="REF-DM-NEU-PAIN"),
     "A8-26", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal=RXP, standardSet="ada_2026")

# ═══ ACT: therapy flags (additions to the 6 that exist) ═════════════════════
therapy_flag("metformin_egfr_30_44", "Metformin with an eGFR of 30 to 44", "amber",
    crit("tf_met45", "On metformin, eGFR 30 to 44", all=[GLT("metformin"), P("egfr", ">=", ref="REF-DM-RX-METFORMIN-STOP-EGFR"), P("egfr", "<", ref="REF-DM-RX-METFORMIN-NOSTART-EGFR")], ref_id="REF-DM-RX-METFORMIN-NOSTART-EGFR"),
    "ADA: do not start metformin below an eGFR of 45. For people already taking it ADA says the amount should be reduced: review with the prescriber and check kidney function more often.", "A4-37")
therapy_flag("glibenclamide_age_60", "Glibenclamide at 60 or over", "amber",
    crit("tf_glib60", "On glibenclamide, aged 60 or over", all=[GLT("glibenclamide"), P("age_years", ">=", ref="REF-DM-RX-GLIB-AGE")], ref_id="REF-DM-RX-GLIB-AGE"),
    "WHO does not recommend glibenclamide at 60 or over, or where hypoglycaemia is a concern. Gliclazide is the preferred sulfonylurea.", "A2-27", status="reconcile")
therapy_flag("glibenclamide_ckd", "Glibenclamide with reduced kidney function", "amber",
    crit("tf_glib_ckd", "On glibenclamide, eGFR below 60", all=[GLT("glibenclamide"), P("egfr", "<", ref="REF-DM-KID-GFR-G3A")], claim_id="A4-42"),
    "ADA: glibenclamide is generally not recommended in chronic kidney disease. Review with the prescriber.", "A4-42")
therapy_flag("pioglitazone_heart_failure", "Pioglitazone in heart failure", "amber",
    crit("tf_pio_hf", "On pioglitazone, with heart failure", all=[GLT("pioglitazone"), P("heart_failure_known")], ref_id="REF-DM-RX-PIO-HF"),
    "Pioglitazone should not be used in heart failure. Review today with the prescriber.", "A4-43")
therapy_flag("dual_ras_blockade", "ACE inhibitor and ARB together", "amber",
    crit("tf_dual_ras", "On both an ACE inhibitor and an ARB", all=[P("ras_blocker", "==", "both")], ref_id="REF-DM-CVD-RASI-ALBUMINURIA"),
    "Do not combine an ACE inhibitor with an ARB. Review with the prescriber.", "A5-12")
therapy_flag("ras_blocker_or_statin_in_pregnancy", "ACE inhibitor, ARB or statin in pregnancy", "red",
    crit("tf_preg", "Pregnant, on an ACE inhibitor, an ARB or a statin", all=[P("pregnant")], any=[P("ras_blocker", "in", ["acei", "arb", "both"]), P("on_statin")], ref_id="REF-DM-CVD-PREG-CONTRA"),
    "These medicines are contraindicated in pregnancy. Review today with the prescriber and the antenatal team.", "A5-14")
therapy_flag("ras_blocker_or_statin_could_conceive", "ACE inhibitor, ARB or statin in a woman who could conceive", "amber",
    crit("tf_conceive", "Could become pregnant, on an ACE inhibitor, an ARB or a statin", all=[P("could_conceive")], any=[P("ras_blocker", "in", ["acei", "arb", "both"]), P("on_statin")], ref_id="REF-DM-CVD-PREG-CONTRA"),
    "Avoided in women who could conceive and are not using reliable contraception. Discuss pregnancy plans and contraception.", "A5-14")
therapy_flag("ras_blocker_creatinine_rise", "Creatinine up by more than 30% after starting an ACE inhibitor or ARB", "amber",
    crit("tf_creat", "Creatinine risen by more than 30% within 4 weeks of starting or increasing", all=[P("creatinine_rise_percent_4w", ">", ref="REF-DM-KID-RASI-CREAT-RISE")], ref_id="REF-DM-KID-RASI-CREAT-RISE"),
    "Look for acute kidney injury: volume depletion, NSAIDs, diuretics, renal artery stenosis. KDIGO: reduce or stop only if correcting these does not work.", "A6-30")
therapy_flag("ras_blocker_potassium_high", "Potassium above 5.5 on an ACE inhibitor or ARB", "amber",
    crit("tf_k", "On an ACE inhibitor or ARB, potassium above 5.5 mmol/L", all=[P("ras_blocker", "in", ["acei", "arb", "both"]), P("potassium", ">", ref="REF-DM-KID-K-ACTION")], ref_id="REF-DM-KID-K-ACTION"),
    "KDIGO: correct other causes first (NSAIDs, trimethoprim, diet), then treat the potassium; reduce or stop the ACE inhibitor or ARB only as a last resort. A potassium of 6.5 or more is an emergency and is routed separately.", "A6-59")
therapy_flag("sulfonylurea_with_rifampicin", "Sulfonylurea with rifampicin", "amber",
    crit("tf_rif", "On a sulfonylurea and rifampicin", all=[P("on_rifampicin")], any=SU(), ref_id="REF-DM-RX-TB-RIFAMPICIN"),
    "Rifampicin lowers sulfonylurea levels: glucose control may worsen, so monitor it. Insulin is not affected; WHO keeps metformin as the initial medicine during TB treatment.", "A10-34")
therapy_flag("sglt2_before_surgery_or_fast", "SGLT2 inhibitor before surgery or a prolonged fast", "amber",
    crit("tf_sglt2_surg", "On an SGLT2 inhibitor, with surgery or a prolonged fast planned", all=[GLT("sglt2_inhibitor"), P("surgery_or_fasting_planned")], ref_id="REF-DM-RX-SGLT2-HOLD"),
    "ADA: stop the SGLT2 inhibitor before scheduled surgery and during prolonged fasting, because of ketoacidosis with near-normal glucose. Agree the plan with the prescriber.", "A4-39")
therapy_flag("metformin_during_acute_illness", "Metformin during acute illness with poor intake", "amber",
    crit("tf_met_sick", "On metformin, acutely unwell", all=[GLT("metformin"), P("acute_illness_current")], ref_id="REF-DM-RX-SICKDAY-HOLD"),
    "ADA: consider holding metformin when the person cannot eat and drink or acute kidney injury is a concern. KDIGO notes the evidence for sick-day lists is weak.", "A4-64")
therapy_flag("hypoglycaemia_needing_help_on_treatment", "A low needing someone's help while on insulin or a sulfonylurea", "amber",
    crit("tf_hypo", "On insulin or a sulfonylurea, with a low needing someone's help in the last year", all=[P("on_insulin_or_sulfonylurea"), P("hypo_worst_12m", "==", "needed_help")], ref_id="REF-DM-HYPO-DEINTENSIFY"),
    "ADA: re-evaluate the plan, with deintensification or a switch of the causing medicine. Review hypoglycaemia at every visit.", "A4-20")
therapy_flag("dolutegravir_with_metformin", "Dolutegravir with metformin", "amber",
    crit("tf_dtg_met", "On a dolutegravir regimen and metformin", all=[GLT("metformin"), P("art_regimen", "in", ["tdf_3tc_dtg", "taf_ftc_dtg", "abc_3tc_dtg", "azt_3tc_dtg"])], ref_id="REF-DM-RX-DTG-METFORMIN"),
    "Uganda's HIV chapter: dolutegravir raises metformin levels. Follow up closely for hypoglycaemia and lactic acidosis; review with the prescriber and the ART clinic.", "A1-21")

# ═══ ACUTE_ROUTE: signals that leave this surface (additions) ═══════════════
condition("dka", "Diabetic ketoacidosis", "A9-01", complication_code="dka", status="reuse")
condition("hyperkalaemia_severe", "Severe hyperkalaemia", "A6-60")
drule("DM-ACU-ROUTE-01", "Glucose 18 mmol/L or more: test urine ketones now", "dka",
      crit("acu_glu18", "Glucose 18 mmol/L or more", any=HIGH_GLU("REF-DM-ACU-KETONE-TEST-GLU"), ref_id="REF-DM-ACU-KETONE-TEST-GLU"),
      "low", "immediate", ["urine_ketones", "bohb"], ["Hyperosmolar hyperglycaemic state", "Uncomplicated severe hyperglycaemia"], "A9-48", "DM-ACU-ROUTE", lane="acute_route",
      notes="WHO primary-care protocol. Ketones 2+ or more: refer now. A urine strip is enough to make this decision at any level of care.",
      proposal={"kind": "test.order", "test": "test.ketones_urine", "tier": "today"})
drule("DM-ACU-ROUTE-02", "Ketones 2+ or more (or blood ketones 3.0 or more) with high glucose or known diabetes: ketoacidosis until shown otherwise", "dka",
      crit("acu_ketones", "Urine ketones 2+ or more, or blood ketones 3.0 mmol/L or more; with glucose 11.1 mmol/L or more, or known diabetes",
           any=[P("urine_ketones", "in", ["2plus", "3plus"]), P("bohb", ">=", ref="REF-DM-ACU-DKA-BOHB")],
           atLeast=(1, [KNOWN(), P("capillary_glucose", ">=", ref="REF-DM-ACU-DKA-GLU"), P("random_pg", ">=", ref="REF-DM-ACU-DKA-GLU"), P("fasting_pg", ">=", ref="REF-DM-ACU-DKA-GLU")]), ref_id="REF-DM-ACU-DKA-BOHB"),
      "high", "immediate", ["venous_ph", "bicarbonate", "sodium", "urea"], ["Starvation ketosis", "Alcoholic ketoacidosis", "Ketosis of pregnancy", "Captopril or valproate (false-positive strip)"], "A9-01", "DM-ACU-ROUTE", lane="acute_route",
      notes="Two OR-groups are conjoined by putting the second in atLeast with n = 1. Ketosis with a glucose below 11.1 in a person not known to have diabetes does not fire this rule; on an SGLT2 inhibitor rule 03 covers it. "
            "No blood gas at this site: refer on ketones and the clinical picture; do not wait.",
      proposal={"kind": "acute_signal", "to": "triage"})
drule("DM-ACU-ROUTE-03", "On an SGLT2 inhibitor and vomiting, in pain or breathing deeply: check ketones even if glucose is normal", "dka",
      crit("acu_edka", "On an SGLT2 inhibitor, with any of: vomiting, abdominal pain, deep rapid breathing, acute illness",
           all=[GLT("sglt2_inhibitor")], any=[P("vomiting"), P("abdominal_pain"), P("deep_rapid_breathing"), P("acute_illness_current")], ref_id="REF-DM-ACU-EDKA"),
      "moderate", "immediate", ["bohb", "urine_ketones", "venous_ph", "bicarbonate"], ["Gastroenteritis", "Urinary or genital infection (also commoner on this medicine)"], "A9-05", "DM-ACU-ROUTE", lane="acute_route",
      notes="The live catalog already carries euglycaemic rules; reconcile rather than duplicate. Glucose may be below 11.1 mmol/L.",
      proposal={"kind": "acute_signal", "to": "triage"})
drule("DM-ACU-ROUTE-04", "A child with symptoms of diabetes who is vomiting, in pain, breathing deeply, dry or drowsy: hospital now", "dka",
      crit("acu_paed", "Any of thirst, passing a lot of urine, weight loss or new bed-wetting; with at least one of vomiting, abdominal pain, deep rapid breathing, dehydration",
           any=[P("polyuria"), P("polydipsia"), P("unexplained_weight_loss"), P("secondary_enuresis")],
           atLeast=(1, [P("vomiting"), P("abdominal_pain"), P("deep_rapid_breathing"), P("dehydration")]), claim_id="A9-31"),
      "high", "immediate", ["capillary_glucose", "urine_ketones", "bohb"], ["Malaria", "Gastroenteritis", "Pneumonia", "Urinary tract infection", "Acute abdomen"], "A9-31", "DM-ACU-ROUTE", lane="acute_route",
      ageBands=["child", "adolescent"],
      notes="NICE: glucose above 11 mmol/L with these features goes immediately to a hospital with paediatric facilities. Recognition and referral only: no fluid or insulin content is carried for children.",
      proposal={"kind": "acute_signal", "to": "triage"})
drule("DM-ACU-ROUTE-05", "Potassium 6.5 mmol/L or more: immediate assessment and ECG monitoring", "hyperkalaemia_severe",
      crit("acu_k", "Potassium 6.5 mmol/L or more", all=[P("potassium", ">=", ref="REF-DM-KID-K-SEVERE")], ref_id="REF-DM-KID-K-SEVERE"),
      "high", "immediate", ["potassium"], ["Haemolysed sample", "Delayed sample"], "A6-60", "DM-ACU-ROUTE", lane="acute_route",
      proposal={"kind": "acute_signal", "to": "triage"})
amend("dka", "citation.reverify", {"what": "2024 consensus criteria re-read: glucose 11.1 or known diabetes; ketones 3.0 or urine 2+; pH below 7.3 and/or bicarbonate below 18. Severity table recorded.",
      "refs": ["REF-DM-ACU-DKA-GLU", "REF-DM-ACU-DKA-BOHB", "REF-DM-ACU-DKA-UKET", "REF-DM-ACU-DKA-PH", "REF-DM-ACU-DKA-HCO3", "REF-DM-ACU-DKA-SEV-PH", "REF-DM-ACU-DKA-MOD-PH", "REF-DM-ACU-DKA-SEV-HCO3", "REF-DM-ACU-DKA-MOD-HCO3", "REF-DM-ACU-DKA-SEV-BOHB"],
      "conflict": "WHO HEARTS-D Table 5 prints 13.9 mmol/L; JBDS uses bicarbonate below 15. The consensus is the criteria set in force; the others are recorded."}, ["A9-01", "A9-04", "A2-40", "A9-19"], "DM-ACU-ROUTE", lane="acute_route")
amend("hhs", "citation.reverify", {"what": "Glucose 33.3 or more; effective osmolality above 300 or total above 320; ketones below 3.0; pH 7.3 or more and bicarbonate 15 or more.",
      "refs": ["REF-DM-ACU-HHS-GLU", "REF-DM-ACU-HHS-OSM-EFF", "REF-DM-ACU-HHS-OSM-TOTAL", "REF-DM-ACU-HHS-HCO3"]}, ["A9-07"], "DM-ACU-ROUTE", lane="acute_route")
amend("hypoglycaemia", "citation.reverify", {"what": "Level 1 below 3.9, level 2 below 3.0, level 3 by need for help. WHO writes 'at or below 3.9' and gives 2.8 for intravenous glucose. Malaria's 2.2 is a different threshold for a different disease.",
      "refs": ["REF-DM-HYPO-L1", "REF-DM-HYPO-L2", "REF-DM-HYPO-L3", "REF-DM-HYPO-WHO-IV", "REF-DM-HYPO-MALARIA"], "decision": "D-DM-24"}, ["A4-14", "A2-39", "A9-46"], "DM-ACU-ROUTE", lane="acute_route")

# ═══ Design B: time-based act rules ═════════════════════════════════════════
designb("DM-ACT-RECALL-01", "DM-ACT-RECALL", "act", "Recall: 3 months until at target, 6 months once at target, 1 month after a treatment change", "recallInterval",
        {"above": "REF-DM-ACT-REVIEW-MONTHS", "at_target": "REF-DM-CTRL-WINDOW-AT-TARGET", "after_change": "REF-DM-ACT-REVIEW-AFTER-CHANGE", "cadence": "REF-DM-ACT-CADENCE"},
        ["obs.hba1c", "obs.glucose"], ["proposal"], ["A12-61", "A12-67", "A2-25"], minTrust=2,
        note="The date proposed is the earliest of this and any organ-specific recall (foot category, eye grade, kidney grid). One recall per patient, never one per rule.")
designb("DM-ACT-RECALL-02", "DM-ACT-RECALL", "act", "Rescreen date for a person tested and negative", "rescreenDate",
        {"interval": "REF-DM-SUS-RESCREEN", "ih": "REF-DM-IH-RETEST", "near": "REF-DM-DX-NEAR-THRESHOLD-MAX"}, ["obs.glucose", "obs.hba1c"], ["proposal"], ["A11-41", "A3-50", "A3-08"], minTrust=3)
designb("DM-ACT-SCREEN-NEVER", "DM-ACT-SCREEN", "act", "Confirmed diabetes with no retinal, kidney or foot assessment on record", "screeningNeverDone",
        {"eye": "REF-DM-EYE-INTERVAL-WHO", "eye_start_t1": "REF-DM-EYE-START-T1", "kidney": "REF-DM-KID-SCREEN-INTERVAL", "kidney_start_t1": "REF-DM-KID-SCREEN-START-T1", "foot": "REF-DM-FOOT-INT-0"},
        ["exam.retinopathy_grade", "obs.uacr", "derived.egfr", "exam.monofilament"], ["proposal", "data_gap"], ["A2-34", "A2-35", "A2-36"], minTrust=2,
        note="Type 2: due at diagnosis. Type 1: eyes and kidneys from 5 years after onset. Unclassified is treated as type 2 for this purpose (earlier is safer).")
designb("DM-ACT-TARGET-01", "DM-ACT-TARGET", "act", "Propose an individual target for the clinician to accept", "proposeTarget",
        {"general": "REF-DM-CTRL-HBA1C-TARGET", "relaxed": "REF-DM-CTRL-HBA1C-RELAXED", "older": "REF-DM-CTRL-OLDER-HEALTHY", "tb": "REF-DM-CTRL-TB", "bp_sbp": "REF-DM-CVD-BP-SBP", "bp_dbp": "REF-DM-CVD-BP-DBP"},
        ["obs.hba1c"], ["proposal"], ["A2-28", "A2-29", "A4-49", "A10-36"], minTrust=2,
        note="Runs the TargetRule list. Proposes the tier with the reason; an accepted target becomes a monitoring threshold. In pregnancy it proposes none and refers.")
designb("DM-ACU-ROUTE-CTX", "DM-ACU-ROUTE", "acute_route", "Route acute signals to triage with their diabetes context", "acuteRoute",
        {"ketone_test": "REF-DM-ACU-KETONE-TEST-GLU", "bohb": "REF-DM-ACU-DKA-BOHB", "hhs": "REF-DM-ACU-HHS-GLU", "hypo_l2": "REF-DM-HYPO-L2", "k": "REF-DM-KID-K-SEVERE"},
        ["obs.glucose", "obs.ketones_blood", "obs.ketones_urine", "obs.potassium"], ["acute_signal"], ["A9-48", "A9-01", "A9-07", "A4-14", "A6-60"], minTrust=1,
        note="minTrust 1: a patient-entered reading can raise an acute signal, though never a diagnosis. The NCD surface shows only where the signal went.")
