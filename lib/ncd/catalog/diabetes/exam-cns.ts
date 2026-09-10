/**
 * Conscious level, focal signs, and the neuroglycopenic/autonomic split that
 * decides how a low glucose is treated.
 *
 * ── What this segment is for ─────────────────────────────────────────────────
 * Three questions, and nothing else. HOW AWAKE is this person, and in which
 * direction is that moving. IS THE DEFICIT FOCAL, because a lateralised sign
 * and a seizure send the clinician down different roads from a symmetrically
 * drowsy patient. And WHICH HALF of the hypoglycaemia picture is present — the
 * autonomic warning, or the neuroglycopenia that follows it — because the
 * ABSENCE of the first half in a person who is low is not a reassuring negative,
 * it is impaired awareness of hypoglycaemia, and it changes the target, the drug
 * and the follow-up. That single asymmetry is the reason this file exists as
 * something other than a place to write "GCS 15".
 *
 * ── Not here, deliberately ───────────────────────────────────────────────────
 * `avpu` and `mental_status` are NOT redefined. AVPU is recorded once, with the
 * crisis symptoms, and the ADA/EASD alert-drowsy-stupor-coma ladder is recorded
 * once, in the acute assessment; a second place to answer either is a second
 * answer to disagree with. What AVPU cannot say is the letter it does not have —
 * the C of ACVPU, new confusion — and that is `disorientation` below, which is a
 * different observation and not a second grading of the same one.
 *
 * `focal_neurological_deficit` in the symptoms section is WHO PEN-H's emergency
 * SCREEN ("sudden one-sided weakness, or difficulty speaking") and already fires
 * red on its own. `lateralising_neurological_signs` here is the examination that
 * screen asks for, and it deliberately carries NO second danger sign: two reds
 * for one problem is how an interface teaches people to ignore the first one.
 *
 * Also left out, each for a reason: cranial-nerve findings have no separate
 * feature — the orbit, the eye movements and the fundus belong to the eye
 * segment, and a nerve palsy found while comparing the two sides is recorded as
 * a lateralising sign. Tone, reflexes, plantars, gait and Romberg are
 * documentation; the sensory examination that IS cited (monofilament, 128-Hz
 * fork) is the foot and neuropathy segments'. Neck stiffness is omitted because
 * everything it argues for lies outside this catalog. Cognitive screening in
 * older adults is ADA Section 13's recommendation and belongs to the
 * age-specific segment, not to a conscious-level examination.
 *
 * ── Paediatrics ──────────────────────────────────────────────────────────────
 * The cerebral-oedema warning signs come from BSPED's paediatric DKA guideline
 * and are banded `adolescent`. `neonate`, `infant` and `child` are deferred
 * (ADR 0083), so the child bands those sources also cover are NOT written here;
 * a finding banded to a life stage the surface cannot render simply never
 * appears, which is the safe failure. `conscious_level_falling` is the one that
 * is NOT banded, and that is not an oversight: JBDS's adult HHS guideline names
 * a deteriorating conscious level as the bedside indicator of cerebral oedema
 * and osmotic demyelination in adults too, so banding it to adolescents would
 * hide it from the patients JBDS wrote it for.
 *
 * ── Where the sources diverge, and both are recorded ─────────────────────────
 * 1. THE NUMBER. ADA Table 6.4 puts level 1 hypoglycaemia below 3.9 mmol/L and
 *    level 2 below 3.0. Uganda Clinical Guidelines 1.1.6 says symptoms
 *    "generally occur with a blood glucose <3.0 mmol/L (55 mg/dl)". WHO PEN-H's
 *    flowchart says "If blood glucose is < = 2.8 mmol/l treat hypoglycemia".
 *    Three bodies, three numbers. NONE of them is asserted on a feature here —
 *    measurements discriminate through a cited threshold in a rule (ADR 0083),
 *    and the interpretation tables are where those three sets of bands belong.
 * 2. THE SPLIT. ADA and JBDS separate autonomic from neuroglycopenic symptoms
 *    and JBDS explains the mechanism. UCG lists them as one undifferentiated set
 *    of "clinical features", with confusion among the EARLY symptoms alongside
 *    tremor and sweating. A clinician taught from UCG has no vocabulary for the
 *    distinction that impaired awareness turns on, which is exactly why the two
 *    halves are captured as two findings and not one checklist.
 * 3. THE HYPEROSMOLAR BRAIN. UCG 8.1.4 lists "Alterated consciousness, coma"
 *    under DKA and gives HHS only slower onset, worse dehydration and no
 *    ketosis — no cognitive change at all. ADA Table 16.2 records "Change in
 *    cognitive state common", and JBDS ties it to an osmolality above
 *    330 mOsm/kg. Both readings are carried below, on `disorientation`.
 * 4. THE STROKE THAT IS A LOW. WHO PEN-H makes a blood glucose part of the
 *    EXAMINATION of a one-sided deficit, to exclude hypoglycaemia or
 *    ketoacidosis. UCG 4.1.11 gives stroke no differential diagnosis and directs
 *    "Control blood sugar with insulin if diabetic". The catalog follows PEN-H.
 *
 * Every citation here is `csoSigned: false`. The segment ships gated dark.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

import { ADAEASD_2024_CRISES } from "@/lib/ncd/catalog/diabetes/sources";

const RETRIEVED = "2026-09-07";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * The hypoglycaemia classification, and ADA's own one-line symptom list. Level 3
 * is the one that matters at the bedside because it is defined by BEHAVIOUR —
 * needing another person — and not by a number, which is what lets a clinic with
 * no meter still record it.
 */
const ADA_S6_HYPO: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 6, Table 6.4",
  title: "6. Glycemic Goals and Hypoglycemia: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Level 3: A severe event characterized by altered mental and/or physical status requiring assistance for treatment of hypoglycemia, irrespective of glucose level",
};

/** And the recommendation that makes lost awareness a thing to look for, yearly. */
const ADA_S6_UNAWARE: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 6, rec 6.11",
  title: "6. Glycemic Goals and Hypoglycemia — Impaired Hypoglycemia Awareness",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "6.11 Screen individuals at risk for hypoglycemia for impaired hypoglycemia awareness at least annually and when clinically appropriate. E",
};

/**
 * The split itself, in the words of the only retrieved guideline that states the
 * MECHANISM rather than just the list. Everything in this file that separates
 * the warning from the neuroglycopenia rests on this sentence.
 */
const JBDS_HYPO_2023: Citation = {
  standard: "local",
  version: "JBDS 01, January 2023 (Table 1, Edinburgh Hypoglycaemia Scale)",
  title:
    "The Hospital Management of Hypoglycaemia in Adults with Diabetes Mellitus — Joint British Diabetes Societies for Inpatient Care",
  url: "https://abcd.care/sites/default/files/site_uploads/JBDS_Guidelines_Current/JBDS_01_Hypo_Guideline_with_QR_code_January_2023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Autonomic symptoms are generated by the activation of the sympatho-adrenal system and neuroglycopenic symptoms are the result of cerebral glucose deprivation. … Autonomic • Sweating • Palpitations • Shaking • Hunger; Neuroglycopenic • Confusion • Drowsiness • Odd behaviour • Speech difficulty • Incoordination; General malaise • Headache • Nausea",
  needsCsoInput:
    "JBDS is a UK national inpatient-care body and is NOT one of the enumerated standard bodies, hence `local`. The Edinburgh Hypoglycaemia Scale is a research instrument reproduced in the guideline; it is used here only as the source for WHICH symptoms fall on which side of the split, never as a score, a threshold or a cut-off. CSO to ratify, and to decide whether a Ugandan site should be shown a UK inpatient guideline's vocabulary at all.",
};

/** Impaired awareness, defined — and defined as a LOSS, which is why it is a negative. */
const JBDS_IAH_2023: Citation = {
  standard: "local",
  version: "JBDS 01, January 2023 (Impaired awareness of hypoglycaemia)",
  title:
    "The Hospital Management of Hypoglycaemia in Adults with Diabetes Mellitus — Joint British Diabetes Societies for Inpatient Care",
  url: "https://abcd.care/sites/default/files/site_uploads/JBDS_Guidelines_Current/JBDS_01_Hypo_Guideline_with_QR_code_January_2023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Impaired awareness of hypoglycaemia (IAH) is an acquired syndrome associated with insulin treatment. IAH results in the warning symptoms of hypoglycaemia becoming diminished in intensity, altered in nature or lost altogether. This increases the vulnerability of affected individuals of progression to severe hypoglycaemia. … Particular care must be taken with older people (particularly those who are frail with cognitive impairment) as the clinical features may be subtle and mistaken for other problems.",
  needsCsoInput:
    "JBDS is not one of the enumerated standard bodies, hence `local`. Cited for the definition of impaired awareness and for the older-person caveat; no prevalence figure from the guideline is asserted anywhere here. CSO to ratify.",
};

/**
 * The adult hyperosmolar guideline, and the two things it says about the brain
 * that no other retrieved source says as plainly: that cognitive change is NOT
 * always there, and that a falling conscious level during treatment is how
 * cerebral oedema and osmotic demyelination announce themselves in adults.
 */
const JBDS_HHS_2022: Citation = {
  standard: "local",
  version: "JBDS 06, 2022 (Initial Assessment — Clinical; Recovery Phase)",
  title:
    "The Management of the Hyperosmolar Hyperglycaemic State (HHS) in Adults with Diabetes — Joint British Diabetes Societies for Inpatient Care",
  url: "https://abcd.care/sites/default/files/site_uploads/JBDS_Guidelines_Current/JBDS_06_The_Management_of_Hyperosmolar_Hyperglycaemic_State_HHS_%20in_Adults_FINAL_0.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Acute cognitive impairment is not necessarily present and may be associated with dehydration but is not specific to the condition. Alterations in cognitive status are more common when the osmolality rises above 330 mOsm/kg.",
  needsCsoInput:
    "JBDS is not one of the enumerated standard bodies, hence `local`. The osmolality figure is quoted for context only; NO threshold from this guideline is asserted on any feature in this file. CSO to ratify.",
};

/** The same guideline on monitoring, and the sentence the falling-GCS finding rests on. */
const JBDS_HHS_MONITORING: Citation = {
  standard: "local",
  version: "JBDS 06, 2022 (Markers of severity; Management timeline)",
  title:
    "The Management of the Hyperosmolar Hyperglycaemic State (HHS) in Adults with Diabetes — Joint British Diabetes Societies for Inpatient Care",
  url: "https://abcd.care/sites/default/files/site_uploads/JBDS_Guidelines_Current/JBDS_06_The_Management_of_Hyperosmolar_Hyperglycaemic_State_HHS_%20in_Adults_FINAL_0.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Glasgow Coma Scale (GCS) <12 or abnormal AVPU (Alert, Voice, Pain, Unresponsive) scale … Check GCS every 1-2hrs … assessment of complications of treatment e.g. fluid overload, cerebral oedema or CPM / osmotic demyelination syndrome (as indicated by a deteriorating conscious level) must be undertaken frequently (every 1-2 hours).",
  needsCsoInput:
    "JBDS is not one of the enumerated standard bodies, hence `local`. The GCS <12 figure is a level-2-care trigger in the guideline; it is a THRESHOLD and therefore belongs in a rule, not on a feature, and none is asserted here. CSO to ratify and to decide whether the level-2 trigger is meaningful where no level-2 bed exists.",
};

/**
 * The paediatric DKA protocol, and the only source retrieved FOR THIS FILE with
 * a bedside list of cerebral-oedema warning signs. BSPED states it is broadly
 * similar to ISPAD, and BSPED is what was read here.
 *
 * An earlier version of this comment asserted that ISPAD's Chapter 11 sits
 * behind a paywall. That claim is withdrawn: it was never tested, and
 * conditions.ts cites the same chapter and reports retrieving it in full. The
 * two are not reconciled — the chapter could not be re-fetched independently
 * from this session either, so neither "free" nor "paywalled" is asserted here.
 * What is true is only that this file's content comes from BSPED. See the
 * handover note; the CSO obtains the chapter and settles it.
 */
const BSPED_2021_OEDEMA: Citation = {
  standard: "local",
  version: "BSPED DKA Guideline 2021, sections C.2 and H",
  title:
    "BSPED Guideline for the Management of Children and Young People under the age of 18 years with Diabetic Ketoacidosis — 2021",
  url: "https://www.bsped.org.uk/media/v2ydcuv0/bsped-dka-guideline-v3.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Immediately assess a child or young person with DKA for suspected cerebral oedema if they have any of these early manifestations: headache; agitation or irritability; unexpected fall in heart rate; increased blood pressure. … If a child or young person develops any of these signs: deterioration in level of consciousness; abnormalities of breathing pattern, for example respiratory pauses &/or drop in SaO2; oculomotor palsies; abnormal posturing; pupillary inequality or dilatation … N.B. papilloedema is a late sign.",
  needsCsoInput:
    "BSPED is a UK national specialist society and is NOT one of the enumerated standard bodies, hence `local`. The guideline covers under-18s; only the `adolescent` band is written here because neonatal, infant and child capture is deferred (ADR 0083). The doses in that section are deliberately not carried. Note that conditions.ts DOES quote ISPAD Chapter 11 for the paediatric severity cut-points and the cerebral-injury incidence, on a retrieval this file could not reproduce — so the catalog currently carries one source at two levels of verification. CSO to obtain ISPAD Chapter 11, reconcile the two, and decide whether paediatric DKA is in scope at all.",
};

/** The same protocol on conscious level, and the scale itself as it prints it. */
const BSPED_2021_GCS: Citation = {
  standard: "local",
  version: "BSPED DKA Guideline 2021, section C.1 and Appendix 1",
  title:
    "BSPED Guideline for the Management of Children and Young People under the age of 18 years with Diabetic Ketoacidosis — 2021 (Appendix 1, Glasgow Coma Scale)",
  url: "https://www.bsped.org.uk/media/v2ydcuv0/bsped-dka-guideline-v3.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Conscious Level - Institute hourly neurological observations including Glasgow Coma Score (see Appendix 1) whether or not drowsy on admission. … conscious level is directly related to degree of acidosis, but signs of raised intracranial pressure suggest cerebral oedema … Best Motor Response 1 = none … 6 = responds to commands; Eye Opening 1 = none … 4 = spontaneous; Best Verbal Response 1 = none … 5 = fully orientated. Maximum score 15, minimum score 3",
  needsCsoInput:
    "The GCS is Teasdale and Jennett's, published in 1974; the primary paper was NOT retrieved and the scale is reproduced here from the appendix of a national protocol that prints it in full. The paediatric verbal modifications that appendix also carries are deliberately NOT written, because the bands they serve are deferred. CSO to ratify against the primary source.",
};

/**
 * The Ugandan text. Cited for what a clinician using this tool was taught, and
 * for the divergences set out in the file header — not for corroboration.
 */
const UCG_2023_HYPO: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 1.1.6 (pp 24–25)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Symptoms generally occur with a blood glucose <3.0 mmol/L (55 mg/dl). … Clinical features: Early symptoms: hunger, dizziness, tremors, sweating, nervousness and confusion; Profuse sweating, palpitations, weakness; Convulsions; Loss of consciousness … If patient does not regain consciousness after 30 minutes, consider other causes of coma",
  needsCsoInput:
    "The Ugandan national text is not one of the enumerated standard bodies, hence `local`. Its 3.0 mmol/L figure DIVERGES from ADA's 3.9 and from WHO PEN-H's 2.8; all three are recorded in the file header and NONE is asserted on a feature here, because a threshold belongs in a rule. CSO to decide which standard a Ugandan site profile should prefer.",
};

/** UCG on a focal deficit, and on what it does not say about the glucose. */
const UCG_2023_STROKE: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 4.1.11 (pp 326–327)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Clinical features: Focal neurological deficits as one-sided weakness (face, arm, leg. Note that eyes are not affected) – hemiparesis or hemiplegia; Difficulty in speaking/swallowing; Severe headache (especially in haemorrhage); Alteration of consciousness; Convulsions",
  needsCsoInput:
    "Cited for the description of a focal deficit as UCG writes it. That section states no differential diagnosis and directs 'Control blood sugar with insulin if diabetic'; the catalog follows WHO PEN-H, which requires a blood glucose as part of the examination of a one-sided deficit. The divergence is recorded in the file header. CSO to ratify.",
};

/**
 * WHO's humanitarian package, and the one line that makes a glucose part of the
 * EXAMINATION of a focal deficit rather than an afterthought. This is the source
 * that makes a lateralising sign a diabetes finding at all.
 */
const PEN_H_STROKE_GLUCOSE: Citation = {
  standard: "WHO",
  version: "PEN-H toolkit, Flowchart 3.7 (TIA and stroke), STEP 2 EXAMINE",
  title: "PEN-H toolkit — package of essential NCD interventions for humanitarian settings",
  url: "https://www.rescue.org/sites/default/files/document/5214/penhtoolkit-full.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "STEP 2 EXAMINE • Level of consciouness • Temperature and neck stiffness (to exclude meningitis) • Blood pressure (to exclude hypertensive emergency…) • Blood glucose (to exclude hypoglycaemia or diabetic ketoacidosis…)",
};

const EX = "examination";

/**
 * A neurological finding, filed under the region of the examination it is found
 * in. The segment bar shows "Neurological"; inside it, conscious level comes
 * before focal signs because that is the order the examination is performed in
 * and because a deficit found in a comatose patient means something different
 * from the same deficit found in an alert one.
 */
const finding = (region: string, f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "sign",
  section: EX,
  group: region,
});

/** Characterises the finding above it; only asked once that is present. */
const prop = (parent: string, f: Omit<Feature, "section" | "kind" | "parent">): Feature => ({
  ...f,
  kind: "sign",
  section: EX,
  parent,
});

export const CNS_FEATURES: Feature[] = [
  /* ── conscious level ─────────────────────────────────────────────────── */
  {
    /**
     * A MEASUREMENT, and therefore carrying no `discriminates` — a number
     * discriminates through a cited threshold, and the thresholds that exist for
     * this one are rules, not properties of the field. JBDS puts a GCS below 12
     * on its list of markers requiring level-2 care; ADA/EASD grade severe DKA by
     * stupor or coma. Both are `Criterion` shaped and neither belongs here.
     *
     * `refRange` is the SCALE, 3 to 15, not a normal band — the only normal value
     * on this instrument is 15, and a band of "3–15" is what stops the surface
     * rendering a 9 as though it were within reference. That is a display
     * convention and is written down as one.
     *
     * The three components are asked for in `elicitation` rather than as three
     * further fields. A total is what every protocol in this file records and
     * what every handover repeats; splitting it into three would triple the
     * segment to capture a distinction that changes no rule in this catalog.
     */
    code: "gcs_total",
    display: "Glasgow Coma Score (total)",
    kind: "measurement",
    valueType: "number",
    /** Points, not a physical quantity — but it is the scale any threshold on
     *  this feature would be expressed in, which is what `unit` is for. */
    unit: "points",
    section: EX,
    group: "nx_conscious",
    refRange: { low: 3, high: 15 },
    synonyms: ["GCS", "Glasgow Coma Scale", "coma score"],
    elicitation:
      "Score best eye opening (1–4), best verbal response (1–5) and best motor response (1–6) and add them: minimum 3, maximum 15. Take the BEST response, and the better side, applying a standard painful stimulus only if there is no response to voice. Write the three components beside the total in the notes — an E1V4M5 of 10 and an E3V3M4 of 10 are not the same patient. Then repeat it and record the time: in a hyperglycaemic emergency both BSPED and JBDS ask for it hourly to two-hourly, because the direction of travel is worth more than any single number.",
    citation: BSPED_2021_GCS,
  },

  finding("nx_conscious", {
    /**
     * The C that AVPU does not have. A person can be scored Alert, and score 15,
     * and be newly confused, agitated or behaving out of character — and in a
     * hyperglycaemic emergency that is the finding, not the arousal.
     *
     * It overlaps by one word with the neuroglycopenic list below, and the
     * overlap is deliberate: this is the general question asked of every patient,
     * and that is a PATTERN whose shape — which half arrived first — is the whole
     * point of recording it. Two questions, one shared answer, and no rule reads
     * both.
     *
     * It also carries BSPED's second early manifestation of cerebral oedema,
     * agitation or irritability, which is why the display says so.
     */
    code: "disorientation",
    display: "New confusion, disorientation or agitation",
    valueType: "boolean",
    synonyms: [
      "acute confusional state",
      "delirium",
      "new-onset confusion",
      "irritability",
      "the C of ACVPU",
    ],
    elicitation:
      "Ask their name, where they are and the month, and compare the answer with how they were BEFORE today — someone who has always been disoriented is not newly confused, so ask the relative or the nurse who knows them. Record agitation, irritability or behaviour out of character here as well. AVPU can read Alert while every one of these is true, which is why it is a separate question and not a finer grade of the same one.",
    urgency: "immediate",
    citation: JBDS_HYPO_2023,
    discriminates: [
      {
        condition: "hypoglycaemia",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Confusion is the first of the five neuroglycopenic items JBDS lists, and the guideline warns that in frail older people the features are subtle and get mistaken for something else. A capillary glucose settles it in a minute and nothing else does.",
        citation: JBDS_HYPO_2023,
      },
      {
        condition: "hhs",
        direction: "supports",
        strength: "moderate",
        rationale:
          "JBDS records that alterations in cognitive status become more common once osmolality rises above 330 mOsm/kg, so new confusion in a hyperglycaemic patient argues towards the hyperosmolar end rather than the ketoacidotic one.",
        citation: JBDS_HHS_2022,
      },
      {
        condition: "cerebral_oedema",
        direction: "supports",
        strength: "moderate",
        rationale:
          "BSPED lists agitation or irritability among the four early manifestations that should prompt immediate assessment for cerebral oedema in a child or young person with DKA.",
        citation: BSPED_2021_OEDEMA,
      },
    ],
    importantNegative: {
      absenceRefutes: ["severe_dka"],
      caveat:
        "An oriented, settled patient argues against SEVERE ketoacidosis and against nothing else — the ADA/EASD severity table records the mild and moderate columns as alert, so this negative does not touch them. It does not exclude HHS either: JBDS states that acute cognitive impairment is not necessarily present, so a completely lucid patient can still be profoundly hyperosmolar. And it is not a glucose measurement.",
      citation: ADAEASD_2024_CRISES,
    },
  }),

  finding("nx_conscious", {
    /**
     * Half of the whole point of this file. The autonomic warning is the body's
     * alarm, and it is the half that goes first: JBDS defines impaired awareness
     * as those warning symptoms becoming diminished, altered in nature or lost
     * altogether. So this finding matters far more when it is ABSENT than when it
     * is present, which is why the `importantNegative` below is the longest thing
     * in this segment and why the elicitation insists on recording a NO.
     */
    code: "hypo_autonomic_warning",
    display: "Autonomic warning of a low — sweating, shaking, palpitations, hunger",
    valueType: "boolean",
    synonyms: [
      "adrenergic symptoms",
      "sympatho-adrenal symptoms",
      "warning symptoms of a hypo",
      "hypo warning signs",
    ],
    elicitation:
      "Look and feel before you ask: cold sweat on the forehead and palms, a fine tremor of the outstretched hands, a fast pulse, pallor. Then ask whether they felt it coming, and whether that is how their lows usually start. If they are low now, or have just been low, RECORD A NO EXPLICITLY when none of these are there — that recorded negative is the finding, and a blank is not.",
    citation: JBDS_HYPO_2023,
    discriminates: [
      {
        condition: "hypoglycaemia",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Sweating, palpitations, shaking and hunger are the four autonomic items of the scale JBDS reproduces, generated by activation of the sympatho-adrenal system as the glucose falls. Moderate rather than strong because every one of them is also produced by fear, sepsis and thyrotoxicosis.",
        citation: JBDS_HYPO_2023,
      },
      {
        condition: "hypoglycaemia_unawareness",
        direction: "refutes",
        strength: "moderate",
        rationale:
          "A person who still gets the warning has not lost it. Moderate rather than strong because JBDS describes the awareness as becoming diminished in intensity or altered in nature before it is lost altogether, so a partially preserved warning is compatible with a partially impaired one.",
        citation: JBDS_IAH_2023,
      },
    ],
    importantNegative: {
      absenceRefutes: ["hypoglycaemia"],
      caveat:
        "ONLY in someone whose warning is intact — and this is the one negative in the segment that can kill if it is read flatly. JBDS defines impaired awareness of hypoglycaemia as the warning symptoms becoming diminished, altered in nature or lost altogether, so in long-standing type 1 diabetes, in recurrent lows, or on a beta-blocker, an absent autonomic warning is not evidence against a low: it is evidence FOR impaired awareness, and the next low is the more likely to be severe. It never stands in place of a glucose measurement.",
      citation: JBDS_IAH_2023,
    },
  }),
  prop("hypo_autonomic_warning", {
    /**
     * Exactly the four items JBDS prints under Autonomic, and no more. Adding
     * pallor or anxiety would be ours rather than the source's, and the value of
     * this field is that it is the published half of a published pair.
     */
    code: "hypo_autonomic_features",
    display: "Which warning features",
    valueType: "multi_select",
    citation: JBDS_HYPO_2023,
    options: [
      { value: "sweating", display: "Sweating" },
      { value: "palpitations", display: "Palpitations" },
      { value: "shaking", display: "Shaking or tremor" },
      { value: "hunger", display: "Hunger" },
    ],
  }),

  finding("nx_conscious", {
    /**
     * The other half. Neuroglycopenia is cerebral glucose deprivation, and it is
     * what the patient's brain does once the warning has been ignored — or, in
     * impaired awareness, once there was never a warning to ignore.
     *
     * No `dangerSign`. `urgency: immediate` already answers the question a danger
     * sign would answer, the hypoglycaemia symptoms already carry a red, and
     * ADR 0083 is explicit that the two axes are orthogonal: this needs a glucose
     * NOW, and it does not need a second siren for the same event.
     */
    code: "hypo_neuroglycopenic_features",
    display: "Neuroglycopenia — confusion, drowsiness, odd behaviour, slurred speech, clumsiness",
    valueType: "boolean",
    synonyms: ["neuroglycopenia", "cerebral glucose deprivation", "neuroglycopenic symptoms"],
    elicitation:
      "Watch and test rather than ask. Is the speech slurred, are they drowsy, is the behaviour out of character — ask the person who knows them what is different. Can they touch their nose with a fingertip. Then establish the ORDER, because it is the finding that changes management: did the sweating and shaking come first, or did the brain go first with no warning at all?",
    urgency: "immediate",
    citation: JBDS_HYPO_2023,
    discriminates: [
      {
        condition: "hypoglycaemia",
        direction: "supports",
        strength: "strong",
        rationale:
          "Confusion, drowsiness, odd behaviour, speech difficulty and incoordination are the five neuroglycopenic items JBDS lists, and it states plainly what they are: the result of cerebral glucose deprivation. Strong, because the brain is the organ the glucose is missing from.",
        citation: JBDS_HYPO_2023,
      },
      {
        condition: "hypoglycaemia_unawareness",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Neuroglycopenia arriving with no autonomic warning ahead of it is what impaired awareness looks like at the bedside: the syndrome is defined as the warning symptoms being diminished, altered or lost, which leaves cerebral glucose deprivation as the first thing anybody notices. ADA asks for this to be screened for at least annually.",
        citation: ADA_S6_UNAWARE,
      },
    ],
  }),
  prop("hypo_neuroglycopenic_features", {
    /**
     * The published five. Seizure and loss of consciousness are the severe end of
     * the same process and are recorded as findings in their own right rather
     * than as ticks in a list — an unconscious patient is not a checkbox.
     */
    code: "hypo_neuroglycopenic_which",
    display: "Which features",
    valueType: "multi_select",
    citation: JBDS_HYPO_2023,
    options: [
      { value: "confusion", display: "Confusion" },
      { value: "drowsiness", display: "Drowsiness" },
      { value: "odd_behaviour", display: "Odd behaviour" },
      { value: "speech_difficulty", display: "Speech difficulty" },
      { value: "incoordination", display: "Incoordination" },
    ],
  }),

  finding("nx_conscious", {
    /**
     * A DIFFERENCE, not a value — which is why it is a separate finding from the
     * GCS above and cannot be computed from it. One observation cannot express
     * it; two, an hour apart, can, and both protocols in this file ask for those
     * two observations precisely so that the difference exists to be seen.
     *
     * NOT banded to adolescents, unlike the three BSPED findings below. JBDS's
     * ADULT guideline names a deteriorating conscious level as the bedside
     * indicator of cerebral oedema and osmotic demyelination during treatment, so
     * a band here would hide the finding from the patients that sentence was
     * written for.
     */
    code: "conscious_level_falling",
    display: "Conscious level falling since the last assessment",
    valueType: "boolean",
    synonyms: ["deteriorating GCS", "reducing conscious level", "dropping GCS", "obtundation"],
    elicitation:
      "This is a comparison, so find the previous score and the time it was taken before you record anything. Compare like with like — GCS against GCS, AVPU against AVPU — and treat a drop of two points or a step down the AVPU ladder as real until someone senior says otherwise. A patient who was improving and has stopped improving counts.",
    urgency: "immediate",
    citation: JBDS_HHS_MONITORING,
    discriminates: [
      {
        condition: "cerebral_oedema",
        direction: "supports",
        strength: "strong",
        rationale:
          "JBDS instructs that complications of treatment — fluid overload, cerebral oedema, central pontine myelinolysis — be assessed every one to two hours, and names a deteriorating conscious level as how they show themselves. BSPED lists deterioration in level of consciousness among the signs that mandate immediate treatment in a child or young person.",
        citation: JBDS_HHS_MONITORING,
      },
      {
        condition: "severe_dka",
        direction: "supports",
        strength: "moderate",
        rationale:
          "The ADA/EASD severity table separates mild and moderate ketoacidosis, where the patient is alert or drowsy, from severe, where the patient is in stupor or coma. A conscious level that is falling is a patient crossing between those columns.",
        citation: ADAEASD_2024_CRISES,
      },
      {
        condition: "hypoglycaemia",
        direction: "supports",
        strength: "moderate",
        rationale:
          "JBDS names hypoglycaemia during treatment among the causes of changed cerebral function in HHS. A conscious level falling while insulin is running is a low until a glucose says it is not, and it is the one cause on this list that is reversible in minutes.",
        citation: JBDS_HHS_2022,
      },
    ],
  }),

  finding("nx_conscious", {
    /**
     * BSPED's first-listed early manifestation, and the only one on the ward that
     * the patient reports rather than the machine shows — which is why the
     * guideline tells nursing staff to report it to the medical team immediately,
     * at night included, alongside a slowing pulse.
     *
     * Banded `adolescent` because the source covers under-18s and the younger
     * bands are deferred (ADR 0083).
     */
    code: "dka_new_headache",
    display: "New or worsening headache during treatment for ketoacidosis",
    valueType: "boolean",
    ageBands: ["adolescent"],
    synonyms: ["cerebral oedema warning sign", "headache on treatment"],
    elicitation:
      "Ask at every observation round, and ask again once the fluids are running. The finding is a headache that is NEW, or one that is getting worse while the acidosis, the ketones and the thirst are all improving. Do not attribute it to dehydration once treatment has started — that is the point at which BSPED wants it escalated.",
    urgency: "immediate",
    citation: BSPED_2021_OEDEMA,
    discriminates: [
      {
        condition: "cerebral_oedema",
        direction: "supports",
        strength: "strong",
        rationale:
          "BSPED lists headache first among the four early manifestations that should prompt an immediate assessment for cerebral oedema in a child or young person with DKA, and instructs staff to report it to the medical team without delay.",
        citation: BSPED_2021_OEDEMA,
      },
    ],
  }),

  finding("nx_conscious", {
    /**
     * ONE finding rather than two, because the conjunction is the sign. A pulse
     * falling as a shocked child rehydrates is expected; a blood pressure rising
     * as pain settles is unremarkable; the two together, in the same hour, are
     * the Cushing response. Splitting them would produce two findings that each
     * mean nothing and a differential that ranks on noise.
     *
     * The numbers themselves are already captured as vitals. This records the
     * PATTERN across a chart, which no single reading can express.
     */
    code: "dka_bradycardia_with_hypertension",
    display: "Unexpected fall in heart rate with a rising blood pressure",
    valueType: "boolean",
    ageBands: ["adolescent"],
    synonyms: [
      "Cushing response",
      "relative bradycardia with relative hypertension",
      "slowing pulse and rising blood pressure",
    ],
    elicitation:
      "Read it off the observation chart, not off one set of numbers: a pulse that has fallen when it should be settling, and a blood pressure that has climbed, in the same patient within the same hour or two. Neither alone means anything in a rehydrating young person. Both together, with or without a headache, is what BSPED wants assessed immediately.",
    urgency: "immediate",
    citation: BSPED_2021_OEDEMA,
    discriminates: [
      {
        condition: "cerebral_oedema",
        direction: "supports",
        strength: "strong",
        rationale:
          "An unexpected fall in heart rate and an increased blood pressure are two of BSPED's four early manifestations mandating immediate assessment for cerebral oedema; together they are the classical pressure response to a rising intracranial pressure.",
        citation: BSPED_2021_OEDEMA,
      },
    ],
  }),

  finding("nx_conscious", {
    /**
     * The signs that mean the window has closed. Grouped as one multi-select
     * because BSPED groups them — any one of them triggers the same instruction —
     * and because four separate booleans would imply a discrimination between
     * them that no source supports.
     *
     * NO `importantNegative`. BSPED itself says papilloedema is a late sign, and
     * a list of late signs is by construction absent in exactly the patient who
     * most needs treating; a recorded negative here refutes nothing, and claiming
     * that it did would be more dangerous than saying nothing at all.
     */
    code: "cerebral_oedema_late_signs",
    display: "Late signs of raised intracranial pressure",
    valueType: "multi_select",
    ageBands: ["adolescent"],
    synonyms: ["raised ICP", "coning", "signs of herniation"],
    elicitation:
      "Look at the breathing before you touch them — pauses, an irregular pattern, a saturation falling with no lung explanation. Then the pupils: size, equality, and the reaction to light in each eye separately. Then the eye movements, and the posture of the arms and legs to a painful stimulus. The optic discs last, and only if you can see them: blurred margins are the final sign to appear, so a normal disc excludes nothing.",
    urgency: "immediate",
    citation: BSPED_2021_OEDEMA,
    options: [
      { value: "breathing_pattern", display: "Abnormal breathing pattern or respiratory pauses" },
      { value: "oculomotor_palsy", display: "Oculomotor palsy" },
      { value: "abnormal_posturing", display: "Abnormal posturing" },
      { value: "pupils", display: "Unequal or dilated pupils" },
      { value: "papilloedema", display: "Papilloedema (a late sign)" },
      { value: "none", display: "None of these" },
    ],
    discriminates: [
      {
        condition: "cerebral_oedema",
        direction: "supports",
        strength: "strong",
        rationale:
          "BSPED instructs that a child or young person developing any of deterioration in conscious level, abnormalities of breathing pattern, oculomotor palsies, abnormal posturing or pupillary inequality or dilatation be treated immediately for cerebral oedema, without waiting for imaging.",
        citation: BSPED_2021_OEDEMA,
      },
    ],
  }),

  /* ── focal signs and seizures ────────────────────────────────────────── */
  finding("nx_focal", {
    /**
     * The examination the symptom-section screen asks for, and NOT a second
     * screen. `focal_neurological_deficit` records what the patient or the family
     * reports; this records what the two sides actually do when they are
     * compared, in a patient who may be too drowsy to report anything.
     *
     * No `dangerSign`, deliberately. The screen already fires red with PEN-H's
     * own instruction attached; a second red for one problem is how a tool
     * teaches people to scroll past the first.
     *
     * No `importantNegative` either. A symmetrical examination does not argue
     * against hypoglycaemia or ketoacidosis in any useful way — both are far
     * commoner WITHOUT focal signs than with them — so a refutation here would be
     * an invention.
     */
    code: "lateralising_neurological_signs",
    display: "Lateralising neurological signs on examination",
    valueType: "boolean",
    synonyms: [
      "focal neurological deficit",
      "hemiparesis",
      "one-sided weakness",
      "cranial nerve palsy",
      "focal signs",
    ],
    elicitation:
      "Compare the two sides, in this order: facial movement, arms held out with the eyes closed for drift, power at the hip and the ankle, tone, the plantar responses, and speech. Test the cranial nerves — an eye that will not move fully, a facial weakness that spares the forehead. Record WHICH side. Do this even in a drowsy patient: an asymmetric response to a painful stimulus is a lateralising sign and is often the only one you will get.",
    urgency: "immediate",
    citation: UCG_2023_STROKE,
    discriminates: [
      {
        condition: "hypoglycaemia",
        direction: "supports",
        strength: "moderate",
        rationale:
          "WHO PEN-H puts a blood glucose inside the EXAMINATION of a one-sided deficit, to exclude hypoglycaemia before the deficit is attributed to a vascular event. It earns that place because a low is reversible in minutes and because the two treatments point in opposite directions.",
        citation: PEN_H_STROKE_GLUCOSE,
      },
      {
        condition: "dka",
        direction: "supports",
        strength: "weak",
        rationale:
          "The same PEN-H examination step names diabetic ketoacidosis alongside hypoglycaemia as the metabolic cause to exclude in a focal deficit. Weak, because a focal deficit is an unusual way for ketoacidosis to present and the finding shifts the order of the list rather than the diagnosis.",
        citation: PEN_H_STROKE_GLUCOSE,
      },
    ],
  }),

  finding("nx_focal", {
    /**
     * A seizure in a person taking insulin or a sulfonylurea is a low until a
     * glucose says otherwise, and it is the finding most often filed under
     * "epilepsy" and never re-examined. UCG lists convulsions among the clinical
     * features of hypoglycaemia and ADA's severe class is defined by needing
     * someone else's help — which every seizure does.
     *
     * This one DOES carry a danger sign, unlike the neuroglycopenic finding
     * above, because it is the one presentation where the wrong first move — an
     * anticonvulsant, a CT scan, a transfer — costs the minutes in which the
     * right one would have worked. The action is UCG's own instruction and
     * carries no dose.
     */
    code: "seizure",
    display: "Seizure (witnessed, or on arrival)",
    valueType: "boolean",
    synonyms: ["convulsion", "fit", "tonic-clonic attack", "seizure activity"],
    elicitation:
      "Ask whoever saw it what they actually saw, not what they concluded: stiffening then jerking, which side or which limb started, eyes open or shut, tongue bitten, incontinence, how long the movements lasted and how long until the person was talking normally again. Look for a bitten lateral tongue and for post-ictal drowsiness. Take the capillary glucose WHILE you take the history, not after it.",
    urgency: "immediate",
    /**
     * The feature-level citation is ADA's, because the assertion the FIELD makes
     * is ADA's: an event of altered mental or physical status requiring another
     * person's help is severe hypoglycaemia by definition, at any glucose value,
     * and a seizure is always that. The Ugandan text is what carries the bedside
     * instruction below.
     */
    citation: ADA_S6_HYPO,
    dangerSign: {
      severity: "red",
      action:
        "Check a capillary glucose immediately and correct a low before anything else. Uganda Clinical Guidelines list convulsions and loss of consciousness among the clinical features of hypoglycaemia, and direct that hypoglycaemia be checked and corrected in anyone found unconscious.",
      citation: UCG_2023_HYPO,
    },
    discriminates: [
      {
        condition: "hypoglycaemia",
        direction: "supports",
        strength: "strong",
        rationale:
          "Uganda Clinical Guidelines list convulsions, alongside loss of consciousness, among the clinical features of hypoglycaemia, and direct that the glucose be checked and corrected in anyone found unconscious before other causes of coma are entertained.",
        citation: UCG_2023_HYPO,
      },
    ],
  }),
  prop("seizure", {
    /**
     * Focal onset points at something structural and generalised onset at
     * something metabolic — a crude split, and the reason it is a property rather
     * than a finding with its own discriminations. "Not witnessed" is a real
     * answer and the commonest one; offering it stops the field being filled in
     * with a guess.
     */
    code: "seizure_pattern",
    display: "Onset pattern",
    valueType: "single_select",
    citation: {
      ...UCG_2023_STROKE,
      needsCsoInput:
        "UCG lists convulsions among the clinical features of stroke, which is the source for focal onset being worth recording. That focal onset argues for a structural cause and generalised onset for a metabolic one is CONVENTIONAL TEACHING and is stated by no guideline retrieved for this catalog; no discrimination is claimed from it here. CSO to source or to strike the field.",
    },
    options: [
      { value: "focal", display: "Focal onset" },
      { value: "generalised", display: "Generalised from the start" },
      { value: "not_witnessed", display: "Not witnessed" },
    ],
  }),
];
