"""Corrections from the independent re-read of the reference catalogue (verify/V*-results.json).

Every entry was handed to a verifier told to refute it against the source. This file
(1) applies the wording corrections that came back, and (2) stamps each entry with the
verifier's verdict, so the dossier shows what was re-read and what was not.
"""
import json, os, glob
import lib
from lib import REFS, CLAIMS, claim, _bodies

# The type 5 description is an international consensus statement, not an IDF document.
CLAIMS["A10-44"]["standard"] = "other (international consensus statement, Lancet Glob Health 2025)"

def refix(rid, text=None, claims=None, note=None, needs=None, clear_needs=False, conf=None, conflicts=None):
    e = REFS[rid]
    if text: e["text"] = text
    if claims:
        cs = [claim(c) for c in claims]; first = cs[0]
        verified = bool(first.get("verified")) and not first.get("from_memory")
        body, proposed = _bodies(first["standard"])
        e["source"] = f"{proposed} · {first.get('document')} · {first.get('version')}"
        e["url"] = first.get("url") or ""; e["verifiedOn"] = first.get("retrieved") if verified else None
        e["x"].update({"standard": body, "bodyProposed": proposed, "section": first.get("section"), "quote": (first.get("quote") or "").strip(), "claims": list(claims), "verified": verified})
    if note: e["x"]["note"] = note
    if conflicts: e["x"]["conflicts"] = conflicts
    if needs: e["x"]["needsCsoInput"] = needs; e["confidence"] = conf or "low"
    if clear_needs: e["x"].pop("needsCsoInput", None)
    if conf: e["confidence"] = conf

# refresh sources for the re-attributed claim
for _r in ("REF-DM-CLS-T5", "REF-DM-CLS-T5-BMI", "REF-DM-CLS-T5-AGE"):
    refix(_r, claims=REFS[_r]["x"]["claims"])

refix("REF-DM-ACU-DKA-PH", text="DKA: pH below this value", note="The consensus figure says 'pH'. Venous gases are listed among the initial samples and 'venous pH' is used in the resolution criteria; the catalog feature is venous_ph.")
refix("REF-DM-ACU-MIXED", text="DKA and HHS overlap in more than a third of hyperglycaemic crises. Mortality in the mixed picture is higher than in HHS alone.",
      note="The comparison with DKA alone did not reach significance (adjusted OR 1.8; 95% CI 0.9 to 3.6).")
refix("REF-DM-ACU-KETONE-RISK", text="Blood ketones at or above this value (and below 3.0): at risk of DKA, contact the diabetes team as soon as possible",
      note="Trend UK sick-day leaflet. ISPAD uses 'above 1.5' for the same step. At 3.0 or more the action is emergency help.")
refix("REF-DM-ACU-INFECTIONS", text="Infections strongly associated with diabetes that can kill: rhinocerebral mucormycosis, emphysematous pyelonephritis and cholecystitis, necrotising (malignant) otitis externa, Fournier's gangrene.",
      note="The emphysematous pyelonephritis source could not be re-opened at verification. The CDC page names uncontrolled diabetes, not ketoacidosis, as the mucormycosis risk factor.")
refix("REF-DM-SUS-PAED-4T", note="The Diabetes UK page is written for families. The instruction to clinicians (measure capillary glucose at presentation) is NICE NG18 recommendation 1.4.1.")
refix("REF-DM-HYPO-IAH", note="ISPAD: impaired awareness is a continuum, not all-or-none; the questionnaires are for people able to self-report.")
refix("REF-DM-HYPO-MALARIA", note="A different threshold for a different disease. The same WHO passage intervenes below 3 mmol/L in children under 5. In a person on insulin or a sulfonylurea the diabetes thresholds apply.")
refix("REF-DM-ACU-PAED-GLU", text="NICE: a child or young person without known diabetes, with a glucose above this value and symptoms that suggest ketoacidosis, goes immediately to a hospital with paediatric facilities",
      note="NICE NG18 1.4.2. In a child with KNOWN diabetes NICE says to suspect ketoacidosis even if the glucose is normal (1.4.4): the threshold never excludes it.")
refix("REF-DM-SUS-PAED-SAMEDAY", text="A child or young person with suspected type 1 diabetes is referred immediately, on the same day (NICE NG18 1.1.2).")
refix("REF-DM-EYE-INTERVAL-ADA", text="ADA: with any retinopathy, a dilated eye examination at least every this many months (with none on one or more yearly examinations and glycaemia at goal, every 1 to 2 years may be considered)")
refix("REF-DM-NEU-ATYPICAL", text="Refer when features are atypical: acute or subacute onset, not length-dependent, motor involvement, asymmetry, or the diagnosis is unclear.")
refix("REF-DM-VAL-ABI-HIGH", text="An ankle-brachial index above this value is an elevated result: it does not exclude peripheral artery disease and is itself a risk factor for amputation",
      note="IWGDF/ESVS/SVS: medial artery calcification raises ankle pressures and affects the accuracy of the index.")
refix("REF-DM-FOOT-CHARCOT", text="Always consider active Charcot foot in a person with diabetes, neuropathy and intact skin whose foot is warmer, swollen and/or red compared with the other foot. Start knee-high offloading promptly while it is investigated (IWGDF). NICE: refer within 1 working day.",
      note="Any one of warmth, swelling or redness is enough. IWGDF endorses no skin-temperature threshold for DIAGNOSIS; NICE NG19 uses a sustained difference under 2 degrees to judge RESOLUTION only.")
refix("REF-DM-EYE-UG-2016", text="Uganda MoH Guidelines for Eye Care 2016: all people with diabetes are referred to a secondary or tertiary facility (retina centre) for evaluation. Staging follows the ICO severity scales; mild non-proliferative retinopathy is already 'refer to retina clinic'.",
      note="Uganda's table stages macular oedema as mild, moderate or severe (the 2003 scale), not the ICO 2017 centre-involving split.")
refix("REF-DM-EYE-ICDR", conflicts="Exactly 20 haemorrhages per quadrant: 'more than 20' in the ICDR scale (Wilkinson 2003); '20 or more' in ICO's 2017 restatement. The pack grades by ICDR and schedules by ICO (D-DM-14).")
refix("REF-DM-EPI-UG-FPG-SENS", text="Eastern Uganda: sensitivity of fasting plasma glucose at the recommended cut-off against the OGTT (95% CI 41.5 to 79.8)")
refix("REF-DM-EPI-UG-HBA1C-SENS", text="Eastern Uganda: sensitivity of HbA1c at the recommended cut-off against the OGTT (95% CI 46.3 to 86.1)")
refix("REF-DM-RX-EML", note="Semaglutide is in the 2025 (24th) list, not the 2023 list: established cardiovascular disease or CKD AND obesity (BMI 30 or more). Empagliflozin has been listed since 2021.")
refix("REF-DM-ACT-EDU-RAMADAN", text="Fasting: assess risk well before Ramadan; break the fast if glucose is below 3.9 or above 16.6 mmol/L or the person feels unwell; testing does not break the fast.",
      note="The '6 to 8 weeks before' figure recorded in research could not be found at verification and has been removed.")
refix("REF-DM-CLS-CPEP-LOW", needs="The 'below 200 pmol/L' band is printed inside the flowchart figure (Holt 2021 Fig. 1; ADA 2026 Fig. 2.1), which could not be read at verification. Readable text: 'low or absent C-peptide confirms the diagnosis of type 1 diabetes' and '200 to 600 pmol/L are usually consistent with type 1 diabetes or MODY'. A person must read the figure before this is signed.",
      note="200 or more does NOT mean 'not type 1': the 200 to 600 band is usually type 1 or MODY. Only 600 or more argues for type 2.")
refix("REF-DM-ACT-EDU-INJECTION", text="Check injection sites for lipohypertrophy at least every 3 months; rotate within the same anatomical area rather than moving between areas with each injection; do not inject into lumps.")
refix("REF-DM-RX-DEESC-HBA1C", text="Age 75 or over and moderately or severely frail: an HbA1c below this value signals high hypoglycaemia risk; consider de-escalating a sulfonylurea, or a sulfonylurea with insulin",
      note="A UK expert consensus (Strain 2021), not a guideline body; age 75 is given as an example. ADA makes the same point without a number.")
refix("REF-DM-SUS-NO-SCORE", text="No diabetes risk score has been validated in Uganda. A 2022 review found none developed and validated for sub-Saharan Africa; scores tested in African-ancestry cohorts discriminated acceptably and were poorly calibrated, overestimating risk; the African Diabetes Risk Score points table could not be read.",
      note="So DM-SUS-RISK is built from published eligibility criteria (WHO HEARTS-D, ADA Table 2.5), not from a points score. See D-DM-05.")
refix("REF-DM-RX-METFORMIN-NOSTART-EGFR", text="ADA: do not START metformin when eGFR is below this value; for people already taking it, ADA says the amount should be reduced below this value and it should be stopped below 30")
refix("REF-DM-RX-REASSESS", text="ADA: re-evaluate the medication plan at regular intervals (for example every 3 to 6 months) and modify treatment without delay when individual goals are not met.",
      note="Expert opinion (grade E). The need to deintensify when overtreated is in the ADA/EASD 2022 consensus, not in this recommendation.")
refix("REF-DM-CTRL-OLDER-AGE", text="ADA screens for cognitive impairment from this age; the pack uses it as the age from which the older-adult goals are offered",
      note="ADA's goals table for older adults is organised by health status, not by age.", conf="moderate")
refix("REF-DM-RX-TB-RIFAMPICIN", text="Rifampicin lowers the plasma levels of sulfonylureas; insulin is unaffected; metformin's effect may increase. WHO keeps metformin as the initial medicine during TB treatment.")
refix("REF-DM-SUS-TB", note="The handbook prints 'over 40 years' in the prioritisation sentence and 'aged 40 or over with BMI above 25' when restating the general WHO recommendation.")
refix("REF-DM-SUS-TB-RECHECK", clear_needs=True, conf="high", note="Read verbatim at verification: 'It is therefore critical to reassess the glycaemic status after 1 month as part of standard diabetes management.'")
refix("REF-DM-CTRL-TB", text="WHO TB handbook: a more lenient HbA1c target might be assigned in the short term to people with markedly elevated glucose and TB: for example below this value",
      note="Not a blanket target for everyone on TB treatment; the general target stated is about 7%.")
refix("REF-DM-ACT-TB-COUGH", note="WHO and The Union, 2011: 'at diagnosis and, if possible, at each regular check-up'.")
refix("REF-DM-RX-LOWCOST", note="Read in the 2025 edition (recommendations 9.29 and 9.30, grade E); not found in the readable part of the 2026 edition.", conf="moderate")
refix("REF-DM-CLS-MODY", text="Suspect MODY: onset typically before 35, a parent affected in each generation, no islet antibodies, low insulin requirement, no significant obesity, or mild stable fasting hyperglycaemia.")
refix("REF-DM-ACT-PRECONCEPTION", claims=["A5-14", "A5-26"],
      text="Women who could conceive: ADA says to avoid ACE inhibitors, ARBs and related medicines without reliable contraception, to switch before a planned pregnancy, and to stop lipid-lowering medicines before conception.",
      note="Re-attributed at verification: WHO 2025 covers medicine changes DURING pregnancy only and has no preconception recommendation. ADA's passages concern blood pressure and lipid medicines.", conf="moderate")
refix("REF-DM-EYE-PREG", claims=["A7-24", "A10-09", "A7-32"])
refix("REF-DM-PREG-WINDOW-START", claims=["A10-22", "A10-20"], note="FIGO also allows diagnosis 'at any other time during the course of pregnancy': 24 weeks is when routine testing is done, not a floor.")
refix("REF-DM-PREG-WINDOW-END", claims=["A10-22", "A10-20"])
refix("REF-DM-CLS-T5", text="Type 5 (malnutrition-related) diabetes has NO formal diagnostic criteria yet. An international consensus statement (2025) describes: BMI below 18.5 in adults, usually diagnosed before 30, early-life undernutrition, ketosis resistance, antibody negative, normal pancreas on imaging.")
refix("REF-DM-CLS-T5-AGE", text="The consensus statement describes onset before this age; a description from the literature, not a criterion")
refix("REF-DM-CLS-T5-BMI", text="BMI below this value in adults is the lean threshold in the consensus features panel; the cut-off is proposed and needs more research")

# ═══ Batches V1 (WHO), V2 (ADA), V4 (kidney and heart), V8 (Uganda) ═════════
def requote(cid, quote, how):
    """Replace a recorded quote with the one the verifier read. The old quote is kept beside it."""
    c = CLAIMS[cid]
    c["quote_recorded_in_research"] = c.get("quote"); c["quote"] = quote
    c["how_verified"] = (c.get("how_verified") or "") + " | " + how
    for e in REFS.values():
        if e["x"]["claims"] and e["x"]["claims"][0] == cid: e["x"]["quote"] = quote

# V8 read these three UCG 2023 HIV-chapter passages verbatim (prescribingcompanion.com, which states the 2023 edition).
for _cid, _q in (("A1-19", "Do RBS to confirm hyperglycaemia then substitute with EFV"),
                 ("A1-20", "Contraindications for DTG (use DTG screening tool prior to DTG initiation) including: known diabetics, patients on anticonvulsants (carbamazepine, phenytoin, phenobarbital)"),
                 ("A1-21", "DTG increases metformin levels. May increase risk of hypoglycaemia and metabolic acidosis | Close follow-up (routine electrolytes, BUN and Creatinine, Random Blood Sugar tests) recommended")):
    requote(_cid, _q, "Read verbatim at verification (batch V8) on prescribingcompanion.com, whose index page states '2023 Uganda Clinical Guidelines'. A mirror of the UCG HIV chapter, not the MoH file.")
    CLAIMS[_cid]["verified"] = True; CLAIMS[_cid]["from_memory"] = False; CLAIMS[_cid]["retrieved"] = "2026-10-05"
requote("A2-37", "Urgent (same day) referral should occur if one of the following is detected: urine ketones >2+, or no improvement in glycaemia ≥18 mmol/L after management with metformin and/or gliclazide; suspicion of ketoacidosis or HHS; hypoglycaemia unresolved by treatment; clinical suspicion of type 1 diabetes in newly diagnosed patient; [...] blood pressure >200/>110 mmHg; blood pressure >180/>110 mmHg with headache, shortness of breath, blurred vision, changed mental state, nausea, vomiting, reduced urine output; [...] critical limb ischaemia; anuria or eGFR <30 mL/min/1.73 m²",
        "Quote completed at verification (batch V1): the research quote had elided the two blood-pressure bullets.")

# ── V1: WHO HEARTS-D and WHO PEN ────────────────────────────────────────────
refix("REF-DM-ACT-REVIEW-AFTER-CHANGE", needs="Not established at verification. HEARTS-D Fig. 1 prints 'REVIEW IN 1 MONTH' twice, but the text extraction cannot say which step it follows; Fig. 2 and the PEN manual print 3 months after starting metformin and after each step. A person must look at the printed figure (p. 16) before 1 month is used as a general post-change interval.")
refix("REF-DM-ACT-REVIEW", text="Review in 3 months, or at once if symptoms appear (HEARTS-D Fig. 2 and the PEN manual, after starting a medicine and after each step).",
      note="HEARTS-D Fig. 1 also prints 'REVIEW IN 1 MONTH' twice; which step it follows could not be read (REF-DM-ACT-REVIEW-AFTER-CHANGE).")
refix("REF-DM-ACT-REFER-SAMEDAY", text="WHO HEARTS-D same-day referral: suspected DKA or HHS; urine ketones 2+ or more; glucose 18 mmol/L or more not improving on metformin and/or gliclazide; hypoglycaemia unresolved by treatment; suspected type 1 in a new diagnosis; symptoms of heart disease or stroke; recent deterioration of vision; blood pressure above 200/110, or above 180/110 with symptoms; infected or spreading foot ulcer, gangrene, critical limb ischaemia; anuria or eGFR below 30.",
      conflicts="Urine ketones: section 4 prints '>2+', Fig. 1 prints '≥2+'. The pack uses 2+ or more (the safer reading, and the 2024 consensus criterion).",
      note="The blood-pressure-with-symptoms bullet was missing from the research record and was added at verification.")
refix("REF-DM-ACU-BP-REFER-SBP", note="Strict '>'. The same list has a second bullet at above 180/110 with headache, breathlessness, blurred vision, changed mental state, nausea, vomiting or reduced urine output (REF-DM-ACU-BP-REFER-SBP-SYMPT).")
refix("REF-DM-ACU-BP-REFER-DBP", note="Strict '>'. WHO writes '>200/>110' without saying AND or OR; the pack fires on either, which is the cautious reading and an interpretation.")
refix("REF-DM-CTRL-HBA1C-TARGET", text="General HbA1c target: 7.0% (WHO prints no operator: 'aim for an HbA1c of 7.0%')",
      conflicts="At exactly 7.0%: WHO's narrative has no operator; WHO's control-rate indicator (Table 7) prints '<7.0%'; ADA prints '<7%'. The pack's bands use 'below 7.0' (D-DM-13).")
refix("REF-DM-CTRL-FPG-SURROGATE", conflicts="At exactly 7.0 mmol/L: the clinical target (p. 17 and the Fig. 2 goal box) is '≤7.0'; the programme indicator in Table 7 is '<7.0'. The same split applies to 9.0 after a meal (D-DM-13).")
refix("REF-DM-CTRL-HBA1C-RELAXED", text="Relaxed HbA1c target: WHO gives 'below 8%' as an example, for people with frequent severe hypoglycaemia, advanced complications or low life expectancy",
      note="'Frailty' is not WHO's word; it comes from ADA. WHO's Fig. 2 footnote adds serious comorbidity.")
refix("REF-DM-SUS-BMI", conflicts="HEARTS-D prints 'BMI ≥25' in Fig. 1 and 'BMI >25' in Fig. 2. The pack uses 25 or more.")
refix("REF-DM-DX-RANDOM", text="Random plasma glucose at or above this value WITH symptoms is in the diabetes range (WHO: 'to be used only in the presence of symptoms')",
      note="'Or a hyperglycaemic crisis' is ADA's wording, not WHO's.")
refix("REF-DM-DX-HBA1C", note="WHO 2011 and HEARTS-D Table 3 print '6.5%' as a cut point with no operator; 'at or above' is explicit only in ADA Table 2.1. HEARTS-D adds that plasma glucose is preferred in people with symptoms.")
refix("REF-DM-HYPO-WHO-IV", conflicts="Body text: '≤2.8 mmol/L (50 mg/dL)'. Fig. 2 panel: '<50 mg/dl or 2.8 mmol/l'. The pack uses at or below.")
refix("REF-DM-KID-DIPSTICK", text="Where ACR is unavailable WHO HEARTS-D ranks: protein-to-creatinine ratio, then a reagent strip read by machine, then a strip read by eye. KDIGO 2024 (Practice Point 1.3.1.2): confirm a positive strip with a laboratory ratio wherever possible.",
      note="The confirmation sentence is KDIGO's, not WHO's; re-attributed at verification.")
refix("REF-DM-RX-LADDER-WHO", conflicts="When metformin starts: HEARTS-D body text and Fig. 1 say after diet and physical activity have not achieved control; Fig. 2 (the WHO PEN protocol) starts it at diagnosis alongside them. "
      "Before insulin: a Fig. 2 footnote allows a DPP-4 inhibitor, an SGLT2 inhibitor or pioglitazone 'if they are more affordable than insulin', which is wider than 'only if insulin is unsuitable'.",
      note="'Review 3 months after each step' is Fig. 2's wording.")
refix("REF-DM-ACU-KETONE-TEST-GLU", conflicts="'≥18' in the PEN manual and HEARTS-D text; '>18' in HEARTS-D Fig. 1 and Fig. 2. The PEN manual refers every patient at 18 or more; HEARTS-D Fig. 1 tests ketones and refers if they are 2+ or more or there is no improvement.")
refix("REF-DM-CVD-STATIN-AGE", text="WHO HEARTS-D: a statin for people with type 2 diabetes at or above this age, 'but only if this does not negatively impact access to glucose-lowering and blood pressure-lowering medication'")
refix("REF-DM-FOOT-EVERY-VISIT", text="Examine the feet for ulcers at every visit; refer to a higher level if an ulcer is present or a pulse is absent. Assess amputation risk yearly at low risk, every 3 to 6 months at moderate risk and every 1 to 3 months at high risk (WHO HEARTS-D foot annex).")
refix("REF-DM-SUS-AGE-WHO", note="The threshold is in Fig. 1 and Fig. 2 ('40+ years'); Table 2, cited in research, lists symptoms only.")
refix("REF-DM-CTRL-WINDOW-ABOVE", note="WHO PEN states this as a monitoring interval. Reading it as 'a measure older than this is not current' and adding 'or therapy changed' is this pack's derivation, for CSO signature.")
refix("REF-DM-CTRL-WINDOW-AT-TARGET", note="WHO PEN states this as a monitoring interval once controlled; HEARTS-D Table 7 uses the same 6-month look-back. The 'not current' reading is this pack's derivation.")
refix("REF-DM-SUS-ONE-TEST-WEAK", note="A synthesis of four sources, not a quotation. Against the OGTT: HbA1c sensitivity 57.7% (Chivese, pooled African studies) and 69.8% (Kasujja, eastern Uganda); fasting glucose 44.3% (Baye) and 62.6% (Kasujja).")
for _r in ("REF-DM-ACT-EVERY-VISIT", "REF-DM-CTRL-INSULIN-FPG-LOW", "REF-DM-DX-POC-WHO", "REF-DM-ACT-EDU-FOOT", "REF-DM-SUS-DRUGS"):
    _rows = [x for f in sorted(glob.glob(os.path.join(lib.ROOT, "verify", "V*-results.json"))) for x in json.load(open(f, encoding="utf-8")) if x.get("ref") == _r and x.get("foundQuote")]
    if _rows:
        requote(REFS[_r]["x"]["claims"][0], _rows[0]["foundQuote"], "Quote replaced at verification: the one recorded in research did not support the claim.")

# ── V2: ADA Standards of Care 2026 ──────────────────────────────────────────
refix("REF-DM-CLS-CPEP-HIGH", needs="600 pmol/L is printed in the figure legend as the level above which 'the circumstances of testing do not matter'. The statement that it strongly suggests type 2 diabetes is inside the flowchart image (Holt 2021 Fig. 1; ADA 2026 Fig. 2.1), which could not be read. A person must read the figure before any rule uses it.",
      note="Applies only to people on insulin, not within 2 weeks of a hyperglycaemic emergency, and rests on White European data. Held out of the pack's rules.")
refix("REF-DM-CLS-CPEP-VLOW", note="Given as an example ('e.g.'). White European data, reprinted from Holt 2021.")
refix("REF-DM-CLS-CPEP-TIMING", note="Not applied by any live rule: both C-peptide criteria are held out until the source figure is read by a person.")
refix("REF-DM-CLS-AB-ORDER", text="Islet autoantibodies: GAD first; if negative, IA-2 and/or ZnT8. In people diagnosed under 35 with no features of type 2 or monogenic diabetes, a negative result does not change the diagnosis of type 1.",
      note="White European data, reprinted from Holt 2021. In Cameroon, Uganda and South Africa most young people with clinical type 1 were antibody negative (REF-DM-CLS-UG-AB-NEG).")
refix("REF-DM-CLS-MODY-HBA1C", text="Consider monogenic diabetes with one or more of: HbA1c at diagnosis below this value; one parent with diabetes; features of a specific monogenic cause",
      note="Any one feature is enough in the source. White European data.")
refix("REF-DM-VAL-HBA1C-RBC", text="Anything that shortens red-cell survival (haemolysis, recovery from blood loss) falsely LOWERS HbA1c whatever the assay. After transfusion, in sickle cell disease and with malaria the result is unreliable in a direction that cannot be predicted: use glucose.",
      note="NGSP states the direction only for shortened red-cell survival. It gives none for transfusion or homozygous variants ('interpreted with caution'), and does not mention malaria; WHO 2011 lists malaria without a direction.")
refix("REF-DM-VAL-HBA1C-IRON", note="Iron deficiency: NGSP. Vitamin B12 deficiency: WHO 2011 Annex 1, not NGSP.")
refix("REF-DM-HYPO-RISK-AGE", note="ADA Table 6.5, 'other risk factors'. The footnote ties it to type 2 diabetes; younger people with type 1 are also at very high risk.")
refix("REF-DM-HYPO-RISK", note="ADA's row is 'alcohol or substance use disorder'; the table also covers meglitinides. The pack carries a selection of the listed factors.")
refix("REF-DM-SUS-GDM-RETEST-MAX", text="After gestational diabetes, test for diabetes at least every this many months (ADA Table 2.5: 'at least every 1 to 3 years')",
      note="'Lifelong' is not in ADA Section 2 and has been removed from the wording.")
refix("REF-DM-SUS-RESCREEN", note="ADA: 'at a minimum of 3-year intervals', sooner with symptoms or a change in risk. A maximum gap, never a reason to withhold an earlier test.")
refix("REF-DM-SUS-RISK-FACTORS-ADA", note="The pack carries a subset. ADA's table also lists high-risk ancestry and fatty liver disease, and gives numbers the pack does not use (HDL, triglycerides, BMI 23 for Asian ancestry).")
refix("REF-DM-SUS-STEROID", note="ADA recommendation 2.18 does not say 'not fasting'; that the fasting value misleads is from the narrative and the UK steroid guidance (A10-39).")
refix("REF-DM-ACT-TABLE41", note="ADA's row is 'vitamin B12 if taking metformin for more than 5 years'. The table also lists coeliac screening in type 1, a full blood count, and calcium, vitamin D and phosphorus.")
refix("REF-DM-ACT-VACCINES", text="ADA reprints the US adult schedule (CDC/ACIP) for people with diabetes: eight rows, two of them pneumococcal. Uganda's routine schedule has none of them for adults with diabetes.",
      note="A US schedule, not an ADA recommendation of its own. The Uganda half rests on an undated UNICEF guide.")
refix("REF-DM-ACT-SMBG", note="ADA 7.13 adds that monitoring 'may be helpful' on non-insulin therapy, particularly with medicines that can cause hypoglycaemia. No self-monitoring statement was found in HEARTS-D (a negative finding).")
refix("REF-DM-RX-SICKDAY-HOLD", note="ADA: narrative, not a graded recommendation; it names metformin AND SGLT2 inhibitors. KDIGO's words are 'a paucity of evidence' and 'potential harm' (read from a third-party copy).")
refix("REF-DM-VAL-METER", note="The home-use criterion (the hospital-use standard is tighter). ISO 15197:2013 also requires 99% of readings in consensus error grid zones A and B. The laboratory guideline converts 100 mg/dL to 5.56 mmol/L.")
refix("REF-DM-HYPO-L2", note="Strictly below: a reading of exactly 3.0 mmol/L is level 1 (ADA Table 6.4).")
refix("REF-DM-SUS-HOSP-GLU", note="Strictly above in both ADA recommendation 16.1 and its definitions.")
refix("REF-DM-CTRL-OLDER-COMPLEX", note="The 8% figure is in ADA's narrative ('e.g., A1C up to 8%') and the Figure 6.1 legend ('less than 8 percent'), not in a numbered recommendation; the two wordings differ at exactly 8%.")

# ── V4: kidney and cardiovascular ───────────────────────────────────────────
refix("REF-DM-KID-REFER-FALL", text="KDIGO 2024: refer for a SUSTAINED fall in eGFR of more than this percentage (more than 30% in people who have just started an ACE inhibitor, ARB or SGLT2 inhibitor)",
      note="A referral criterion for progression. It is not, on its own, a sign that the kidney disease is not diabetic.")
for _r in ("REF-DM-KID-K-SEVERE", "REF-DM-KID-K-MODERATE"):
    refix(_r, note="KDIGO 2024 Table 28 is credited 'Data from Think Kidneys, the Renal Association and the British Society for Heart Failure': UK guidance reproduced by KDIGO as a suggested action, not a graded KDIGO statement.")
REFS["REF-DM-VAL-HBA1C-CKD-EGFR"]["x"]["conversion"] = "KDIGO says 'advanced CKD (G4 to G5)'; G4 starts below 30 (REF-DM-KID-GFR-G4)"
refix("REF-DM-VAL-HBA1C-CKD-EGFR", note="A derived value: the source names categories, not a number.")
refix("REF-DM-CVD-LIPID-INTERVAL", note="ADA 10.16 (grade E) is for people not on lipid-lowering treatment. For people starting or changing it, 10.17 (grade A) asks for a profile 4 to 12 weeks later, then yearly.")
refix("REF-DM-CVD-BAND-20", text="WHO chart band boundary: 10-year risk",
      note="The statin clause was removed at verification: the only readable source heads the statin band 'CVD risk >20%', and the HEARTS risk-based management module could not be opened.")
refix("REF-DM-KID-ACR-A3", conflicts="Exactly 30 mg/mmol: KDIGO 2024 Table 3 places it in A2 (A3 is 'above 30'); KDIGO's own Figure 13 and Figure 48 and ADA place it in the severe band (D-DM-17).")
for _r in ("REF-DM-CTRL-CKD-HIGH", "REF-DM-CTRL-CKD-LOW"):
    refix(_r, note="KDIGO 2022 recommendation 2.2.1 applies to CKD NOT treated with dialysis.")
refix("REF-DM-CVD-ASCVD", text="Established atherosclerotic disease (ADA 2026): acute coronary syndrome, myocardial infarction, stable or unstable angina, arterial revascularisation, stroke, or peripheral artery disease including aortic aneurysm.",
      note="Transient ischaemic attack is NOT in ADA's sentence. The feature cvd_established includes it as a local clinical addition for CSO signature.")
refix("REF-DM-CVD-BP-INTERVAL", text="ADA 10.1: measure blood pressure at every routine visit, or at least every 6 months. WHO 2021 hypertension guideline (recommendation 7, conditional): monthly after starting or changing treatment until at target, then every 3 to 6 months.",
      note="Two bodies; attribution split at verification.")
refix("REF-DM-CVD-PREG-CONTRA", text="ADA 2026: ACE inhibitors, ARBs and mineralocorticoid antagonists are avoided without reliable contraception and are contraindicated in pregnancy (10.12). Lipid-lowering medicines are, in most circumstances, stopped before conception (10.25).",
      note="ADA does not call statins 'contraindicated'; it allows continuation in some circumstances. Wording corrected at verification.")
refix("REF-DM-CVD-FOLLOWUP", note="Read in the WHO South-East Asia booklet, which prints the bands as '<5%', '5-10%', '10-20%' and '>20%', says 12 months 'if treatment not initiated', and does not credit HEARTS.")
refix("REF-DM-CVD-NOT-VALIDATED", note="'No sub-Saharan African cohort' is an inference from the list of six validation cohorts, not a sentence in the paper.")
refix("REF-DM-CVD-NONLAB-UNDER", note="Compared with the laboratory chart in the same people (an agreement study), not with observed events.")
refix("REF-DM-KID-RASI-CHECK", note="KDIGO: 2 to 4 weeks. ADA 2025 Section 11 was read as '7 to 14 days after initiation or after a dose change'; the recommendation number was not captured.")
refix("REF-DM-KID-STRIP-MAP", needs="KDIGO 2012 Table 7 could not be read from any copy. WHO HEARTS-D Table 6 was readable and gives A2 as 'trace/1+' and A3 as '1+/2+'. Re-attribute to WHO or have a person read the KDIGO table.")
refix("REF-DM-VAL-EGFR-STEADY", text="KDIGO 2024: non-steady-state conditions are a source of error in creatinine-based eGFR.",
      needs="Only the steady-state clause was found, as 'source of error'. No sentence naming acute kidney injury, hyperglycaemic crisis or pregnancy was found on the pages read.")
refix("REF-DM-KID-MONITOR-GRID", note="The 18 cell values came out of the figure as one run of text. The counts match the grid recorded here and the order is consistent with it, but cell positions are inferred: a person should check Figure 13 once.")

# ── V8: Uganda ──────────────────────────────────────────────────────────────
refix("REF-DM-DX-HIVGL-FBG", note="Printed '≥ 7mmol', in the summary-of-changes table as the definition of a client category, not as a diagnostic criterion. The screening algorithm figures could not be read.")
refix("REF-DM-DX-HIVGL-RBG", note="Printed '≥ 11mmol' (11, not 11.1), in the same client-category definition.")
refix("REF-DM-RX-EMHSLU", note="Glibenclamide's deletion and the six additions were read in the list's front matter. The level-of-care designations were read only in a 2025 PLoS One analysis; the list itself is readable to about p. 32. That paper also says UCG 2023 still names glibenclamide.")
refix("REF-DM-CLS-DTG", note="Read through the HIV i-Base summary of the Lancet HIV letter, not the letter. In ART-naive Ugandans diabetes was rare (about 4 per 1000 person-years) but pre-diabetes was common (about 240 per 1000 person-years).")
refix("REF-DM-EPI-UG-EYE-CAPACITY", note="51 ophthalmologists 'as of 2023'. The 95% is 36 respondents; 40 people were interviewed.")
refix("REF-DM-SUS-HIV-UG", note="Read in a secondary source (Mulindwa et al.). The full risk list is age 45 or over, BMI 24 or more and a history of hypertension. UCG 2023's HIV chapter, read verbatim, still lists 'known diabetics' as a contraindication to dolutegravir (D-DM-33).")
refix("REF-DM-ACT-LEVELS", note="The level codes are defined in UCG 2023's introduction. The cadres and the 'lowest level of use' rule were read in EMHSLU 2023.")
for _r, _sec in (("REF-DM-CTRL-UCG", "8.1.3"), ("REF-DM-DX-UCG-CRITERIA", "8.1.3"), ("REF-DM-PREG-UCG", "16.2.5"), ("REF-DM-RX-UCG-LADDER", "8.1.3"), ("REF-DM-EYE-UCG", "20.2.3")):
    refix(_r, needs=f"UCG 2023 section {_sec} was not read: every copy found is a single large PDF and the reading tool stops in the front matter. This is 'beyond the readable part', not 'absent'. Page numbers differ between printings (8.1.3 is p. 469 in one copy and p. 471 in another). The CSO supplies the pages.")
refix("REF-DM-DX-UG-2026", needs="The MoH library would not open on any attempt: not even the title was read. Its date, content and whether it supersedes UCG 2023 section 8.1.3 are unknown. The CSO supplies the file.")

# ── stamp every entry with the verifier's verdict ───────────────────────────
VERIFY_DIR = os.path.join(lib.ROOT, "verify")
HANDLED = {"REF-DM-CLS-CPEP-LOW", "REF-DM-ACT-PRECONCEPTION", "REF-DM-ACT-REVIEW-AFTER-CHANGE", "REF-DM-KID-STRIP-MAP", "REF-DM-VAL-EGFR-STEADY", "REF-DM-CTRL-UCG", "REF-DM-DX-UCG-CRITERIA", "REF-DM-PREG-UCG", "REF-DM-RX-UCG-LADDER", "REF-DM-DX-UG-2026"}
VERDICTS = {}
for _f in sorted(glob.glob(os.path.join(VERIFY_DIR, "V*-results.json"))):
    try:
        rows = json.load(open(_f, encoding="utf-8"))
    except Exception:
        continue
    for r in rows:
        rid = r.get("ref")
        if rid not in REFS: continue
        VERDICTS[rid] = r
        e = REFS[rid]
        e["x"]["verification"] = {"verdict": r.get("verdict"), "note": r.get("note") or "", "foundQuote": r.get("foundQuote") or "", "urlUsed": r.get("urlUsed") or "", "batch": os.path.basename(_f)[:2]}
        if r.get("verdict") in ("not_found", "could_not_open", "wrong_attribution", "wrong_value") and rid not in HANDLED:
            if not e["x"].get("needsCsoInput"):
                e["x"]["needsCsoInput"] = f"Independent re-read returned '{r.get('verdict')}': {(r.get('note') or '')[:400]}"
                e["confidence"] = "low"
for _rid, _e in REFS.items():
    _e["x"].setdefault("verification", {"verdict": "not_rechecked", "note": "Not reached by the independent re-read.", "foundQuote": "", "urlUsed": "", "batch": None})
