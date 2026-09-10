/**
 * Skin, injection sites and soft tissue.
 *
 * ── What this file adds, and what it deliberately does not ───────────────────
 * ADA Table 4.1 asks for a skin examination — "acanthosis nigricans, insulin
 * injection or insertion sites, and lipodystrophy" — at the first visit and at
 * every follow-up. Most of that already has a home. `acanthosis_nigricans`,
 * `lipodystrophy` (with its type and its sites), `diabetes_skin_lesions`,
 * `skin_infection` and `peripheral_dry_skin` are in general-exam.ts and are NOT
 * redefined here: one finding, one home, exactly as that file argues.
 *
 * What was missing is not more lesions. It is the two things the skin
 * examination of a person with diabetes is actually FOR, and neither of them is
 * a lesion you can see from the end of the bed:
 *
 *   1. THE INJECTION SITES, FELT RATHER THAN LOOKED AT. Lipohypertrophy is
 *      recorded by `lipodystrophy`, but nothing recorded WHY it is there or
 *      whether the patient is still injecting into it — which is the half that
 *      changes what happens next. Most lipohypertrophy is missed because the
 *      examiner looks and does not palpate, so the `elicitation` on both
 *      findings below is the palpation drill itself, in the imperative.
 *
 *   2. THE GENITAL SKIN. Candidal balanitis and vulvovaginitis are a recognised
 *      first presentation of previously undiagnosed diabetes, and the perineum
 *      is where a necrotising soft-tissue infection is found late because nobody
 *      exposed it. Neither is reachable through `skin_infection`, which is
 *      explicitly "not the feet" and carries its site as free text — and free
 *      text cannot discriminate anything (the validator forbids a rule reading
 *      it, and rightly).
 *
 * ── ADA and UCG diverge here, twice, and both are recorded ───────────────────
 * The Ugandan text is not a weaker copy of ADA; it is written for a different
 * clinic, and on this domain it is better in one place and silent in another.
 *
 *   • GENITAL CANDIDIASIS. UCG 2023 §8.1.3 lists "itchy genitalia (candidiasis)"
 *     among the symptoms that should make you think of diabetes — a sentence ADA
 *     Section 2's classic-symptom list does not contain. But UCG §3.2.8.1, the
 *     entry a clinician actually reaches when a man presents with balanitis, sits
 *     in the STI chapter, names Candida and Trichomonas as the causes, treats and
 *     advises on hygiene and circumcision, and does NOT direct anybody to test
 *     the blood sugar. So the Ugandan pathway can find the finding and never
 *     close the loop. Both halves are cited below; the finding exists to close it.
 *
 *   • INJECTION SITES. ADA Section 9 requires the sites to be examined for
 *     lipohypertrophy and the patient to be taught rotation. UCG 2023 gives full
 *     insulin regimens over four pages and, in the whole retrieved text, contains
 *     no injection-site examination, no rotation instruction and no mention of
 *     lipohypertrophy. Recorded in `needsCsoInput` rather than smoothed over:
 *     these fields are ADA content in a Ugandan catalog, and the CSO should know
 *     that before signing them.
 *
 * ── Left out on purpose ──────────────────────────────────────────────────────
 * The parsimony rule (ADR 0083) says a finding that cannot move the differential,
 * raise urgency or trigger a specific action is documentation. Applied honestly
 * it removes most of a dermatology list:
 *
 *   • NECROBIOSIS LIPOIDICA, DIABETIC DERMOPATHY, GRANULOMA ANNULARE, BULLOSIS,
 *     SCLEREDEMA, PRURITUS — every one of them is already an option of
 *     `diabetes_skin_lesions`. Giving them a second, discriminating home would
 *     give each lesion two answers that can disagree, which is the failure
 *     general-exam.ts moved four fields to prevent.
 *
 *   • ERUPTIVE XANTHOMATA. The one dermatosis on that list that carries a
 *     deadline — they mean a triglyceride high enough to threaten the pancreas —
 *     and the one this file could not fix. `urgency` attaches to a FEATURE, not
 *     to an option of a multi-select, and there is no way to reach the option
 *     from here without redefining somebody else's finding. It also has nothing
 *     to argue for: conditions.ts models no hypertriglyceridaemia and the catalog
 *     carries no lipid feature, so a discrimination could not be written even if
 *     the field could. ADA Section 10 could not be retrieved for this build
 *     either — diabetesjournals.org returns 403 and no PubMed Central mirror was
 *     found — so no threshold or recommendation of theirs is asserted anywhere
 *     here. Closing the gap needs three things this file does not own: a
 *     hypertriglyceridaemia entry in conditions.ts, a fasting-triglyceride
 *     feature carrying ADA's own cut-point, and the eruptive-xanthoma option
 *     promoted to a finding in general-exam.ts. Left for the CSO to direct.
 *
 *   • XANTHELASMA. Same gap, without the deadline. A finding that cannot name a
 *     condition this catalog ranks is a finding this catalog should not carry.
 *
 *   • CANDIDAL INTERTRIGO. `skin_infection` already offers "Fungal — intertrigo
 *     or candidal" with a site. The genital site is split out below because it is
 *     a FIRST PRESENTATION rather than a complication and because nobody looks
 *     there unless asked; the submammary and groin folds are not, because the
 *     existing field finds them and adding nothing.
 *
 *   • INSULIN OEDEMA. `peripheral_oedema`, graded and with its extent, already
 *     owns the finding. No guideline retrieved for this build states a bedside
 *     definition, no condition in conditions.ts corresponds to it, and a field
 *     whose whole content is an attribution the examination cannot make is worse
 *     than the absence of one.
 *
 *   • VITILIGO AND MUCOCUTANEOUS HYPERPIGMENTATION. Skin to look at, but they
 *     are markers of the autoimmune conditions that travel with type 1 and of
 *     adrenal insufficiency. They belong with the autoimmune examination, and two
 *     authors each assuming the other had them is exactly how a finding acquires
 *     two homes.
 *
 *   • NEEDLE AND SYRINGE REUSE. The commonest injection-technique problem where
 *     this module is going, and left out because no guideline retrieved for this
 *     build ties it to anything this catalog ranks. It is a supply and education
 *     problem; recording it against an invented source would be worse than not
 *     recording it.
 *
 * Every citation here is `csoSigned: false`, as everywhere else in this catalog.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-07";
const EX = "examination";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * The injection-site examination, and the sentence that makes it an examination
 * rather than a question. ADA is explicit that the sites are EXAMINED, which is
 * what licenses the palpation drill in the `elicitation` below.
 */
const ADA_S9_SITE_EXAM: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 9 — Injection Technique",
  title: "9. Pharmacologic Approaches to Glycemic Treatment: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690185/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Examination of insulin administration sites for the presence of lipohypertrophy, as well as assessment of administration device use and injection technique, are key components of a comprehensive diabetes evaluation and treatment plan. … Lipohypertrophy appears as soft, smooth raised areas several centimeters in breadth and can contribute to erratic insulin absorption, increased glycemic variability, and unexplained hypoglycemic episodes.",
};

/**
 * Rotation, and the mechanism that makes its failure a cause rather than a
 * correlate: lipohypertrophy is fat laid down by insulin AT A SITE OF MULTIPLE
 * INJECTIONS. That clause is the whole discrimination.
 */
const ADA_S9_ROTATION: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 9 — Injection Technique",
  title: "9. Pharmacologic Approaches to Glycemic Treatment: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690185/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Injection or infusion site rotation is necessary to avoid lipohypertrophy, an accumulation of subcutaneous fat in response to the adipogenic actions of insulin at a site of multiple injections. … People treated with insulin and/or caregivers should receive education about proper injection or infusion site rotation and how to recognize and avoid injecting in areas of lipohypertrophy.",
  needsCsoInput:
    "ADA content in a catalog written for Uganda. The Uganda Clinical Guidelines 2023 were retrieved in full for this build and set out insulin regimens over four pages; the retrieved text contains no injection-site examination, no site-rotation instruction and no mention of lipohypertrophy anywhere. Neither text is wrong — one assumes a clinic that teaches injection technique and one is written for a shelf of NPH and a syringe — but the divergence should be visible before these two fields are signed.",
};

/**
 * The Ugandan text on diabetes, cited for the symptom nobody else lists. It is
 * the reason a Ugandan clinician reading this catalog will recognise the genital
 * finding at all.
 */
const UCG_2023_DM: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 8.1.3, Clinical features (p 472)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Other symptoms … Frequent skin infections like boils, itchy genitalia (candidiasis), slow healing wounds",
  needsCsoInput:
    "Quoted from text extracted from the official Ministry of Health PDF retrieved on 2026-09-07; the page number is the printed one. UCG is a national protocol rather than one of the enumerated standard bodies, hence `local`. CSO to ratify.",
};

/**
 * And the same guideline's OWN entry for balanitis, cited for what it does not
 * say. This is the divergence, not a corroboration: the clinician who meets the
 * finding is sent to the sexually-transmitted-infection chapter, where diabetes
 * is not mentioned and no glucose is asked for.
 */
const UCG_2023_BALANITIS: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 3.2.8.1 Balanitis (p 292)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "3.2.8.1 Balanitis … Inflammation of the glans penis … Usually caused by Candida, rarely by Trichomonas … Clinical features … Discharge, erythema, erosions … Prepuce is retractable",
  needsCsoInput:
    "Cited for an ABSENCE. The UCG balanitis entry sits in the sexually-transmitted-infection chapter, names no association with diabetes and directs no blood-glucose test, while UCG's own diabetes section lists itchy genitalia among the symptoms of diabetes. Nothing is asserted here about what UCG intends by that; the divergence is recorded so the CSO can decide whether this catalog should prompt the glucose that the national text does not.",
};

/**
 * Balanitis as a presentation of diabetes. A tertiary reference work, not a
 * guideline, and labelled as one — it is the source for the association and for
 * the instruction to test the glucose after recurrent episodes. The prevalence
 * figures are quoted for audit and are NOT used as a test performance anywhere:
 * no likelihood ratio is asserted from them.
 */
const BALANITIS_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Balanitis, NBK537143",
  title: "Balanitis — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK537143/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Diabetes is the most commonly identified underlying contributing disorder. … Balanitis can be the first presenting sign of underlying diabetes. … Recurrent episodes of balanoposthitis should raise concern for occult diabetes, so patients with recurrent episodes should undergo blood glucose testing. … Overall, balanitis affects about 16% of men with diabetes compared to just 5.8% of men without diabetes. … The use of glycosuric diabetic agents that increase urinary glucose excretion, including canagliflozin (Invokana), dapagliflozin (Farxiga), and empagliflozin (Jardiance), has been linked to an increased risk of balanitis.",
  needsCsoInput:
    "A tertiary reference work, not a guideline. Cited for the association, for the instruction to test the glucose after recurrent episodes, and for the SGLT2-inhibitor caveat. The 16% / 5.8% figures are recorded verbatim for audit only — they are not a sensitivity, a specificity or a likelihood ratio, and nothing in this file treats them as one. CSO to ratify.",
};

/**
 * The female half. CDC is not one of the enumerated bodies, hence `local`. Cited
 * for the definition of RECURRENT disease, which is what the property below
 * captures, and for naming diabetes among the causes of it.
 */
const CDC_2021_VVC: Citation = {
  standard: "local",
  version:
    "CDC Sexually Transmitted Infections Treatment Guidelines, 2021 — Vulvovaginal Candidiasis",
  title:
    "Vulvovaginal Candidiasis — STI Treatment Guidelines, Centers for Disease Control and Prevention",
  url: "https://www.cdc.gov/std/treatment-guidelines/candidiasis.htm",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Recurrent VVC, usually defined as three or more episodes of symptomatic VVC in <1 year, affects <5% of women. … can be either idiopathic or secondary (related to frequent antibiotic use, diabetes, or other underlying host factors)",
  needsCsoInput:
    "CDC is not one of the enumerated standard bodies, hence `local`. Cited for the three-episodes-in-a-year definition of recurrent disease and for diabetes being named among its secondary causes. It issues no recommendation to screen for diabetes and none is asserted here. CSO to ratify.",
};

/**
 * The perineum. Cited to a tertiary work for the same reason conditions.ts is —
 * the association is not disputed and no society publishes a bedside case
 * definition, so the honest position is to name the source rather than invent
 * one. The sentence that governs the `caveat` below is the one about the
 * EARLIEST signs: itching and erythema, long before anything looks necrotic.
 */
const FOURNIER_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Fournier Gangrene, NBK549821",
  title: "Leslie SW, Foreman J. Fournier Gangrene — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK549821/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Fournier gangrene is a rare and rapidly progressive form of necrotizing fasciitis that affects the deep and superficial tissues of the perineal, anal, scrotal, and genital regions. … Approximately half of all patients with Fournier gangrene have diabetes. … The earliest signs of a possible Fournier gangrene include itching, localized tenderness, edema, and erythema involving the skin of the perineum, scrotum, or labia. … Severe pain out of proportion to the physical findings is a classic finding of Fournier gangrene.",
  needsCsoInput:
    "A tertiary reference work, not a guideline. Cited for the definition, for the association with diabetes and for the description of the early and late signs. No incidence, threshold or case definition from it drives a verdict; the finding raises the condition for somebody to settle in theatre. CSO to ratify.",
};

/** And what a suspected one obliges somebody to do, in that source's own words. */
const FOURNIER_SURGERY: Citation = {
  ...FOURNIER_STATPEARLS,
  quote:
    "While antibiotic therapy and resuscitation are critical, they should not delay emergent, early, and aggressive surgical exploration and debridement, which remain the definitive and essential treatment for Fournier gangrene.",
};

/* ── Shape helpers, matching general-exam.ts ─────────────────────────────── */

/** A finding in its own right, filed under the region it is found in. */
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

export const SKIN_FEATURES: Feature[] = [
  /* ── injection and infusion sites ────────────────────────────────────── */
  finding("gx_injection", {
    /**
     * NAMED FOR THE ABNORMALITY, and the option list is why. The ranker reads a
     * single-select as PRESENT unless the recorded value is literally "none", so
     * a field called `injection_site_rotation` whose good answer was "rotates
     * well" would argue FOR lipohypertrophy in the patient doing everything
     * right. The good answer is therefore the `none` option, and the code says
     * out loud which direction it runs in.
     *
     * "Not known" is deliberately absent. Leaving the field unanswered is how
     * this catalog says not known — `Assessed` already separates that from a
     * recorded negative, and an option would collapse the two back together.
     *
     * Asked only of someone on insulin: on anyone else it is a question about an
     * injection that does not happen.
     */
    code: "injection_site_rotation_failure",
    display: "Injection-site rotation",
    valueType: "single_select",
    showWhen: { feature: "glucose_lowering_therapy", op: "==", value: "insulin" },
    synonyms: ["site rotation", "injection technique", "rotating injection sites"],
    citation: ADA_S9_ROTATION,
    options: [
      { value: "none", display: "Rotates systematically between areas" },
      { value: "within_one_area", display: "Rotates within one area only" },
      { value: "same_site", display: "Injects the same spot each time" },
    ],
    elicitation:
      "Do not ask this from the end of the bed. Uncover the abdomen, both thighs and both upper arms, and ask the patient to point to where they injected today, yesterday and the day before. Look across the skin in oblique light for a smooth raised swelling, then PALPATE every site — most lipohypertrophy is felt and never seen: lay the flat of two fingers on the skin and sweep, then pinch a fold and roll it between finger and thumb, comparing left with right. Lipohypertrophic tissue is firmer and rubbery with an indistinct edge, and is often painless and less sensitive than the skin beside it. Record 'rotates systematically' only when the sites the patient shows you are in different areas, not merely a few centimetres apart.",
    discriminates: [
      {
        condition: "insulin_lipohypertrophy",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Lipohypertrophy is fat laid down by insulin at a site of repeated injection, so injecting into one place is the mechanism rather than a correlate of it; ADA states rotation is necessary to avoid it.",
        citation: ADA_S9_ROTATION,
      },
    ],
    importantNegative: {
      absenceRefutes: ["insulin_lipohypertrophy"],
      caveat:
        "Rotating well now does not undo years of not doing so — established lipohypertrophy persists long after the practice changes, so a patient who rotates today can still have lumps you must palpate for. This is also what the patient shows and reports, which is not always what they do. And it refutes nothing about the other causes of erratic control: a missed dose, a warm store, an intercurrent illness or gastroparesis all look the same on a glucose chart.",
      citation: ADA_S9_ROTATION,
    },
  }),

  finding("gx_injection", {
    /**
     * The half that changes what happens next.
     *
     * `lipodystrophy` in general-exam.ts records that the lump is there. It does
     * not record whether the patient is still putting insulin into it, and that
     * is the question ADA turns into an instruction — recognise it, and avoid
     * injecting there. Gated by `showWhen` rather than made a property of
     * `lipodystrophy` on purpose: a property inherits its finding's band and
     * would render over in the skin group, away from the sites it is about.
     *
     * It argues for hypoglycaemia and not for lipohypertrophy. The condition is
     * already on the table — the gate above requires it — and adding a second
     * voice for something already established would count one finding twice.
     */
    code: "injecting_into_lipohypertrophy",
    display: "Still injecting into the affected area",
    valueType: "boolean",
    showWhen: { feature: "lipodystrophy", op: "present" },
    synonyms: ["injecting into the lump", "injecting into lipos"],
    citation: ADA_S9_SITE_EXAM,
    elicitation:
      "Map the lipohypertrophy first by palpation, then put the patient's own hand on it: ask them to show you, on their own skin, where the needle went this morning. Watch what they point at rather than what they say — the affected area is the comfortable one, because it is the one that has lost sensation, so people return to it without knowing they do.",
    discriminates: [
      {
        condition: "hypoglycaemia",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA states that lipohypertrophy contributes to erratic insulin absorption, increased glycaemic variability and unexplained hypoglycaemic episodes; injecting into it is the route by which that happens, and it explains lows that otherwise get blamed on the patient.",
        citation: ADA_S9_SITE_EXAM,
      },
    ],
  }),

  /* ── genital skin: the presentation nobody looks for ─────────────────── */
  finding("gx_skin", {
    /**
     * Recorded here rather than as a `skin_infection` of type "fungal", for
     * three reasons and all three matter. It is a FIRST PRESENTATION rather than
     * a complication — the man who came about a rash and leaves with a diagnosis
     * of diabetes. It cannot discriminate through `skin_infection`, whose site is
     * free text the engine is forbidden to read. And it is never volunteered:
     * this is a finding that exists only if somebody asks and then looks.
     *
     * THE SGLT2 CAVEAT, which is not a footnote. Glycosuric drugs cause genital
     * mycotic infection as a class effect, so in a patient already on one this
     * finding argues for the drug and says much less about control or about an
     * undiagnosed diabetes. The rationale below says so; the therapy is already
     * captured in `glucose_lowering_therapy`, so nothing here needs to guess it.
     */
    code: "genital_candidiasis",
    display: "Genital candidiasis",
    valueType: "boolean",
    synonyms: [
      "thrush",
      "candidal balanitis",
      "balanoposthitis",
      "vulvovaginal candidiasis",
      "monilia",
      "itchy genitalia",
    ],
    /**
     * Cited to the UGANDAN text, deliberately, and not to the source of the
     * evidential claim below it. UCG's own diabetes chapter is what puts "itchy
     * genitalia (candidiasis)" in front of a clinician here, and it is the
     * reason this field exists in a catalog written for Uganda; what that text
     * then fails to do — its balanitis entry directs no glucose — is the gap the
     * discrimination closes, on somebody else's authority.
     */
    citation: UCG_2023_DM,
    elicitation:
      "Ask, then look — with consent and a chaperone. In men, retract the prepuce fully: look for erythema and small erosions on the glans and the inner prepuce, a curdy sub-preputial discharge, fissuring at the rim, and a prepuce that will not retract or will not go back. In women, part the labia and inspect for erythema, excoriation and fissures, and ask about a thick curdy discharge and itch. Record this as present only if you looked; an itch the patient reports and nobody examined belongs in the symptom section, not here.",
    discriminates: [
      {
        condition: "type_2_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Glycosuria feeds candida, and balanitis is described as a first presenting sign of underlying diabetes with recurrent episodes an indication to test the blood glucose; in an adult presenting with the rash rather than with thirst, the diabetes it uncovers is usually type 2. It argues much less strongly in someone already taking an SGLT2 inhibitor, in whom genital mycotic infection is a class effect of the drug.",
        citation: BALANITIS_STATPEARLS,
      },
    ],
  }),
  prop("genital_candidiasis", {
    /**
     * One field for both sexes rather than two gated on `sex`, because the
     * clinician ticks what they saw and the surface should not make an anatomy
     * question out of a rendering decision.
     */
    code: "genital_candidiasis_pattern",
    display: "What was seen",
    valueType: "multi_select",
    citation: UCG_2023_BALANITIS,
    options: [
      { value: "glans_erythema", display: "Erythema or erosions of the glans or inner prepuce" },
      { value: "subpreputial_discharge", display: "Curdy sub-preputial discharge" },
      { value: "preputial_fissuring", display: "Fissuring, or a prepuce that will not retract" },
      { value: "vulval_erythema", display: "Vulval erythema or excoriation" },
      { value: "vaginal_discharge", display: "Thick curdy vaginal discharge" },
    ],
  }),
  prop("genital_candidiasis", {
    /**
     * The one that carries the action. A single episode is common and means
     * little; it is RECURRENCE that both sources turn into an instruction —
     * test the glucose in a man with recurrent balanoposthitis, and look for a
     * secondary cause including diabetes in a woman with three or more episodes
     * in a year. CDC's threshold is quoted in the label so nothing has to be
     * remembered.
     */
    code: "genital_candidiasis_recurrent",
    display: "Recurrent — three or more episodes in the past year",
    valueType: "boolean",
    citation: CDC_2021_VVC,
    elicitation:
      "Count episodes treated, not episodes remembered as itchy: ask how many times in the last twelve months they have been given a cream, a pessary or a tablet for this.",
  }),

  /* ── the perineum, which is where nobody looks ───────────────────────── */
  finding("gx_skin", {
    /**
     * conditions.ts says the quiet part out loud about Fournier gangrene: it is
     * "pain out of proportion to what is visible, in a place clinicians are slow
     * to look", and ranking it is worth having only if it also gets looked at.
     * This is the field that makes somebody look. It sits with the skin rather
     * than with the abdomen because the perineum is examined with the skin, and
     * because a foot examination is not the only place this catalog asks about
     * soft tissue.
     *
     * The finding is the INFECTION, not the diagnosis. Most perineal cellulitis
     * is perineal cellulitis, so it argues moderately and the red flag is gated
     * separately on the features that actually distinguish the two — which is
     * exactly what `dangerSign.when` exists for, after the audit caught this
     * catalog firing red on vomiting alone.
     */
    code: "perineal_soft_tissue_infection",
    display: "Perineal, scrotal or vulval soft-tissue infection",
    valueType: "boolean",
    urgency: "urgent",
    synonyms: [
      "Fournier gangrene",
      "perineal necrotising fasciitis",
      "scrotal gangrene",
      "necrotising soft-tissue infection of the perineum",
    ],
    citation: FOURNIER_STATPEARLS,
    elicitation:
      "Expose the perineum, the scrotum or the vulva and the natal cleft properly, with consent and a chaperone, and roll the patient to see behind. Look for erythema, swelling, tense oedema, blistering and any dusky, grey or black skin. Palpate for crepitus — a fine crackling under the fingers. Smell the wound. And weigh the pain against what you can see: severe pain out of proportion to the physical findings is the classic early sign, and the skin may look almost normal while the fascia beneath it is dead.",
    discriminates: [
      {
        condition: "fournier_gangrene",
        direction: "supports",
        strength: "moderate",
        rationale:
          "About half of all patients with Fournier gangrene have diabetes, and it begins as itching, localised tenderness, oedema and erythema of exactly this skin — so a perineal infection in a person with diabetes is the presentation this condition is missed as, and warrants a deliberate look for the features that separate them.",
        citation: FOURNIER_STATPEARLS,
      },
    ],
    importantNegative: {
      absenceRefutes: ["fournier_gangrene"],
      caveat:
        "Only if you exposed and examined the area — a perineum nobody looked at refutes nothing at all. Even then, the earliest signs are itching, tenderness, oedema and erythema; crepitus, dusky skin and a putrid smell are LATE, so intact-looking skin over pain out of proportion does not exclude this and is the presentation in which it is most often missed.",
      citation: FOURNIER_STATPEARLS,
    },
    dangerSign: {
      severity: "red",
      action:
        "Obtain an emergency surgical opinion now. Antibiotics and resuscitation are critical but must not delay emergent, early and aggressive surgical exploration and debridement.",
      when: {
        id: "perineal_necrotising_features",
        label:
          "Perineal infection with pain out of proportion, crepitus, dusky or black skin, bullae or a putrid discharge",
        all: [
          {
            feature: "perineal_infection_features",
            op: "in",
            value: [
              "pain_out_of_proportion",
              "crepitus",
              "dusky_or_black_skin",
              "bullae",
              "putrid_discharge",
            ],
          },
        ],
        citation: FOURNIER_SURGERY,
      },
      citation: FOURNIER_SURGERY,
    },
  }),
  prop("perineal_soft_tissue_infection", {
    /**
     * Not documentation: this is the list the danger sign is gated on, so
     * ticking one of the first five is what turns an urgent finding into an
     * immediate one. "Erythema and swelling only" is offered as an answer
     * because the commonest true state of this field is the reassuring one, and
     * a list containing only alarming options quietly pressures the examiner to
     * tick something.
     */
    code: "perineal_infection_features",
    display: "Which features",
    valueType: "multi_select",
    citation: FOURNIER_STATPEARLS,
    options: [
      {
        value: "pain_out_of_proportion",
        display: "Pain out of proportion to what is visible",
      },
      { value: "crepitus", display: "Crepitus — gas in the tissues" },
      { value: "dusky_or_black_skin", display: "Dusky, grey or black skin" },
      { value: "bullae", display: "Blisters or bullae" },
      { value: "putrid_discharge", display: "Putrid or musty discharge" },
      { value: "erythema_swelling_only", display: "Erythema and swelling only" },
    ],
  }),
];
