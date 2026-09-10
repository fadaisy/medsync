/**
 * The crisis abdomen, and the gas-forming infections that hide behind it.
 *
 * ── The one question this segment exists to answer ───────────────────────────
 * A person in ketoacidosis has a tender abdomen. Is that the ketoacidosis, or is
 * it the thing that CAUSED the ketoacidosis and is about to kill them? The error
 * runs in both directions and both directions hurt someone: a DKA abdomen
 * settles with fluid and insulin and does not need a laparotomy, and a missed
 * perforation is fatal whichever way the glucose went.
 *
 * The honest position is that the distinction is HARD, and the sources say so in
 * their own words. The ADA/EASD consensus writes "Caution is needed with
 * patients who present with abdominal pain because the symptoms could be either
 * a result of the DKA or an indication of a precipitating cause of DKA" —
 * either, not one or the other. Umpierrez and Freire, who counted, put abdominal
 * pain in 46% of 189 consecutive DKA episodes and say plainly that it sometimes
 * mimics an acute abdomen.
 *
 * What the sources DO give is two discriminators, and neither is a palpating
 * hand:
 *
 *   1. THE SEVERITY OF THE ACIDOSIS. Pain tracked with the acid and with nothing
 *      else — not with the glucose, not with the dehydration. Present in 86% of
 *      patients with a bicarbonate below 5 mmol/L, 66% at 5 to under 10, 36% at
 *      10 to under 15, and 13% at 15–18. So a tender abdomen in someone who is
 *      only mildly acidotic is the abdomen that needs explaining, which is
 *      exactly what the consensus means by "particularly in the absence of
 *      severe metabolic acidosis".
 *   2. WHAT IT DOES WITH TREATMENT. "Further clinical evaluation is necessary if
 *      this complaint is not resolved with the resolution of dehydration and
 *      metabolic acidosis."
 *
 * Both are encoded below — the first as the `when` gate on the tenderness danger
 * sign, the second as a finding of its own. GUARDING, REBOUND AND RIGIDITY ARE
 * CAPTURED BUT NOT GRADED. No source retrieved for this file establishes that
 * they separate a DKA abdomen from a surgical one, so they are a property of the
 * tenderness carrying no discrimination of their own; they earn a second route
 * into the same amber prompt, and that limb is declared as the catalog's own
 * judgement rather than smuggled in under the consensus's citation. Overclaiming
 * here would be worse than saying nothing, because the clinician would stop
 * thinking at the point the tool sounded confident.
 *
 * ── What else is here ────────────────────────────────────────────────────────
 * Hepatomegaly, because a big liver in a person with diabetes is the bedside end
 * of ADA's steatotic-liver pathway and is occasionally the first sign that the
 * diabetes is secondary. And the two gas-forming infections diabetes owns:
 * emphysematous pyelonephritis, in which over 90% of patients have diabetes, and
 * Fournier gangrene tracking up the abdominal wall along Scarpa's fascia — with
 * its SGLT2-inhibitor association, which the FDA case series and StatPearls both
 * record and which is captured on the crepitus finding below.
 *
 * ── Not here, deliberately ───────────────────────────────────────────────────
 * `perineal_soft_tissue_infection` is NOT redefined. The perineum is examined
 * with the skin and is exam-skin.ts's, red flag and all; what this file adds is
 * the abdominal WALL and the loin, which that finding does not reach. Two reds
 * for one problem is how an interface teaches people to scroll past the first.
 * `succussion_splash` and `bladder_distension` belong to the autonomic segment,
 * `insulin_lipohypertrophy` to the skin, splenomegaly to the haemolysis screen
 * in general-exam.ts, and `peripheral_oedema` to the general survey.
 * `abdominal_pain` and its SOCRATES properties are the SYMPTOM — what the
 * patient reports; `abdominal_tenderness` here is what the abdomen does under a
 * hand, in a patient who may be too drowsy to report anything.
 *
 * SIGNS OF NEPHROPATHY ARE ALMOST ABSENT FROM THIS SEGMENT, and that is a
 * finding rather than an omission. ADA Standards of Care 2026 Section 11
 * (https://pmc.ncbi.nlm.nih.gov/articles/PMC12690176/) lists what should make
 * you doubt that kidney disease in a person with diabetes is diabetic — "An
 * active urinary sediment …, rapidly increasing albuminuria or total
 * proteinuria, the presence of nephrotic syndrome, rapidly decreasing eGFR, or
 * the absence of retinopathy" — and every item on it is a laboratory result or
 * an eye. There is no physical sign on that list. So a ballotable kidney and
 * ascites were both drafted and both struck: the discrimination they would have
 * carried is one no retrieved source states, and a palpable bladder — the one
 * abdominal finding that genuinely changes a rising creatinine — already exists
 * in exam-neuropathy.ts.
 *
 * EMPHYSEMATOUS CHOLECYSTITIS IS NAMED BUT NOT MODELLED. StatPearls
 * (https://www.ncbi.nlm.nih.gov/books/NBK448099/) puts diabetes in "30% to 75%
 * of patients with this disorder", says "the patient's condition may rapidly
 * deteriorate despite the moderate pain", and calls for "an emergency
 * cholecystectomy upon diagnosis" — so it belongs in a diabetes catalog. It is
 * not written as a feature because conditions.ts holds no code for it, that file
 * belongs to another author, and a `discriminates` naming a condition nobody
 * defined is a build failure by design. It survives as a named mimic in the
 * elicitation of the crepitus finding, where a clinician will actually read it.
 *
 * ── What could not be verified ───────────────────────────────────────────────
 * NO UGANDAN SOURCE IS CITED IN THIS FILE, and not for want of trying. The UCG
 * 2023 PDF was requested three times and fetched none of them: the
 * differentiatedservicedelivery.org and guluhospital.net mirrors both exceed the
 * fetch tool's 10 MB content-length ceiling, and library.health.go.ug fails
 * certificate verification. It is a public document and it is not paywalled —
 * the tool could not carry it. So no divergence between ADA and UCG is recorded
 * for the abdomen, and the CSO must read UCG §8.1.4 (diabetic ketoacidosis and
 * the hyperosmolar state) and its upper-urinary-tract-infection section against
 * what is written here before any of it is signed.
 *
 * Every citation is `csoSigned: false`. The segment ships gated dark.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-08";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * The consensus, on the only abdominal question it addresses — and it addresses
 * it as a warning rather than as a rule. Both sentences are carried because the
 * first says the sign is ambiguous and the second says what to do about the
 * ambiguity, and a catalog that quoted only one of them would be a different
 * catalog.
 */
const ADAEASD_2024_ABDOMEN: Citation = {
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (Diabetologia)",
  title: "Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Nausea, vomiting and abdominal pain are common in DKA (>50%) but are uncommon in HHS. … Caution is needed with patients who present with abdominal pain because the symptoms could be either a result of the DKA or an indication of a precipitating cause of DKA, particularly in the absence of severe metabolic acidosis. Further clinical evaluation is necessary if this complaint is not resolved with the resolution of dehydration and metabolic acidosis.",
};

/**
 * The only study retrieved that COUNTED, and the source of every number in this
 * file's header. It is what turns the consensus's "particularly in the absence
 * of severe metabolic acidosis" from advice into a gate with a threshold on it.
 *
 * Read as an abstract, not as a paper — and the difference matters enough to say
 * out loud in `needsCsoInput` rather than let a reader assume otherwise.
 */
const UMPIERREZ_2002_ABDOMEN: Citation = {
  standard: "local",
  version: "J Crit Care 2002;17(1):63–67 (abstract, via Europe PMC REST record)",
  title:
    "Umpierrez G, Freire AX. Abdominal pain in patients with hyperglycemic crises. Journal of Critical Care 2002",
  url: "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:12040551&resultType=core&format=json",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Abdominal pain, sometimes mimicking an acute abdomen, is a frequent manifestation in patients with DKA. … Abdominal pain occurred in 86 of 189 patients with DKA (46%). In 30 patients, the cause of abdominal pain was considered to be secondary to the precipitating cause of metabolic decompensation. Five of them required surgical intervention including 1 patient with Fournier's necrotizing fasciitis, 1 with cholecystitis, 1 with acute appendicitis, and 2 patients with perineal abscess. … Abdominal pain was present in 86% of patients with serum bicarbonate less than 5 mmol/L, in 66% of patients with levels of 5 to less than 10 mmol/L, in 36% of patients with levels 10 to less than 15 mmol/L, and in 13% of patients with bicarbonate levels 15 to 18 mmol/L. … abdominal pain was not reported in any patient with HHS. … investigation of the etiology of abdominal pain in DKA should be reserved for patients without severe metabolic acidosis or if the pain persists after the resolution of ketoacidosis.",
  needsCsoInput:
    "A single-centre prospective series from one inner-city teaching hospital in Atlanta, collected from October 1995, and NOT one of the enumerated standard bodies — hence `local`. ONLY THE ABSTRACT WAS READ: pubmed.ncbi.nlm.nih.gov requires cookies this tool does not set and the publisher's full text was not retrieved, so the methods, the definition of 'abdominal pain' used and the case ascertainment are unverified here. The HHS arm is 11 patients, which is why the HHS discrimination below is graded moderate and not strong. No sensitivity, specificity or likelihood ratio is claimed anywhere from it. CSO to obtain the paper and ratify, and to decide whether a 1995 American cohort should set a threshold for a Ugandan ward at all.",
};

/**
 * ADA's steatotic-liver pathway, which is why a liver edge is felt at all in a
 * diabetes clinic. The recommendations are carried verbatim because the ACTION
 * is the point of the hepatomegaly finding — the condition itself is not
 * rankable here, and the field earns its place by starting the FIB-4.
 */
const ADA_S4_MASLD: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 4, recs 4.22a–4.24",
  title:
    "4. Comprehensive Medical Evaluation and Assessment of Comorbidities: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690184/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Screen adults with type 2 diabetes or with prediabetes, particularly those with obesity or other cardiometabolic risk factors or established cardiovascular disease, for their risk of having or developing cirrhosis related to metabolic dysfunction–associated steatohepatitis (MASH) using a calculated fibrosis-4 index (FIB-4) … Adults with type 2 diabetes or prediabetes with a FIB-4 ≥ 1.3 should have additional risk stratification by liver stiffness measurement with transient elastography, or, if unavailable, the enhanced liver fibrosis (ELF) test. … Refer adults with type 2 diabetes or prediabetes at higher risk for significant liver fibrosis … to a gastroenterologist or hepatologist for further evaluation and management.",
};

/** The other reason to feel for a liver: the diabetes may not be type 1 or type 2. */
const ADA_S2_PANCREATIC: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2 (pancreatic diabetes)",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Pancreatic diabetes … is commonly misdiagnosed as type 2 diabetes. … The diverse set of etiologies includes pancreatitis …, trauma or pancreatectomy, neoplasia, cystic fibrosis … hemochromatosis, fibrocalculous pancreatopathy, rare genetic disorders, and idiopathic forms",
};

/**
 * The kidney infection that is a diabetes disease. The 90% figure is what makes
 * loin tenderness a finding this catalog should carry at all, and the sentence
 * about mirroring ordinary pyelonephritis is what stops the discrimination below
 * being graded any higher than moderate.
 */
const STATPEARLS_EPN: Citation = {
  standard: "local",
  version: "StatPearls, Emphysematous Pyelonephritis, NBK599505 (updated 11 January 2024)",
  title: "Sherchan R, Hamill R. Emphysematous Pyelonephritis — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK599505/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Diabetes mellitus represents the most prevalent risk factor, found in over 90% of patients diagnosed with EPN. … Fevers, chills, dysuria, nausea, and vomiting are the presenting symptoms and signs of EPN. Other physical signs include abdominal pain, loin tenderness, and pneumaturia or palpable crepitus. … CT imaging is the most effective diagnostic tool to detect EPN in individuals with 100% sensitivity compared to ultrasonography (69%) and plain film radiography (65%). … EPN is a life-threatening disease, with reported mortality rates ranging from 40% to 90%. … EPN is a life-threatening condition associated with septic complications that require urgent attention.",
  needsCsoInput:
    "A tertiary reference work, not a guideline, and not one of the enumerated standard bodies — hence `local`. Cited for the association with diabetes, for the bedside signs and for the imaging comparison; the chapter also reports a contemporary mortality of 21% against the 40–90% historical range, and NEITHER figure drives a verdict anywhere in this catalog. No threshold from it is asserted. CSO to ratify, and to say what a district hospital with no CT is meant to do with a finding whose only confirmatory test is a CT.",
};

/**
 * Fournier gangrene as it reaches the ABDOMEN — which is the only part of it
 * this file owns, the perineum being exam-skin.ts's. Scarpa's fascia is why a
 * perineal infection becomes an abdominal-wall sign, and the 90% figure for
 * subcutaneous gas is why crepitus is worth palpating for deliberately.
 */
const STATPEARLS_FOURNIER_SPREAD: Citation = {
  standard: "local",
  version: "StatPearls, Fournier Gangrene, NBK549821",
  title: "Leslie SW, Foreman J. Fournier Gangrene — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK549821/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "spreads along the Dartos, Colles, and Scarpa fascias, allowing for the early involvement of the abdominal wall … erythema and tenderness extending into the anterior abdominal wall … the infection can progress as far as the clavicles … scrotal swelling (79%), followed by tachycardia (61%), purulent drainage (60%), crepitus (54%), and fever (41%) … X-ray imaging of the affected area may reveal subcutaneous gas, which is present in 90% of all Fournier gangrene cases. … The use of sodium-glucose cotransporter-2 (SGLT2) inhibitors has been linked to Fournier gangrene, although this association remains controversial. … If Fournier gangrene is suspected in users of these medications, the drugs should be discontinued",
  needsCsoInput:
    "A tertiary reference work, not a guideline, hence `local`. The 54% crepitus and 79% scrotal-swelling figures are the chapter's summary of ONE referenced study and are quoted for context only — no proportion from them is asserted as a test characteristic, and no likelihood ratio is claimed. The same chapter calls the SGLT2-inhibitor association 'controversial', which is why the discrimination below rests on the FDA case series and is graded weak. CSO to ratify.",
};

/**
 * The SGLT2-inhibitor association, from the regulator that found it, and quoted
 * WITH its own limitation. Fifty-five cases against nineteen for every other
 * glucose-lowering drug since 1984 is a signal; a case series cannot make it a
 * rate, and the authors say so in the paper's own words.
 */
const BERSOFF_MATCHA_2019: Citation = {
  standard: "local",
  version: "Ann Intern Med 2019;170(11):764–769 (abstract, via Europe PMC REST record)",
  title:
    "Bersoff-Matcha SJ, Chamberlain C, Cao C, Kortepeter C, Chong WH. Fournier Gangrene Associated With Sodium-Glucose Cotransporter-2 Inhibitors: A Review of Spontaneous Postmarketing Cases",
  url: "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:31060053&resultType=core&format=json",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The FDA identified 55 unique cases of FG in patients receiving SGLT2 inhibitors between 1 March 2013 and 31 January 2019. … Time to onset after initiation of SGLT2-inhibitor therapy ranged from 5 days to 49 months. All patients had surgical debridement and were severely ill. … Three patients died. For comparison, the FDA identified 19 FG cases associated with other antiglycemic agents between 1984 and 31 January 2019 … Limitation: Inability to establish causality or incidence, variable quality of reports, possible underreporting, and confounding by indication. … Physicians prescribing these agents should be aware of this possible complication and have a high index of suspicion to recognize it in its early stages.",
  needsCsoInput:
    "A regulatory case series, not a guideline, and the US FDA is not one of the enumerated standard bodies — hence `local`. ONLY THE ABSTRACT WAS READ; the FDA's own 2018 drug-safety communication returned 403 to this tool and is not cited. The authors state they cannot establish causality or incidence, so NO risk figure, rate or likelihood ratio is asserted anywhere here and the discrimination it supports is graded weak. CSO to ratify, and to decide whether this belongs as a therapy flag against the drug rather than as an examination finding.",
};

const EX = "examination";

/**
 * A finding in its own right, filed under the region of the examination it is
 * found in. Palpation comes before the infection band because that is the order
 * the abdomen is examined in, and because tenderness found in a septic patient
 * means something different from the same tenderness found in a well one.
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

export const ABDOMEN_FEATURES: Feature[] = [
  /* ── palpation ───────────────────────────────────────────────────────── */
  finding("ab_palpation", {
    /**
     * The finding the whole segment is built around, and a DIFFERENT question
     * from `abdominal_pain` in the symptoms section. That one is what the
     * patient reports; this is what the abdomen does under a hand — which is the
     * only version available in someone who is stuporose, and the only version a
     * surgeon will act on.
     *
     * The danger sign is GATED, and the gate is the source's own rule rather
     * than a precaution invented here. An unqualified flag on a tender abdomen
     * would fire on every patient in ketoacidosis, more than half of whom have
     * one, and the audit has already caught this catalog crying wolf once.
     */
    code: "abdominal_tenderness",
    display: "Abdominal tenderness on palpation",
    valueType: "boolean",
    synonyms: [
      "tender abdomen",
      "abdominal pain on examination",
      "pseudoperitonitis",
      "DKA abdomen",
    ],
    elicitation:
      "Warm your hands and watch the face, not the abdomen. Ask where it hurts and start as far from there as you can, palpating lightly through all nine regions before pressing deeply anywhere. Record WHERE it is tender rather than only that it is. Then do it again after the fluids and the insulin have been running — a DKA abdomen softens as the acid clears, and that repeat examination is worth more than anything the first one told you.",
    citation: ADAEASD_2024_ABDOMEN,
    dangerSign: {
      severity: "amber",
      action:
        "Look for a precipitating cause and do not attribute this abdomen to the ketoacidosis alone. The consensus states that abdominal pain may be either a result of the DKA or an indication of a precipitating cause of it, particularly in the absence of severe metabolic acidosis, and that further clinical evaluation is necessary if the complaint does not resolve with the resolution of dehydration and metabolic acidosis. Five of the 189 patients in Umpierrez and Freire's series needed an operation — necrotising fasciitis, cholecystitis, appendicitis and two perineal abscesses.",
      when: {
        id: "abdomen_needs_explaining",
        label:
          "A tender abdomen in ketoacidosis that is either not severely acidotic (bicarbonate 10 to under 18 mmol/L) or shows guarding, rebound or rigidity",
        all: [{ feature: "bicarbonate", op: "<", value: 18, unit: "mmol/L" }],
        any: [
          { feature: "bicarbonate", op: ">=", value: 10, unit: "mmol/L" },
          {
            feature: "peritoneal_signs",
            op: "in",
            value: ["guarding", "rebound_tenderness", "rigidity"],
          },
        ],
        citation: {
          ...ADAEASD_2024_ABDOMEN,
          needsCsoInput:
            "TWO LIMBS, AND ONLY THE FIRST IS THE SOURCE'S. The bicarbonate window is the consensus's 'absence of severe metabolic acidosis' expressed in this catalog's own severity thresholds — under 18 mmol/L is the ADA/EASD boundary for ketoacidosis and under 10 for SEVERE ketoacidosis, and Umpierrez and Freire put abdominal pain in 13% of patients at 15–18 mmol/L against 86% below 5. THE PERITONEAL LIMB IS THE CATALOG'S OWN: no source retrieved for this file grades guarding, rebound or rigidity in ketoacidosis, and it is added because the consensus's rule alone would leave a rigid abdomen in a severely acidotic patient flagging nothing at all. It is amber rather than red for the same reason. Note also that both limbs need a bicarbonate: a site with a venous pH and no bicarbonate fires neither. CSO to ratify the peritoneal limb, strike it, or replace the gate with a pH equivalent.",
        },
      },
      citation: ADAEASD_2024_ABDOMEN,
    },
    discriminates: [
      {
        condition: "dka",
        direction: "supports",
        strength: "moderate",
        rationale:
          "The consensus records nausea, vomiting and abdominal pain as common in DKA at over 50%, and Umpierrez and Freire found abdominal pain in 46% of 189 consecutive episodes. Moderate rather than strong because a tender abdomen has every other cause it has ever had, and roughly a third of the pain in that series turned out to belong to whatever precipitated the decompensation.",
        citation: ADAEASD_2024_ABDOMEN,
      },
      {
        condition: "severe_dka",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Pain tracked with the ACID and with nothing else — not with the glucose, not with the dehydration. It was present in 86% of patients with a bicarbonate below 5 mmol/L and in 13% of those at 15–18, so a tender abdomen argues towards the severe end of the severity table. It is a marker of how acidotic the patient is, not a measurement of it, and the bicarbonate itself settles the stage.",
        citation: UMPIERREZ_2002_ABDOMEN,
      },
      {
        condition: "hhs",
        direction: "refutes",
        strength: "moderate",
        rationale:
          "The consensus states that nausea, vomiting and abdominal pain are uncommon in HHS, and no patient in Umpierrez and Freire's HHS arm reported abdominal pain at all. Moderate rather than strong because that arm was eleven patients, which is too few to carry a stronger claim, and because a hyperosmolar patient can have a surgical abdomen like anyone else.",
        citation: ADAEASD_2024_ABDOMEN,
      },
    ],
    importantNegative: {
      absenceRefutes: ["severe_dka"],
      caveat:
        "Weakly, and never on its own. Abdominal pain was present in 86% of patients whose bicarbonate was below 5 mmol/L — which means 14% of the most acidotic patients in the series had none, so a soft abdomen shifts the odds and settles nothing. It argues nothing at all about HHS, where pain is not expected in the first place. And it is worth only as much as the examination behind it: a stuporose patient, a patient with an insensate abdomen, and a patient nobody undressed can each have a perforation and no tenderness to find.",
      citation: UMPIERREZ_2002_ABDOMEN,
    },
  }),
  prop("abdominal_tenderness", {
    /**
     * Captured, gated, and deliberately NOT graded. These are the signs every
     * examiner was taught separate a surgical abdomen from a medical one, and no
     * source retrieved for this file says whether they do that in ketoacidosis —
     * the studies measured PAIN, not what the abdomen felt like. So this is a
     * property rather than a finding: it carries no discrimination, it moves no
     * ranking, and the one thing it does is open the second limb of the amber
     * flag above, where its provenance is declared as ours.
     *
     * "None of these" is offered because the commonest true answer is the
     * reassuring one, and a list containing only alarming options quietly
     * pressures the examiner into ticking something.
     */
    code: "peritoneal_signs",
    display: "Peritoneal signs",
    valueType: "multi_select",
    elicitation:
      "Feel for GUARDING as you palpate — the abdominal wall tensing under your hand — and note whether it goes when you distract them, because voluntary guarding does and true guarding does not. RIGIDITY is a board-like wall that never relaxes; you will not have to wonder. Test rebound by percussing gently rather than by pressing deeply and letting go, which hurts and adds nothing. Listen for a full minute before recording bowel sounds as absent.",
    citation: {
      ...ADAEASD_2024_ABDOMEN,
      needsCsoInput:
        "CONVENTIONAL EXAMINATION VOCABULARY, NOT A PUBLISHED TAXONOMY. Neither the ADA/EASD consensus nor Umpierrez and Freire records guarding, rigidity, rebound or bowel sounds in ketoacidosis, and neither states that any of them separates a DKA abdomen from a surgical one; the consensus's own discriminators are the severity of the acidosis and the response to treatment. Nothing is claimed from this field beyond documentation and the one danger-sign limb declared above. CSO to ratify or to source it properly.",
    },
    options: [
      { value: "guarding", display: "Guarding" },
      { value: "rebound_tenderness", display: "Rebound tenderness" },
      { value: "rigidity", display: "Board-like rigidity" },
      { value: "localised_tenderness", display: "Tenderness localised to one region" },
      { value: "absent_bowel_sounds", display: "Absent bowel sounds" },
      { value: "none", display: "None of these" },
    ],
  }),

  finding("ab_palpation", {
    /**
     * The consensus's second discriminator, and the one that costs nothing but
     * the discipline to go back. An abdomen that settles as the acid clears was
     * the ketoacidosis; an abdomen that does not was something else all along,
     * and in Umpierrez and Freire's series that something else went to theatre
     * five times.
     *
     * `urgency: urgent` and no danger sign. The urgency axis already answers the
     * question a danger sign would answer, the tenderness above already carries
     * an amber, and a second siren for the same abdomen is how the first one
     * stops being read.
     */
    code: "abdominal_pain_unresolved_after_treatment",
    display: "Abdominal pain or tenderness persisting after the acidosis has resolved",
    valueType: "boolean",
    urgency: "urgent",
    /**
     * A follow-up question, so it appears only once there is an abdomen to
     * follow up — either a reported pain or an elicited tenderness. NOT a
     * property of `abdominal_tenderness`: a property would vanish for the
     * patient whose admission abdomen nobody palpated, which is precisely the
     * patient the elicitation below is written for, and a property carries no
     * discrimination of its own.
     */
    showWhenAny: [
      { feature: "abdominal_tenderness", op: "present" },
      { feature: "abdominal_pain", op: "present" },
    ],
    synonyms: [
      "persistent abdominal pain after DKA treatment",
      "abdomen not settling with treatment",
    ],
    elicitation:
      "Re-examine the abdomen once the bicarbonate and the pH are back to normal and the patient is rehydrated — not before, and not from the chart. Compare it with what you found on admission and say which regions have changed. Tenderness that has not moved, or has spread, or that now guards where it did not, is the finding. If nobody examined the abdomen on arrival there is nothing to compare with, and that is worth recording as its own failure.",
    citation: ADAEASD_2024_ABDOMEN,
    discriminates: [
      {
        condition: "dka",
        direction: "refutes",
        strength: "moderate",
        rationale:
          "Not that the patient does not have ketoacidosis, but that the ketoacidosis no longer explains the abdomen: the consensus requires further clinical evaluation when the complaint does not resolve with the resolution of dehydration and metabolic acidosis, and Umpierrez and Freire reserve investigation of the abdomen for exactly this group. Whatever is still tender is a second diagnosis, and most of the ones that matter lie outside this catalog.",
        citation: ADAEASD_2024_ABDOMEN,
      },
    ],
  }),

  finding("ab_palpation", {
    /**
     * The weakest entry in this segment, and it should say so.
     *
     * What a big liver actually points at here is steatotic liver disease, and
     * that is not a rankable condition in this catalog — so the two
     * discriminations below are both weak and neither is the reason the field
     * exists. The reason is the ACTION: ADA screens adults with type 2 diabetes
     * or prediabetes for MASH-related cirrhosis with a FIB-4, which is arithmetic
     * on tests a district laboratory already runs, and a palpable liver is the
     * thing at the bedside most likely to make somebody calculate it.
     *
     * No `importantNegative`. A steatotic liver is usually impalpable, and a
     * normal-feeling edge excludes nothing at all; claiming otherwise would turn
     * an insensitive sign into a bad rule-out. If the owner would rather delete
     * this than carry it, that is a defensible call.
     */
    code: "hepatomegaly",
    display: "Hepatomegaly",
    valueType: "boolean",
    synonyms: ["enlarged liver", "palpable liver edge", "big liver", "hepatic enlargement"],
    elicitation:
      "Start in the right iliac fossa, well below where you expect the edge, and work up towards the costal margin with the patient breathing deeply through the mouth — starting too high is how an enlarged liver gets missed entirely. Measure the span downwards from the percussed upper border in centimetres rather than counting finger-breadths below the costal margin, which measures the chest as much as the liver. Note whether the edge is tender and what it feels like.",
    citation: ADA_S4_MASLD,
    discriminates: [
      {
        condition: "type_2_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "ADA screens adults with type 2 diabetes or prediabetes — and not type 1 — for cirrhosis related to metabolic dysfunction-associated steatohepatitis, because a fatty liver travels with the insulin-resistant phenotype. Weak, because a palpable liver has many commoner explanations in this setting and because most steatotic livers cannot be felt at all.",
        citation: ADA_S4_MASLD,
      },
      {
        condition: "secondary_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "ADA lists haemochromatosis, pancreatitis, neoplasia and pancreatectomy among the causes of pancreatic diabetes and warns that it is commonly misdiagnosed as type 2. A large or irregular liver in a person newly labelled type 2 is one of the few bedside prompts to ask whether the diabetes is secondary. Weak, because the sign is common and the conditions are rare.",
        citation: ADA_S2_PANCREATIC,
      },
    ],
  }),
  prop("hepatomegaly", {
    /**
     * The one question worth asking of a liver edge in this clinic, because ADA's
     * whole Section 4 pathway is about finding CIRRHOSIS rather than finding fat.
     * A smooth soft edge and a hard nodular one send the same patient down two
     * different roads, and the second one is a hepatology referral.
     */
    code: "hepatomegaly_edge",
    display: "Character of the liver edge",
    valueType: "single_select",
    citation: {
      ...ADA_S4_MASLD,
      needsCsoInput:
        "The OPTIONS are conventional examination vocabulary and no retrieved guideline grades a liver edge; ADA's referral trigger is a FIB-4, a liver-stiffness measurement or an ELF test, not a palpating hand. Nothing is claimed from this field and no criterion reads it. CSO to ratify or to strike it.",
    },
    options: [
      { value: "smooth", display: "Smooth and soft" },
      { value: "firm_nodular", display: "Firm, irregular or nodular" },
      { value: "tender", display: "Tender" },
      { value: "pulsatile", display: "Pulsatile" },
    ],
  }),

  /* ── severe infection ────────────────────────────────────────────────── */
  finding("ab_infection", {
    /**
     * Ninety per cent of emphysematous pyelonephritis happens to people with
     * diabetes, which makes it one of the few infections this catalog can
     * honestly claim as its own. The examination that finds it takes ten seconds
     * and is skipped constantly, because a patient who is vomiting and acidotic
     * is rarely rolled forward.
     *
     * The strength stops at moderate for a reason the source states plainly: EPN
     * presents exactly like ordinary pyelonephritis and only a CT tells them
     * apart. Loin tenderness raises the question; it cannot answer it.
     */
    code: "renal_angle_tenderness",
    display: "Renal angle tenderness",
    valueType: "boolean",
    urgency: "urgent",
    synonyms: [
      "loin tenderness",
      "costovertebral angle tenderness",
      "CVA tenderness",
      "renal punch",
      "Murphy's kidney punch",
    ],
    elicitation:
      "Sit the patient forward, or roll them. Lay one palm flat over the costovertebral angle — the notch between the twelfth rib and the spine — and strike the back of that hand ONCE with the ulnar border of your closed fist, firmly rather than hard. Warn them first. Do each side once and compare: repeating the blow tells you nothing new and hurts. While you are there, palpate the flank for swelling and for the fine crackle of gas under the skin, and record which side.",
    citation: STATPEARLS_EPN,
    discriminates: [
      {
        condition: "emphysematous_pyelonephritis",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Loin tenderness is one of the physical signs the source lists, and over 90% of patients with emphysematous pyelonephritis have diabetes — so this sign in this population is the presentation the condition is missed as. Moderate and not strong because the clinical picture closely mirrors ordinary acute pyelonephritis, and CT is what distinguishes them at 100% sensitivity against 69% for ultrasound.",
        citation: STATPEARLS_EPN,
      },
    ],
    importantNegative: {
      absenceRefutes: ["emphysematous_pyelonephritis"],
      caveat:
        "Only if somebody actually sat the patient forward and struck both sides — and even then, weakly. The presenting features the source lists are fevers, chills, dysuria, nausea and vomiting, all of which a patient can have with no tenderness to elicit, and a shocked or obtunded patient will not localise anything. It says nothing about ordinary pyelonephritis, which needs treating either way, and it is not a substitute for imaging in anyone septic.",
      citation: STATPEARLS_EPN,
    },
  }),
  prop("renal_angle_tenderness", {
    /**
     * Which side, because the answer determines which kidney gets imaged and,
     * where it comes to it, which one gets drained. "Both" is a real answer and
     * a worse one.
     */
    code: "renal_angle_tenderness_side",
    display: "Which side",
    valueType: "single_select",
    citation: STATPEARLS_EPN,
    options: [
      { value: "right", display: "Right" },
      { value: "left", display: "Left" },
      { value: "both", display: "Both" },
    ],
  }),

  finding("ab_infection", {
    /**
     * Gas in the urine. Rare, near-specific, free to ask about, and never
     * volunteered — which is the exact profile of a finding worth a field of its
     * own rather than a line in somebody's notes.
     *
     * NOT graded pathognomonic, and the reason is instructive: an enterovesical
     * fistula from diverticular disease, Crohn's or a colorectal cancer produces
     * the same bubbles and lies entirely outside this catalog, so `strong` is as
     * far as the evidence goes. No `importantNegative` either — most people with
     * emphysematous pyelonephritis never have it, and a recorded absence would be
     * refutation manufactured out of a rare sign.
     */
    code: "pneumaturia",
    display: "Pneumaturia — gas or bubbles in the urine",
    valueType: "boolean",
    urgency: "urgent",
    synonyms: ["gas in the urine", "bubbling urine", "fizzing urine", "air in the urine"],
    elicitation:
      "Ask directly, because nobody mentions it: does the urine fizz, bubble or crackle as it is passed, and does it do it at the end of the stream? If there is a catheter, watch the bag and the tubing for bubbles rising through the urine that are not coming from a disconnection. Ask about pneumaturia separately from frothy urine — froth is protein and settles, gas rises and pops.",
    citation: STATPEARLS_EPN,
    discriminates: [
      {
        condition: "emphysematous_pyelonephritis",
        direction: "supports",
        strength: "strong",
        rationale:
          "The source lists pneumaturia among the physical signs of emphysematous pyelonephritis, and gas in the urine of a person with diabetes and an upper-tract infection means a gas-forming organism is at work. Strong rather than pathognomonic because an enterovesical fistula and recent instrumentation produce the same finding, and neither is a condition this catalog reasons about.",
        citation: STATPEARLS_EPN,
      },
    ],
  }),

  finding("ab_infection", {
    /**
     * The sign that ends the discussion. Gas under the skin of the flank or the
     * abdominal wall in a person with diabetes is a gas-forming necrotising
     * infection until an image says otherwise, and both of the conditions it
     * raises are operations rather than prescriptions.
     *
     * Scoped to the WALL, the flank and the loin. The perineum, the scrotum and
     * the vulva belong to `perineal_soft_tissue_infection` in exam-skin.ts, which
     * already fires red on crepitus found there; what this adds is the territory
     * that finding does not reach — Fournier gangrene spreads along Scarpa's
     * fascia and involves the abdominal wall early, and by the time it is
     * palpable there the perineal examination is no longer the urgent one.
     *
     * This is also where the SGLT2-inhibitor association is carried. It is graded
     * WEAK and not more: the FDA found 55 cases against 19 for every other
     * glucose-lowering drug since 1984, and then said in the same abstract that
     * it could establish neither causality nor incidence.
     *
     * No `importantNegative`. Subcutaneous gas is a late sign — the StatPearls
     * chapter puts crepitus in 54% of Fournier cases — and a list of late signs
     * is by construction absent in the patient who most needs treating.
     */
    code: "abdominal_wall_crepitus",
    display: "Crepitus in the abdominal wall, flank or loin",
    valueType: "boolean",
    urgency: "immediate",
    synonyms: [
      "subcutaneous emphysema",
      "surgical emphysema",
      "gas in the tissues",
      "crackling under the skin",
    ],
    elicitation:
      "Palpate deliberately for it rather than hoping to notice it: press the flat of the fingers gently over the flank, the loin and the whole abdominal wall including both groins, feeling for a fine dry crackle like bubble wrap under the skin. Compare the two sides. Then look at the drug chart for an SGLT2 inhibitor, and at the perineum if nobody has yet. Right-upper-quadrant crepitus with fever and a patient deteriorating faster than the pain suggests is emphysematous cholecystitis — a diagnosis this catalog does not rank but a surgeon must be told about.",
    citation: STATPEARLS_FOURNIER_SPREAD,
    dangerSign: {
      severity: "red",
      action:
        "Obtain an immediate surgical and urological opinion and arrange emergency cross-sectional imaging, and discontinue any SGLT2 inhibitor. Every one of the 55 patients in the FDA's series of Fournier gangrene on these drugs required surgical debridement and was severely ill, and three of them died; CT detects emphysematous pyelonephritis with 100% sensitivity against 69% for ultrasonography, and its reported mortality is 40% to 90%. Antibiotics and resuscitation matter and must not be what delays the operation.",
      citation: {
        ...BERSOFF_MATCHA_2019,
        needsCsoInput:
          "THIS ACTION DRAWS ON THREE SOURCES AND THE SLOT HOLDS ONE. The case numbers, the severity and the deaths are this FDA series', which states it can establish neither causality nor incidence. The instruction to stop the drug where Fournier gangrene is suspected in a user is StatPearls' Fournier chapter (https://www.ncbi.nlm.nih.gov/books/NBK549821/), which in the same paragraph calls the SGLT2-inhibitor association controversial. The imaging comparison and the mortality range are the StatPearls emphysematous-pyelonephritis chapter's (https://www.ncbi.nlm.nih.gov/books/NBK599505/), cited in full on this feature's first discrimination. Not one of the three is a guideline, and none is an enumerated standard body — hence `local`. CSO to ratify the wording, and to decide whether stopping a named drug belongs in a danger sign at all or in a therapy flag.",
      },
    },
    discriminates: [
      {
        condition: "emphysematous_pyelonephritis",
        direction: "supports",
        strength: "strong",
        rationale:
          "Palpable crepitus is one of the physical signs the source names for emphysematous pyelonephritis, and gas tracking into the tissues over the loin of a person with diabetes — over 90% of whom have it — has very few other explanations. Strong rather than pathognomonic because trauma, recent instrumentation and a pneumothorax tracking down also put gas under the skin, and none of them is a condition this catalog reasons about.",
        citation: STATPEARLS_EPN,
      },
      {
        condition: "fournier_gangrene",
        direction: "supports",
        strength: "strong",
        rationale:
          "Fournier gangrene spreads along the Dartos, Colles and Scarpa fascias, which allows early involvement of the abdominal wall, and subcutaneous gas is present in 90% of cases on imaging. Crepitus felt over the lower abdominal wall or the groin of a person with diabetes is that infection having left the perineum, and it demands the same emergency operation whether or not the perineum has been looked at yet. The same chapter records that SGLT2 inhibitors have been linked to Fournier gangrene — calling the association controversial — and directs that the drug be discontinued where it is suspected in a user, which is why this finding is also a reason to read the drug chart.",
        citation: STATPEARLS_FOURNIER_SPREAD,
      },
    ],
  }),
];
