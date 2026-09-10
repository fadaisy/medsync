/**
 * The acute decisions of the diabetes-related foot.
 *
 * ── What these rules are for ─────────────────────────────────────────────────
 * complications.ts already carries the IWGDF risk stratification — the four
 * categories, the 12 / 6 / 3 / 1-month review intervals, the annual screening
 * stratum. That answers *when should this person come back*. Nothing here
 * repeats it. These rules answer the other question, the one the clinician is
 * holding the foot to ask: *what has to happen before this person leaves the
 * room today*, and *which of the two things that look identical is this*.
 *
 * Seventeen rules, in three groups:
 *   • infection — a wound with local signs, a wound with a systemic response
 *     (adult and adolescent), a wound with shock, a moderate infection in an
 *     ischaemic foot, the two findings a standards body calls emergencies
 *     outright, the complicated infection that needs a knife, and the wound
 *     that has reached bone;
 *   • Charcot versus infection — the discrimination this whole layer exists
 *     for, now including the collapsed foot that has ulcerated over its own
 *     prominence;
 *   • ischaemia — the ulcerated foot with a perfusion deficit, the bedside signs
 *     that only prompt a Doppler, and the limb that is being lost.
 *
 * ── The Charcot-versus-infection problem, stated honestly ────────────────────
 * A hot, swollen, red foot in a neuropathic patient is a foot infection or it is
 * active Charcot neuro-osteoarthropathy. The managements are opposites —
 * antibiotics and possibly a debridement for one, complete offloading and no
 * antibiotics at all for the other — and the guidelines do not pretend the
 * bedside separates them. IWGDF's Charcot Recommendation 1 says only to
 * *consider* the diagnosis; its rationale counts the clinical signs "after
 * exclusion of other diagnoses such as infection, gout, and deep venous
 * thrombosis"; and Recommendation 8 sends a foot with normal X-rays for an MRI.
 * IWGDF/IDSA Table 1 comes at the same wall from the other side: a mild
 * infection may not be graded unless there is "no other cause of an inflammatory
 * response of the skin (e.g., trauma, gout, acute Charcot neuro-arthropathy,
 * fracture, thrombosis, or venous stasis)".
 *
 * NO RULE IN THIS FILE CARRIES `rulesOut`, and the absence is deliberate. Two
 * rules used to, and an audit took both apart:
 *
 *   • `charcot_in_an_uninfected_foot` used to rule out `diabetic_foot_sepsis`
 *     arithmetically — grade 4 IS "≥ 2 SIRS criteria", so with the measured
 *     vitals inside their limits the count could not reach two. The arithmetic
 *     was wrong twice over. Table 1's temperature criterion is "> 38°C **or <
 *     36°C**", so a gate of `temperature <= 38` admitted every hypothermic
 *     patient — the presentation in which a severe foot infection is most easily
 *     missed — while leaving that criterion MET. And Table 1's respiratory
 *     criterion is "> 20 breaths/min, **or PaCO2 < 4.3 kPa**", of which this
 *     catalog captures only the rate. With the white count also uncaptured, two
 *     criteria remain reachable whatever the vitals say, so no count taken here
 *     can exclude grade 4. The temperature is now bounded on both sides, which
 *     makes the rule's own words true, and the exclusion is gone.
 *   • `hot_foot_with_protective_sensation_intact` used to rule out
 *     `charcot_neuroarthropathy` from a normal 10 g monofilament and a normal
 *     Ipswich touch test. IWGDF defines CNO as "an inflammatory process in
 *     persons with diabetes mellitus and neuropathy" and defines active CNO by
 *     a red, warm, swollen foot "in a person with diabetes mellitus and
 *     neuropathy" — never by a monofilament, and nowhere does the guideline say
 *     intact pressure sensation excludes the disease. This catalog's own
 *     `monofilament_10g` records a pooled negative likelihood ratio of 0.53
 *     against nerve conduction studies, and ADA recommendation 12.24 asks for a
 *     second modality alongside the filament for that exact reason. A negative
 *     that barely moves the odds cannot carry a `strong` refutation, so the rule
 *     now argues FOR infection without arguing against Charcot.
 *
 * What is left is an ORDER rather than an exclusion, which is what ADR 0083 says
 * this layer produces. The evidence trail carries both possibilities and the
 * imaging settles them.
 *
 * ── What these rules deliberately do NOT claim ───────────────────────────────
 * • They do not diagnose. Every one is a `consider`, and the imaging or the
 *   grade is what settles it.
 * • THE ELEVATION TEST IS NOT HERE. The classical teaching — that Charcot's
 *   redness drains away when the foot is raised and cellulitis's does not — does
 *   not appear anywhere in the 2023 IWGDF Charcot guideline, which names
 *   temperature, oedema and redness and says nothing about dependency. It is not
 *   encoded, because encoding it would mean citing a guideline for a sign the
 *   guideline does not contain.
 * • They assign no IWGDF/IDSA grade. `foot_infection_grade` is a field the
 *   CLINICIAN fills; these rules read it and prompt for it. A rule that computed
 *   the grade would need the erythema measured in centimetres from the wound
 *   margin and the tissue plane established, and neither is captured. Nothing
 *   that must reach `immediate` is gated behind that optional field: wet
 *   gangrene and a necrotising infection each raise their own ungated rule,
 *   because ADA calls them emergencies in themselves and states no grade.
 * • They name no dose, no antibiotic and no offloading device beyond the
 *   guideline's own instruction. Guidance stops at the prescription.
 *
 * ── Where the standards diverge, both are recorded ───────────────────────────
 * • ADA and IWGDF agree, and IWGDF is cited where they do: ADA Table 12.1 is an
 *   adapted reprint of the IWGDF stratification, not independent corroboration.
 *   ADA is cited where it says something in its own words — the two surgical
 *   emergencies, the neurological examination, and the imaging a wound with
 *   exposed bone or signs of infection earns.
 * • WHO HEARTS-D — the tier a Ugandan district clinic runs on — has exactly TWO
 *   referral tiers and no third one above them. "Urgent (same day) referral" IS
 *   its emergency tier, and "Non-emergency referral" is the other. Its foot
 *   chapter names six findings for "Urgent referral to acute services" (infected
 *   ulcer, spreading infection, critical limb ischaemia, gangrene, suspicion of
 *   acute Charcot arthropathy, unexplained red swollen foot), with no grading
 *   scheme, no SIRS count and no ankle-brachial index anywhere in it. That list
 *   is used here as a CROSS-CHECK, and the check does not pass everywhere — so
 *   the divergences are named rather than asserted away:
 *     – WHO puts an infected foot ulcer on its most urgent tier. This file
 *       raises the locally infected wound at `same_day`, resting that on
 *       IWGDF's own sentence that almost all patients with a mild infection can
 *       be treated in an ambulatory setting. WHO would refer it faster.
 *     – WHO puts "symptoms and signs of peripheral vascular disease" on its
 *       NON-emergency list, and sends a foot with absent pulses or suspected
 *       lower-limb ischaemia to a higher level of care without calling it
 *       urgent. `ischaemic_foot_ulcer` therefore sits at `same_day`, and
 *       `foot_ulcer_with_bedside_ischaemic_signs` at `same_day` with a `low`
 *       posterior. Only critical ischaemia and gangrene reach `urgent` here,
 *       which is where WHO puts them too.
 * • Uganda Clinical Guidelines 2023 diverges BY OMISSION, and it is the loudest
 *   divergence in this file. The whole national instruction on the diabetic foot
 *   is §8.1.3 (p 475): "Assess for complications (renal disease, eye problems,
 *   diabetic foot, peripheral neuropathy, heart problem, stroke), and refer/
 *   treat accordingly", at health-centre level III. No examination, no ulcer
 *   grading, no infection grading, no risk stratification, no Charcot. The one
 *   place UCG says anything substantive about the diabetic foot is its
 *   MUSCULOSKELETAL chapter (§10.1.2, p 557), and what it says differs from
 *   IWGDF: suspect chronic osteomyelitis in ulcers that "fail to heal after
 *   several weeks of appropriate ulcer care (e.g. in diabetic foot)", where
 *   IWGDF reaches for the probe and the plain film on the day. Retrieved
 *   2026-09-08 from
 *   https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf.
 *   Every rule below is therefore IWGDF, ADA or WHO policy and NOT Ugandan
 *   national policy, and the CSO memo should carry that into the
 *   national-adaptation decision rather than discovering it later.
 *
 * ── Age ──────────────────────────────────────────────────────────────────────
 * The SIRS rule is banded, and it is banded in PAIRS rather than scoped away.
 * The heart-rate and respiratory-rate cut-offs in IWGDF/IDSA Table 1 are ADULT
 * SIRS values, and this catalog's own vitals declare a wider adolescent range —
 * 55–110 bpm and 12–24 breaths/min. An unbanded rule therefore counted a
 * fourteen-year-old's ordinary pulse of 100 and respiratory rate of 22 as two
 * SIRS criteria and raised a severe foot infection on them. Banding it to adults
 * alone would have hidden a septic foot from the adolescent who has one, so
 * there are two rules: the adult thresholds under `adult`/`older_adult`, and the
 * catalog's own adolescent limits under `adolescent`. Nothing is hidden; the
 * thresholds simply stop counting normal physiology as sepsis. Where the
 * patient's band is unknown the engine applies every rule, which is the safe
 * failure — and, because the adolescent cut-offs are the higher pair, an
 * unknown-age patient who meets them fires both rules and scores the condition
 * twice. That inflates a magnitude rather than an order, it is the same
 * behaviour the acute file's banded DKA pair already has, and recording the age
 * removes it. Child, infant and neonate remain deferred (ADR 0083).
 *
 * Every citation here is `csoSigned: false`. The file ships gated dark, and the
 * validator warns on each.
 */
import type { Citation, DifferentialRule } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-08";

const IWGDF_INFECTION_URL =
  "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-04-Infection-Guideline.pdf";
const IWGDF_CHARCOT_URL =
  "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-08-Charcot-Guideline.pdf";
const IWGDF_PAD_URL =
  "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-05-PAD-Guideline.pdf";
const ADA_S12_URL = "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/";

const IWGDF_INFECTION_TITLE =
  "Guidelines on the diagnosis and treatment of foot infection in persons with diabetes (IWGDF/IDSA 2023 update)";
const IWGDF_CHARCOT_TITLE =
  "Diagnosis and treatment of active Charcot neuro-osteoarthropathy in persons with diabetes mellitus (IWGDF 2023)";
const IWGDF_PAD_TITLE =
  "The intersocietal IWGDF, ESVS, SVS guidelines on peripheral artery disease in people with diabetes and a foot ulcer (2023)";
const ADA_S12_TITLE =
  "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/** The grading scheme every infection rule below turns on, at its grade-2 rung. */
const IWGDF_IDSA_TABLE1: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Table 1 and Recommendation 1",
  title: IWGDF_INFECTION_TITLE,
  url: IWGDF_INFECTION_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Infected: At least two of these items are present: Local swelling or induration; Erythema > 0.5 but < 2 cm around the wound; Local tenderness or pain; Local increased warmth; Purulent discharge. And, no other cause of an inflammatory response of the skin (e.g., trauma, gout, acute Charcot neuro-arthropathy, fracture, thrombosis, or venous stasis) 2 / Mild",
  needsCsoInput:
    "ONE OF TABLE 1'S FIVE LOCAL SIGNS IS NOT CAPTURED AT ALL, AND A SECOND IS NOT QUALIFIED. There is no wound-tenderness field, and nothing measures how far the erythema extends from the wound margin — the 0.5 cm and 2 cm boundaries that separate grade 2 from grade 3. Two further limits are structural rather than clinical: the four signs `foot_wound_locally_infected` counts are all recorded through `foot_finding`, which is a PROPERTY of `foot_ulcer_or_inflammation` and cannot be recorded without it, so a wound entered only through the examination's `active_foot_ulcer` reaches at most one sign and the rule will not fire; and local increased warmth is captured twice, as `foot_finding = warmth` and as `foot_temperature_asymmetry`, which are ONE Table 1 item and must be counted once (the second is confirmatory here, never a second sign). CSO to decide whether wound tenderness and erythema extent earn fields, whether the examination needs its own erythema, swelling and discharge captures, and whether prompting for the clinician's own grade is the right stopping point.",
};

/** Grade 4, quoted in full, because its four criteria ARE the rule. */
const IWGDF_IDSA_GRADE4: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Table 1 (grade 4 / Severe)",
  title: IWGDF_INFECTION_TITLE,
  url: IWGDF_INFECTION_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Any foot infection with associated systemic manifestations (of the systemic inflammatory response syndrome [SIRS]), as manifested by ≥ 2 of the following: temperature, > 38°C or < 36°C; heart rate, > 90 beats/min; respiratory rate, >20 breaths/min, or PaCO2 < 4.3 kPa (32 mmHg); white blood cell count >12,000/mm3, or < 4G/L, or > 10% immature (band) forms … 4 / Severe",
  needsCsoInput:
    "THE SIRS COUNT HERE IS PARTIAL, AND IT MAY NEVER BE USED TO EXCLUDE GRADE 4. There is no white-cell-count feature and no PaCO2, so the count runs on temperature, heart rate and the respiratory RATE alone. Two of Table 1's four criteria therefore remain reachable whatever the measured vitals say — the white count, and the PaCO2 limb of the respiratory criterion — which means no arrangement of normal observations in this catalog can bring the count below two. An earlier version of `charcot_in_an_uninfected_foot` rested a `rulesOut` on exactly that arithmetic; the exclusion has been removed. The rule remains specific and INSENSITIVE: a foot infection whose only two systemic criteria are a raised white count and a normal-range pulse will not fire it. CSO to decide whether a full blood count belongs in the catalog, and to ratify shipping a partial SIRS count meanwhile.",
};

/**
 * Table 1's criteria against the catalog's OWN adolescent vital-sign bands.
 *
 * A separate citation from the adult one because it is a separate claim: the
 * criteria are IWGDF's, the numbers substituted into two of them are not.
 */
const IWGDF_IDSA_GRADE4_ADOLESCENT: Citation = {
  standard: "IWGDF",
  version:
    "IWGDF/IDSA 2023 Infection Guideline, Table 1 (grade 4 / Severe), with adolescent vital-sign limits substituted",
  title: IWGDF_INFECTION_TITLE,
  url: IWGDF_INFECTION_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Any foot infection with associated systemic manifestations (of the systemic inflammatory response syndrome [SIRS]), as manifested by ≥ 2 of the following: temperature, > 38°C or < 36°C; heart rate, > 90 beats/min; respiratory rate, >20 breaths/min, or PaCO2 < 4.3 kPa (32 mmHg); white blood cell count >12,000/mm3, or < 4G/L, or > 10% immature (band) forms … 4 / Severe",
  needsCsoInput:
    "IWGDF/IDSA PUBLISH NO ADOLESCENT SIRS THRESHOLDS. Table 1's heart-rate and respiratory-rate cut-offs are adult values, and applying them to a fourteen-year-old counts an ordinary pulse of 100 and a respiratory rate of 22 as two criteria. The numbers used in the adolescent twin — pulse above 110 and respiratory rate above 24 — are the upper limits of this catalog's OWN `ageRefRanges` for those vitals (Fleming 2011, cited in examination.ts) and are an inference, not a guideline threshold. The two temperature limbs are unchanged, because Table 1 states no age dependence for them. CSO to ratify the substitution or replace it with a paediatric standard.",
};

/**
 * The definition sentence, and the reason the grade-4 rule is reachable at a
 * health centre: SIRS is not merely a severity modifier applied to an infection
 * somebody has already established — it is one of the two ways IWGDF/IDSA DEFINE
 * one. A thermometer, a watch and a hand on the chest are the whole apparatus.
 */
const IWGDF_IDSA_DEFINITION: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Recommendation 1 rationale",
  title: IWGDF_INFECTION_TITLE,
  url: IWGDF_INFECTION_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Importantly, in the current guideline, we define a DFI based on the presence of evidence of (a) inflammation of any part of the foot, not just of an ulcer, or (b) findings of SIRS.",
  needsCsoInput:
    "THIS SENTENCE DEFINES AN INFECTION; IT DOES NOT MAKE EVERY FEBRILE PATIENT WITH AN ULCER ONE. Table 1's grade 4 reads 'any foot INFECTION with associated systemic manifestations', so the SIRS rules below require evidence of infection at the FOOT — a recorded grade, a spreading infection or gangrene, purulent discharge, or erythema — and no longer fire on a clean neuropathic ulcer plus a fever. In a malaria-endemic setting that was the commonest way the rule fired. CSO to ratify the reading.",
};

/**
 * Hospitalisation, the single co-morbidity IWGDF singles out by name, and the
 * sentence that keeps the mild infection out of the emergency tier.
 */
const IWGDF_IDSA_HOSPITAL: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Recommendation 2 and rationale, Table 1 note",
  title: IWGDF_INFECTION_TITLE,
  url: IWGDF_INFECTION_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Consider hospitalising all persons with diabetes and a foot infection who have either a severe foot infection as classified by the IWGDF/IDSA classification, or a moderate infection which is associated with key relevant morbidities. (Conditional; Low) … Consideration should be given to hospitalise all persons with a severe foot infection to ensure timely and effective management, as well as those with a moderate infection associated with key relevant co-morbidities, in particular, PAD (see details in Table 2). This is due to a higher risk of poor outcomes in these cases, especially amputation or death. … Fortunately, almost all patients with a mild infection, and many with a moderate infection but without any key relevant morbidities, can be treated in an ambulatory setting. … Note: The presence of clinically significant foot ischaemia makes both diagnosis and treatment of infection considerably more difficult.",
};

/**
 * Recommendation 2's ischaemic co-morbidity, WITH the index that stands in for
 * it — and that index comes from a different guideline, which is why it is
 * stated here rather than borrowed silently.
 */
const IWGDF_INFECTION_WITH_PAD: Citation = {
  standard: "IWGDF",
  version:
    "IWGDF/IDSA 2023 Infection Guideline, Recommendation 2; IWGDF/ESVS/SVS 2023 PAD Guideline, Recommendation 4",
  title: IWGDF_INFECTION_TITLE,
  url: IWGDF_INFECTION_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Consideration should be given to hospitalise all persons with a severe foot infection … as well as those with a moderate infection associated with key relevant co-morbidities, in particular, PAD (see details in Table 2). … [PAD Guideline, Recommendation 4] No single modality has been shown to be optimal for the diagnosis of PAD, and there is no value above which PAD can be excluded. However PAD is less likely in the presence of ABI 0.9-1.3; TBI ≥ 0.70; and triphasic or biphasic pedal Doppler waveforms. (Strong, Low)",
  needsCsoInput:
    "THE INFECTION GUIDELINE STATES NO ANKLE-BRACHIAL INDEX. Recommendation 2 names PAD in words and gives no number; the 0.9 used by this criterion is borrowed from Recommendation 4 of the intersocietal PAD guideline (" +
    IWGDF_PAD_URL +
    ", retrieved " +
    RETRIEVED +
    "), where it is stated as the lower end of the range in which PAD is LESS LIKELY and explicitly NOT as a value that excludes disease. It is used here as a threshold that argues PAD IN, which is the direction the source supports least badly, and an index above 0.9 clears nothing. CSO to ratify the borrowing, or to replace it with the toe-brachial index and Doppler waveform the guideline actually pairs it with — neither of which this catalog captures.",
};

/** And what a severe or complicated infection obliges someone to do, today. */
const IWGDF_IDSA_SURGERY: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Recommendations 18 and 20",
  title: IWGDF_INFECTION_TITLE,
  url: IWGDF_INFECTION_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Recommendation 18: Urgent surgical consultation should be obtained in cases of severe infection or moderate diabetes-related foot infection complicated by extensive gangrene, necrotizing infection, signs suggesting deep (below the fascia) abscess, compartment syndrome, or severe lower limb ischaemia. Best Practice Recommendation … Recommendation 20: In people with diabetes, peripheral artery disease and a foot ulcer or gangrene with infection involving any portion of the foot, obtain an urgent consultation by a surgical specialist as well as a vascular specialist in order to determine the indications and timings of a drainage procedure and/or revascularisation procedure. Best Practice Statement",
  needsCsoInput:
    "TWO OF RECOMMENDATION 18'S FIVE COMPLICATIONS ARE NOT CAPTURED, AND ITS SEVERE-ISCHAEMIA LIMB CARRIES A BORROWED NUMBER. There is no feature for a deep (below-fascia) abscess and none for compartment syndrome, so a foot with either and none of the captured findings will not raise the surgical rule. Recommendation 18 also names 'severe lower limb ischaemia' in words and states no index: the 0.4 used here is Recommendation 13 of the intersocietal PAD guideline (" +
    IWGDF_PAD_URL +
    ", retrieved " +
    RETRIEVED +
    "), quoting the Global Vascular Guidelines. Recommendation 18's own 'severe OR moderate-plus-complication' shape is not expressible in one Criterion, whose branches are conjoined — so the uncomplicated severe infection is raised by the SIRS rules at `urgent`, wet gangrene and a necrotising infection each raise their own ungated `immediate` rule, and this rule lifts the graded infection with extensive gangrene or severe ischaemia. CSO to decide whether either missing finding earns a field.",
};

/**
 * The one part of a sepsis picture no guideline in this file grades, carried
 * with its gap stated rather than dressed up as a citation.
 */
const IWGDF_IDSA_SHOCK: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Recommendation 2 rationale and Table 1 (grade 4)",
  title: IWGDF_INFECTION_TITLE,
  url: IWGDF_INFECTION_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Consideration should be given to hospitalise all persons with a severe foot infection to ensure timely and effective management … This is due to a higher risk of poor outcomes in these cases, especially amputation or death.",
  needsCsoInput:
    "NO SOURCE IN THIS FILE STATES A BLOOD-PRESSURE OR CONSCIOUS-LEVEL THRESHOLD FOR A FOOT INFECTION. Table 1 counts SIRS and stops there; it does not grade shock, and the guideline names no systolic pressure. The systolic below 90 mmHg and the altered conscious level used by `foot_infection_with_shock` are the ordinary bedside markers of septic shock and are an INFERENCE from Recommendation 2's 'higher risk of poor outcomes … especially amputation or death', not a published foot-specific threshold. The rule exists because without it an infected foot with a systolic of 80 and a confused patient was presented at the same urgency as one with a fever and a fast pulse. CSO to supply the local sepsis standard and ratify or replace these numbers.",
};

/** ADA on the two findings it calls surgical emergencies outright. */
const ADA_S12_SURGICAL_EMERGENCY: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12 (foot care narrative)",
  title: ADA_S12_TITLE,
  url: ADA_S12_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Necrotizing soft tissue infections and wet gangrene are surgical emergencies and need immediate surgical referral for wide incision and drainage, often including amputation to manage the source of infection.",
  needsCsoInput:
    "This sentence sits in Section 12's NARRATIVE rather than in a numbered recommendation, so no recommendation number is asserted for it; it was read from the PMC full text of the section. It is the only place a standards body in this file uses the word 'emergencies', and it is what carries the `immediate` urgency on the two ungated rules. Neither rule requires an IWGDF/IDSA grade, because this sentence names none. CSO to confirm the wording against the journal version before signing.",
};

/**
 * ADA on what a wound with exposed bone or signs of infection earns.
 *
 * Carried because an earlier version of this file attributed abscess imaging to
 * IWGDF. It does not say it: IWGDF Recommendation 8 sends OSTEOMYELITIS for an
 * MRI when the diagnosis remains in doubt, and the word abscess appears in that
 * guideline only in Recommendation 18's list of surgical complications and in
 * Table 2. The advice about abscesses and gas is ADA's, in ADA's words.
 */
const ADA_S12_WOUND_IMAGING: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12 (foot care narrative)",
  title: ADA_S12_TITLE,
  url: ADA_S12_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "When exhibiting clinical signs of infection or when bone is exposed or probed, appropriate diagnostic measures must be used. Tissue samples for culture and sensitivity and radiologic or other imaging should be undertaken to ascertain the presence of bone erosions/osteomyelitis, abscesses, or gas.",
  needsCsoInput:
    "NO IMAGING FEATURE EXISTS IN THIS CATALOG. There is no code for a foot X-ray, an MRI or a wound culture, so this instruction can only appear in a rule's `notes` and never in `confirmWith`, which is the field the schema built for it. Prose is not a gap the engine can track or a test the surface can offer. CSO to decide whether foot radiography and wound culture earn features and capabilities (e.g. `imaging.foot_xray`, `lab.wound_culture`).",
};

/** IWGDF's initial work-up for bone, and what settles it when doubt remains. */
const IWGDF_IDSA_OSTEOMYELITIS: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Recommendations 7 and 8 and rationale",
  title: IWGDF_INFECTION_TITLE,
  url: IWGDF_INFECTION_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Recommendation 7: In a person with diabetes, consider using a combination of probe-to-bone test, plain X-rays, and erythrocyte sedimentation rate, or C-reactive protein, or procalcitonin as the initial studies to diagnose osteomyelitis of the foot. (Conditional; Low) … Osteomyelitis may be present underlying any foot wound, especially those that have been present for many weeks or that are wide, deep, located over a bony prominence, showing visible bone, or accompanied by an erythematous, swollen (“sausage”) toe … Recommendation 8: Perform magnetic resonance imaging when the diagnosis of diabetes-related osteomyelitis of the foot remains in doubt despite clinical, plain X-rays and laboratory findings. (Strong; Moderate)",
  needsCsoInput:
    "TWO THIRDS OF RECOMMENDATION 7'S INITIAL WORK-UP IS OUT OF REACH HERE. The probe is captured — twice, as `foot_probe_to_bone` and as `ulcer_depth = bone_or_joint` — but there is no plain-film feature and no ESR, CRP or procalcitonin, so `foot_osteomyelitis_suspected` fires on the bedside test alone and prompts for the rest in prose. IWGDF also warns that a clinician unskilled in the probe should not rely on its result. CSO to decide whether foot radiography and an inflammatory marker earn features.",
};

/** The Charcot statement, with the precondition and the exclusions in its rationale. */
const IWGDF_CHARCOT_DX: Citation = {
  standard: "IWGDF",
  version:
    "IWGDF 2023 Charcot Guideline, definitions, Recommendation 1 and Recommendation 5 rationale",
  title: IWGDF_CHARCOT_TITLE,
  url: IWGDF_CHARCOT_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Charcot neuro-osteoarthropathy: CNO is an inflammatory process in persons with diabetes mellitus and neuropathy which results in injury to bones, joints, and soft tissues. Active Charcot neuro-osteoarthropathy: Active CNO is the presence of a red, warm, swollen foot with osseous abnormalities on imaging in a person with diabetes mellitus and neuropathy. … Recommendation 1: Always consider active Charcot neuro-osteoarthropathy in a person with diabetes mellitus, neuropathy and intact skin when there are clinical findings of an increase in temperature, oedema, and/or redness of the foot, compared to the contralateral foot. Best Practice Statement. … Active CNO should always be suspected when a person with diabetes and neuropathy presents with a unilateral red, warm, swollen foot, intact skin, and no history of ulceration. … Clinical signs of inflammation, such as hyperemia, increased foot skin temperature and oedema should be present when the diagnosis of active CNO is considered, after exclusion of other diagnoses such as infection, gout, and deep venous thrombosis. Pain may be absent or relatively mild due to sensory neuropathy",
  needsCsoInput:
    "LOSS OF PROTECTIVE SENSATION IS BEING SUBSTITUTED FOR THE GUIDELINE'S 'NEUROPATHY', AND THE SUBSTITUTION IS POOR IN ONE DIRECTION. IWGDF defines the disease by neuropathy and never by a test result; this catalog can only offer the 10 g monofilament, the Ipswich touch test and a reported history, and its own `monofilament_10g` records a pooled negative likelihood ratio of 0.53 against nerve conduction studies. Sensation recorded intact therefore argues weakly and excludes nothing — which is why no rule in this file uses it to rule Charcot out — while sensation recorded lost argues well and is what the raising rules read. Two further gaps: `lops` and `monofilament_10g` are two catalog fields for the SAME monofilament test and can disagree by construction, and IWGDF's finding is explicitly COMPARATIVE ('compared to the contralateral foot', 'a unilateral red, warm, swollen foot') while only `foot_temperature_asymmetry` carries that comparison. CSO to ratify the substitution and to decide whether the two monofilament fields should be collapsed into one.",
};

/**
 * What suspicion obliges before any imaging comes back, what settles it — and,
 * in the same guideline, what does NOT. The blood tests every clinician reaches
 * for to separate Charcot from infection are precisely the ones IWGDF says not
 * to use for that purpose, which is why they are quoted here beside the imaging.
 */
const IWGDF_CHARCOT_ACTION: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Charcot Guideline, Recommendations 5, 6, 8 and 10",
  title: IWGDF_CHARCOT_TITLE,
  url: IWGDF_CHARCOT_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Recommendation 5: Initiate knee high immobilization/offloading promptly while further diagnostic studies are performed to confirm or rule out active Charcot neuro-osteoarthropathy (CNO), when active CNO is suspected in a person with diabetes mellitus and intact skin. (Strong; Low) … Recommendation 6: Perform plain X-ray of the foot and ankle in a person with diabetes mellitus and suspected active Charcot neuro-osteoarthropathy. … Recommendation 8: Perform Magnetic Resonance Imaging in a person with diabetes mellitus and suspected active Charcot neuro-osteoarthropathy with normal appearance of the plain X-rays to diagnose or exclude the disease and its activity. (Strong; Moderate) … Recommendation 10: We suggest not using C-reactive protein (CRP), erythrocyte sedimentation rate (ESR), white blood count, alkaline phosphatase, or other blood tests … to diagnose or exclude the disease. (Conditional; Low)",
  needsCsoInput:
    "NO IMAGING FEATURE EXISTS IN THIS CATALOG. There is no code for a foot or ankle X-ray and none for an MRI, so the Charcot rules cannot name the confirmatory investigation in `confirmWith` — which is the field the schema built for exactly that. Their `notes` name it in prose instead, which is weaker: prose is not a gap the engine can track or a test the surface can offer. CSO to decide whether foot radiography earns a feature and a capability (e.g. `imaging.foot_xray`).",
};

/**
 * The collapsed foot, and the reason it needs a rule of its own: IWGDF's
 * recommendations are written for INTACT SKIN, and the deformity they are meant
 * to prevent is exactly what breaks the skin. The guideline says so.
 */
const IWGDF_CHARCOT_DEFORMITY: Citation = {
  standard: "IWGDF",
  version:
    "IWGDF 2023 Charcot Guideline, background, Recommendation 2 rationale and Recommendation 24 rationale",
  title: IWGDF_CHARCOT_TITLE,
  url: IWGDF_CHARCOT_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Bone and joint deformities, as a consequence of active CNO, predispose to ulceration and infection, both of which significantly increase the risk of major lower extremity amputation. Studies have identified a six to 12 times increased risk of major amputation in individuals with a foot ulcer that is the consequence of a CNO deformity as compared to those without an ulcer … The presence of concomitant ulceration and/or infection can also limit the usefulness of foot temperature to monitor CNO … The indications for surgical intervention during active CNO include deformities that result in impending skin ulceration, severe instability, intractable pain, or the inability to immobilize the foot in a cast or non-removable knee high device",
  needsCsoInput:
    "IWGDF'S CHARCOT RECOMMENDATIONS ARE SCOPED TO INTACT SKIN AND THIS RULE IS NOT. Recommendations 1 and 5 both say 'in a person with diabetes mellitus … and intact skin', and the systematic review behind them excluded CNO patients with a foot ulcer. What the guideline does state without that scope is the DEFINITION — an inflammatory process in a person with diabetes and neuropathy, presumed active as long as there are signs of inflammation — and the passages quoted above, which describe the ulcerated Charcot foot as a real and far more dangerous state. `charcot_in_an_ulcerated_foot` therefore RAISES the consideration in a deformed, warm, neuropathic foot whatever the skin is doing, and deliberately does NOT extend Recommendation 5's prompt-offloading instruction to a broken foot, because the guideline does not. CSO to decide what this catalog should say about offloading a Charcot foot that has already ulcerated.",
};

/** ADA on the warm, swollen, red foot — the same picture, in its own words. */
const ADA_S12_CHARCOT: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12 (foot care)",
  title: ADA_S12_TITLE,
  url: ADA_S12_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Special consideration should be given to individuals with neuropathy who present with a warm, swollen, red foot with or without a history of trauma and without an open ulceration. These individuals require a thorough workup for possible Charcot neuroarthropathy … These individuals require total non–weight-bearing and urgent referral to a foot care specialist for further management.",
};

/** ADA's neurological examination, and the reason one negative test is not enough. */
const ADA_S12_EXAM: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, rec 12.24",
  title: ADA_S12_TITLE,
  url: ADA_S12_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "12.24 The examination should include inspection of the skin, assessment of foot deformities, neurological assessment (10-g monofilament testing or Ipswich touch test with at least one additional assessment: pinprick, temperature, or vibration), and vascular assessment, including pulses in the legs and feet. B",
};

/**
 * WHO's resource-appropriate tier, carried as the CROSS-CHECK on urgency rather
 * than as a second grading scheme.
 *
 * HEARTS-D has TWO referral tiers and no third one above them: "Urgent (same
 * day) referral" is its emergency tier and "Non-emergency referral" is the
 * other. Its foot chapter names six findings for urgent referral to acute
 * services, with no grade, no index and no SIRS count anywhere in the list. An
 * earlier version of this file read the same-day list as an alternative to an
 * emergency tier that does not exist, and used the misreading to justify holding
 * an infected foot wound below `urgent`. It does not justify it; IWGDF's own
 * ambulatory sentence does, and WHO is recorded here as a divergence.
 */
const WHO_HEARTS_D_REFERRAL: Citation = {
  standard: "WHO",
  version:
    "HEARTS-D, WHO 2020 (derived from WHO PEN 2013), referral criteria (p 26) and foot section (p 34)",
  title: "HEARTS D: diagnosis and management of type 2 diabetes",
  url: "https://iris.who.int/server/api/core/bitstreams/2a0b4f68-7155-4ad1-b543-945791e31830/content",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Urgent (same day) referral should occur if one of the following is detected: … infected foot ulcer with or without symptoms of systemic infection; gangrene; critical limb ischaemia … Non-emergency referral should occur if one of the following is detected: … symptoms and signs of peripheral vascular disease … [foot section] Patients with gross foot deformities and/or absent peripheral pulses, and patients with suspected lower limb ischaemia will need to be referred to a higher level of care. Urgent referral to acute services is recommended for patients with any of the following: infected ulcer; spreading infection; critical limb ischaemia; gangrene; suspicion of acute Charcot arthropathy; unexplained red swollen foot.",
};

/** IWGDF's own verdict on what the bedside vascular examination can and cannot do. */
const IWGDF_PAD_BEDSIDE: Citation = {
  standard: "IWGDF",
  version: "IWGDF/ESVS/SVS 2023 PAD Guideline, Recommendations 3 and 4 and rationale",
  title: IWGDF_PAD_TITLE,
  url: IWGDF_PAD_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "No single modality has been shown to be optimal for the diagnosis of PAD, and there is no value above which PAD can be excluded. However PAD is less likely in the presence of ABI 0.9-1.3; TBI ≥ 0.70; and triphasic or biphasic pedal Doppler waveforms. (Strong, Low) … Pulse palpation had a PLR of 1.38 and a NLR 0.75 for PAD in people presenting with a foot ulcer (47). These likelihood ratios represent a very small ability of the test to identify or exclude disease. … clinical examination is not sufficient to exclude PAD. … pulse palpation should therefore be performed, and results considered in the context of other clinical examinations that may be associated with PAD including hair loss, muscle atrophy and reduced peripheral skin temperature. It should be noted that these clinical examinations are highly subjective and such findings may also be associated with neuropathy. … peripheral neuropathy can mask pain symptoms and autonomic neuropathy can result in a warm foot, meaning that the widely recognised signs and symptoms of PAD may not be present",
};

/** The findings that make a revascularisation a live question. */
const IWGDF_PAD_ISCHAEMIA: Citation = {
  standard: "IWGDF",
  version: "IWGDF/ESVS/SVS 2023 PAD Guideline, Recommendation 12, with Recommendation 4's index",
  title: IWGDF_PAD_TITLE,
  url: IWGDF_PAD_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "In a person with diabetes, peripheral artery disease, a foot ulcer and clinical findings of ischaemia, a revascularisation procedure should be considered. Findings of ischaemia include absent pulses, monophasic or absent pedal Doppler waveforms, ankle pressure < 100 mm Hg or toe pressure < 60 mm Hg. Consult a vascular specialist unless major amputation is considered medically urgent. Best Practice Statement",
  needsCsoInput:
    "RECOMMENDATION 12 STATES NO INDEX, AND ONE OF ITS FOUR FINDINGS OF ISCHAEMIA IS CAPTURED. The recommendation is a CONJUNCTION — peripheral artery disease AND a foot ulcer AND clinical findings of ischaemia — and the criterion now mirrors that shape: absent pedal pulses (the only one of the four findings this catalog holds) conjoined with a wound and with evidence of PAD. The evidence of PAD is `pad = present` or an ankle-brachial index below 0.9, and that 0.9 is borrowed from Recommendation 4 of this same guideline, where it marks the range in which PAD is LESS LIKELY rather than a diagnostic cut-point. There is no ankle pressure, no toe pressure and no pedal Doppler waveform here. CSO to decide whether toe pressure and Doppler waveform earn features and capabilities.",
};

/** And the threshold at which IWGDF stops saying consider and says urgently. */
const IWGDF_PAD_SEVERE: Citation = {
  standard: "IWGDF",
  version: "IWGDF/ESVS/SVS 2023 PAD Guideline, Recommendation 13",
  title: IWGDF_PAD_TITLE,
  url: IWGDF_PAD_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "In a person with diabetes, peripheral artery disease, a foot ulcer, and severe ischaemia i.e. an ankle-brachial index <0.4, ankle pressure <50mmHg, toe pressure <30mmHg or transcutaneous oxygen pressure <30mmHg or monophasic or absent pedal Doppler waveforms, urgently consult a vascular specialist regarding possible revascularisation. Best Practice Statement",
  needsCsoInput:
    "ONE OF RECOMMENDATION 13'S FIVE MEASURES OF SEVERE ISCHAEMIA IS CAPTURED. Only the ankle-brachial index exists here — the measure IWGDF itself says is unreliable in the medially calcified arteries common in this population — so `limb_threatening_ischaemia` UNDER-detects rather than over-detects, and a severely ischaemic foot can carry an index of 1.0. CSO to ratify shipping a single-measure threshold, and to decide whether toe pressure earns a feature.",
};

/** The syndrome the severity belongs to, defined, plus what it obliges. */
const IWGDF_PAD_CLTI: Citation = {
  standard: "IWGDF",
  version: "IWGDF/ESVS/SVS 2023 PAD Guideline, definitions and Recommendation 14",
  title: IWGDF_PAD_TITLE,
  url: IWGDF_PAD_URL,
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Chronic Limb Threatening Ischaemia: a clinical syndrome defined by the presence of peripheral artery disease in combination with rest pain, gangrene or foot ulcer of at least 2 weeks duration. Venous, embolic, non-atherosclerotic and traumatic aetiologies are excluded. … Recommendation 14: In a person with diabetes, peripheral artery disease and a foot ulcer with infection or gangrene involving any portion of the foot, urgently consult a vascular specialist in order to determine the timing of a drainage procedure and a revascularisation procedure. Best Practice Statement",
  needsCsoInput:
    "THE DEFINITION'S EXCLUSIONS CANNOT BE ENFORCED BY THIS CATALOG. CLTI is defined only after venous, embolic, non-atherosclerotic and traumatic causes are set aside, and nothing here captures any of them — they travel in `mimicsToExclude` as named strings instead. The PAD limb of the criterion is also indirect: `pad = present`, absent pedal pulses or an index below 0.9 stand in for a diagnosis the guideline reaches with Doppler waveforms and a toe-brachial index, and the 0.9 comes from Recommendation 4, where it marks the range in which PAD is less likely. CSO to ratify.",
};

/** Uganda's national instruction on bone beneath a wound, which is not IWGDF's. */
const UCG_2023_OSTEOMYELITIS: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, §10.1.2 Osteomyelitis (p 557)",
  title: "Uganda Clinical Guidelines 2023",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Deep or extensive ulcers that fail to heal after several weeks of appropriate ulcer care (e.g. in diabetic foot), and non-healing fractures, should raise suspicion of chronic osteomyelitis",
  needsCsoInput:
    "UCG AND IWGDF DIVERGE ON WHEN TO SUSPECT BONE. Uganda's national instruction is a TIME criterion — an ulcer that has not healed after several weeks of appropriate care — and it sits in the musculoskeletal chapter rather than in the diabetes one; §8.1.3 (p 475), the whole national instruction on the diabetic foot, says only to assess for complications and refer. IWGDF reaches for the probe and the plain film on the day. `foot_osteomyelitis_suspected` follows IWGDF, so at a Ugandan site it fires EARLIER than national policy expects. CSO to decide which the site profile should apply.",
};

/* ── Infection ───────────────────────────────────────────────────────────── */

/** The three ways a wound reaches these rules at all. */
const WOUND_PRESENT = [
  { feature: "active_foot_ulcer", op: "present" as const },
  { feature: "foot_ulcer_or_inflammation", op: "present" as const },
  { feature: "foot_infection_or_gangrene", op: "present" as const },
];

/**
 * Evidence of infection AT THE FOOT, as against inflammation of any cause.
 *
 * Table 1's grade 4 reads "any foot INFECTION with associated systemic
 * manifestations", so the SIRS rules require one of these rather than a bare
 * ulcer. A clean neuropathic ulcer in a patient febrile from malaria is not a
 * severe foot infection, and in a malaria-endemic setting that was by a wide
 * margin the commonest way the old criterion fired.
 */
const FOOT_INFECTION_EVIDENCE = [
  { feature: "foot_infection_or_gangrene", op: "present" as const },
  { feature: "foot_infection_grade", op: "in" as const, value: ["mild", "moderate", "severe"] },
  { feature: "foot_finding", op: "==" as const, value: "discharge" },
  { feature: "foot_finding", op: "==" as const, value: "erythema" },
];

/** The neuropathy IWGDF names as the setting for Charcot, as this catalog can reach it. */
const NEUROPATHY_ANY = [
  { feature: "lops", op: "==" as const, value: "present" },
  { feature: "lops_ipswich", op: "==" as const, value: "present" },
  { feature: "monofilament_10g", op: "in" as const, value: ["one_foot", "both_feet"] },
  { feature: "charcot_known_neuropathy", op: "present" as const },
];

const INFECTION: DifferentialRule[] = [
  {
    /**
     * The shape of IWGDF/IDSA grade 2, reached from what the catalog captures.
     *
     * `moderate` and not `high`, because it reaches the SHAPE of the grade and
     * not the grade: Table 1's five local signs include tenderness, which is not
     * captured, and qualify the erythema at more than 0.5 cm and less than 2 cm
     * from the wound margin, which nothing measures. The rule's honest output is
     * "grade this foot", and `foot_infection_grade` leads the confirmatory set
     * for that reason.
     *
     * `same_day` rests on IWGDF's own sentence — "almost all patients with a
     * mild infection … can be treated in an ambulatory setting" — and NOT on
     * WHO, which puts an infected foot ulcer on its most urgent tier. That
     * divergence is recorded rather than smoothed over; the rules below are the
     * ones that escalate.
     *
     * FOUR signs are counted, not five. Local increased warmth is captured twice
     * in this catalog, as `foot_finding = warmth` and as
     * `foot_temperature_asymmetry`, and they are ONE Table 1 item; counting both
     * let a single warm foot recorded in two fields satisfy "at least two of
     * these items". The comparative capture is confirmatory here instead.
     */
    id: "foot_wound_locally_infected",
    display:
      "A foot wound with two or more local signs of inflammation — consider a diabetes-related foot infection, and grade it",
    condition: "diabetic_foot_infection",
    when: {
      id: "dfi_local_signs",
      label:
        "A foot ulcer, wound or foot inflammation, with at least two of: swelling, erythema, increased warmth, or purulent discharge",
      any: WOUND_PRESENT,
      atLeast: {
        n: 2,
        of: [
          { feature: "foot_finding", op: "==", value: "swelling" },
          { feature: "foot_finding", op: "==", value: "erythema" },
          { feature: "foot_finding", op: "==", value: "warmth" },
          { feature: "foot_finding", op: "==", value: "discharge" },
        ],
      },
      citation: IWGDF_IDSA_TABLE1,
    },
    posterior: "moderate",
    urgency: "same_day",
    confirmWith: [
      "foot_infection_grade",
      "foot_temperature_asymmetry",
      "ulcer_depth",
      "foot_probe_to_bone",
      "ulcer_area_cm2",
      "temperature",
      "pulse",
      "respiratory_rate",
      "pedal_pulses",
      "pad",
      "abi",
    ],
    mimicsToExclude: [
      "Active Charcot neuro-osteoarthropathy — IWGDF/IDSA will not allow a mild infection to be graded until it has been considered and set aside",
      "Gout, or another acute crystal arthritis",
      "Trauma, or a fracture the neuropathy has masked",
      "Deep vein thrombosis",
      "Venous stasis, chronic venous insufficiency or lymphoedema",
      "Cellulitis or erysipelas arising above the ankle rather than in the foot",
      "Contact or stasis dermatitis, including a reaction to a dressing or a topical agent",
      "Reactive hyperaemia in a foot just revascularised or just released from a cast",
    ],
    notes:
      "This reaches the shape of grade 2 and not the grade itself — record `foot_infection_grade` and the grade stays the clinician's. Two structural limits travel with it. Warmth is counted ONCE: `foot_temperature_asymmetry` records the same Table 1 item as `foot_finding = warmth`, so it is confirmatory here rather than a second sign. And all four counted signs are recorded through `foot_finding`, which is a property of `foot_ulcer_or_inflammation` — a wound entered only through the examination's `active_foot_ulcer` therefore reaches at most one sign and this rule will not fire, which is an under-detection the CSO memo carries. The local signs may also be blunted by neuropathy or by ischaemia, so failing to find two of them is not evidence that the foot is clean. WHO HEARTS-D would refer this foot on its urgent (same-day) tier, which is its most urgent one; the `same_day` here rests on IWGDF's ambulatory sentence, and the two are not in agreement.",
    citation: IWGDF_IDSA_HOSPITAL,
  },
  {
    /**
     * The grade-4 rule, and the one the foot vignette turns on: a plantar ulcer
     * with erythema, absent pulses, a fever and a tachycardia.
     *
     * What makes it reachable at a health centre is the definition sentence
     * rather than the grading table. IWGDF/IDSA define a foot infection from
     * EITHER inflammation of any part of the foot OR findings of SIRS — but
     * Table 1's grade 4 reads "any foot INFECTION with associated systemic
     * manifestations", so the entry branch demands evidence of infection AT THE
     * FOOT and not merely a wound. It used to accept `active_foot_ulcer` alone,
     * which meant a clean neuropathic ulcer plus a malarial fever raised a
     * severe foot infection to the top of the ranking.
     *
     * `urgent` rather than `immediate`, deliberately. The instruction here is
     * hospitalisation and an urgent surgical consultation; `immediate` is
     * reserved for the rules below, where a knife or a fluid bolus is needed
     * within the hour.
     */
    id: "foot_infection_with_sirs",
    display:
      "A foot infection with a systemic inflammatory response — consider a severe (IWGDF/IDSA grade 4) foot infection and admit",
    condition: "diabetic_foot_sepsis",
    ageBands: ["adult", "older_adult"],
    when: {
      id: "dfi_grade4_sirs",
      label:
        "A graded foot infection, spreading infection or gangrene, or a wound with purulent discharge or erythema, with at least two of: temperature above 38 °C, temperature below 36 °C, pulse above 90 bpm, respiratory rate above 20 breaths/min",
      any: FOOT_INFECTION_EVIDENCE,
      atLeast: {
        n: 2,
        of: [
          { feature: "temperature", op: ">", value: 38, unit: "°C" },
          { feature: "temperature", op: "<", value: 36, unit: "°C" },
          { feature: "pulse", op: ">", value: 90, unit: "bpm" },
          { feature: "respiratory_rate", op: ">", value: 20, unit: "breaths/min" },
        ],
      },
      citation: IWGDF_IDSA_GRADE4,
    },
    posterior: "high",
    urgency: "urgent",
    confirmWith: [
      "foot_infection_grade",
      "ulcer_depth",
      "foot_probe_to_bone",
      "gangrene_type",
      "bp_systolic",
      "mental_status",
      "pedal_pulses",
      "pad",
      "abi",
      "capillary_glucose",
    ],
    mimicsToExclude: [
      "Malaria — the commonest cause of fever with tachycardia in this setting, and an ulcer in the same patient proves nothing about the fever",
      "Pneumonia, urinary tract infection or any other extra-pedal source of sepsis in someone who also happens to have a foot wound",
      "Cellulitis or erysipelas of the leg arising above the ankle",
      "Necrotising fasciitis, which is a surgical emergency on a shorter clock than this and has its own rule below",
      "Diabetic ketoacidosis or a hyperosmolar state, in which dehydration alone produces the tachycardia and the tachypnoea",
      "Active Charcot neuro-osteoarthropathy, which inflames a foot without infecting it",
      "Deep vein thrombosis, or a pulmonary embolus",
      "Tuberculosis or an HIV-related febrile illness",
    ],
    notes:
      "Three of Table 1's four SIRS criteria are counted; there is no white-cell count in this catalog and no PaCO2, so the rule is specific and insensitive against the published grade. The two temperature predicates are the two limbs of one criterion and only one can ever be met, so they do not double-count. A foot the examiner has graded UNINFECTED is not excluded by the criterion — requiring a recorded grade would make the rule unreachable at every site that does not record one, which is the district reality it exists for — but a recorded grade of `none` already argues against a severe infection through that field's own recorded-absence caveat, and the two must be read together. The thresholds here are ADULT SIRS values and the rule is banded to adults for that reason; the adolescent twin below carries this catalog's own adolescent limits. Above all this is a rule about a FOOT: fever and a fast pulse in a person who merely happens to have a wound are far more often something else, and the mimic list is not decoration.",
    citation: IWGDF_IDSA_DEFINITION,
  },
  {
    /**
     * The same rule against the adolescent's own physiology.
     *
     * A separate rule rather than the adult one with a band bolted on, for the
     * reason the acute file gives: the numbers underneath genuinely differ. This
     * catalog's `ageRefRanges` put an adolescent pulse at 55–110 and an
     * adolescent respiratory rate at 12–24, so a fourteen-year-old with a pulse
     * of 100 and a rate of 22 met two adult SIRS criteria while sitting inside
     * the catalog's own declared normal. The temperature limbs are unchanged,
     * because Table 1 states no age dependence for them.
     *
     * Nothing is hidden from the adolescent by this split. Where the patient's
     * band is unknown the engine applies every rule.
     */
    id: "foot_infection_with_sirs_adolescent",
    display:
      "A foot infection with a systemic inflammatory response in a young person — consider a severe (IWGDF/IDSA grade 4) foot infection on the adolescent vital-sign limits",
    condition: "diabetic_foot_sepsis",
    ageBands: ["adolescent"],
    when: {
      id: "dfi_grade4_sirs_adolescent",
      label:
        "A graded foot infection, spreading infection or gangrene, or a wound with purulent discharge or erythema, with at least two of: temperature above 38 °C, temperature below 36 °C, pulse above 110 bpm, respiratory rate above 24 breaths/min",
      any: FOOT_INFECTION_EVIDENCE,
      atLeast: {
        n: 2,
        of: [
          { feature: "temperature", op: ">", value: 38, unit: "°C" },
          { feature: "temperature", op: "<", value: 36, unit: "°C" },
          { feature: "pulse", op: ">", value: 110, unit: "bpm" },
          { feature: "respiratory_rate", op: ">", value: 24, unit: "breaths/min" },
        ],
      },
      citation: IWGDF_IDSA_GRADE4_ADOLESCENT,
    },
    posterior: "high",
    urgency: "urgent",
    confirmWith: [
      "foot_infection_grade",
      "ulcer_depth",
      "foot_probe_to_bone",
      "gangrene_type",
      "bp_systolic",
      "mental_status",
      "pedal_pulses",
      "pad",
      "abi",
      "capillary_glucose",
    ],
    mimicsToExclude: [
      "Malaria — the commonest cause of fever with tachycardia in this setting, and a wound in the same patient proves nothing about the fever",
      "Type 1 diabetes presenting in ketoacidosis, in which the tachycardia and the tachypnoea are the acidosis",
      "Pneumonia, urinary tract infection or another extra-pedal source of sepsis",
      "Anxiety, pain or a recent effort, any of which raises an adolescent's pulse well past the adult cut-off",
      "Sickle-cell disease with a vaso-occlusive crisis or an ulcer",
      "Osteomyelitis or septic arthritis of the foot or ankle, which in this age group is more often haematogenous than contiguous",
      "Rheumatic fever, or another febrile illness with arthralgia",
    ],
    notes:
      "The criteria are IWGDF's; the two numbers substituted into them are not. Pulse above 110 and respiratory rate above 24 are the upper limits of this catalog's own adolescent reference bands and are an inference, recorded as such on the citation. Paediatric diabetes remains out of scope (ADR 0083), so there is no rule for a child, an infant or a neonate — a septic foot in that age group is outside what this catalog claims to reason about, and the clinician's judgement is the only route.",
    citation: IWGDF_IDSA_GRADE4_ADOLESCENT,
  },
  {
    /**
     * The rule that stops an infected foot with shock arriving at the same
     * urgency as an infected foot with a fever.
     *
     * Table 1 counts SIRS and stops there — it does not grade shock, and no
     * guideline cited in this file states a blood pressure for a foot infection.
     * So the numbers here are the ordinary bedside markers of septic shock,
     * declared as an inference on the citation rather than dressed up as a
     * threshold somebody published. Without it a systolic of 80 and a confused
     * patient reached `urgent` and nothing else in the catalog compensated:
     * `bp_systolic` and `mental_status` sat in confirmatory lists that nothing
     * reads, and the blood-pressure interpretation table has no low band at all.
     */
    id: "foot_infection_with_shock",
    display:
      "A foot infection with hypotension or an altered conscious level — treat as septic shock and escalate now",
    condition: "diabetic_foot_sepsis",
    when: {
      id: "dfi_shock",
      label:
        "A graded foot infection, spreading infection or gangrene, or a wound with purulent discharge or erythema, with a systolic blood pressure below 90 mmHg, a conscious level below alert, or recorded hypotension or confusion",
      any: FOOT_INFECTION_EVIDENCE,
      atLeast: {
        n: 1,
        of: [
          { feature: "bp_systolic", op: "<", value: 90, unit: "mmHg" },
          { feature: "mental_status", op: "in", value: ["drowsy", "stupor", "coma"] },
          { feature: "avpu", op: "in", value: ["voice", "pain", "unresponsive"] },
          { feature: "foot_systemic_signs", op: "in", value: ["hypotension", "confusion"] },
        ],
      },
      citation: IWGDF_IDSA_SHOCK,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "bp_systolic",
      "mental_status",
      "avpu",
      "pulse",
      "respiratory_rate",
      "temperature",
      "capillary_glucose",
      "foot_infection_grade",
      "gangrene_type",
      "ulcer_depth",
    ],
    mimicsToExclude: [
      "Sepsis from another source — pneumonia, urinary tract infection, meningitis or severe malaria — in a person who also has a foot wound",
      "Hypoglycaemia, which produces a reduced conscious level in minutes and is corrected in minutes",
      "Diabetic ketoacidosis or a hyperosmolar state, in which dehydration alone produces the hypotension and the drowsiness",
      "Dehydration from vomiting or diarrhoea, or from diuretics",
      "Autonomic neuropathy with a postural drop, which is a lying-standing difference and not shock",
      "A gastrointestinal or other haemorrhage",
      "Cardiogenic shock from a silent myocardial infarction, which diabetes makes more likely and less painful",
      "A drug effect — an antihypertensive, an opioid or a sedative",
    ],
    notes:
      "The blood pressure and the conscious level are the inference in this file, and the citation says so: no source cited here grades shock in a diabetes-related foot infection. Read the rule as an escalation of urgency rather than as a claim about the foot — the source of the shock may not be the foot at all, which is why the mimic list is long and the confirmatory set starts with the observations rather than with the wound. A postural drop is not this: `bp_systolic_standing` and the postural pulse response answer a different question and are deliberately not read here.",
    citation: IWGDF_IDSA_SURGERY,
  },
  {
    /**
     * The one co-morbidity IWGDF names when deciding who to admit, and the one
     * combination two separate guidelines both call urgent: infection plus PAD.
     * The infection guideline asks for hospitalisation and the PAD guideline
     * asks for a vascular opinion the same day, which is why this is a rule and
     * not a footnote on the grade.
     *
     * DRY GANGRENE IS NOT AN ENTRY HERE, and used to be. Dry gangrene is the
     * end-point of ischaemia, not an infection: a mummified, afebrile toe with
     * absent pulses read on the screen as "a moderate or severe foot infection
     * in an ischaemic foot" at `high`, while the recorded uninfected grade was
     * simultaneously arguing the other way. That foot belongs to
     * `clti_with_gangrene_or_chronic_ulcer` below, which raises the ischaemic
     * syndrome instead. Wet gangrene stays, because it is an infected gangrene
     * and it is the pairing Recommendation 14 is about.
     *
     * The ischaemia limb is a disjunction on purpose. `pad` is the clinician's
     * confirmed finding, `pedal_pulses` is what a district clinic has, and `abi`
     * is what a clinic with a Doppler has — and no one of the three is
     * sufficient alone, which is IWGDF's own position.
     */
    id: "foot_infection_with_pad",
    display:
      "A moderate or severe foot infection in an ischaemic foot — consider admission and an urgent vascular opinion",
    condition: "diabetic_foot_infection",
    when: {
      id: "dfi_with_pad",
      label:
        "A foot infection graded moderate or severe, or wet gangrene, in a foot with peripheral artery disease, absent pedal pulses, or an ankle-brachial index below 0.9",
      any: [
        { feature: "foot_infection_grade", op: "in", value: ["moderate", "severe"] },
        { feature: "gangrene_type", op: "==", value: "wet" },
      ],
      atLeast: {
        n: 1,
        of: [
          { feature: "pad", op: "==", value: "present" },
          { feature: "pedal_pulses", op: "==", value: "absent" },
          { feature: "abi", op: "<", value: 0.9, unit: "ratio" },
        ],
      },
      citation: IWGDF_INFECTION_WITH_PAD,
    },
    posterior: "high",
    urgency: "urgent",
    confirmWith: [
      "abi",
      "pedal_pulses",
      "ischaemic_foot_signs",
      "pad",
      "foot_infection_grade",
      "ulcer_depth",
      "foot_probe_to_bone",
      "gangrene_type",
      "temperature",
      "pulse",
    ],
    mimicsToExclude: [
      "Dry gangrene in a stable, afebrile foot, which is ischaemic necrosis rather than an infection and is not what this rule is about",
      "Venous or mixed leg ulceration with surrounding stasis dermatitis, which is not an ischaemic foot",
      "Acute limb ischaemia from an embolus or a thrombosis — a different emergency, on a shorter clock",
      "An artefactually low ankle-brachial index from a cuff applied over a dressing, an ulcer or an oedematous ankle",
      "Active Charcot neuro-osteoarthropathy in a foot that also happens to have diseased arteries",
      "Pressure necrosis from a cast, a dressing or a shoe",
      "Sickle-cell leg ulceration",
    ],
    notes:
      "The infection guideline names PAD in words and states no index. The 0.9 is borrowed from Recommendation 4 of the PAD guideline, where it marks the range in which PAD is LESS LIKELY — that guideline is explicit that there is no value above which PAD can be excluded, so an index of 1.4 does not clear this rule's concern: medial arterial calcification is common in diabetes and in kidney disease and falsely raises the index, and a high value should send the clinician to a toe pressure or a Doppler waveform, neither of which this catalog captures. The infection guideline's own note travels with the rule — clinically significant foot ischaemia makes both the diagnosis and the treatment of the infection considerably more difficult.",
    citation: IWGDF_IDSA_HOSPITAL,
  },
  {
    /**
     * Wet gangrene, ungated.
     *
     * ADA calls it a surgical emergency in its own words and names no grade, so
     * this rule names none either. That matters because the grade is a judgement
     * this catalog cannot always reach — it needs the erythema measured from the
     * wound margin and the tissue plane established — and the previous version
     * of the surgical rule was gated behind it. A forefoot recorded as wet
     * gangrene with the grade selector untouched produced no `immediate` output
     * at all, which is the failure this rule exists to close.
     */
    id: "wet_gangrene_of_the_foot",
    display:
      "Wet gangrene of the foot — a surgical emergency; refer for immediate surgical opinion",
    condition: "diabetic_foot_sepsis",
    when: {
      id: "dfi_wet_gangrene",
      label: "Gangrene of the foot recorded as wet",
      all: [{ feature: "gangrene_type", op: "==", value: "wet" }],
      citation: ADA_S12_SURGICAL_EMERGENCY,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "gangrene_type",
      "foot_infection_grade",
      "ulcer_wagner_grade",
      "ulcer_depth",
      "foot_probe_to_bone",
      "temperature",
      "pulse",
      "respiratory_rate",
      "bp_systolic",
      "abi",
      "pedal_pulses",
    ],
    mimicsToExclude: [
      "Dry gangrene, which is ischaemic necrosis in a stable foot and is managed differently — it is not treated as an emergency",
      "A necrotic eschar or an adherent slough that has not been debrided, and is not necrosis of living tissue",
      "Acute limb ischaemia from an embolus or a thrombosis, which needs a vascular surgeon rather than a debridement",
      "Calciphylaxis in a person on dialysis",
      "Pyoderma gangrenosum, in which debridement makes the lesion worse",
      "A chemical or thermal burn in an insensate foot",
      "Frostbite, or another cold injury",
    ],
    notes:
      "`gangrene_type` is a property of the spreading-infection-or-gangrene finding, so recording it already asserts the foot is involved. What the rule cannot tell is how much of the foot: `ulcer_wagner_grade` leads the confirmatory set because grades 4 and 5 are forefoot and whole-foot gangrene, which is what Recommendation 18 calls extensive. Where there is also peripheral artery disease, Recommendation 20 asks for the surgical and the vascular opinion TOGETHER, so that the drainage and the revascularisation are sequenced rather than raced.",
    citation: ADA_S12_SURGICAL_EMERGENCY,
  },
  {
    /**
     * The other emergency ADA names in the same sentence, given its own rule and
     * its own condition.
     *
     * `necrotising_soft_tissue_infection` was defined in conditions.ts and
     * nothing could raise it; a rule fired on `skin_infection_type =
     * necrotising` and filed the result under a foot infection. It is now its
     * own entity, which is what the condition was declared for.
     *
     * Ungated on the grade for the same reason as wet gangrene: ADA states none.
     */
    id: "necrotising_foot_infection",
    display:
      "A rapidly spreading or necrotising soft-tissue infection in a person with a foot wound — a surgical emergency; refer for immediate surgical opinion",
    condition: "necrotising_soft_tissue_infection",
    when: {
      id: "nsti_with_foot_wound",
      label:
        "A skin infection recorded as rapidly spreading or necrotising, in a person with a foot ulcer, wound or foot infection",
      all: [{ feature: "skin_infection_type", op: "==", value: "necrotising" }],
      any: WOUND_PRESENT,
      citation: ADA_S12_SURGICAL_EMERGENCY,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "skin_infection_type",
      "skin_infection_site",
      "foot_infection_grade",
      "gangrene_type",
      "ulcer_depth",
      "temperature",
      "pulse",
      "respiratory_rate",
      "bp_systolic",
      "mental_status",
    ],
    mimicsToExclude: [
      "Severe cellulitis or erysipelas, which spreads fast and does not need a knife",
      "Wet gangrene, which ADA names in the same sentence but which is a different lesion with its own rule",
      "An abscess or a carbuncle that needs drainage rather than debridement",
      "Fournier's gangrene, which is the perineal entity and is modelled separately",
      "Pyoderma gangrenosum, in which surgery makes the lesion worse",
      "Calciphylaxis in a person on dialysis",
      "A necrotic eschar or an adherent slough that has not been debrided",
      "An extensive burn, a chemical injury or an extravasation",
    ],
    notes:
      "`skin_infection_type` is a GENERAL-examination field and its site is recorded as free text, which no rule may read — so this rule can only say that a necrotising infection has been recorded in a person who also has a foot wound, and never that the necrotising infection is on the foot. Read `skin_infection_site` beside it before acting. The rule is deliberately loose in that direction: a necrotising soft-tissue infection anywhere is an emergency on the same clock, so the cost of firing on a non-pedal one is a surgical opinion that was needed anyway. This catalog asserts no bedside case definition for the entity and encodes no LRINEC score — IWGDF's own review found the laboratory risk indicator for necrotising fasciitis unreliable for predicting amputation or mortality.",
    citation: ADA_S12_SURGICAL_EMERGENCY,
  },
  {
    /**
     * What is left of Recommendation 18 once the two ungated emergencies above
     * have been split out: the graded infection made surgical by extensive
     * gangrene or by severe ischaemia.
     *
     * The grade is required HERE and only here, because Recommendation 18 is
     * where the grade appears — "severe infection or moderate diabetes-related
     * foot infection complicated by …". Nothing that must reach `immediate`
     * without a grade is trapped behind it any more.
     */
    id: "foot_infection_needing_urgent_surgery",
    display:
      "A moderate or severe foot infection with extensive gangrene or severe ischaemia — obtain an urgent surgical opinion now",
    condition: "diabetic_foot_sepsis",
    when: {
      id: "dfi_surgical",
      label:
        "A foot infection graded moderate or severe, complicated by forefoot or whole-foot gangrene (Wagner 4 or 5) or by severe ischaemia (ankle-brachial index below 0.4)",
      all: [{ feature: "foot_infection_grade", op: "in", value: ["moderate", "severe"] }],
      atLeast: {
        n: 1,
        of: [
          { feature: "ulcer_wagner_grade", op: "in", value: ["grade_4", "grade_5"] },
          { feature: "abi", op: "<", value: 0.4, unit: "ratio" },
        ],
      },
      citation: IWGDF_IDSA_SURGERY,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "foot_infection_grade",
      "gangrene_type",
      "ulcer_wagner_grade",
      "ulcer_depth",
      "foot_probe_to_bone",
      "abi",
      "pedal_pulses",
      "temperature",
      "pulse",
      "respiratory_rate",
      "bp_systolic",
    ],
    mimicsToExclude: [
      "Dry gangrene of a single toe in a stable, afebrile foot, which is managed differently from wet gangrene and is not treated as an emergency",
      "Acute limb ischaemia from an embolus or a thrombosis, which needs a vascular surgeon rather than a debridement",
      "A necrotic eschar or an adherent slough that has not been debrided, and is not necrosis of living tissue",
      "An artefactually low ankle-brachial index from a cuff over a dressing, an ulcer or a swollen ankle",
      "Calciphylaxis in a person on dialysis",
      "Pyoderma gangrenosum, in which debridement makes the lesion worse",
      "A chemical or thermal burn in an insensate foot",
    ],
    notes:
      "Two of Recommendation 18's five complications cannot be reached from this catalog: there is no feature for a deep (below-fascia) abscess and none for compartment syndrome. A foot with either and none of the captured findings will NOT raise this rule, and the clinician's judgement remains the only route to it — which is why ADA's own instruction is carried here instead: when there are clinical signs of infection, or bone is exposed or probed, tissue samples for culture and radiologic or other imaging should be undertaken to ascertain bone erosions or osteomyelitis, abscesses, or gas. That advice is ADA's; IWGDF's imaging recommendation (Recommendation 8) is about OSTEOMYELITIS, not abscesses, and an earlier version of this file misattributed it. The 0.4 is Recommendation 13 of the PAD guideline; Recommendation 18 says 'severe lower limb ischaemia' in words and states no index.",
    citation: ADA_S12_WOUND_IMAGING,
  },
  {
    /**
     * Bone, which this file used to say the catalog did not model. It does:
     * `diabetic_foot_osteomyelitis` has been in conditions.ts all along, and
     * nothing named it, so a positive probe-to-bone raised nothing at all and
     * the validator called the condition unreachable.
     *
     * `moderate` and not `high` because the probe is one of three initial
     * studies Recommendation 7 asks for and this catalog holds only that one —
     * no plain film, no ESR, CRP or procalcitonin. `same_day` and not `urgent`
     * because what changes is the LENGTH of the antibiotic course and whether a
     * resection is needed, not whether the patient survives the night.
     */
    id: "foot_osteomyelitis_suspected",
    display:
      "A foot wound that probes to bone or reaches bone or joint — consider osteomyelitis and start the initial work-up",
    condition: "diabetic_foot_osteomyelitis",
    when: {
      id: "dfo_probe_to_bone",
      label:
        "A foot wound in which bone can be probed or seen, or an ulcer recorded as reaching bone or joint",
      any: [
        { feature: "foot_probe_to_bone", op: "present" },
        { feature: "ulcer_depth", op: "==", value: "bone_or_joint" },
      ],
      citation: IWGDF_IDSA_OSTEOMYELITIS,
    },
    posterior: "moderate",
    urgency: "same_day",
    confirmWith: [
      "foot_probe_to_bone",
      "ulcer_depth",
      "ulcer_area_cm2",
      "foot_ulcer_duration",
      "foot_ulcer_region",
      "ulcer_wagner_grade",
      "foot_infection_grade",
      "pedal_pulses",
      "abi",
    ],
    mimicsToExclude: [
      "Active Charcot neuro-osteoarthropathy, which destroys the same bones without infecting them and is the single hardest thing to tell this from on a plain film",
      "An unrecognised fracture in an insensate foot, walked on until the bone is palpable",
      "A neuropathic joint, or a joint destroyed by a previous Charcot episode now in remission",
      "A retained foreign body — a thorn, a nail or a fragment of glass — in a foot that felt nothing",
      "Septic arthritis of an adjacent joint",
      "Gout with a tophus eroding into bone",
      "A deep soft-tissue abscess below the fascia with no bone involvement",
      "Tuberculous or sickle-cell osteomyelitis, in which the organism and the course are different",
    ],
    notes:
      "The probe is one of three initial studies and the only one this catalog holds. IWGDF asks for the probe-to-bone test COMBINED with plain X-rays and an inflammatory marker — ESR, CRP or procalcitonin — and sends the foot for magnetic resonance imaging when the diagnosis remains in doubt despite all three; none of those exist as features here, so they are named in prose and the inference stays the clinician's. IWGDF also warns that a clinician unskilled in the probe should not rely on its result, and that osteomyelitis may underlie any wound, especially one present for many weeks, wide, deep, over a bony prominence, showing visible bone, or with a swollen sausage toe. Uganda Clinical Guidelines diverge: §10.1.2 asks that chronic osteomyelitis be suspected in deep or extensive ulcers that fail to heal after several weeks of appropriate care, which is a slower trigger than this one.",
    citation: UCG_2023_OSTEOMYELITIS,
  },
];

/* ── Charcot versus infection ────────────────────────────────────────────── */

const CHARCOT: DifferentialRule[] = [
  {
    /**
     * IWGDF Charcot Recommendation 1, expressed as it is written: diabetes,
     * NEUROPATHY, INTACT SKIN, and the foot warmer, more swollen or redder than
     * THE OTHER ONE. Three separate conditions, and the criterion keeps them
     * separate — `all` for the intact skin, `any` for the inflammation,
     * `atLeast` for the neuropathy — because collapsing them into one
     * disjunction would let a hot foot in a patient with normal nerves raise
     * Charcot.
     *
     * THE INFLAMMATION BRANCH IS COMPARATIVE, and that is a change. It used to
     * accept `foot_finding = swelling` or `= erythema` on their own, with no
     * laterality anywhere, so a neuropathic patient with bilateral pitting
     * oedema from kidney disease, heart failure or a calcium-channel blocker
     * raised "consider active Charcot and offload it now" at `urgent`. Both
     * places IWGDF describes the finding it is comparative — "compared to the
     * contralateral foot", "a unilateral red, warm, swollen foot" — so only the
     * comparative capture and the named Charcot presentation remain.
     *
     * `posterior: "moderate"` is the ceiling this rule may reach. Recommendation
     * 1 is a Best Practice Statement to CONSIDER the disease; the guideline's own
     * diagnosis is clinical signs PLUS abnormalities on imaging. `urgency:
     * "urgent"` is where the value is: Recommendation 5 says to start knee-high
     * immobilisation and offloading PROMPTLY, while the imaging is arranged, and
     * it is graded Strong.
     */
    id: "charcot_active_suspected",
    display:
      "A foot warmer, more swollen or redder than the other one, with intact skin, in a neuropathic patient — consider active Charcot neuro-osteoarthropathy and offload it now",
    condition: "charcot_neuroarthropathy",
    when: {
      id: "cno_rec1",
      label:
        "No active foot ulcer recorded, loss of protective sensation or known neuropathy, and the foot warmer than the other one or recorded as a red, hot, swollen foot with no ulcer",
      all: [{ feature: "active_foot_ulcer", op: "absent" }],
      any: [
        { feature: "foot_temperature_asymmetry", op: "in", value: ["warmer", "markedly_warmer"] },
        { feature: "charcot_presentation", op: "present" },
      ],
      atLeast: { n: 1, of: NEUROPATHY_ANY },
      citation: IWGDF_CHARCOT_DX,
    },
    posterior: "moderate",
    urgency: "urgent",
    confirmWith: [
      "foot_temperature_asymmetry",
      "charcot_side",
      "charcot_foot_deformity",
      "foot_deformity_pattern",
      "foot_infection_grade",
      "oedema_distribution",
      "temperature",
      "pulse",
      "respiratory_rate",
      "lops",
      "lops_ipswich",
      "charcot_duration",
    ],
    mimicsToExclude: [
      "Diabetes-related foot infection, including cellulitis and osteomyelitis — IWGDF asks that infection be excluded BEFORE active Charcot is considered, not afterwards",
      "Bilateral dependent, cardiac, renal or drug-induced oedema — heart failure, nephrotic syndrome, advanced kidney disease or a calcium-channel blocker, none of which is unilateral and none of which needs a cast",
      "Gout, or another acute crystal arthritis",
      "Deep vein thrombosis",
      "Trauma, or a fracture the neuropathy has masked and the patient has gone on walking upon",
      "Venous stasis, chronic venous insufficiency or lymphoedema",
      "Septic arthritis of the ankle or the midfoot",
      "Erysipelas or cellulitis arising above the ankle",
      "Reactive hyperaemia in a foot recently revascularised or just out of a cast",
      "Osteoarthritis or an inflammatory arthropathy of the midfoot or ankle",
    ],
    notes:
      "This rule fires on the whole picture and settles nothing. The catalog has no feature for a foot X-ray or an MRI, so the confirmatory investigation cannot appear in `confirmWith` and is named here instead: weight-bearing plain X-rays of foot and ankle first, MRI if they are normal. The inflammation must be COMPARATIVE — a foot warmer than the other one, or the named red, hot, swollen foot — because bilateral swelling in a neuropathic patient is far more often oedema than Charcot; `oedema_distribution` and `charcot_side` are in the confirmatory set so the laterality can be settled. IWGDF Recommendation 10 removes the shortcut a clinician reaches for: CRP, ESR, the white count and alkaline phosphatase are not to be used to diagnose or exclude the disease, so a normal inflammatory screen is not permission to stop offloading. Pain may be absent or mild because of the neuropathy, so a comfortable foot argues for nothing. And the classically taught elevation test — redness that drains when the foot is raised — is NOT in the 2023 IWGDF Charcot guideline, and is deliberately encoded nowhere in this catalog.",
    citation: IWGDF_CHARCOT_ACTION,
  },
  {
    /**
     * The same picture with the systemic observations quiet, and NO `rulesOut`.
     *
     * It used to carry one. The argument was that IWGDF/IDSA grade 4 is defined
     * as any foot infection with at least two SIRS criteria, so with the
     * measured vitals inside their limits at most one criterion — the white
     * count — could remain and two could not be reached. That arithmetic was
     * wrong twice. The gate read `temperature <= 38`, which admits a patient at
     * 35 °C while Table 1's temperature criterion is "> 38°C **or < 36°C**" —
     * so the very patient whose severe infection is most easily missed had it
     * pushed DOWN the ranking. And the respiratory criterion is "> 20
     * breaths/min, **or PaCO2 < 4.3 kPa**", of which only the rate is captured.
     * With the white count uncaptured too, two criteria remain reachable no
     * matter what the vitals say, so nothing measured here can exclude grade 4.
     *
     * The temperature is now bounded on BOTH sides, which is what makes the
     * rule's own words true, and the rule argues for Charcot without arguing
     * against anything. The recorded uninfected grade already carries its own
     * refutation through that field's importantNegative, with the caveat
     * attached — which is the honest weight for it.
     */
    id: "charcot_in_an_uninfected_foot",
    display:
      "The Charcot picture in a foot graded uninfected, with temperature, pulse and respiratory rate inside the adult SIRS limits",
    condition: "charcot_neuroarthropathy",
    when: {
      id: "cno_uninfected",
      label:
        "No active foot ulcer, the foot graded uninfected on the IWGDF/IDSA scale, temperature between 36 and 38 °C, pulse 90 bpm or below and respiratory rate 20 breaths/min or below — with neuropathy, and the foot warmer than the other one or recorded as a red, hot, swollen foot with no ulcer",
      all: [
        { feature: "active_foot_ulcer", op: "absent" },
        { feature: "foot_infection_grade", op: "==", value: "none" },
        { feature: "temperature", op: ">=", value: 36, unit: "°C" },
        { feature: "temperature", op: "<=", value: 38, unit: "°C" },
        { feature: "pulse", op: "<=", value: 90, unit: "bpm" },
        { feature: "respiratory_rate", op: "<=", value: 20, unit: "breaths/min" },
      ],
      any: [
        { feature: "foot_temperature_asymmetry", op: "in", value: ["warmer", "markedly_warmer"] },
        { feature: "charcot_presentation", op: "present" },
      ],
      atLeast: { n: 1, of: NEUROPATHY_ANY },
      citation: IWGDF_IDSA_GRADE4,
    },
    posterior: "moderate",
    urgency: "urgent",
    confirmWith: [
      "charcot_foot_deformity",
      "foot_deformity_pattern",
      "foot_temperature_asymmetry",
      "charcot_side",
      "charcot_duration",
      "prior_foot_ulcer",
      "foot_skin_broken",
      "preulcerative_foot_lesions",
      "oedema_distribution",
    ],
    mimicsToExclude: [
      "Diabetes-related foot infection at any grade — an uninfected reading may simply mean the signs were blunted by neuropathy or ischaemia, and this rule excludes nothing",
      "A severe foot infection in a person already taking an antibiotic or a steroid, in whom the fever and the tachycardia have been suppressed",
      "Osteomyelitis beneath intact skin, which produces no systemic upset in many people",
      "A deep abscess below the fascia, which the local signs and the observations can both miss",
      "Bilateral dependent, cardiac, renal or drug-induced oedema",
      "Gout, or another acute crystal arthritis",
      "Deep vein thrombosis",
      "Trauma, or an unrecognised fracture",
      "Venous stasis or lymphoedema",
    ],
    notes:
      "This rule adds evidence for Charcot and removes none from anything else. It used to rule out a severe foot infection on a SIRS count, and it cannot: with the white cell count and the PaCO2 both uncaptured, two of Table 1's four criteria remain reachable whatever the thermometer, the watch and the hand on the chest say. Observations are also only as good as the moment they were taken — an hour-old set does not describe a foot that is deteriorating now, and a person on antibiotics or steroids can be afebrile with an infected foot. The vital-sign gates are ADULT limits: an adolescent breathing at 22 is inside this catalog's own normal range and outside this rule, so the rule simply does not fire for them, which costs nothing now that it refutes nothing. Recommendation 5 still applies while the imaging is arranged: knee-high immobilisation and offloading, promptly, and not antibiotics.",
    citation: ADA_S12_CHARCOT,
  },
  {
    /**
     * The collapsed Charcot foot that has ulcerated over its own prominence, and
     * the patient this file's header used to describe and then leave with no
     * rule at all.
     *
     * Both rules above make `active_foot_ulcer: absent` a hard requirement,
     * following Recommendation 1's "intact skin". That is the precondition for
     * the CLASSIC presentation, not a criterion for excluding active disease in
     * a foot that has since broken down — and IWGDF's own definition of active
     * CNO has no intact-skin clause in it, while its background describes the
     * ulcerated Charcot foot as carrying a six- to twelve-fold higher risk of
     * major amputation. That foot fired the infection rules, got antibiotics,
     * and received no offloading prompt from anywhere: the `charcot_presentation`
     * danger sign is ulcer-gated too.
     *
     * Keyed on the DEFORMITY rather than on the skin, so it reads the ulcerated
     * and the unulcerated collapsed foot alike — a re-activation happens in both.
     */
    id: "charcot_in_an_ulcerated_foot",
    display:
      "A warm, deformed, neuropathic foot — consider active or re-activated Charcot neuro-osteoarthropathy even though the skin is broken",
    condition: "charcot_neuroarthropathy",
    when: {
      id: "cno_deformed_foot",
      label:
        "Midfoot collapse or a rocker-bottom deformity, or a hindfoot, ankle or bony-prominence deformity, with the foot warmer than the other one, in a patient with neuropathy",
      all: [
        { feature: "foot_temperature_asymmetry", op: "in", value: ["warmer", "markedly_warmer"] },
      ],
      any: [
        { feature: "charcot_foot_deformity", op: "present" },
        {
          feature: "foot_deformity_pattern",
          op: "in",
          value: ["bony_prominence", "hindfoot_or_ankle"],
        },
      ],
      atLeast: { n: 1, of: NEUROPATHY_ANY },
      citation: IWGDF_CHARCOT_DEFORMITY,
    },
    posterior: "moderate",
    urgency: "urgent",
    confirmWith: [
      "charcot_foot_deformity",
      "foot_deformity_pattern",
      "foot_temperature_asymmetry",
      "charcot_duration",
      "charcot_side",
      "active_foot_ulcer",
      "ulcer_depth",
      "foot_probe_to_bone",
      "foot_infection_grade",
      "prior_foot_ulcer",
      "footwear_inspection",
    ],
    mimicsToExclude: [
      "Infection of the ulcer over the prominence, which is commoner than a re-activation and is treated in the opposite direction",
      "Osteomyelitis beneath that ulcer — the bone is already abnormal, so the plain film cannot separate them and this is where the MRI earns its place",
      "A Charcot foot in remission with a pressure ulcer from the deformity, in which the joint is consolidated and the warmth is the wound",
      "A fracture through the deformed foot, which the neuropathy has masked",
      "Gout, or another acute crystal arthritis in a deformed joint",
      "Septic arthritis of the midfoot or ankle",
      "Cellulitis or erysipelas arising above the ankle",
      "A cast or device reaction — a new blister or ulcer from an offloading device is a recognised complication of the treatment itself",
    ],
    notes:
      "IWGDF's Charcot recommendations are scoped to INTACT SKIN and this rule is not, which is stated on its citation rather than glossed. What the guideline says without that scope is the definition — an inflammatory process in a person with diabetes and neuropathy, presumed active as long as there are signs of inflammation — and that deformity from active CNO predisposes to ulceration and infection, with a six- to twelve-fold higher risk of major amputation in those who ulcerate. This catalog therefore RAISES the consideration and deliberately does NOT extend Recommendation 5's prompt-offloading instruction to a broken foot, because the guideline does not state it there. IWGDF also warns that concomitant ulceration or infection limits the usefulness of the foot-temperature comparison this rule is built on, so a foot that is warm because it is infected will fire it. Read it beside the infection rules rather than instead of them; the two coexist, which is the whole reason neither rules the other out.",
    citation: IWGDF_CHARCOT_DEFORMITY,
  },
  {
    /**
     * The picture in a foot whose protective sensation is recorded INTACT.
     *
     * It used to set `rulesOut: ["charcot_neuroarthropathy"]`, and that has been
     * removed. IWGDF defines CNO by NEUROPATHY — "an inflammatory process in
     * persons with diabetes mellitus and neuropathy" — and never by a test
     * result; nowhere does the guideline say an intact monofilament excludes the
     * disease. Reading the absence of a stated precondition as a refutation is
     * denying the antecedent of a "consider" statement, and the substitution is
     * poor on the catalog's own evidence: `monofilament_10g` carries a pooled
     * negative likelihood ratio of 0.53 against nerve conduction studies, and
     * ADA recommendation 12.24 asks for a second modality — pinprick,
     * temperature or vibration — precisely because one negative is not enough.
     * A negative that barely moves the odds cannot carry a `strong` refutation
     * that subtracts from the one condition whose management is the opposite.
     *
     * What survives is the argument in the other direction: with protective
     * sensation intact on both pressure tests, infection is the likelier reading
     * of a hot foot, and that is what the rule now says.
     */
    id: "hot_foot_with_protective_sensation_intact",
    display:
      "A warm, swollen or red foot in someone whose protective sensation is intact — infection is the likelier explanation",
    condition: "diabetic_foot_infection",
    when: {
      id: "hot_foot_no_lops",
      label:
        "The foot warm, swollen or red, with loss of protective sensation recorded ABSENT on both the 10 g monofilament and the Ipswich touch test",
      all: [
        { feature: "lops", op: "==", value: "absent" },
        { feature: "lops_ipswich", op: "==", value: "absent" },
      ],
      any: [
        { feature: "foot_temperature_asymmetry", op: "in", value: ["warmer", "markedly_warmer"] },
        { feature: "charcot_presentation", op: "present" },
        { feature: "foot_finding", op: "==", value: "swelling" },
        { feature: "foot_finding", op: "==", value: "erythema" },
        { feature: "foot_finding", op: "==", value: "warmth" },
      ],
      citation: IWGDF_CHARCOT_DX,
    },
    posterior: "moderate",
    urgency: "same_day",
    confirmWith: [
      "foot_infection_grade",
      "preulcerative_foot_lesions",
      "foot_skin_broken",
      "temperature",
      "pulse",
      "small_fibre_sensation",
      "vibration_128hz",
      "ankle_reflexes",
      "monofilament_10g",
      "ischaemic_foot_signs",
    ],
    mimicsToExclude: [
      "Active Charcot neuro-osteoarthropathy — this rule argues against it and does NOT exclude it; the monofilament and the Ipswich test both examine large-fibre pressure perception and neither sees a small-fibre neuropathy",
      "Gout, which classically inflames a first metatarsophalangeal joint in a foot with entirely normal sensation",
      "Deep vein thrombosis",
      "Trauma, a sprain, or a stress fracture",
      "Septic arthritis",
      "Cellulitis or erysipelas arising above the ankle",
      "An inflammatory arthropathy — reactive, psoriatic or rheumatoid",
      "An insect bite, or a foreign body inside the shoe",
      "Neuroarthropathy of a non-diabetic cause — leprosy, syringomyelia, tabes dorsalis or alcohol-related neuropathy — none of which IWGDF's diabetes-specific statement covers",
    ],
    notes:
      "This argues AGAINST Charcot; it does not exclude it, and since the audit it no longer pretends to. The 10 g monofilament tests large-fibre pressure perception and is insensitive against nerve conduction studies, which is exactly why ADA recommendation 12.24 asks for a second modality — pinprick, temperature or vibration — alongside it. A recorded loss of small-fibre sensation, absent ankle reflexes or a raised vibration threshold should reopen the question, and those three lead the confirmatory set for that reason. One catalog problem travels with the rule: `lops` and `monofilament_10g` are two separate fields recording the SAME monofilament test, they can disagree by construction, and this rule reads only the first — `monofilament_10g` is in the confirmatory set so the disagreement at least becomes visible. The mimic list also ends where the guideline does: IWGDF's statement is about diabetes, and a neuroarthropathy from leprosy, syringomyelia or alcohol is outside both the guideline and this catalog.",
    citation: ADA_S12_EXAM,
  },
];

/* ── Ischaemia ───────────────────────────────────────────────────────────── */

const ISCHAEMIA: DifferentialRule[] = [
  {
    /**
     * PAD Recommendation 12, at the bedside, as a CONJUNCTION.
     *
     * The recommendation reads "In a person with diabetes, PERIPHERAL ARTERY
     * DISEASE, a foot ulcer AND clinical findings of ischaemia" — three separate
     * requirements. This rule used to collapse them into one disjunction, so a
     * neuropathic plantar ulcer with dependent rubor and nothing else raised an
     * urgent vascular referral; IWGDF says in the same guideline that these
     * signs are highly subjective and may be produced by neuropathy alone, and
     * that autonomic neuropathy makes the foot warm. The three branches now
     * mirror the three requirements: the wound in `any`, evidence of PAD in
     * `atLeast`, and the one clinical finding of ischaemia this catalog captures
     * — absent pedal pulses — in `all`.
     *
     * `same_day` rather than `urgent`, and this is where the file's WHO
     * cross-check actually bites. HEARTS-D's urgent list is critical limb
     * ischaemia and gangrene; a foot with absent pulses or suspected lower-limb
     * ischaemia is sent to a higher level of care without that word, and
     * "symptoms and signs of peripheral vascular disease" sit on its NON-
     * emergency list. Recommendation 12 states no clock of its own. The rule
     * below, at an index under 0.4, is the one that reaches `urgent`.
     */
    id: "ischaemic_foot_ulcer",
    display:
      "A foot wound with absent pedal pulses and evidence of peripheral artery disease — consider revascularisation and consult a vascular specialist",
    condition: "peripheral_artery_disease",
    when: {
      id: "pad_ulcer_ischaemia",
      label:
        "A foot ulcer, wound or gangrene, with absent pedal pulses, and with peripheral artery disease confirmed or an ankle-brachial index below 0.9",
      all: [{ feature: "pedal_pulses", op: "==", value: "absent" }],
      any: [
        { feature: "active_foot_ulcer", op: "present" },
        { feature: "foot_ulcer_or_inflammation", op: "present" },
        { feature: "gangrene_type", op: "in", value: ["dry", "wet"] },
      ],
      atLeast: {
        n: 1,
        of: [
          { feature: "pad", op: "==", value: "present" },
          { feature: "abi", op: "<", value: 0.9, unit: "ratio" },
        ],
      },
      citation: IWGDF_PAD_ISCHAEMIA,
    },
    posterior: "moderate",
    urgency: "same_day",
    confirmWith: [
      "abi",
      "pedal_pulses",
      "pad",
      "ischaemic_foot_signs",
      "ulcer_area_cm2",
      "ulcer_depth",
      "foot_ulcer_duration",
      "foot_infection_grade",
      "leg_pain_character",
    ],
    mimicsToExclude: [
      "Venous or mixed leg ulceration, which sits above the malleolus and heals with compression rather than with a bypass",
      "Neuropathic ulceration in a well-perfused foot, where the failure to heal is pressure and not perfusion",
      "An artefactually low ankle-brachial index from a cuff over a dressing, an ulcer or a swollen ankle",
      "Acute limb ischaemia from an embolus or a thrombosis, which is a different emergency on a shorter clock",
      "Oedema or obesity making the pulses impalpable in a limb whose arteries are patent",
      "Sickle-cell leg ulceration",
      "Buerger's disease (thromboangiitis obliterans) in a young person who smokes",
      "Pyoderma gangrenosum, vasculitic ulceration, or a Marjolin's ulcer in a long-standing wound",
    ],
    notes:
      "The bedside examination here is weak and IWGDF says so plainly: pulse palpation in a person who already has a foot ulcer carries a positive likelihood ratio of 1.38 and a negative of 0.75, which is almost no discrimination at all, and clinical examination alone is not sufficient to exclude PAD. That cuts both ways — this rule failing to fire is not reassurance, and there is no value of the index above which PAD can be excluded. Only one of Recommendation 12's four findings of ischaemia is captured here; there is no ankle pressure, no toe pressure and no pedal Doppler waveform. The urgency is WHO's rather than IWGDF's, because IWGDF states none: HEARTS-D reserves its urgent tier for critical limb ischaemia and gangrene, sends a foot with absent pulses or suspected lower-limb ischaemia to a higher level of care without that word, and puts the symptoms and signs of peripheral vascular disease on its non-emergency list. IWGDF also asks that microangiopathy NOT be assumed as the cause of a non-healing ulcer until the large arteries have been properly investigated. And if the wound has not shrunk by about half in four weeks despite good infection control, offloading and wound care, the vascular status is to be reassessed whatever was found today.",
    citation: WHO_HEARTS_D_REFERRAL,
  },
  {
    /**
     * The soft signs, kept — at the weight IWGDF gives them.
     *
     * Cool foot, dependent rubor, elevation pallor, delayed capillary refill and
     * delayed venous filling were until now qualifying alternatives inside the
     * rule above, which let any one of them produce an urgent vascular referral.
     * They belong here instead, at `low`, saying what they honestly say: get a
     * Doppler on this foot. IWGDF's own words are that these examinations are
     * highly subjective, that the findings may also be associated with
     * neuropathy, and that autonomic neuropathy can make the foot warm — so the
     * classic false positive is the neuropathic foot, which is most of this
     * clinic.
     *
     * `hair_loss_atrophic_skin` is deliberately NOT one of the qualifying signs,
     * although the field offers it: it is the one most often produced by
     * something other than ischaemia.
     */
    id: "foot_ulcer_with_bedside_ischaemic_signs",
    display:
      "A foot wound with bedside signs of ischaemia but no confirmed perfusion deficit — measure the ankle-brachial index before calling this neuropathic",
    condition: "peripheral_artery_disease",
    when: {
      id: "pad_bedside_signs",
      label:
        "A foot ulcer, wound or gangrene, with reduced pedal pulses or at least one bedside sign of ischaemia — a cool foot, dependent rubor, elevation pallor, delayed capillary refill or delayed venous filling",
      any: [
        { feature: "active_foot_ulcer", op: "present" },
        { feature: "foot_ulcer_or_inflammation", op: "present" },
        { feature: "gangrene_type", op: "in", value: ["dry", "wet"] },
      ],
      atLeast: {
        n: 1,
        of: [
          { feature: "pedal_pulses", op: "==", value: "reduced" },
          {
            feature: "ischaemic_foot_signs",
            op: "in",
            value: [
              "cool_foot",
              "dependent_rubor",
              "elevation_pallor",
              "delayed_capillary_refill",
              "delayed_venous_filling",
            ],
          },
        ],
      },
      citation: IWGDF_PAD_BEDSIDE,
    },
    posterior: "low",
    urgency: "same_day",
    confirmWith: [
      "abi",
      "pad",
      "pedal_pulses",
      "ischaemic_foot_signs",
      "leg_pain_character",
      "foot_ulcer_duration",
      "ulcer_area_cm2",
      "foot_infection_grade",
    ],
    mimicsToExclude: [
      "Peripheral neuropathy alone, which produces most of these signs by itself — IWGDF says so in the same paragraph that lists them",
      "Autonomic neuropathy, which makes the foot WARM and hides the classic signs rather than producing them",
      "A cold room, or a foot that has been uncovered for the examination",
      "Venous insufficiency, which produces dependent colour change without an arterial deficit",
      "Anaemia or hypovolaemia, which delays capillary refill everywhere",
      "Raynaud's phenomenon, or another vasospastic disorder",
      "Heart failure with a low cardiac output and cool peripheries",
    ],
    notes:
      "`low`, and it should stay low. This rule says a test is outstanding, not that the foot is ischaemic — IWGDF's position is that no single modality diagnoses PAD, that clinical examination alone cannot exclude it, and that these particular signs are subjective and are also produced by neuropathy. Its whole value is `confirmWith`: the ankle-brachial index leads that list because it is the one thing here that would move the question. Where the index cannot be measured at this site the engine will say so rather than nag, and the honest next step is a referral to somewhere it can be.",
    citation: IWGDF_PAD_BEDSIDE,
  },
  {
    /**
     * The threshold at which IWGDF stops saying "consider" and says "urgently".
     * An ankle-brachial index below 0.4 in an ulcerated or gangrenous foot is the
     * Global Vascular Guidelines' severe-ischaemia boundary, quoted by
     * Recommendation 13, and delay past two weeks is associated with limb loss.
     *
     * It now raises `chronic_limb_threatening_ischaemia` rather than the generic
     * `peripheral_artery_disease`. The severity used to live only in this rule's
     * `urgency` because — the old comment said — conditions.ts carried no code
     * for it. It does, and always did; the claim was simply false, and the
     * validator was reporting the condition as unreachable.
     */
    id: "limb_threatening_ischaemia",
    display:
      "Severe ischaemia in a foot with a wound — consult a vascular specialist urgently about revascularisation",
    condition: "chronic_limb_threatening_ischaemia",
    when: {
      id: "pad_severe_ischaemia",
      label: "A foot ulcer, wound or gangrene with an ankle-brachial index below 0.4",
      all: [{ feature: "abi", op: "<", value: 0.4, unit: "ratio" }],
      any: [
        { feature: "active_foot_ulcer", op: "present" },
        { feature: "foot_ulcer_or_inflammation", op: "present" },
        { feature: "gangrene_type", op: "in", value: ["dry", "wet"] },
      ],
      citation: IWGDF_PAD_SEVERE,
    },
    posterior: "high",
    urgency: "urgent",
    confirmWith: [
      "abi",
      "pedal_pulses",
      "ischaemic_foot_signs",
      "pad",
      "foot_infection_grade",
      "gangrene_type",
      "ulcer_depth",
      "ulcer_area_cm2",
      "foot_ulcer_duration",
    ],
    mimicsToExclude: [
      "An artefactually low index — a cuff over a dressing or an ulcer, an oedematous ankle, or a reading taken before the person has rested",
      "Acute limb ischaemia from an embolus or a thrombosis, which presents over hours and needs a vascular surgeon at once rather than a work-up",
      "Severe venous disease or lymphoedema producing a non-healing leg ulcer in a limb with normal arteries",
      "Pressure necrosis from a cast, a dressing or a shoe",
      "Sickle-cell leg ulceration",
      "Aortic dissection, or another proximal cause of a suddenly cold and painful limb",
      "Vasculitis or thromboangiitis obliterans, which the CLTI definition excludes by name",
    ],
    notes:
      "The index is the only one of Recommendation 13's five measures this catalog can reach — there is no ankle pressure, toe pressure, transcutaneous oxygen pressure or pedal Doppler waveform — so severe ischaemia is UNDER-detected here rather than over-detected, and a medially calcified artery, common in diabetes and in kidney disease, pushes the index up: a foot can be severely ischaemic with an index of 1.0. Where infection or gangrene is present alongside the ischaemia, Recommendation 14 asks for the surgical and the vascular opinion together, so that the drainage and the revascularisation are sequenced rather than raced. This rule sits on WHO HEARTS-D's urgent list too, under critical limb ischaemia, which is the one place in this file where the resource-limited guideline and the IWGDF machinery agree on the clock without qualification.",
    citation: IWGDF_PAD_SEVERE,
  },
  {
    /**
     * Chronic limb-threatening ischaemia as the PAD guideline defines it, and
     * the home the dry gangrenous foot never had.
     *
     * Dry gangrene used to enter `foot_infection_with_pad`, which asserted a
     * foot INFECTION at `high` on an ischaemic, mummified, afebrile toe. It is
     * ischaemic necrosis, and the definition it actually satisfies is this one:
     * peripheral artery disease in combination with rest pain, gangrene or a
     * foot ulcer of at least two weeks' duration. Recommendation 14 supplies the
     * clock where there is also infection or gangrene.
     */
    id: "clti_with_gangrene_or_chronic_ulcer",
    display:
      "Gangrene, rest pain or a foot ulcer of two weeks or more in a foot with peripheral artery disease — consider chronic limb-threatening ischaemia and consult a vascular specialist urgently",
    condition: "chronic_limb_threatening_ischaemia",
    when: {
      id: "clti_definition",
      label:
        "Gangrene, pain at rest, or a foot ulcer present for two weeks or longer, in a foot with peripheral artery disease, absent pedal pulses or an ankle-brachial index below 0.9",
      any: [
        { feature: "gangrene_type", op: "in", value: ["dry", "wet"] },
        { feature: "leg_pain_character", op: "==", value: "at_rest" },
        { feature: "foot_ulcer_duration", op: ">=", value: 2, unit: "weeks" },
      ],
      atLeast: {
        n: 1,
        of: [
          { feature: "pad", op: "==", value: "present" },
          { feature: "pedal_pulses", op: "==", value: "absent" },
          { feature: "abi", op: "<", value: 0.9, unit: "ratio" },
        ],
      },
      citation: IWGDF_PAD_CLTI,
    },
    posterior: "moderate",
    urgency: "urgent",
    confirmWith: [
      "abi",
      "pad",
      "pedal_pulses",
      "ischaemic_foot_signs",
      "gangrene_type",
      "leg_pain_character",
      "foot_ulcer_duration",
      "ulcer_area_cm2",
      "ulcer_depth",
      "foot_infection_grade",
    ],
    mimicsToExclude: [
      "Acute limb ischaemia from an embolus or a thrombosis — the definition excludes embolic aetiologies by name, and the clock is hours rather than weeks",
      "Traumatic or non-atherosclerotic arterial injury, also excluded by the definition",
      "Venous ulceration of long standing, which the two-week criterion will otherwise sweep up in a limb whose arteries are patent",
      "Neuropathic ulceration in a well-perfused foot that has simply not been offloaded",
      "Painful diabetic peripheral neuropathy, in which the pain is worse at rest and at night and is NOT ischaemic rest pain relieved by dependency",
      "Spinal stenosis or a radiculopathy producing leg pain that is relieved by sitting rather than by hanging the leg down",
      "Buerger's disease (thromboangiitis obliterans) in a young person who smokes",
      "Frostbite, calciphylaxis or a pressure injury producing necrosis without large-vessel disease",
    ],
    notes:
      "The definition's exclusions cannot be enforced by this catalog — venous, embolic, non-atherosclerotic and traumatic aetiologies are set aside by the clinician, not by any field, so they lead the mimic list instead. Rest pain is the hardest of the three entry findings to trust: painful neuropathy is also worse at rest, and what separates them is that ischaemic rest pain eases when the leg hangs down. Where infection or gangrene sits alongside the ischaemia, Recommendation 14 asks for the vascular opinion and the drainage to be timed together, and Recommendation 20 of the infection guideline asks for both specialists at once. The 0.9 is Recommendation 4's number and marks the range in which PAD is less likely, not a diagnostic cut-point.",
    citation: IWGDF_PAD_CLTI,
  },
];

/**
 * The foot rules, in the order a clinician meets them: the wound, the wound with
 * a fever, the wound in a patient who is shutting down, the wound in a foot with
 * no blood supply, the two findings that need a knife tonight, the wound that has
 * reached bone — then the hot foot that could be either thing — then the foot
 * that is dying for want of perfusion.
 */
export const FOOT_RULES: DifferentialRule[] = [...INFECTION, ...CHARCOT, ...ISCHAEMIA];
