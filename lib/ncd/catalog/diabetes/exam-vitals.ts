/**
 * The vitals the first pass did not carry: the postural drop, the capillary
 * refill and the weight trajectory.
 *
 * ── What ADA Table 4.1 asks for, and what the first pass gave it ─────────────
 * The comprehensive evaluation asks for "Orthostatic blood pressure measures
 * (when indicated)" beside the ordinary blood pressure determination. The first
 * pass recorded the CONCLUSION — `postural_hypotension`, a yes/no in the general
 * examination — and could not record the readings it was drawn from. So a
 * clinician could assert a postural drop and leave nobody able to check it, and
 * the next examiner had no earlier pair of numbers to compare against.
 *
 * ── One finding, one home ────────────────────────────────────────────────────
 * `postural_hypotension` is NOT redefined here. It stays where general-exam.ts
 * put it, under "Legs and fluid", and stays the yes/no the surface reasons on.
 * Three things are added beside it, all of them measurement:
 *
 *   • the standing systolic, diastolic and pulse — the readings that establish
 *     the drop, taken in the same act as the seated ones, which is why they sit
 *     with the vitals rather than in the general survey;
 *   • the pulse RESPONSE to the drop, which is a separate finding and the only
 *     one of the three that discriminates.
 *
 * The pulse response earns its own entry because the engine cannot derive it.
 * A `Predicate` compares a feature with a CONSTANT; there is no arithmetic
 * between two features, so "did the pulse rise by enough for the pressure it
 * lost" is not expressible as a rule and would otherwise go unrecorded. And it
 * is the whole clinical point of standing the patient up: a drop WITH a brisk
 * compensatory tachycardia is a volume or a drug problem, and a drop WITHOUT one
 * is a baroreflex that is no longer answering — ADA's own definition of the sign
 * says so, and the two lead in opposite directions.
 *
 * That definition also closes a declared gap. general-exam.ts labels
 * `postural_hypotension` with the 20/10 mmHg-within-three-minutes numbers and
 * says in its citation that they were NOT retrieved for that build. They are
 * retrieved here, from ADA Section 12, and quoted below. The wording differs in
 * a way worth noticing: ADA writes strict inequalities and folds the heart rate
 * into the definition, where the 2011 consensus statement usually cited for this
 * sign writes "at least" 20 and 10 mmHg and speaks of the pressure alone. Only
 * ADA's was retrieved; the consensus paper sits behind a publisher paywall and
 * is therefore not quoted anywhere in this file.
 *
 * ── Capillary refill, and why it is central ──────────────────────────────────
 * The cheapest measure of perfusion there is, and the one a health centre with
 * no lactate and no ultrasound still has. It is recorded from the STERNUM
 * deliberately: BSPED's DKA guideline defines shock by the CENTRAL refill and
 * notes in the same paragraph that acidosis and hypocapnia both constrict the
 * periphery, so a slow fingertip in ketoacidosis can be an artefact of the
 * acidosis rather than a failing circulation.
 *
 * It carries NO `importantNegative`, and that is a deliberate refusal rather
 * than an omission. A brisk refill refutes SHOCK, and shock is not one of the
 * conditions this catalog ranks. Writing it as refuting DKA or HHS would be
 * exactly the over-reading the mandatory caveat exists to prevent — the ADA/EASD
 * consensus states plainly that some patients maintain haemodynamic stability
 * despite severe hypovolaemia, because the hypertonicity pulls water out of the
 * cells and holds the circulation up while the patient is drying out.
 *
 * ── The weight trajectory ────────────────────────────────────────────────────
 * `unexplained_weight_loss` already exists as a SYMPTOM: what the patient says
 * has happened. This is the scale disagreeing with the chart, and it is a
 * different piece of evidence — it survives a patient who never weighs
 * themselves, and it is the one that separates type 1 from type 2 at
 * presentation, where ADA lists unintentional weight loss beside an age under 35
 * and a BMI under 25.
 *
 * ── Where ADA and UCG diverge ────────────────────────────────────────────────
 * Four divergences bear on this segment, and all four are recorded rather than
 * smoothed over.
 *
 *   1. UCG's diabetes chapter contains NO examination step at all — no
 *      orthostatic blood pressure, no capillary refill, no weight recorded
 *      against a previous one. ADA asks for the first of those by name. Neither
 *      text is wrong for its setting; the fields here are ADA's and are offered,
 *      not demanded.
 *   2. On the failing circulation, UCG's DKA/HHS section names "Cardiovascular
 *      collapse (hypotension)" and stops there, where BSPED calls hypotension
 *      "a late sign of shock" and puts the central refill ahead of it. UCG does
 *      carry a capillary-refill threshold — slow beyond two seconds — but in the
 *      SEVERE MALARIA chapter, not the diabetes one. Both are cited below.
 *   3. On the commonest cause of a false positive here — a beta-blocker blunting
 *      the compensatory tachycardia — the two texts leave a Ugandan clinician in
 *      a different position: UCG §8.1.3 (p 474) says outright "Do not use beta
 *      blockers, e.g., atenolol in diabetes", where ADA carries no such blanket
 *      caution. The drug history still has to be checked; it is simply less
 *      often the answer here than an ADA-shaped checklist would suggest.
 *   4. On weight loss, ADA reads it as a discriminator WITHIN diabetes, pointing
 *      at type 1. UCG lists "Weight loss despite high appetite" as an ordinary
 *      feature of diabetes and puts HIV/AIDS and TB in the differential of the
 *      presentation itself. In Kampala both readings are live at once, which is
 *      why the finding's discrimination is `moderate` rather than `strong` and
 *      why nothing here treats weight loss as settling anything.
 *
 * ── Not here, deliberately ───────────────────────────────────────────────────
 * A resting tachycardia over 100 bpm is a sign of advanced cardiovascular
 * autonomic neuropathy and a fever over 38 °C is half of an IWGDF/IDSA grade-4
 * foot infection — but both are NUMBERS on vitals that already exist, and a
 * number discriminates through a cited threshold in a rule, never through a
 * second feature beside the measurement (ADR 0083). Modelling them here would
 * create two codes for one pulse.
 *
 * The Cushing response — a falling pulse with a rising pressure and a dropping
 * conscious level — is not here either. It is a vitals PATTERN, but it is
 * inseparable from the conscious level it accompanies, and conscious level is
 * recorded once, in the neurological examination. Splitting it across two
 * segments would give it two homes and no owner.
 *
 * No `dangerSign` is declared on the refill. The only instruction the retrieved
 * sources give for a shocked patient is a fluid volume, and a volume is a dose:
 * this engine does not carry one. The urgency axis says what needs saying — the
 * finding is `immediate` — without putting a prescription in a catalog.
 *
 * Paediatric blood-pressure percentiles, BMI-for-age and Tanner staging are
 * deferred with the rest of the paediatric increment (ADR 0083). The adolescent
 * pulse and respiratory-rate bands are declared, but in examination.ts beside
 * the vitals they qualify, because an `ageRefRange` belongs on the measurement
 * it re-bands and nowhere else.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-07";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * ADA's definition of the orthostatic drop — and the reason the pulse is part
 * of it. The clause that matters is the last one: the fall is defined WITHOUT
 * an appropriate increase in heart rate, so a drop with a brisk rise is a
 * different finding, not a milder one.
 */
const ADA_S12_ORTHOSTATIC: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12 (diabetic autonomic neuropathy)",
  title: "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "a fall in systolic or diastolic blood pressure by >20 mmHg or >10 mmHg, respectively, upon standing without an appropriate increase in heart rate",
};

/** Why an appropriate rise clears nobody: the early disease is silent. */
const ADA_S12_CAN_EARLY: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12 (cardiovascular autonomic neuropathy)",
  title: "12. Retinopathy, Neuropathy, and Foot Care — Cardiovascular Autonomic Neuropathy",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "In its early stages, CAN may be completely asymptomatic and detected only by decreased heart rate variability with deep breathing. … resting tachycardia (>100 bpm)",
};

/**
 * The measurement protocol, which no retrieved source states in full. ADA gives
 * the definition and asks for the measures "when indicated"; the sequence below
 * is conventional practice and says so.
 */
const ORTHOSTATIC_TECHNIQUE: Citation = {
  standard: "local",
  version: "Orthostatic blood pressure — bedside measurement convention",
  title: "How the postural pair is taken — not a guideline position",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    "ADA supplies the DEFINITION of the drop (quoted on the pulse-response finding) and asks for orthostatic measures when indicated; it does not state a protocol. Five minutes seated or supine first, then readings at one and three minutes standing with the LOWER recorded, is conventional practice and was NOT retrieved from a guideline for this build. The 2011 consensus statement (Freeman et al.) states the three-minute window, but its full text sits behind a publisher paywall and is quoted nowhere in this catalog. CSO to source and ratify the protocol.",
};

/**
 * HHS, and why a delayed refill argues for it specifically. The consensus is
 * unusually direct: volume depletion is not a complication of HHS, it is what
 * drives it.
 */
const ADAEASD_2024_HHS_VOLUME: Citation = {
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (Diabetologia)",
  title: "Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Volume depletion is a primary driver of HHS, which commonly occurs in older adults with above-target glucose levels who are at particularly high risk for developing dehydration because of polyuria, age-related impairment of thirst mechanisms, and limited access to fluids",
};

/**
 * And the sentence that stops the same finding being read backwards. A patient
 * can be profoundly dry and look haemodynamically well, because the
 * hypertonicity is holding the circulating volume up — which is precisely why a
 * normal refill is not recorded here as refuting anything.
 */
const ADAEASD_2024_PERFUSION: Citation = {
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (Diabetologia)",
  title: "Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Tachycardia and hypotension correlate with severe hypovolaemia. However, some patients can maintain haemodynamic stability and intravascular volume because of the hypertonicity associated with hyperglycaemia and the subsequent movement of intracellular water into the extracellular space.",
};

/**
 * The national DKA protocol, and the source for the refill being CENTRAL. It
 * covers people under 18, so it is quoted for the adolescent band and for the
 * description of the sign — never as an adult threshold.
 */
const BSPED_2021_SHOCK: Citation = {
  standard: "local",
  version: "BSPED DKA guideline 2021 (v3), initial fluid bolus",
  title:
    "BSPED Guideline for the Management of Children and Young People under the age of 18 years with Diabetic Ketoacidosis – 2021",
  url: "https://www.bsped.org.uk/media/v2ydcuv0/bsped-dka-guideline-v3.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Shock is defined by the APLS definition of tachycardia, prolonged central capillary refill, poor peripheral pulses and hypotension (though this is a late sign of shock). It is not just poor peripheral perfusion. … It is not possible to accurately clinically assess the degree of dehydration to work out the deficit.",
  needsCsoInput:
    "BSPED is not one of the enumerated standard bodies, hence `local`, and the guideline covers under-18s — it is the source for WHERE the refill is taken and for hypotension being a late sign, not for an adult cut-off. The same paragraph adds that acidosis and hypocapnia both cause peripheral vasoconstriction; that sentence carries a typographical error in the published PDF and is therefore paraphrased in the elicitation rather than quoted. Pressing for five seconds before releasing is convention and was not retrieved from any source. CSO to ratify.",
};

/**
 * The Ugandan number for a slow refill — from the SEVERE MALARIA chapter, not
 * the diabetes one. It is the figure a clinician using this tool was taught, and
 * it is carried for that reason; nothing in this catalog turns on it.
 */
const UCG_2023_CRT: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 2.5.3.3 (p 176)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "If systolic BP <80 mmHg (adult) or <50 mmHg (child) or if peripheral pulse absent and capillary refill is slow (>2 seconds)",
  needsCsoInput:
    "The two-second cut-off is UCG's own, but it is stated under the management of complications of SEVERE MALARIA; UCG's diabetes and DKA/HHS sections name no capillary refill at all, giving \"Cardiovascular collapse (hypotension)\" as the circulatory feature of DKA (§8.1.4, p 479) — which BSPED calls a late sign. It is recorded here as the local figure, not as a diabetes threshold, and no criterion reads it. Whitespace was normalised in the quote where the published PDF runs two words together. CSO to ratify.",
};

/** The phenotype ADA says should stop a clinician settling on type 2. */
const ADA_S2_T1_PHENOTYPE: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote: "younger age at diagnosis (<35 years), lower BMI (<25 kg/m2), unintentional weight loss",
};

/** And the reason a weight that has held excludes nothing. */
const ADA_S2_T1_MISSED: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2 (type 1 diabetes in adults)",
  title: "2. Diagnosis and Classification of Diabetes — Type 1 Diabetes",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The onset of type 1 diabetes may be more variable in adults, who may not present with the classic symptoms seen in children … misdiagnosis can occur in up to 40% of adults with new type 1 diabetes (e.g., adults with type 1 diabetes misdiagnosed as having type 2 diabetes)",
};

/** UCG's own reading of weight loss — a feature of diabetes, and of what else. */
const UCG_2023_DM_FEATURES: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 8.1.3 (pp 472–473)",
  title: "Uganda Clinical Guidelines 2023 — Diabetes Mellitus",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Other symptoms o Weight loss despite high appetite … Differential diagnosis ~ Diabetes insipidus, HIV/AIDS, TB",
  needsCsoInput:
    "UCG is a national guideline, not one of the enumerated bodies, hence `local`. Cited for the divergence: ADA reads unintentional weight loss as pointing at type 1 WITHIN diabetes, and UCG puts HIV/AIDS and TB in the differential of the same presentation. Neither claim is encoded as a rule — HIV and TB are outside this catalog and have no rankable code, by design. CSO to ratify how the two readings are shown together.",
};

/* ── Shapes ──────────────────────────────────────────────────────────────── */

const EX = "examination";

/**
 * A measured vital. Measurements carry no `discriminates` (ADR 0083): a number
 * argues through a cited threshold, and a threshold is a `Criterion` on a rule.
 */
const measure = (f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "measurement",
  section: EX,
  group: "vitals",
});

/** A finding in its own right, in the vitals segment. */
const finding = (f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "sign",
  section: EX,
  group: "vitals",
});

/**
 * Quantifies the finding above it, and is only asked once that is present.
 * Both properties here are numbers — the reading behind a judgement — so the
 * helper fixes the kind rather than taking it.
 */
const prop = (parent: string, f: Omit<Feature, "section" | "kind" | "parent">): Feature => ({
  ...f,
  kind: "measurement",
  section: EX,
  parent,
});

export const VITALS_EXTRA_FEATURES: Feature[] = [
  /* ── the postural pair ────────────────────────────────────────────────── */
  measure({
    /**
     * Deliberately a `number` and not a `series`. The engine reads the LATEST
     * reading of a series, and what matters in a postural pair is the LOWEST —
     * a pressure that has recovered by three minutes is not the pressure that
     * dropped at one. The field asks for the lower of the two readings and its
     * label says so, rather than storing both and letting the wrong one be read.
     */
    code: "bp_systolic_standing",
    display: "Standing systolic blood pressure — lowest reading",
    valueType: "number",
    unit: "mmHg",
    synonyms: ["orthostatic blood pressure", "postural blood pressure", "lying and standing BP"],
    elicitation:
      "Take the seated or supine pressure first, after five minutes at rest. Then stand the patient with a chair behind them, measure again at one minute and at three, and record the LOWER of the two. Sit them down the moment they feel faint — a syncope is not a data point.",
    citation: ORTHOSTATIC_TECHNIQUE,
  }),
  measure({
    code: "bp_diastolic_standing",
    display: "Standing diastolic blood pressure — lowest reading",
    valueType: "number",
    unit: "mmHg",
    elicitation:
      "The diastolic from the same standing reading as the systolic above. ADA's definition is satisfied by EITHER limb falling, so a patient whose systolic barely moves can still have the sign on this one.",
    citation: ORTHOSTATIC_TECHNIQUE,
  }),
  measure({
    /**
     * The reading the whole segment turns on, and the one most often skipped: a
     * standing pressure is routinely taken without a standing pulse, which
     * leaves the finding below unanswerable.
     */
    code: "pulse_standing",
    display: "Standing pulse",
    valueType: "number",
    unit: "bpm",
    elicitation:
      "Count for a full 30 seconds during the same standing minute the pressure was taken, and record it beside that reading. A monitor's average across the transition is not the standing rate.",
    citation: ORTHOSTATIC_TECHNIQUE,
  }),

  finding({
    /**
     * The interpretation of the pair, and the only discriminating finding in it.
     *
     * Gated on `postural_hypotension` rather than parented to it: `parent` would
     * pull it into the general examination's "Legs and fluid" band, away from
     * the readings it is drawn from, and would exempt it from `discriminates` —
     * which is the one thing it exists to carry. The gate is right either way:
     * asking whether the heart answered the drop is meaningless until a drop has
     * been recorded.
     */
    code: "blunted_postural_pulse_rise",
    display: "Postural fall with no appropriate rise in pulse",
    valueType: "boolean",
    showWhen: { feature: "postural_hypotension", op: "present" },
    synonyms: [
      "neurogenic orthostatic hypotension",
      "absent compensatory tachycardia",
      "fixed heart rate",
    ],
    elicitation:
      "Compare the standing pulse with the seated one taken minutes before. Record this only where the pressure has actually fallen: the question is whether the heart answered the drop, not whether the patient is tachycardic. Check first that nothing is blunting the answer — a beta-blocker, a rate-limiting calcium-channel blocker or a paced rhythm all reproduce the sign with no neuropathy at all.",
    discriminates: [
      {
        condition: "autonomic_neuropathy",
        direction: "supports",
        strength: "strong",
        rationale:
          "A postural fall with no compensatory rise in pulse is the neurogenic pattern — the baroreflex is not answering — and it is written into ADA's definition of the sign rather than inferred from it.",
        citation: ADA_S12_ORTHOSTATIC,
      },
    ],
    importantNegative: {
      absenceRefutes: ["autonomic_neuropathy"],
      caveat:
        "A brisk compensatory rise points at volume depletion or a drug rather than a failing baroreflex, but it does not exclude autonomic neuropathy: in its early stages the disease may be detectable only by reduced heart-rate variability. Nor does it make the drop itself safe — the patient still falls over.",
      citation: ADA_S12_CAN_EARLY,
    },
    citation: ADA_S12_ORTHOSTATIC,
  }),

  /* ── perfusion ────────────────────────────────────────────────────────── */
  finding({
    /**
     * `immediate` on the urgency axis and no `dangerSign`, which is the
     * distinction ADR 0083 draws: the severity vocabulary answers how loud, and
     * this answers by when. A red flag here would have to carry an action, the
     * only action the retrieved sources give is a fluid volume, and a volume is
     * a dose this engine does not hold.
     */
    code: "prolonged_capillary_refill",
    display: "Prolonged central capillary refill",
    valueType: "boolean",
    urgency: "immediate",
    synonyms: ["capillary refill time", "CRT", "delayed capillary refill", "blanch test"],
    elicitation:
      "Press the STERNUM — not a fingertip — firmly for five seconds, release, and count the seconds until the colour returns. Use the centre of the body deliberately: in ketoacidosis the acidosis and the low carbon dioxide constrict the periphery, so a cold, slow finger can be recorded in a patient whose circulation is intact. A cold room lengthens it and poor light makes the blanch hard to see, so record what you counted rather than what you expected. It says whether the circulation is in trouble, not how many litres are missing — the same guideline is explicit that the degree of dehydration cannot be assessed accurately at the bedside.",
    discriminates: [
      {
        condition: "hhs",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Volume depletion is what drives HHS rather than merely accompanying it, and a delayed central refill is the bedside measure of it in a clinic with no lactate and no ultrasound.",
        citation: ADAEASD_2024_HHS_VOLUME,
      },
      {
        condition: "severe_dka",
        direction: "supports",
        strength: "moderate",
        rationale:
          "In ketoacidosis a failing circulation marks SEVERITY rather than the diagnosis: the consensus pairs tachycardia and hypotension with severe hypovolaemia, and a delayed refill belongs to the same picture and turns earlier than the pressure does.",
        citation: ADAEASD_2024_PERFUSION,
      },
    ],
    citation: BSPED_2021_SHOCK,
  }),
  prop("prolonged_capillary_refill", {
    /**
     * The count itself, asked only once the refill has been called prolonged.
     * A normal refill is fully recorded by the negative above; a prolonged one
     * is worth a number, because the next examiner needs to know whether three
     * seconds has become five.
     */
    code: "capillary_refill_seconds",
    display: "How many seconds",
    valueType: "number",
    unit: "s",
    elicitation:
      "The number you counted, so the next examiner can tell whether three seconds has become five. UCG calls a refill slow beyond two seconds — the figure most clinicians here were taught, though it is stated in its severe-malaria chapter and not in its diabetes one.",
    citation: UCG_2023_CRT,
  }),

  /* ── the weight trajectory ────────────────────────────────────────────── */
  finding({
    /**
     * The MEASURED counterpart of `unexplained_weight_loss`, which stays where
     * it is among the symptoms. Two fields for one idea only if you read them as
     * the same idea: one is what the patient reports, and this is the scale
     * disagreeing with the chart in a patient who has never weighed themselves.
     *
     * No `ageBands`. Banding this to the young is the specific error that gets
     * an adult with new type 1 diabetes started on tablets — the same reason
     * `type_1_diabetes` carries no band in conditions.ts.
     */
    code: "documented_weight_loss",
    display: "Weight has fallen against a previously documented weight",
    valueType: "boolean",
    synonyms: ["measured weight loss", "catabolic weight loss", "weight trajectory"],
    elicitation:
      "Weigh the patient now, then compare with the last weight IN THE CHART rather than the one they remember. Where no earlier weight was recorded, leave this unanswered: a remembered weight is a symptom and is already captured as one.",
    discriminates: [
      {
        condition: "type_1_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA lists unintentional weight loss beside an age under 35 and a BMI under 25 as the phenotype that should stop a clinician settling on type 2. Moderate, not strong: in this setting the same finding also raises HIV and TB, which UCG puts in the differential of the presentation itself.",
        citation: ADA_S2_T1_PHENOTYPE,
      },
      {
        condition: "type_2_diabetes",
        direction: "refutes",
        strength: "weak",
        rationale:
          "Read in reverse the same list argues only weakly: osmotic diuresis takes weight off in uncontrolled type 2 as well, so a falling weight tilts away from it rather than excluding it.",
        citation: ADA_S2_T1_PHENOTYPE,
      },
    ],
    importantNegative: {
      absenceRefutes: ["type_1_diabetes"],
      caveat:
        "A weight that has held does not exclude type 1. ADA states that the onset in adults may be more variable and without the classic features, and that up to 40% of adults with new type 1 diabetes are misdiagnosed — most often as type 2.",
      citation: ADA_S2_T1_MISSED,
    },
    citation: UCG_2023_DM_FEATURES,
  }),
  prop("documented_weight_loss", {
    code: "previous_documented_weight_kg",
    display: "The charted weight compared against",
    valueType: "number",
    unit: "kg",
    elicitation:
      "The earlier weight as written in the record. The difference is left for a human to read against the current weight: this engine holds no arithmetic between two features, and a stored subtraction is a number that can disagree with both of them.",
    citation: ORTHOSTATIC_TECHNIQUE,
  }),
  prop("documented_weight_loss", {
    /**
     * A weight with no date is nearly useless — five kilograms over two months
     * and five over two years are different illnesses — and the reported period
     * beside the symptom cannot stand in for it, because it is gated behind the
     * patient having reported the loss at all.
     */
    code: "previous_weight_months_ago",
    display: "When that weight was recorded",
    valueType: "duration",
    unit: "months",
  }),
];
