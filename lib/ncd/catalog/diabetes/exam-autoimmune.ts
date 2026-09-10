/**
 * The autoimmune company type 1 diabetes keeps — the thyroid, the gut and the
 * adrenal, read off the face, the neck, the mouth and the skin.
 *
 * ── What every finding here is for ───────────────────────────────────────────
 * Two jobs, and most of these do both. Each one argues that the diabetes in
 * front of you is TYPE 1 rather than type 2 — the question a clinic with no
 * C-peptide and no islet antibodies has to answer off a body — and each one
 * names a SECOND disease that is, right now, being managed as bad diabetes
 * control. ADA makes the first job explicit in its AABBCC tool, whose first A is
 * autoimmunity: "personal or family history of autoimmune disease or
 * polyglandular autoimmune syndromes". ADA also says, in the same sentence, that
 * the tool has never been prospectively validated. That is why nothing below
 * argues for type 1 harder than `moderate`, and why the corresponding argument
 * against type 2 is `weak` everywhere it appears: a person with type 2 diabetes
 * may have Hashimoto's thyroiditis or vitiligo like anybody else, and a catalog
 * that forgot this would reclassify them on a pale patch.
 *
 * ── What is here ─────────────────────────────────────────────────────────────
 * Thyroid, in the head-and-neck region: the eye signs, the peripheral signs of
 * thyrotoxicosis, and the hypothyroid face. Skin: vitiligo, Addisonian
 * hyperpigmentation with the sites it is actually found in, and dermatitis
 * herpetiformis. The mouth carries the one coeliac finding a clinician can see
 * without a serology form — recurrent aphthous ulceration.
 *
 * One local mimic is carried with them. A depigmented patch in Uganda is a
 * leprosy question until somebody touches it — UCG diagnoses leprosy on a
 * hypopigmented patch with definite loss of sensation, and lists early vitiligo
 * in that chapter's own differential — so the sensation in the patch is a
 * recorded answer here rather than a sentence somebody may or may not read.
 *
 * The tremor and the sweat are hand-and-skin findings filed with the THYROID
 * rather than with the hands, and that is deliberate: they answer one question —
 * what state is the gland in — and splitting that question across two regions of
 * the examination would have the examiner answer it twice, with two answers free
 * to disagree.
 *
 * ── Not here, and why ────────────────────────────────────────────────────────
 * `goitre` and `goitre_character` are NOT redefined. The neck is palpated once,
 * in general-exam.ts, where the ADA/UCG divergence over what a lump in a Ugandan
 * neck means is already recorded; a second thyroid swelling field would be a
 * second answer to the same question. Everything below is what that palpation
 * cannot tell you: whether the gland is over- or under-working, and what else
 * has come with it.
 *
 * Also left out, each for a reason:
 *
 *   • ALOPECIA AREATA. ISPAD's own table gives it "clinical diagnosis" and
 *     "symptom related" screening, and it argues at best weakly for type 1 —
 *     while in this population non-scarring patchy hair loss is far more often
 *     tinea capitis or traction alopecia. Nothing follows from finding it that
 *     does not already follow from vitiligo, which is better evidenced.
 *   • PRETIBIAL MYXOEDEMA AND THYROID ACROPACHY. Rare, and by the time either is
 *     visible the eye signs and the goitre have long since been found. A field
 *     that only ever confirms a diagnosis already made is documentation.
 *   • THE ABDOMEN OF COELIAC DISEASE — distension, wasting, the pale stool. The
 *     abdominal examination is its own segment and its own author's; splitting
 *     abdominal distension across two files would give it two homes and no
 *     owner. `nutritional_wasting` and `pallor` likewise already exist in the
 *     general survey and are not repeated here as coeliac findings.
 *   • THE SLOW-RELAXING ANKLE JERK. Taught everywhere as the hypothyroid sign
 *     and stated by NONE of the guidelines retrieved for this build, so it is
 *     not offered as an option below. `ankle_reflexes` in the neuropathy segment
 *     already records whether the jerk is there; the relaxation phase is a
 *     different observation and would need a source before it could be asked
 *     for.
 *   • A TSH, A tTG-IgA, A 21-HYDROXYLASE ANTIBODY. Every finding here ends in a
 *     blood test, and none of those tests is modelled as a feature yet. That is
 *     an honest gap and it is named rather than papered over with a bedside
 *     field pretending to answer the same question.
 *
 * ── Why the detail lives in a property, not in the finding ───────────────────
 * Each finding below is a BOOLEAN with a multi-select property hanging off it,
 * rather than one multi-select carrying a "None of these" option. The reason is
 * mechanical and worth writing down: the ranker reads a recorded multi-select as
 * PRESENT whenever the list is non-empty, so a ticked "None of these" would
 * argue FOR the very thing the examiner was recording the absence of. A boolean
 * false cannot misfire that way, which is what makes the two important negatives
 * in this file safe to carry at all.
 *
 * ── Where ADA and the Ugandan guidelines diverge, and both are recorded ──────
 *   1. THE THYROID. ADA rec 4.6 screens EVERY person with type 1 diabetes for
 *      autoimmune thyroid disease, and states that routine screening for thyroid
 *      dysfunction is recommended for all of them because primary hypothyroidism
 *      is prevalent, insidious and non-specific. Uganda Clinical Guidelines 2023
 *      approach the thyroid from the other end: §§8.1.5–8.1.7 are symptom-driven
 *      entries — a visible swelling, a weight loss, a slow pulse — that never
 *      mention diabetes at all, and the UCG diabetes chapter (§8.1.3) asks for
 *      no thyroid test. So on this catalog's own local guideline, a person with
 *      type 1 diabetes is screened for thyroid disease only if they LOOK
 *      thyroidal, which is precisely what these three findings are for.
 *   2. COELIAC DISEASE. ADA rec 4.7 and ISPAD both ask for it. The retrieved
 *      full text of UCG 2023 was searched for "coeliac", "celiac" and "gluten"
 *      and contains none of them: there is no Ugandan entry for the disease, no
 *      local pathway, and in many sites no serology to send. Both coeliac
 *      findings below are therefore ADA/ISPAD content in a Ugandan catalog, and
 *      say so in `needsCsoInput` rather than borrowing an authority that has not
 *      spoken.
 *   3. ADDISON DISEASE. ADA and ISPAD frame it as autoimmune, arriving with
 *      type 1 diabetes and thyroid disease as polyglandular syndrome type 2.
 *      UCG §8.1.1 puts ABRUPT CESSATION OF STEROID TREATMENT first among the
 *      causes, then autoimmune destruction, then TB of the adrenals and
 *      HIV/AIDS — and lists diabetes mellitus in its differential diagnosis.
 *      Both readings are carried on the pigmentation finding, and the difference
 *      is not academic: the commonest cause UCG names produces NO pigmentation
 *      at all, which is exactly what the important negative below is about.
 *
 * ── Age bands ────────────────────────────────────────────────────────────────
 * `ageBands` is set on NOTHING here, deliberately. ISPAD's evidence is
 * adolescent and ADA's is adult, the two agree on what the findings are, and
 * every one of them is looked for identically at 15, at 40 and at 80. A band
 * declared without cause hides a finding from everyone outside it (ADR 0083).
 *
 * ── Urgency ──────────────────────────────────────────────────────────────────
 * ONE finding carries it, and one carries a danger sign: Addisonian
 * hyperpigmentation, which is the only thing in this file that can kill this
 * week. The thyroid and the gut are measured in months. A segment that shouted
 * about all seven would be ignored about the one.
 *
 * Every citation here is `csoSigned: false`. The segment ships gated dark.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-08";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * The recommendations that make any of this a diabetes examination rather than a
 * general-medical one: ADA screens type 1 diabetes for thyroid disease and for
 * coeliac disease by name, and names the rest of the company the disease keeps.
 */
const ADA_S4_AUTOIMMUNE: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 4, recs 4.6 and 4.7 (Autoimmune Diseases)",
  title:
    "4. Comprehensive Medical Evaluation and Assessment of Comorbidities — Autoimmune Diseases",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690184/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "4.6 Screen people with type 1 diabetes for autoimmune thyroid disease soon after diagnosis and thereafter at repeated intervals if clinically indicated. B 4.7 Adults with type 1 diabetes should be screened for celiac disease in the presence of gastrointestinal symptoms, signs, laboratory manifestations, or clinical suspicion suggestive of celiac disease. B … Other autoimmune conditions associated with type 1 diabetes include autoimmune liver disease, primary adrenal insufficiency (Addison disease), vitiligo, collagen vascular diseases, and myasthenia gravis … Given the high prevalence, nonspecific symptoms, and insidious onset of primary hypothyroidism, routine screening for thyroid dysfunction is recommended for all people with type 1 diabetes.",
};

/**
 * THE SENTENCE THIS WHOLE FILE TURNS ON, and the caveat attached to it by ADA
 * itself. Autoimmunity is one of the six letters ADA offers for telling type 1
 * from type 2 without a laboratory — and the tool is explicitly unvalidated,
 * which is the ceiling on every type-1 claim below.
 */
const ADA_S2_AABBCC: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2 (Type 1 Diabetes; the AABBCC approach)",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "People with type 1 diabetes are also prone to other autoimmune disorders, such as Hashimoto thyroiditis, Graves disease, celiac disease, Addison disease, vitiligo, autoimmune hepatitis, myasthenia gravis, and pernicious anemia … Although not prospectively validated, the AABBCC approach is a useful tool to help distinguish type 1 from type 2 diabetes: Age (e.g., for individuals <35 years old, consider type 1 diabetes); Autoimmunity (e.g., personal or family history of autoimmune disease or polyglandular autoimmune syndromes); Body habitus (e.g., BMI <25 kg/m2) …",
};

/**
 * The paediatric-and-adolescent consensus, and the only retrieved guideline that
 * writes these associations up as CLINICAL PICTURES rather than as a list of
 * diagnoses. Its thyroid features are what the two thyroid findings below are
 * built from.
 */
const ISPAD_2022_THYROID: Citation = {
  standard: "local",
  version: "ISPAD Clinical Practice Consensus Guidelines 2022, Chapter 19, §§4.1–4.2",
  title:
    "Fröhlich-Reiterer E, Elbarbary NS, Simmons K, et al. Other complications and associated conditions in children and adolescents with type 1 diabetes — ISPAD Clinical Practice Consensus Guidelines 2022",
  url: "https://www.ispad.org/resource/chapter-19-other-complications.html",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Clinical features of hypothyroidism include the presence of a painless goiter, decreased linear growth, fatigue, cold intolerance, bradycardia and weight gain. Glycemic management may not be significantly affected, but hypoglycemia has been linked to hypothyroidism. … Hyperthyroidism is characterized by weight loss, increase in appetite, palpitations, tachycardia, tremors, hyperactivity, difficulty concentrating, heat intolerance and thyroid enlargement. Characteristic eye findings such as exophthalmos and lid lag may or may not be present in children but are often milder than in adults.",
  needsCsoInput:
    "ISPAD is a specialist society and is NOT one of the enumerated standard bodies, hence `local`. The chapter covers children and young people; only its clinical descriptions are used here, and they are used unbanded because ADA and UCG describe the same signs in adults. The PDF (2022 CG Ch_19_-_Other_complications.pdf) was retrieved from the ISPAD resource page given above. No prevalence figure, screening interval or antibody threshold from the chapter is asserted on any feature in this file. CSO to ratify, and to decide whether a paediatric consensus should be shown to a clinic seeing adults.",
};

/**
 * The same chapter on the adrenal, and the one sentence in any retrieved source
 * that names the bedside picture whole — the lows, the falling insulin
 * requirement and the pigment together, which is how this diagnosis is actually
 * made before the crisis rather than during it.
 */
const ISPAD_2022_ADDISON: Citation = {
  standard: "local",
  version: "ISPAD Clinical Practice Consensus Guidelines 2022, Chapter 19, §§4.4 and 4.7",
  title:
    "Fröhlich-Reiterer E, Elbarbary NS, Simmons K, et al. Other complications and associated conditions in children and adolescents with type 1 diabetes — ISPAD Clinical Practice Consensus Guidelines 2022",
  url: "https://www.ispad.org/resource/chapter-19-other-complications.html",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Addison's disease is suspected by the clinical picture of frequent hypoglycemia, unexplained decrease in insulin requirements, increased skin pigmentation, lassitude, weight loss, hyponatremia and hyperkalemia as well as severe or recurrent infections. … Treatment is urgent and lifelong … APS-2 … is defined by the combination of at least two of three diseases in the same individual: autoimmune adrenal insufficiency, T1D, and autoimmune thyroid disease.",
  needsCsoInput:
    "ISPAD is not one of the enumerated standard bodies, hence `local`. Cited for the clinical picture and for the definition of polyglandular autoimmune syndrome type 2; the 100-fold genetic risk figure and the mortality figure the chapter also carries are deliberately NOT asserted anywhere here. CSO to ratify.",
};

/**
 * And on coeliac disease — including the sentence that stops the two coeliac
 * findings below over-reaching. Most of this disease has no signs at all.
 */
const ISPAD_2022_COELIAC: Citation = {
  standard: "local",
  version:
    "ISPAD Clinical Practice Consensus Guidelines 2022, Chapter 19, §3 and executive summary",
  title:
    "Fröhlich-Reiterer E, Elbarbary NS, Simmons K, et al. Other complications and associated conditions in children and adolescents with type 1 diabetes — ISPAD Clinical Practice Consensus Guidelines 2022",
  url: "https://www.ispad.org/resource/chapter-19-other-complications.html",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "CD may present with varied clinical signs and symptoms that may be gastrointestinal (diarrhea, nausea, abdominal pain), extra intestinal (unexplained weight loss, iron deficiency anemia, decreased bone mineralization, aphthous stomatitis) or diabetes-related (unexplained hypoglycemia). The process of active case finding on the basis of symptoms can be challenging as CD is frequently asymptomatic in children and young adults with T1D. B … CD is often asymptomatic; i.e., not associated with gastrointestinal symptoms, poor growth and/or deterioration in glycemic status or hypoglycemia.",
  needsCsoInput:
    "ISPAD is not one of the enumerated standard bodies, hence `local`. Uganda Clinical Guidelines 2023 contain NO coeliac disease entry — the retrieved full text was searched for 'coeliac', 'celiac' and 'gluten' and returned nothing — so the two coeliac findings in this file rest on ADA rec 4.7 and on this chapter, with no local pathway behind them and, at many sites, no serology to send. CSO to decide whether they should be shown at all where tissue transglutaminase antibodies cannot be obtained.",
};

/** The same chapter on vitiligo, and the prevalence contrast that earns it a place. */
const ISPAD_2022_VITILIGO: Citation = {
  standard: "local",
  version: "ISPAD Clinical Practice Consensus Guidelines 2022, Chapter 19, §5.2.2 and Table 1",
  title:
    "Fröhlich-Reiterer E, Elbarbary NS, Simmons K, et al. Other complications and associated conditions in children and adolescents with type 1 diabetes — ISPAD Clinical Practice Consensus Guidelines 2022",
  url: "https://www.ispad.org/resource/chapter-19-other-complications.html",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Vitiligo vulgaris, or skin depigmentation, occurs more commonly in T1D; 1% to 7% of all individuals with diabetes have vitiligo compared to 0.2% to 1% of the general population. … Vitiligo — Sharply delineated skin depigmentation, affecting extremities, face, and neck and trunk … The co-occurrence of vitiligo and other autoimmune conditions should raise the diagnostic consideration of APS",
  needsCsoInput:
    "ISPAD is not one of the enumerated standard bodies, hence `local`. The 1–7% versus 0.2–1% contrast is quoted for the reader of the evidence trail; it is NOT a likelihood ratio and none is claimed, and no threshold from the chapter is asserted on a feature. CSO to ratify.",
};

/**
 * The Ugandan text on the thyroid. Cited for what a clinician using this tool was
 * taught, and for the divergence in the file header — its two symptom lists are
 * the local half of the two thyroid findings, and its entries never once mention
 * diabetes.
 */
const UCG_2023_THYROID: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, sections 8.1.6 and 8.1.7 (pp 482–485)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines for Management of Common Health Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Hyperthyroidism … Clinical features: Weight loss with increased appetite; Swelling in the neck (goitre); Palpitations, tachycardia; Irritability, nervousness, inability to rest or sleep; … Profuse sweating, extreme discomfort in hot weather; High blood pressure; Protruding eyes (exophthalmos) in some forms … Differential diagnosis: Anxiety states; Tumours of the adrenal gland (pheochromocytoma); Other causes of weight loss; Other causes of protruding eyes … Hypothyroidism … Clinical features: Dull facial expression, puffiness, periorbital swelling; Hoarse voice, slow speech; Weight gain, drooping eyelids; Hair sparse, coarse, and dry: skin dry, scaly, and thick; … Bradycardia, constipation (often), anaemia (often)",
  needsCsoInput:
    "The Ugandan national text is not one of the enumerated standard bodies, hence `local`. IT DIVERGES FROM ADA AND BOTH ARE RECORDED: ADA rec 4.6 screens every person with type 1 diabetes for autoimmune thyroid disease, while these UCG entries are symptom-driven, never mention diabetes, and are not cross-referenced from the UCG diabetes chapter. UCG also gives 'other causes of protruding eyes' its own line in the hyperthyroid differential, which is why the eye-sign tier below is moderate rather than strong. CSO to decide which standard a Ugandan site profile prefers.",
};

/**
 * The Ugandan text on the adrenal, and the reason the pigmentation finding cannot
 * simply borrow ADA's autoimmune framing. Here the commonest cause is a steroid
 * the patient stopped, and TB and HIV are named next — a different differential
 * behind the same brown mucosa.
 */
const UCG_2023_ADDISON: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 8.1.1 (pp 468–469)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines for Management of Common Health Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Causes: More common: abrupt cessation of steroid treatment after long use; Autoimmune (self destruction of the gland); TB of the adrenals, HIV/AIDS … Clinical features: Acute: Weakness and fatigability (getting tired easily); Shock, very low BP; Hypoglycaemic attacks; Mental changes, e.g., irritability and restlessness until coma; Fever, hyponatremia (low Na), hyperkalemia (high K), acidosis. Chronic: As above plus weight loss, hair loss; Darkening of the skin and mouth; … Symptoms are worse in situations of stress (e.g., infections) … Differential diagnosis: HIV/AIDS, TB, cancer; Depression; Diabetes mellitus; Hypothyroidism",
  needsCsoInput:
    "Not one of the enumerated standard bodies, hence `local`. Its cause list DIVERGES from ADA's and ISPAD's autoimmune framing and both are recorded; UCG also places diabetes mellitus in the differential of adrenal insufficiency, which is the reverse of the direction this catalog reasons in. The acute-crisis doses that section carries (hydrocortisone, fluids) are deliberately NOT reproduced anywhere here — this engine states no dose. CSO to ratify.",
};

/**
 * Leprosy, and the reason a pale patch in this clinic is not a dermatology
 * question until sensation has been tested. UCG's own leprosy differential names
 * early vitiligo, and its own cardinal sign is the one that separates them.
 */
const UCG_2023_LEPROSY: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 2.1.4 (pp 101–103)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines for Management of Common Health Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Leprosy is diagnosed by finding at least one of the three cardinal signs: Hypopigmented patches with definite loss of sensation in them; Thickened or enlarged peripheral nerves … Differential diagnosis: Hypopigmentation e.g. birthmark, early vitiligo; Fungal infections of the skin; … Other causes of peripheral nerve damage, e.g. diabetes mellitus",
  needsCsoInput:
    "Not one of the enumerated standard bodies, hence `local`. Cited ONLY for the bedside discrimination in the vitiligo elicitation — a leprosy patch is anaesthetic and a vitiligo patch is not — and for the fact that UCG itself lists early vitiligo in the leprosy differential. No claim about leprosy is made anywhere in this file, and the cardinal signs are already captured as `leprosy_cardinal_sign` in the neuropathy history. CSO to ratify.",
};

/**
 * The adrenal reference work, for the one thing no guideline retrieved states:
 * WHERE to look for the pigment. It also supplies the caveat that makes the
 * important negative safe — the pigment is absent in secondary insufficiency,
 * which is the very cause UCG names first.
 */
const ADDISON_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Addison Disease (NBK441994), History and Physical",
  title: "Addison Disease — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK441994/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Hyperpigmentation of skin and mucous membranes, a hallmark of Addison disease, is usually generalized and most prominent in sun-exposed and pressure areas. Specific sites should be carefully evaluated for hyperpigmentation, including the palmar creases, gingival mucosa, lips, particularly the vermilion border, elbows, knuckles, posterior neck, breast areola, nipples, and nail beds. … occurs in almost all patients with Addison disease. However, there have been few reports of patients with adrenal insufficiency without hyperpigmentation. This may delay the diagnosis. Also, hyperpigmentation is not seen in secondary insufficiency because ACTH and MSH levels are low. … Vitiligo may also be observed.",
  needsCsoInput:
    "A tertiary reference work, not a guideline, hence `local`. 'Occurs in almost all patients' is the source's own wording and is NOT a sensitivity — no test-performance figure is claimed for this sign anywhere here. The Endocrine Society's 2016 primary adrenal insufficiency guideline was sought for a better source and could not be retrieved (the journal host returns 403 and the society mirror 404). CSO to obtain it and re-anchor this finding.",
};

/**
 * Dermatitis herpetiformis, described by the source that describes it as a
 * disease rather than as a bullet in a list of extraintestinal manifestations.
 * The skin finding and the enteropathy are two faces of the same antibody, which
 * is why this argues for coeliac disease harder than anything else here.
 */
const DH_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Dermatitis Herpetiformis (NBK493163), History and Physical",
  title: "Dermatitis Herpetiformis — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK493163/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Dermatitis herpetiformis is a chronic, autoimmune, blistering disease that causes an extremely pruritic rash that predominantly affects the extensor surfaces. … The disease is closely associated with gluten-sensitive enteropathy (GSE); both conditions are characterized by the development of IgA autoantibodies against transglutaminases … Patients report a rash, most typically over the extensor surfaces of the elbows, knees, buttocks, and scalp. … Because the condition is so pruritic, intact vesicles are rarely seen, and the patient may present with excoriations alone. … The disease is also associated with other autoimmune disorders, such as autoimmune thyroid disease, and all patients should be screened for this condition. Additionally, patients with dermatitis herpetiformis have an increased risk of type 1 diabetes, Addison disease, and vitiligo.",
  needsCsoInput:
    "A tertiary reference work, not a guideline, hence `local`. The definitive test it names — granular IgA on direct immunofluorescence of perilesional skin — is unavailable at most sites this catalog serves, and no such capability is modelled; what the finding buys here is the tissue transglutaminase serology ADA rec 4.7 already asks for on clinical suspicion. CSO to ratify.",
};

const EX = "examination";

/**
 * An autoimmune finding, filed under the region of the examination it is found
 * in — the thyroid with the head and neck, the pigment and the patches with the
 * skin. These are additions to regions that already exist, not a new segment:
 * the examiner is looking at the same face they were already looking at.
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

export const AUTOIMMUNE_FEATURES: Feature[] = [
  /* ── the thyroid: what palpating the gland cannot tell you ───────────── */
  finding("gx_head_neck", {
    /**
     * The eyes are where thyroid disease announces itself across a room, and
     * they are the half of the thyroid examination a goitre field cannot hold:
     * an orbit says something about the CAUSE, not merely about the size of the
     * gland.
     *
     * Moderate rather than strong, and UCG is why. ISPAD calls exophthalmos and
     * lid lag the characteristic eye findings and adds that they may or may not
     * be present; UCG gives "other causes of protruding eyes" a line of its own
     * in the hyperthyroid differential. A protruding eye in this clinic is a
     * thyroid question, not a thyroid answer.
     *
     * NO `importantNegative`. Most autoimmune thyroid disease in type 1 diabetes
     * is Hashimoto's hypothyroidism, which has no eye signs whatever, and even
     * in Graves' disease the orbit is spared in many people. An absent eye sign
     * refutes nothing, and saying that it did would be an invention.
     */
    code: "thyroid_eye_signs",
    display: "Thyroid eye signs",
    valueType: "boolean",
    synonyms: [
      "Graves' orbitopathy",
      "thyroid eye disease",
      "exophthalmos",
      "proptosis",
      "lid lag",
      "lid retraction",
      "thyroid stare",
    ],
    citation: ISPAD_2022_THYROID,
    elicitation:
      "Look at the face before you touch it, then look from the side and from above and behind the seated patient, down over the brow — proptosis is far easier to see along the line of the cheekbone than face on. Note whether white sclera shows above the iris at rest. Then ask them to follow your finger slowly downwards without moving their head and watch the upper lid: in lid lag the lid trails the eye and a band of sclera opens above the iris. Ask about double vision, test the eye movements in all directions, and record redness, chemosis or swollen lids. Ask whether photographs from a year ago look like the same face.",
    discriminates: [
      {
        condition: "autoimmune_thyroid_disease",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ISPAD names exophthalmos and lid lag the characteristic eye findings of hyperthyroidism, and hyperthyroidism accompanying type 1 diabetes is usually Graves' disease or the hyperthyroid phase of Hashimoto's thyroiditis — both autoimmune. Moderate rather than strong because ISPAD says the eye findings may or may not be present, and UCG lists other causes of protruding eyes in its own hyperthyroid differential.",
        citation: ISPAD_2022_THYROID,
      },
      {
        condition: "type_1_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "Autoimmunity is the first A of ADA's AABBCC approach to telling type 1 from type 2 diabetes, and Graves disease is named among the autoimmune disorders people with type 1 diabetes are prone to. Weak, and deliberately so: ADA states the approach has not been prospectively validated, and thyroid disease is common enough that it can accompany type 2 diabetes by coincidence.",
        citation: ADA_S2_AABBCC,
      },
      {
        condition: "type_2_diabetes",
        direction: "refutes",
        strength: "weak",
        rationale:
          "The same unvalidated tool read in the other direction. An autoimmune eye argues gently against the type 2 label already on the chart — enough to ask for the antibodies where they can be sent, never enough to change a classification on its own.",
        citation: ADA_S2_AABBCC,
      },
    ],
  }),
  prop("thyroid_eye_signs", {
    /**
     * The published items, and no more. Lid retraction and lid lag are recorded
     * separately because they are two different observations of the same lid —
     * one at rest, one on pursuit — and an examiner who has only looked at the
     * face at rest has done half of the test.
     */
    code: "thyroid_eye_signs_which",
    display: "Which signs",
    valueType: "multi_select",
    citation: ISPAD_2022_THYROID,
    options: [
      {
        value: "lid_retraction",
        display: "Lid retraction — sclera visible above the iris at rest",
      },
      { value: "lid_lag", display: "Lid lag on downward pursuit" },
      { value: "proptosis", display: "Proptosis or exophthalmos" },
      { value: "periorbital_swelling", display: "Swollen lids, redness or chemosis" },
      { value: "restricted_movement", display: "Restricted eye movement or double vision" },
    ],
  }),

  finding("gx_head_neck", {
    /**
     * The other half of the thyrotoxic picture, and the one that is felt rather
     * than seen. It is filed with the thyroid rather than with the hands because
     * it answers a thyroid question; see the file header.
     *
     * ONE THING TO KNOW BEFORE TRUSTING IT: these are, item for item, the
     * autonomic warning symptoms of a low — sweating, shaking, palpitations —
     * that `hypo_autonomic_warning` records in the neurological segment, whose
     * own rationale already names thyrotoxicosis among the things that produce
     * them. The two findings are separated by the clock and by a glucose, not by
     * the hands: a tremor for six months with weight loss is a thyroid, a tremor
     * for twenty minutes with hunger is a hypoglycaemia. The elicitation says so,
     * and NO discrimination toward hypoglycaemia is claimed here, because the
     * finding cannot tell them apart and a meter can.
     */
    code: "thyrotoxic_peripheral_signs",
    display: "Peripheral signs of thyrotoxicosis",
    valueType: "boolean",
    synonyms: [
      "thyrotoxicosis",
      "hyperthyroidism",
      "fine tremor",
      "sympathetic overactivity",
      "hyperthyroid signs",
    ],
    citation: UCG_2023_THYROID,
    elicitation:
      "Take the hands first: rest a sheet of paper across the fingers of the outstretched hands and watch it flutter, then feel the palms — thyrotoxic skin is warm and damp where an anxious patient's is cold and damp. Count the pulse for a full minute with the patient rested. Watch the person while you take the history for restlessness, over-talking and an inability to sit through it. Then ask about the time course: months of this, with weight loss on a good appetite, is a thyroid. Minutes of it, with hunger, is a low blood glucose until a meter says otherwise — check one before you attribute anything to a gland.",
    discriminates: [
      {
        condition: "autoimmune_thyroid_disease",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ISPAD characterises hyperthyroidism by tremors, tachycardia, hyperactivity and heat intolerance, and UCG's own list adds profuse sweating and an inability to rest. Moderate rather than strong because thyrotoxicosis is not always autoimmune — UCG names toxic adenoma, multinodular goitre, thyroiditis and iatrogenic causes — and because anxiety, sepsis and a low blood glucose all produce the same four signs.",
        citation: ISPAD_2022_THYROID,
      },
      {
        condition: "type_1_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "Graves disease is one of the autoimmune disorders ADA names as travelling with type 1 diabetes, and autoimmunity is a letter of the AABBCC approach for separating type 1 from type 2. Weak: ADA calls the approach unvalidated, and this finding does not even establish that the thyrotoxicosis is autoimmune.",
        citation: ADA_S2_AABBCC,
      },
    ],
  }),
  prop("thyrotoxic_peripheral_signs", {
    code: "thyrotoxic_features_which",
    display: "Which features",
    valueType: "multi_select",
    citation: UCG_2023_THYROID,
    options: [
      { value: "fine_tremor", display: "Fine tremor of the outstretched hands" },
      { value: "warm_moist_skin", display: "Warm, moist skin or profuse sweating" },
      { value: "restlessness", display: "Restlessness, irritability or hyperactivity" },
    ],
  }),

  finding("gx_head_neck", {
    /**
     * The commonest of the three thyroid pictures and the least dramatic:
     * ISPAD reports that the prevalence of autoimmune thyroid disease rises with
     * age and that most of it is hypothyroidism. It is also the one that gets
     * blamed on the diabetes — the tiredness, the weight, the slow pulse — which
     * is exactly why looking at the face is worth a field.
     *
     * The options below are UCG's and ISPAD's own, and the omissions are
     * deliberate. THE PULSE IS NOT AMONG THEM, here or in the thyrotoxic list
     * above: a bradycardia and a resting tachycardia are already a vital with a
     * band on it and a finding of its own in the general survey, and a third
     * place to answer them is a third answer free to disagree. Weight is a
     * measurement for the same reason. `peripheral_dry_skin` is ADA's autonomic
     * sign and is not the same observation as generalised coarse dry skin with
     * sparse hair. And the slow-relaxing ankle jerk is not offered at all, for
     * the reason given in the file header.
     *
     * `suggests` rather than a discrimination toward hypoglycaemia. ISPAD links
     * hypoglycaemia to hypothyroidism in one sentence, which is a reason to ASK
     * about lows — not a reason for a puffy face to raise an acute complication
     * up a ranked differential.
     */
    code: "hypothyroid_signs",
    display: "Signs of hypothyroidism",
    valueType: "boolean",
    synonyms: [
      "hypothyroidism",
      "Hashimoto's thyroiditis",
      "myxoedema",
      "underactive thyroid",
      "hypothyroid facies",
    ],
    citation: UCG_2023_THYROID,
    suggests: ["hypoglycaemia"],
    elicitation:
      "Look at the face for a beat longer than feels necessary: dull expression, puffy lids, thickened features, and eyebrows and scalp hair that are sparse, dry and coarse. Listen to the voice while you take the history rather than testing it — hoarseness and slow speech are heard, not elicited. Feel the skin of the forearms for dryness and thickening, and count the pulse. Then ask the person who knows them whether the face and the voice have changed over the last year, because every one of these signs arrives slowly enough to be invisible to the people who see it daily.",
    discriminates: [
      {
        condition: "autoimmune_thyroid_disease",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ISPAD's clinical features of hypothyroidism are a painless goitre, fatigue, cold intolerance, bradycardia and weight gain, and UCG's own list adds the dull puffy face, the hoarse voice and the coarse dry skin and hair. In a person with type 1 diabetes, ISPAD reports that most autoimmune thyroid disease is hypothyroidism. Moderate, because every one of these signs is also produced by anaemia, chronic kidney disease and simple ageing.",
        citation: ISPAD_2022_THYROID,
      },
      {
        condition: "type_1_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "Hashimoto thyroiditis heads ADA's list of the autoimmune disorders people with type 1 diabetes are prone to, and autoimmunity is a letter of the unvalidated AABBCC approach for separating the two types. Weak: hypothyroidism is common in the general population and this face argues for a thyroid function test long before it argues about a classification.",
        citation: ADA_S2_AABBCC,
      },
    ],
    importantNegative: {
      absenceRefutes: ["autoimmune_thyroid_disease"],
      caveat:
        "Feebly, and only about the CLINICAL picture. ADA recommends routine screening of everyone with type 1 diabetes for thyroid dysfunction precisely because primary hypothyroidism has a high prevalence, non-specific symptoms and an insidious onset — so a normal-looking face is not a normal TSH, and subclinical disease has no face at all. It says nothing whatever about hyperthyroidism, and nothing about the antibodies that predict disease years before any of this appears. It is a reason to send the test at the interval, not a reason to skip it.",
      citation: ADA_S4_AUTOIMMUNE,
    },
  }),
  prop("hypothyroid_signs", {
    code: "hypothyroid_features_which",
    display: "Which features",
    valueType: "multi_select",
    citation: UCG_2023_THYROID,
    options: [
      { value: "puffy_face", display: "Dull facial expression, puffiness, periorbital swelling" },
      { value: "hoarse_voice", display: "Hoarse voice or slow speech" },
      { value: "coarse_dry_skin", display: "Coarse dry skin, sparse dry hair" },
      { value: "drooping_eyelids", display: "Drooping eyelids" },
    ],
  }),

  /* ── the mouth: the only bedside prompt coeliac disease gives ────────── */
  finding("gx_head_neck", {
    /**
     * A weak finding, kept for one strong reason: coeliac disease in type 1
     * diabetes is usually SILENT, so the handful of things that do show are the
     * only prompts anybody gets to send the serology. ISPAD lists recurrent
     * aphthous ulceration among the extraintestinal manifestations that should
     * trigger evaluation, and ADA rec 4.7 asks for screening on clinical
     * suspicion in adults.
     *
     * NOT part of `oral_findings` in the general survey, which is a list of
     * infective and periodontal findings — thrush, angular cheilitis,
     * periodontal disease, an abscess, missing teeth — and offers no aphthous
     * option. This is a different lesion arguing for a different disease, and
     * folding it in would have required editing a finding this file does not
     * own.
     *
     * NO `importantNegative`. A mouth without ulcers argues nothing at all when
     * the disease it is being asked about is asymptomatic in most of the people
     * who have it.
     */
    code: "aphthous_ulceration",
    display: "Recurrent aphthous ulceration",
    valueType: "boolean",
    synonyms: ["aphthous stomatitis", "mouth ulcers", "canker sores", "recurrent oral ulceration"],
    citation: ISPAD_2022_COELIAC,
    elicitation:
      "With a torch and a tongue depressor, look along the inside of the lips and cheeks, under the tongue and at the floor of the mouth — aphthae sit on the soft, mobile mucosa and spare the hard palate and the gums. Record shallow round or oval ulcers with a grey-yellow floor and a red rim. The finding is RECURRENCE, so ask how many crops in the last year and whether they heal and return; a single ulcer beside a broken tooth is trauma, not this.",
    discriminates: [
      {
        condition: "coeliac_disease",
        direction: "supports",
        strength: "weak",
        rationale:
          "ISPAD lists recurrent aphthous ulceration among the extraintestinal manifestations that should prompt evaluation for coeliac disease in a young person with type 1 diabetes, and ADA asks that adults with type 1 diabetes be screened where signs raise clinical suspicion. Weak on purpose: aphthae are common and non-specific — HIV, Behçet disease, and iron, folate or B12 deficiency all produce them — so this argues for sending a tissue transglutaminase antibody, never for a diagnosis.",
        citation: ISPAD_2022_COELIAC,
      },
    ],
  }),

  /* ── the skin ────────────────────────────────────────────────────────── */
  finding("gx_skin", {
    /**
     * The cheapest autoimmune marker in medicine: it is visible from the door,
     * costs nothing, and is enriched several-fold in diabetes — ISPAD puts it at
     * 1–7% of people with diabetes against 0.2–1% of the general population.
     *
     * IN THIS POPULATION IT IS ALSO A LEPROSY QUESTION, and the elicitation is
     * written around that. UCG's leprosy chapter lists early vitiligo in its own
     * differential of a pale patch, and its cardinal sign is a hypopigmented
     * patch with DEFINITE LOSS OF SENSATION in it. Vitiligo is depigmented and
     * sensate; testing the patch takes ten seconds and separates a
     * dermatological curiosity from a notifiable infection. Nothing about
     * leprosy is claimed below — the discriminations are all about diabetes —
     * but a form that made somebody look and not touch would be worse than no
     * form.
     *
     * NO `importantNegative`. Ninety-plus per cent of people with type 1
     * diabetes have no vitiligo, so an unmarked skin refutes nothing; a negative
     * here would argue against type 1 diabetes in almost everyone who has it.
     */
    code: "vitiligo",
    display: "Vitiligo",
    valueType: "boolean",
    synonyms: ["vitiligo vulgaris", "skin depigmentation", "depigmented patches", "leucoderma"],
    citation: ISPAD_2022_VITILIGO,
    elicitation:
      "Look in good daylight at the hands, the face and around the mouth and eyes, then at the elbows, knees and any area that gets knocked; ask the patient to show you anywhere they have noticed the colour going. Vitiligo is DEPIGMENTED — chalk or milk-white, sharply demarcated, often symmetrical — where post-inflammatory change and fungal infection are merely paler than the skin around them. Then test light touch inside the patch and compare it with normal skin: a pale patch with definite loss of sensation is a cardinal sign of leprosy and not this, and in Uganda that is the finding you cannot afford to walk past. Check the scalp and eyelashes for white hairs.",
    discriminates: [
      {
        condition: "type_1_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ISPAD reports vitiligo in 1–7% of people with diabetes against 0.2–1% of the general population and attributes the association to a shared autoreactive T-cell mechanism; ADA names vitiligo among the autoimmune conditions associated with type 1 diabetes, and autoimmunity is a letter of its AABBCC approach for distinguishing type 1 from type 2. Moderate rather than strong because ADA states that approach is not prospectively validated.",
        citation: ISPAD_2022_VITILIGO,
      },
      {
        condition: "type_2_diabetes",
        direction: "refutes",
        strength: "weak",
        rationale:
          "The same argument in the other direction, and no stronger than the prevalence contrast that supports it — vitiligo occurs in people with type 2 diabetes and in people with no diabetes at all. It is a reason to question a type 2 label, not to overturn one.",
        citation: ADA_S2_AABBCC,
      },
      {
        condition: "autoimmune_thyroid_disease",
        direction: "supports",
        strength: "weak",
        rationale:
          "ISPAD names a thyroid disorder among the risk factors listed beside vitiligo and states that the co-occurrence of vitiligo with other autoimmune conditions should raise the consideration of polyglandular autoimmune syndrome. It argues for feeling the neck and sending a TSH, nothing more.",
        citation: ISPAD_2022_VITILIGO,
      },
      {
        condition: "primary_adrenal_insufficiency",
        direction: "supports",
        strength: "weak",
        rationale:
          "Vitiligo is listed among the associated features of Addison disease, and polyglandular autoimmune syndrome type 2 — adrenal insufficiency with type 1 diabetes and thyroid disease — also carries it. Weak and quiet: on its own a white patch is not a reason to think about the adrenal, but beside unexplained lows and a postural drop it is part of a picture.",
        citation: ADDISON_STATPEARLS,
      },
    ],
  }),
  prop("vitiligo", {
    /**
     * The ten seconds that separate a cosmetic finding from a notifiable
     * infection, recorded rather than merely urged. UCG diagnoses leprosy on any
     * one of three cardinal signs, the first of which is a hypopigmented patch
     * with definite loss of sensation in it — and lists early vitiligo in that
     * chapter's own differential, so the two genuinely arrive at the bedside
     * looking alike.
     *
     * NOT a second home for `leprosy_cardinal_sign`, which is a property of the
     * neuropathy history and only appears once an examiner has already named
     * leprosy as a possible cause of a neuropathy. Nothing leads there from a
     * patch found while looking at skin, which is exactly the path this closes.
     * "Not tested" is offered because it is the honest and commonest answer, and
     * because a guessed "normal" here is the one that costs somebody their
     * hands.
     */
    code: "vitiligo_patch_sensation",
    display: "Sensation in the patch",
    valueType: "single_select",
    citation: UCG_2023_LEPROSY,
    elicitation:
      "Touch lightly inside the patch and then on normal skin either side of it, with the patient's eyes closed, and ask them to say when they feel it. Use a wisp of cotton wool or the lightest touch of a fingertip — not a pinprick. Compare like with like: the same limb, the same kind of skin.",
    options: [
      { value: "normal", display: "Normal — feels the same as the skin around it" },
      { value: "reduced_or_absent", display: "Reduced or absent inside the patch" },
      { value: "not_tested", display: "Not tested" },
    ],
  }),

  finding("gx_skin", {
    /**
     * THE ONE FINDING IN THIS FILE THAT CAN KILL THIS WEEK, and the reason it
     * carries both an `urgency` and a gated danger sign.
     *
     * The pigment itself is slow — it has been there for months and it is not an
     * emergency. What it identifies is a person whose adrenal reserve will fail
     * during the next fever, and ISPAD's clinical picture is precisely the one a
     * diabetes clinic explains away: frequent hypoglycaemia, an unexplained fall
     * in the insulin requirement, weight loss and lassitude, all of which get
     * read as good control, gastroenteritis or a patient who is not eating. So
     * `urgency: "urgent"` is on the finding — today's electrolytes and glucose,
     * not next month's — while the RED flag is gated on the combination that
     * means the reserve is already failing.
     *
     * `dangerSign.when` rather than a bare red, because the audit that shaped
     * this schema caught the catalog firing red on a symptom alone. Pigmentation
     * by itself in a Ugandan clinic has ordinary explanations, starting with
     * skin that has always been that colour. Pigmentation WITH recurrent lows or
     * a postural drop is the presentation the guidelines describe, and the
     * action is UCG's and ISPAD's own instruction with every dose stripped out —
     * this engine states no dose.
     */
    code: "addisonian_hyperpigmentation",
    display: "Addisonian hyperpigmentation — buccal mucosa, palmar creases, scars",
    valueType: "boolean",
    urgency: "urgent",
    synonyms: [
      "Addison disease",
      "primary adrenal insufficiency",
      "mucosal pigmentation",
      "buccal pigmentation",
      "bronzing of the skin",
    ],
    citation: ADDISON_STATPEARLS,
    suggests: ["hypoglycaemia"],
    elicitation:
      "Look where the sun does not reach and where the skin is rubbed, because that is where this pigment goes: ask the patient to open their mouth and look at the inside of the cheeks and the gum margins with a torch, turn the hands over and look INTO the palmar creases, then the knuckles, the elbows, the posterior neck, any scar and the nail beds. Compare with skin the sun never sees — the inner upper arm — and, in deeply pigmented skin, compare with a relative in the room and ask the patient whether they or their family have noticed a darkening over the past months. Then take a lying and standing blood pressure and a capillary glucose in the same visit.",
    dangerSign: {
      severity: "red",
      action:
        "Check a capillary glucose and a lying and standing blood pressure now, send urea, electrolytes and creatinine, and refer the same day to a facility that can give intravenous hydrocortisone and fluids: Uganda Clinical Guidelines treat an acute adrenal crisis — shock, hypoglycaemic attacks, mental changes — as a hospital emergency, and ISPAD states that treatment is urgent and lifelong. Ask specifically about any steroid the patient has recently stopped, which UCG names as the commonest cause, and do NOT stop a steroid they are still taking. If they are unwell with an infection, say so on the referral: UCG records that the symptoms are worse in situations of stress.",
      when: {
        id: "addison_pigment_with_crisis_features",
        label: "Hyperpigmentation with recurrent hypoglycaemia or postural hypotension",
        any: [
          { feature: "hypoglycaemia_episode", op: "present" },
          { feature: "postural_hypotension", op: "present" },
        ],
        citation: UCG_2023_ADDISON,
      },
      citation: UCG_2023_ADDISON,
    },
    discriminates: [
      {
        condition: "primary_adrenal_insufficiency",
        direction: "supports",
        strength: "strong",
        rationale:
          "Hyperpigmentation of the skin and mucous membranes is described as a hallmark of Addison disease, most prominent in sun-exposed and pressure areas and specifically sought in the palmar creases, gingival mucosa, knuckles, elbows and nail beds; UCG's own chronic picture is 'darkening of the skin and mouth'. Strong rather than pathognomonic because the same source records that it is generalised and must be read against the person's own baseline colour, which in this population is the whole difficulty.",
        citation: ADDISON_STATPEARLS,
      },
      {
        condition: "type_1_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Polyglandular autoimmune syndrome type 2 is defined as at least two of autoimmune adrenal insufficiency, type 1 diabetes and autoimmune thyroid disease in the same person, and ADA names primary adrenal insufficiency among the autoimmune conditions associated with type 1 diabetes. In someone whose diabetes type is in doubt, adrenal pigment is one of the strongest bedside arguments for the autoimmune side of that question.",
        citation: ISPAD_2022_ADDISON,
      },
      {
        condition: "type_2_diabetes",
        direction: "refutes",
        strength: "weak",
        rationale:
          "Weak, and weaker here than anywhere else in this file, because UCG's leading causes of adrenal insufficiency in Uganda — abrupt withdrawal of long-term steroids, tuberculosis of the adrenals, HIV — have nothing to do with islet autoimmunity and can happen to anyone with any type of diabetes.",
        citation: UCG_2023_ADDISON,
      },
    ],
    importantNegative: {
      absenceRefutes: ["primary_adrenal_insufficiency"],
      caveat:
        "ONLY the primary disease, and only where you actually looked in the mouth and the palmar creases. Hyperpigmentation is NOT seen in secondary adrenal insufficiency, because ACTH and MSH are low — and abrupt cessation of long-term steroid treatment, which is exactly that kind, is the cause Uganda Clinical Guidelines name FIRST. So an unpigmented mouth in someone who has recently stopped prednisolone or dexamethasone excludes nothing at all. The same source records reports of primary adrenal insufficiency without hyperpigmentation, and notes that this delays the diagnosis. It is never a reason to withhold the electrolytes, the glucose or the cortisol.",
      citation: ADDISON_STATPEARLS,
    },
  }),
  prop("addisonian_hyperpigmentation", {
    /**
     * The sites, because WHERE decides what the finding means. Generalised
     * darkening in a person who works outdoors is sun; pigment inside the mouth
     * and down the palmar creases is not, and a form that recorded only "skin
     * darker" would lose the entire discrimination.
     *
     * Scars carry a caveat on the citation and are still offered: the taught
     * sign is that RECENT scars darken, and none of the sources retrieved for
     * this build says so.
     */
    code: "addisonian_pigmentation_sites",
    display: "Where",
    valueType: "multi_select",
    citation: {
      ...ADDISON_STATPEARLS,
      needsCsoInput:
        "The sites are quoted from StatPearls' physical-examination text — palmar creases, gingival mucosa, lips and the vermilion border, elbows, knuckles, posterior neck, breast areolae, nipples and nail beds, plus sun-exposed and pressure areas — with one exception. PIGMENTATION OF RECENT SCARS is conventional teaching and appears in NONE of the sources retrieved for this build; it is offered as an option because clinicians look for it, and no discrimination is claimed from it. CSO to source it or to strike that option.",
    },
    options: [
      { value: "buccal_gingival", display: "Buccal or gingival mucosa, or the lips" },
      { value: "palmar_creases", display: "Palmar creases" },
      { value: "knuckles_elbows", display: "Knuckles, elbows or posterior neck" },
      { value: "scars", display: "Scars" },
      { value: "areolae", display: "Areolae or nipples" },
      { value: "sun_exposed", display: "Generalised, or sun-exposed and pressure areas" },
    ],
  }),

  finding("gx_skin", {
    /**
     * The skin half of coeliac disease, and the one finding here that argues
     * hard. Dermatitis herpetiformis and the enteropathy are two expressions of
     * the same IgA response to transglutaminase, so this is not a rash
     * associated with a gut disease — it is the gut disease, seen on the skin.
     *
     * Not `pathognomonic`, although it is closer than anything else in this
     * file. The tier means "nothing else in this catalog explains it", and what
     * is actually in front of the clinician is usually excoriations rather than
     * the vesicles: the source says intact vesicles are rarely seen because the
     * itch destroys them, and scabies, eczema and a papular pruritic eruption of
     * HIV all excoriate the same way. `strong` is the honest tier, and the
     * definitive test — granular IgA on immunofluorescence of perilesional skin
     * — is unavailable at most sites this catalog serves.
     *
     * NO `importantNegative`. Coeliac disease in type 1 diabetes is frequently
     * asymptomatic and most of it never touches the skin, so clear skin refutes
     * nothing.
     */
    code: "dermatitis_herpetiformis",
    display: "Dermatitis herpetiformis",
    valueType: "boolean",
    synonyms: [
      "DH",
      "Duhring disease",
      "the rash of coeliac disease",
      "gluten rash",
      "blistering rash on the elbows and knees",
    ],
    citation: DH_STATPEARLS,
    elicitation:
      "Expose the extensor surfaces properly — both elbows, both knees, the buttocks and the scalp — because this rash keeps to them and is symmetrical. Look for grouped small red papules and vesicles, and expect to find excoriations and crusts instead: the itch is severe enough that intact blisters are rarely still there. Ask about the itch before the rash, ask whether it comes and goes, and ask what bread and porridge they eat. Look at the palms and soles for punctate purpura. Scabies is the trap — check the finger webs, the wrists and the genitals, and ask whether anyone at home itches too.",
    discriminates: [
      {
        condition: "coeliac_disease",
        direction: "supports",
        strength: "strong",
        rationale:
          "Dermatitis herpetiformis is closely associated with gluten-sensitive enteropathy, and both are characterised by IgA autoantibodies against transglutaminases — the rash and the enteropathy are one disease. ADA asks for coeliac screening in adults with type 1 diabetes on clinical suspicion, and this is as suspicious as the skin gets. Strong rather than pathognomonic because what is usually visible is excoriation rather than the characteristic grouped vesicles, and scabies and eczema excoriate identically.",
        citation: DH_STATPEARLS,
      },
      {
        condition: "type_1_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Patients with dermatitis herpetiformis are recorded as having an increased risk of type 1 diabetes, Addison disease and vitiligo, and ADA's AABBCC approach counts a personal history of autoimmune disease toward type 1 rather than type 2. Moderate, capped by ADA's own statement that the approach has not been prospectively validated.",
        citation: DH_STATPEARLS,
      },
      {
        condition: "autoimmune_thyroid_disease",
        direction: "supports",
        strength: "weak",
        rationale:
          "The same source records an association with autoimmune thyroid disease and states that all patients with dermatitis herpetiformis should be screened for it. Weak, and it earns its place only because the screening it points at — a TSH — is the same test ADA already wants for this patient.",
        citation: DH_STATPEARLS,
      },
    ],
  }),
];
