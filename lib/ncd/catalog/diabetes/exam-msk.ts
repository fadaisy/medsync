/**
 * The hand and the shoulder: four cheap signs of long cumulative glycaemic
 * exposure, and nothing else.
 *
 * ── What this segment is for ─────────────────────────────────────────────────
 * `limited_joint_mobility` — the prayer sign, taught as diabetic
 * cheiroarthropathy — already exists in general-exam.ts with its own
 * discriminations, and is NOT redefined here. What sits beneath that heading is
 * this file: the four other things a pair of hands and a shoulder will give up
 * in under a minute, each with a published association and each with a different
 * next step. A stiff hand is not one finding. It is a palmar cord that a hand
 * surgeon divides, a locking digit that a steroid injection frees, a median
 * nerve that a splint or a release rescues, and a shoulder that will take a year
 * whatever anybody does — and telling them apart takes one instruction each.
 *
 * ── Why a musculoskeletal segment in a diabetes catalog at all ───────────────
 * Two reasons, and only two. FIRST, these signs mark exposure, so they are a
 * reason to do the screening that has not been done — the urine ACR, the
 * monofilament — in a patient who came about their hand. SECOND, and the one
 * that actually changes a diagnosis: three of the four are commoner in people
 * with diabetes than in people without, so a frozen shoulder or a trigger finger
 * in somebody NOT known to be diabetic is a reason to check a glucose. Rai and
 * colleagues put 135 people with an idiopathic frozen shoulder through an oral
 * glucose tolerance test and found 27.4% of them diabetic. That is the strongest
 * claim in this file and it is the only one graded above `weak`.
 *
 * ── BOTH GOVERNING GUIDELINES ARE SILENT HERE, AND THAT IS RECORDED ──────────
 * This is the one segment of the examination with no guideline under it, and the
 * divergence is not between ADA and UCG — it is between both of them and the
 * literature.
 *
 *   • ADA Standards of Care 2026 Section 4 was retrieved in full. Its
 *     comorbidities list covers bone health at length — fracture risk (rec 4.8),
 *     individualised targets to reduce falls and fractures (rec 4.11), calcium
 *     and vitamin D (rec 4.12) — and contains no cheiroarthropathy, no
 *     Dupuytren, no frozen shoulder, no trigger finger and no carpal tunnel.
 *     Section 12 is retinopathy, neuropathy and the foot, and names no
 *     entrapment neuropathy.
 *   • Uganda Clinical Guidelines 2023 was downloaded in full (1,161 pages) and
 *     searched. Its chronic-complications list for diabetes is quoted below and
 *     is entirely micro- and macrovascular; the words cheiroarthropathy, prayer
 *     sign, Dupuytren, frozen shoulder, adhesive capsulitis, trigger finger,
 *     carpal tunnel, joint mobility and tenosynovitis appear NOWHERE in the
 *     document.
 *
 * So every discrimination below rests on peer-reviewed primary literature and
 * every elicitation on a tertiary reference work, and each citation says which.
 * A clinician trained on either guideline has been taught none of this, which is
 * the argument for the segment and also the reason its claims are graded low.
 *
 * ── Left out, deliberately ───────────────────────────────────────────────────
 * FRACTURE AND BONE HEALTH. The one musculoskeletal topic ADA does write
 * recommendations about, and it cannot be written here: conditions.ts models no
 * osteoporosis and no fragility fracture, so a bedside finding — height loss, a
 * thoracic kyphosis, a vertebral tenderness — would have nothing to argue for
 * and the validator would rightly reject it. Falls are already captured
 * (`falls_last_year`, in the age-specific segment). Closing this needs a
 * condition entry and a fracture-risk model, neither of which this file owns.
 *
 * GOUT, DIFFUSE IDIOPATHIC SKELETAL HYPEROSTOSIS AND DIABETIC MYONECROSIS. All
 * three appear in the same prevalence surveys the sources below come from. None
 * is in conditions.ts, DISH is a radiological diagnosis rather than a bedside
 * one, and myonecrosis presents as a hot painful thigh whose real differential —
 * deep vein thrombosis, pyomyositis, necrotising fasciitis — lies entirely
 * outside this catalog. Inventing a weak link to a diabetes condition so that
 * they could be listed would be padding. They go in `msk_exam_other`.
 *
 * CHARCOT NEUROARTHROPATHY. A musculoskeletal diagnosis, and the loudest one —
 * but it is a FOOT finding, it is established from the foot examination, and
 * exam-foot.ts owns it end to end. A second home would be a second answer.
 *
 * PROXIMAL WASTING AND DIABETIC AMYOTROPHY. Already reached through
 * `neuropathy_proximal_leg_pain` in the neuropathy segment.
 *
 * ── No urgency, no important negatives, no age bands, and each for a reason ──
 * NO `urgency`. Not one finding here carries a deadline. A fixed Dupuytren
 * contracture is a referral, not an emergency, and attaching a clock to a
 * painless hand sign would spend the alarm this catalog needs for the foot.
 *
 * NO `importantNegative`. Every sign below sits at roughly one in six of an
 * unselected diabetes clinic: Chammas found carpal tunnel syndrome in 15–25% and
 * flexor tenosynovitis in about a fifth, Arkkila found Dupuytren in 14% of type
 * 2 patients, and a 2024 consecutive series of 702 attenders (Edis, Ozdemir and
 * Hekimsoy, Acta Endocrinol (Buchar) 2024;20:136–142, abstract read through
 * Europe PMC and cited nowhere in this file because nothing here rests on it)
 * puts the three at 17.7%, 14.4% and 13.8%. At those frequencies a recorded
 * absence carries almost no information, and writing one would be asserting
 * evidence the numbers do not support.
 *
 * NO `ageBands`. Every source below studied adults, and none establishes an age
 * beneath which these signs do not occur — Arkkila's type 1 cohort had a mean
 * age of 33 with a standard deviation of 10. Banding on that would be a guess
 * that hides a finding from the adolescent who has it.
 *
 * Every citation here is `csoSigned: false`. The segment ships gated dark.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-08";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * The one sentence in a governing guideline that this file's most useful claim
 * rests on. ADA does not name carpal tunnel syndrome — it names the PRINCIPLE,
 * that diabetic neuropathy is what is left when the treatable things have been
 * excluded, and a median nerve trapped at the wrist is exactly such a treatable
 * thing.
 */
const ADA_S12_EXCLUSION: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12 (Diabetic Peripheral Neuropathy)",
  title: "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Diabetic neuropathy is a diagnosis of exclusion. Nondiabetic neuropathies may be present in people with diabetes and may be treatable.",
};

/**
 * The Ugandan text, fetched for what it does NOT contain.
 *
 * Its chronic-complication list is quoted in full below, and it is entirely
 * vascular. A search of the whole retrieved document found none of the terms in
 * this file. That is not a criticism of the guideline — it is written to be
 * carried into a health centre and every page it spends is a page it has to earn
 * — but it means a Ugandan-trained clinician has never been given a reason to
 * press two palms together, and the segment says so rather than presenting these
 * signs as though they were standard teaching here.
 */
const UCG_2023_COMPLICATIONS: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 8.1.3 (p 472)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Chronic complications 1.Microvascular complications: affect the small blood vessels, such as those supplying blood to the eyes and kidneys. The microvascular complications of diabetes are retinopathy, nephropathy and neuropathy. 2. Macrovasculary complications: affect the larger blood vessels, such as those supplying blood to the heart, brain and legs: stroke, heart attack, peripheral artery disease",
  needsCsoInput:
    "CITED FOR AN ABSENCE. The full 1,161-page document was downloaded from the Ministry of Health library and its text searched: cheiroarthropathy, prayer sign, Dupuytren, frozen shoulder, adhesive capsulitis, trigger finger, carpal tunnel, joint mobility and tenosynovitis return NO occurrences anywhere in it, and the quoted chronic-complication list is purely vascular. ADA Standards of Care 2026 Sections 4 and 12 were also retrieved and cover none of these signs either. Nothing clinical is asserted FROM this citation; it exists so that the absence of guideline backing for this whole segment is on the record rather than inferred from silence. CSO to decide whether a segment with no guideline under it should ship at all.",
};

/**
 * The comparative study that establishes these are commoner in diabetes than in
 * the people sitting next to them. Prospective, with a matched control arm,
 * which is why it is the source for every "commoner in diabetes" claim below and
 * why the two prevalence surveys are used only for how common, never for whether.
 */
const CHAMMAS_1995: Citation = {
  standard: "local",
  version: "J Hand Surg Am 1995;20(1):109–114 (doi 10.1016/s0363-5023(05)80068-1, PMID 7722249)",
  title:
    "Chammas M, Bousquet P, Renard E, Poirier JL, Jaffiol C, Allieu Y. Dupuytren's disease, carpal tunnel syndrome, trigger finger, and diabetes mellitus",
  url: "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:7722249&resultType=core&format=json",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "A comparative prospective study of 120 adult diabetics (60 insulin dependent, 60 non-insulin dependent) and 120 non-diabetic adults as controls showed significantly higher incidence of Dupuytren's disease, limited joint motion, carpal tunnel syndrome, and flexor tenosynovitis in the diabetic population. … carpal tunnel syndrome was observed in 15-25%, and flexor tenosynovitis in about a fifth. … All these hand changes were more marked in insulin-dependent diabetics and they showed a positive correlation with increasing age of the patient, duration of the diabetes, and the presence of a microangiopathy.",
  needsCsoInput:
    "A 1995 PRIMARY STUDY, not a guideline, and the ABSTRACT ONLY was retrieved — through the Europe PMC REST record for PMID 7722249, which is the URL given; the human-readable record is at https://europepmc.org/article/MED/7722249 and the full text sits behind the publisher. So the abstract's figures are quoted and nothing beyond them is asserted: no method detail, no confidence interval and no adjustment for confounding was read. The abstract reports a correlation with 'a microangiopathy' as a class WITHOUT saying which, which is why every discrimination drawn from it below is graded weak and says so. CSO to obtain the full text and ratify.",
};

/**
 * The only retrieved source that put its associations through a regression — and
 * the reason this file asserts one Dupuytren claim rather than four. Chi-squared
 * related Dupuytren to retinopathy, neuropathy, limited joint mobility and
 * shoulder capsulitis; adjusting for age and duration removed all of them except
 * macroalbuminuria in type 2. Only the survivor is carried below.
 */
const ARKKILA_1997: Citation = {
  standard: "local",
  version: "J Rheumatol 1997;24(1):153–159 (PMID 9002027)",
  title:
    "Arkkila PE, Kantola IM, Viikari JS. Dupuytren's disease: association with chronic diabetic complications",
  url: "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:9002027&resultType=core&format=json",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The prevalence of Dupuytren's disease was 14% in type II patients … Its presence was significantly related to retinopathy, neuropathy, limited joint mobility, and shoulder capsulitis in type I and to macroalbuminuria in type II patients, by chi-squared test. However, all these associations, except to macroalbuminuria in type II subjects, disappeared when the confounding effect of age and duration of diabetes was controlled by logistic regression analysis.",
  needsCsoInput:
    "A 1997 PRIMARY STUDY, not a guideline, and the ABSTRACT ONLY was retrieved — through the Europe PMC REST record for PMID 9002027, which is the URL given; the human-readable record is at https://europepmc.org/article/MED/9002027. Two consequences are deliberate. (1) The retinopathy and neuropathy associations are NOT written into this catalog, because the study's own regression removed them; carrying an association the authors nullified would be reading a paper backwards. (2) The surviving macroalbuminuria association comes from 139 people with type 2 diabetes at one centre, so it is graded weak. No odds ratio, confidence interval or p-value from this study is asserted anywhere, because none was retrieved. CSO to obtain the full text and ratify.",
};

/**
 * The reason the frozen shoulder is the one finding here graded above `weak`.
 * Everyone in this study had an idiopathic frozen shoulder and was otherwise
 * well; a formal oral glucose tolerance test then found more than a quarter of
 * them diabetic. The paper's own conclusion is a screening recommendation, which
 * is precisely the action the discrimination below produces.
 */
const RAI_2019_CAPSULITIS: Citation = {
  standard: "local",
  version: "J Family Med Prim Care 2019;8(9):2927–2932 (doi 10.4103/jfmpc.jfmpc_244_19)",
  title:
    "Rai SK, Kashid M, Chakrabarty B, Upreti V, Shaki O. Is it necessary to screen patient with adhesive capsulitis of shoulder for diabetes mellitus?",
  url: "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TITLE%3A%22Is%20it%20necessary%20to%20screen%20patient%20with%20adhesive%20capsulitis%22&resultType=core&format=json",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "135 patients as participated and completed the test. 21 (15.5%) patients with idiopathic adhesive capsulitis of shoulder were found to be prediabetic, and 37 (27.4%) patients were found to be diabetic. … Based on our study, we can recommend that patients with features of idiopathic adhesive capsulitis of shoulder should be screened at least for fasting and post prandial blood sugar so that diabetes can be detected early.",
  needsCsoInput:
    "A PRIMARY STUDY, not a guideline, and the ABSTRACT ONLY was retrieved — through the Europe PMC REST record, which is the URL given; the full text is at https://pmc.ncbi.nlm.nih.gov/articles/PMC6820405/ but that address returned a CAPTCHA page on direct fetch and was NOT read. Three limits are therefore explicit: the study has no control arm, it recruited from an orthopaedic outpatient clinic between the ages of 30 and 65 so the yield in an unselected population will be lower, and 31 of the 135 had a family history of diabetes. The prevalence figures the same abstract quotes for adhesive capsulitis in diabetes (10–22% versus 2–4%) are attributed there to other work and are NOT asserted anywhere in this catalog. CSO to obtain the full text and ratify the `moderate` grading.",
};

/**
 * The four tertiary chapters that supply the ELICITATIONS. Each is cited for how
 * to perform and read one examination, never for a threshold, a frequency or an
 * association that drives anything — those come from the primary studies above.
 * A bedside instruction has to be right and reproducible; it does not have to
 * come from a society, and no society publishes one for these.
 */
const DUPUYTREN_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Dupuytren Contracture, NBK526074",
  title: "Walthall J, Anand P, Rehman UH. Dupuytren Contracture — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK526074/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Dupuytren disease starts as a palpable nodule in the palm, usually at the distal palmar crease. … The 4th digit is most often affected, followed by the 5th digit. … The tabletop test (Hueston) is performed by having the patient attempt to place the palm flat on the exam table. If there is any flexion contracture deformity, the patient cannot straighten the fingers, resulting in a positive test. … It is associated with diabetes, seizure disorders, smoking, alcoholism, HIV, and vascular disease.",
  needsCsoInput:
    "A tertiary reference work, not a guideline. Cited for the description of the sign and for the Hueston tabletop test; the association with diabetes it names is corroborated by Chammas 1995, which is the source the discrimination actually rests on. No prevalence or outcome figure from this chapter is asserted. CSO to ratify.",
};

const CAPSULITIS_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Adhesive Capsulitis (Frozen Shoulder), NBK532955",
  title:
    "Li D, St Angelo JM, Taqi M. Adhesive Capsulitis (Frozen Shoulder) — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK532955/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "A key clinical sign is the marked reduction in both active and passive range of motion. This includes difficulty with flexion, abduction, external rotation, and internal rotation. … Individuals with autoimmune and endocrine comorbidities, such as thyroid disorders and diabetes mellitus, are more prone to developing adhesive capsulitis. … Individuals with comorbid conditions such as diabetes mellitus or thyroid dysfunction commonly have longer and more severe courses of adhesive capsulitis and have a less favorable prognosis.",
  needsCsoInput:
    "A tertiary reference work, not a guideline. Cited for the examination — that the restriction is PASSIVE as well as active, which is what separates it from a painful rotator cuff — and for the worse course in diabetes. The quantitative claim about undiagnosed diabetes rests on Rai 2019, not on this chapter. CSO to ratify.",
};

const TRIGGER_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Trigger Finger, NBK459310",
  title: "Jeanmonod R, Tiwari V, Waseem M. Trigger Finger — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK459310/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "A tender nodule or swelling at the distal palmar crease may be observed. The affected digit might be flexed and locked, and attempts to move it can cause pain and/or snapping. … The etiology of trigger finger is multifaceted and can be associated with specific comorbid diseases, such as diabetes, amyloidosis, carpal tunnel syndrome, gout, thyroid disease, and rheumatoid arthritis, in adults. … Individuals with diabetes typically exhibit a less favorable response to corticosteroids and may often require surgery.",
  needsCsoInput:
    "A tertiary reference work, not a guideline. Cited for the examination and for the poorer steroid response in diabetes, which is why the finding is worth recording rather than merely noticing. Treatment is named only as the chapter names it; this catalog prescribes nothing. CSO to ratify.",
};

const CTS_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Carpal Tunnel Syndrome, NBK448179",
  title: "Sevy JO, Sina RE, Varacallo MA. Carpal Tunnel Syndrome — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK448179/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Numbness, tingling, and pain in the thumb and second, third, and radial portions of the fourth digits, which tend to worsen at night. … The most dependable provocative maneuver, known as the carpal compression test, involves applying steady pressure directly over the carpal tunnel for 30 seconds. … The Phalen test, also known as the reverse prayer, involves instructing the patient to fully flex their wrists by placing the dorsal surfaces of both hands together. … In the Tinel test, a healthcare professional taps directly over the carpal tunnel to elicit a response from the median nerve.",
  needsCsoInput:
    "A tertiary reference work, not a guideline. Cited for the median sensory distribution, for the three provocative manoeuvres and for thenar atrophy as the sign of chronic compression. The chapter's own statement of the sensitivity and specificity of these manoeuvres was NOT retrieved and no such figure is asserted here — which is why the finding carries a qualitative tier and no likelihood ratio. CSO to ratify.",
};

/* ── Builders ────────────────────────────────────────────────────────────── */

const EX = "examination";

/** A musculoskeletal finding, in the examination's musculoskeletal segment. */
const msk = (f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "sign",
  section: EX,
  group: "msk",
});

/** Characterises the finding above it; only asked once that is present. */
const prop = (parent: string, f: Omit<Feature, "section" | "kind" | "parent">): Feature => ({
  ...f,
  kind: "sign",
  section: EX,
  parent,
});

export const MSK_FEATURES: Feature[] = [
  msk({
    /**
     * The palm, felt rather than looked at. It is the one sign in this file with
     * an association that survived adjustment for age and duration of diabetes,
     * and it is also the one most often mistaken for the prayer sign — a stiff
     * hand with a palpable cord is Dupuytren, a stiff hand with waxy skin and no
     * cord is cheiroarthropathy, and the palm under a thumb tells them apart.
     *
     * ONE discrimination, not four, and that is the point of citing Arkkila.
     * Chi-squared in that study related Dupuytren to retinopathy, to neuropathy,
     * to limited joint mobility and to shoulder capsulitis; the authors then
     * controlled for age and duration and every one of those disappeared except
     * macroalbuminuria in type 2. Writing the nullified associations into a
     * catalog because they read well would be quoting a paper against itself.
     */
    code: "dupuytren_contracture",
    display: "Dupuytren contracture — palmar nodule or cord",
    valueType: "boolean",
    citation: DUPUYTREN_STATPEARLS,
    synonyms: [
      "Dupuytren disease",
      "Dupuytren's contracture",
      "Palmar fibromatosis",
      "Viking disease",
      "Palmar cord",
    ],
    elicitation:
      "Turn both palms up and run your thumb firmly across the distal palmar crease, from the " +
      "ring ray towards the little finger — the two most often affected, in that order. You are " +
      "feeling for a firm nodule tethered to the skin, or a cord running up towards a finger; " +
      "look for skin pitting or puckering over it. Then ask the patient to straighten the " +
      "fingers fully. Record this if a nodule or cord is palpable, whether or not any finger is " +
      "yet held bent. It is painless, so nobody volunteers it.",
    discriminates: [
      {
        condition: "diabetic_kidney_disease",
        direction: "supports",
        strength: "weak",
        rationale:
          "Of the associations Arkkila and colleagues tested, macroalbuminuria in type 2 " +
          "diabetes is the only one that survived adjustment for age and duration of diabetes " +
          "— the others were explained by time alone. Weak because that is one cross-sectional " +
          "finding in 139 people at a single centre in 1997, with no effect size retrieved. " +
          "What it should produce is not a diagnosis but the urine ACR that was never sent.",
        citation: ARKKILA_1997,
      },
    ],
  }),

  prop("dupuytren_contracture", {
    /**
     * The one distinction that changes what happens next, and it takes a table.
     * A nodule or a cord with a hand that still lies flat is watched; a hand that
     * will not lie flat is a fixed flexion deformity and the referral a hand
     * surgeon actually wants. A property rather than a finding because it
     * characterises the cord above it and asserts nothing on its own — which is
     * also why it carries no `discriminates`.
     */
    code: "dupuytren_tabletop_test",
    display: "Tabletop test — will the palm lie flat?",
    valueType: "single_select",
    options: [
      { value: "flat", display: "Palm lies flat — nodule or cord, no fixed contracture" },
      { value: "positive", display: "Palm will not lie flat — fixed flexion contracture" },
    ],
    citation: DUPUYTREN_STATPEARLS,
    synonyms: ["Hueston tabletop test", "Hueston test", "Table-top test"],
    elicitation:
      "Ask the patient to place the affected hand palm down and flat on the table, fingers " +
      "extended. If any finger cannot be straightened onto the surface the test is positive. " +
      "Do not press the finger down for them — a contracture that yields to your hand is not " +
      "the finding.",
  }),

  msk({
    /**
     * A digit that catches, clicks or locks. Cheap, treatable, and commoner in
     * diabetes than in the person next to them — which is the whole of its
     * claim, and the claim is deliberately about diabetes rather than about a
     * complication.
     *
     * The condition named is `type_2_diabetes` and the rationale says why that
     * is a choice rather than a finding: Chammas found flexor tenosynovitis
     * raised in insulin-dependent and non-insulin-dependent patients alike, so
     * the sign does not know which type it is looking at. Listing both codes
     * would let it appear to discriminate a type it cannot; listing the one an
     * undiagnosed adult in this clinic will actually turn out to have keeps the
     * action — check a glucose — honest.
     */
    code: "trigger_finger",
    display: "Trigger finger — stenosing flexor tenosynovitis",
    valueType: "boolean",
    citation: TRIGGER_STATPEARLS,
    synonyms: [
      "Stenosing tenosynovitis",
      "Flexor tenosynovitis",
      "Trigger digit",
      "Snapping finger",
      "Locked finger",
    ],
    elicitation:
      "Palpate the distal palmar crease at the base of each digit for a tender nodule over the " +
      "A1 pulley, then ask the patient to make a full fist and open it slowly several times. " +
      "Record this if a digit catches, snaps or locks in flexion on the way out, or if it has " +
      "to be prised straight with the other hand. Ask about the morning specifically — the " +
      "triggering is often worst on waking and gone by the time of the clinic.",
    discriminates: [
      {
        condition: "type_2_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "In a prospective study with a matched non-diabetic control arm, flexor " +
          "tenosynovitis was significantly commoner in the diabetic group, at about one in " +
          "five. In somebody not known to have diabetes that makes a locking finger a reason " +
          "to check a glucose, and no more than that. The study found the excess in " +
          "insulin-dependent and non-insulin-dependent patients alike, so the sign cannot " +
          "tell the two apart; type 2 is named because that is what an undiagnosed adult in " +
          "this clinic is most likely to have, not because the finding distinguishes it.",
        citation: CHAMMAS_1995,
      },
    ],
  }),

  msk({
    /**
     * The most disabling of the four, the slowest to resolve, and the one with
     * the strongest claim in this file. It is also the one most often given the
     * wrong name: a painful arc with preserved passive movement is a rotator
     * cuff, and only a shoulder that will not rotate outwards even when somebody
     * else does the rotating is a capsule. That distinction is the elicitation.
     *
     * `moderate` rather than `weak`, and the only grading above weak here. Rai
     * and colleagues gave 135 people with an idiopathic frozen shoulder a formal
     * oral glucose tolerance test and 27.4% of them proved diabetic; the paper's
     * own conclusion is that this group should be screened. That is a bigger
     * claim than an association in a clinic population, and it produces exactly
     * the action this layer exists to produce.
     */
    code: "adhesive_capsulitis",
    display: "Adhesive capsulitis — restricted passive external rotation",
    valueType: "boolean",
    citation: CAPSULITIS_STATPEARLS,
    synonyms: [
      "Frozen shoulder",
      "Periarthritis of the shoulder",
      "Diabetic stiff shoulder",
      "Capsulitis",
    ],
    elicitation:
      "Test PASSIVE movement, with the patient relaxed and you moving the arm. Steady the " +
      "shoulder, tuck the elbow against the side flexed to a right angle, and rotate the " +
      "forearm outwards; compare the two sides. Marked loss of external rotation that persists " +
      "when you are the one moving the arm is the finding, and it is what separates a frozen " +
      "shoulder from a painful rotator cuff, which the patient guards against but which moves " +
      "when they stop trying. Abduction and internal rotation are usually restricted too.",
    discriminates: [
      {
        condition: "type_2_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Of 135 otherwise well people presenting with an idiopathic frozen shoulder and " +
          "given a formal oral glucose tolerance test, 27.4% were diabetic and a further 15.5% " +
          "prediabetic, and the authors conclude that this group should be screened. A frozen " +
          "shoulder in somebody with no diagnosis is therefore a reason to test, not a " +
          "curiosity. Moderate and not stronger: the study had no control arm, recruited from " +
          "an orthopaedic clinic, and nearly a quarter of its patients had a family history.",
        citation: RAI_2019_CAPSULITIS,
      },
    ],
  }),

  msk({
    /**
     * The finding that argues in two directions, which is why it is the most
     * useful thing in this file.
     *
     * A person with diabetes and numb hands is routinely told it is their
     * neuropathy. ADA's own position is that diabetic neuropathy is what remains
     * once the treatable causes are excluded, and a median nerve trapped at the
     * wrist is a treatable cause that a splint, an injection or a release fixes.
     * So the same finding raises diabetes — it is commoner in this population —
     * while arguing against blaming THIS hand on the polyneuropathy.
     *
     * The refuting claim is `weak` on purpose and the rationale says why: carpal
     * tunnel syndrome and distal symmetric polyneuropathy travel together in
     * diabetes constantly, so finding one is no reason to stop looking for the
     * other. What it refutes is the ATTRIBUTION, not the disease — and the foot
     * examination, not the hand, is what settles the polyneuropathy.
     */
    code: "carpal_tunnel_signs",
    display: "Median nerve entrapment at the wrist — carpal tunnel signs",
    valueType: "boolean",
    citation: CTS_STATPEARLS,
    synonyms: [
      "Carpal tunnel syndrome",
      "CTS",
      "Median nerve compression",
      "Phalen sign",
      "Tinel sign",
      "Durkan carpal compression test",
    ],
    elicitation:
      "First map the numbness: the median territory is the thumb, index and middle fingers and " +
      "the thumb side of the ring finger, and it characteristically wakes the patient at " +
      "night. Then apply steady pressure with both thumbs directly over the carpal tunnel for " +
      "30 seconds and ask what the patient feels; this compression test is the most dependable " +
      "of the three. Phalen's — the backs of both hands pressed together with the wrists fully " +
      "flexed for a minute — and tapping over the tunnel for Tinel's are the others. Record " +
      "this if symptoms in the median distribution are reproduced.",
    discriminates: [
      {
        condition: "diabetic_peripheral_neuropathy",
        direction: "refutes",
        strength: "weak",
        rationale:
          "ADA states plainly that diabetic neuropathy is a diagnosis of exclusion and that " +
          "non-diabetic neuropathies occur in people with diabetes and may be treatable. " +
          "Symptoms confined to the median territory and reproduced by compressing the carpal " +
          "tunnel are an entrapment, not the length-dependent stocking pattern of a diabetic " +
          "polyneuropathy, and treating them as the latter loses a nerve that could have been " +
          "released. Weak, and the weakness is the safety property: the two co-exist " +
          "constantly, so this argues against the EXPLANATION for this hand and never against " +
          "the polyneuropathy itself — which is settled at the feet, not here.",
        citation: ADA_S12_EXCLUSION,
      },
      {
        condition: "type_2_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "Carpal tunnel syndrome was significantly commoner in the diabetic arm of a " +
          "controlled prospective study than in matched controls, at 15–25%. In an " +
          "undiagnosed patient that is a reason to check a glucose alongside treating the " +
          "wrist; it is far too common in the general population to be more than that.",
        citation: CHAMMAS_1995,
      },
    ],
  }),

  prop("carpal_tunnel_signs", {
    /**
     * Wasting is not a worse version of the same finding — it is a different
     * decision. A provocative test reproduces symptoms; a hollow thenar eminence
     * means the motor fibres have already been compressed long enough to lose
     * muscle, and that is the point at which splinting stops being the answer.
     * Recorded separately so the surface can show the two apart, and carrying no
     * `discriminates` because it characterises the entrapment above it.
     */
    code: "carpal_tunnel_thenar_wasting",
    display: "Thenar wasting",
    valueType: "boolean",
    citation: CTS_STATPEARLS,
    synonyms: ["Thenar atrophy", "Wasting of abductor pollicis brevis", "Ape hand"],
    elicitation:
      "Hold both hands palm up side by side and look across the muscle bulk at the base of the " +
      "thumb from the side, not from above — a hollow on one side is easy to miss face on. " +
      "Then ask the patient to point the thumb straight up towards the ceiling against your " +
      "finger and compare the strength of the two. Wasting or weakness means chronic motor " +
      "compression, not a stiff wrist.",
  }),

  {
    /**
     * Off-protocol. Recorded, never reasoned over — and the honest home for the
     * musculoskeletal conditions of diabetes this catalog deliberately does not
     * model: gout, diffuse idiopathic skeletal hyperostosis, diabetic
     * myonecrosis, and the fragility fracture ADA writes recommendations about
     * but conditions.ts has no entry for.
     */
    code: "msk_exam_other",
    display: "Add a musculoskeletal finding the list does not cover",
    kind: "sign",
    valueType: "text_list",
    section: EX,
    group: "msk",
    offProtocol: true,
    citation: UCG_2023_COMPLICATIONS,
  },
];
