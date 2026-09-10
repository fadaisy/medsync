/**
 * Acuity, fundus staging with its referral triggers, and the orbital emergencies.
 *
 * ── What this segment is for ─────────────────────────────────────────────────
 * Three questions, in the order the examination is performed. HOW WELL DOES THIS
 * PERSON SEE, per eye, because that number is the one finding a health centre
 * can obtain with a card and a torch and it changes the referral on its own.
 * WHAT IS ON THE RETINA, graded against a published scale rather than described,
 * because "some changes" is not a stage and a stage is what carries a referral
 * interval. And IS THIS AN ORBIT OR AN EAR THAT IS BEING DESTROYED, because two
 * of the infections that kill people with diabetes fastest declare themselves on
 * the face and in the ear canal, and both are routinely called something else
 * first.
 *
 * ── The grading scale, and why it is the one chosen ──────────────────────────
 * The retinal grade is the INTERNATIONAL CLINICAL DIABETIC RETINOPATHY DISEASE
 * SEVERITY SCALE (Wilkinson et al., 2003) — five levels, defined by what is
 * observable on dilated ophthalmoscopy, and written expressly so that it could
 * be applied without stereo photographs. ETDRS is the gold standard and is
 * deliberately NOT used: it has fourteen levels, requires correlation with
 * standard photographs, and the consensus that produced the five-level scale
 * says in its own summary that the ETDRS grading system "is not employed by the
 * vast majority of physicians managing patients with diabetes". A scale nobody
 * can apply grades nothing.
 *
 * ── Where the standards diverge, and both are recorded ───────────────────────
 * 1. WHEN TO REFER. ADA 12.9 says to refer "promptly" and states no interval.
 *    The ICO attaches a number to every stage and a DIFFERENT number by resource
 *    setting: moderate non-proliferative disease is re-examined at 3–6 months in
 *    a high-resource setting and at 6–12 months in a low- or intermediate one,
 *    with referral required in both; severe non-proliferative disease is under 3
 *    months and proliferative disease under 1 month in both. The catalog carries
 *    ADA's instruction as the danger sign because it is the one that fires on a
 *    grade alone, and records ICO's intervals here so the divergence is visible.
 * 2. HOW OFTEN TO LOOK. ADA 12.3 asks for an initial dilated and comprehensive
 *    examination 5 years after onset in type 1 and 12.4 at diagnosis in type 2,
 *    annually thereafter, with 12.5 allowing every 1–2 years only where there has
 *    been no retinopathy and glycaemia is at goal. WHO PEN-H tells the patient
 *    that "Eyes should be screened for eye disease (diabetic retinopathy) at the
 *    time of diagnosis and at least every two years thereafter" — for everyone,
 *    with no glycaemic qualifier and no split by type. Neither is wrong; they are
 *    written for different systems. The interval belongs to a screening rule
 *    rather than to a finding, so NEITHER is asserted on a feature below.
 *    (WHO PEN-H toolkit, Give advice on self-care of Diabetes —
 *    https://www.rescue.org/sites/default/files/document/5214/penhtoolkit-full.pdf)
 * 3. THE UGANDAN TEXT IS MISSING FROM THIS FILE, and that is a gap rather than a
 *    judgement. Uganda Clinical Guidelines 2023 carries a diabetic-retinopathy
 *    section, and four attempts to retrieve it today — two URL forms, from
 *    library.health.go.ug — failed with a TLS certificate-chain error, not a
 *    paywall. Nothing from UCG is quoted, cited or asserted anywhere below. The
 *    CSO memo should carry it as an open item; sibling files in this catalog did
 *    reach the same document yesterday, so this is a transient host problem and
 *    not an unavailable source.
 *
 * ── Not here, deliberately ───────────────────────────────────────────────────
 * VISUAL SYMPTOMS ARE NOT REDEFINED. `visual_symptoms`, `visual_pattern`,
 * `visual_laterality`, `visual_eye`, `visual_loss_recovered`, `visual_eye_pain`
 * and `last_retinal_exam` are all recorded once, in the symptoms section, and
 * they already carry the emergency flags — sudden loss fires red, floaters and a
 * curtain fire amber, monocular loss that recovered routes to the stroke
 * pathway. This segment records what the EXAMINER finds, and a second place to
 * answer "has your vision changed?" is a second answer to disagree with.
 *
 * PAPILLOEDEMA has no feature here. It is already an option on
 * `cerebral_oedema_late_signs` in the neurological segment, where BSPED puts it
 * and where it is correctly labelled a late sign.
 *
 * VITREOUS HAEMORRHAGE has none either. It is inside the proliferative level of
 * the scale below, and when it is dense enough to matter it is the reason the
 * fundus cannot be seen — which `fundus_view_obscured` records, with the referral
 * the guideline attaches to an examination that could not be obtained.
 *
 * RUBEOSIS IRIDIS was considered and left out. NICE names it and the symptoms
 * section already cites that; no source retrieved for THIS file describes how to
 * elicit it or what it obliges, and a finding whose action cannot be sourced is a
 * finding this catalog does not carry.
 *
 * INTRAOCULAR PRESSURE, colour vision, visual fields and slit-lamp findings are
 * out of scope: none is obtainable at the bedside a district clinic actually has,
 * and the three that a torch and an ophthalmoscope can reach are below.
 *
 * ── `requires: "imaging.fundus"` is declared on NOTHING, and that is the point ─
 * Direct ophthalmoscopy is a bedside act. Every retinal finding below is defined
 * by what the scale calls "findings observable on dilated ophthalmoscopy", so
 * gating any of them behind a fundus camera would delete the eye examination
 * from every site that has an ophthalmoscope and no camera — which is most of
 * them, and exactly the site this catalog is built for. What a camera or a
 * slit-lamp genuinely adds is the three-dimensional view that macular THICKENING
 * needs; that limitation is carried as the mandatory caveat on the maculopathy
 * negative, where a clinician reads it, rather than as a capability gate that
 * makes the question disappear.
 *
 * ── `ageBands` is declared on NOTHING either ─────────────────────────────────
 * A retina looks the same at fifteen and at seventy. The one condition in this
 * segment that IS age-restricted — malignant otitis externa, which the source
 * describes in older adults — carries its band in conditions.ts, where it belongs:
 * banding the FINDING would stop an adolescent's ear canal being examined at all,
 * whereas banding the condition merely stops it being ranked. ISPAD's paediatric
 * complications chapter was sought for an adolescent-specific eye recommendation
 * and could not be retrieved (PMC returned a different chapter; PubMed returned a
 * cookie wall), so nothing age-specific is asserted.
 *
 * Every citation here is `csoSigned: false`. The segment ships gated dark.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-08";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * The scale itself, read from the American Academy of Ophthalmology's own
 * reproduction of Table 1 rather than from the 2003 paper's abstract, because
 * the abstract does not carry the findings and the findings are the whole value.
 * Both the U.S. and the international definitions of severe non-proliferative
 * disease are quoted: they differ on how many haemorrhages count, and a catalog
 * that silently picked one would be asserting a boundary it did not read.
 */
const ICDR_2003_SCALE: Citation = {
  standard: "ICDR",
  version:
    "International Clinical Diabetic Retinopathy Disease Severity Scale (Wilkinson CP, Ferris FL III, Klein RE, et al. Ophthalmology 2003;110:1679), as tabulated in AAO Table 1",
  title:
    "Table 1. Diabetic Retinopathy Disease Severity Scale and International Clinical Diabetic Retinopathy Disease Severity Scale — findings observable upon dilated ophthalmoscopy",
  url: "https://www.aao.org/asset.axd?id=b465da67-9d41-4061-8d65-328b54310f03",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "No apparent retinopathy / No abnormalities. Mild NPDR / Microaneurysms only. Moderate NPDR / More than just microaneurysms but less than severe NPDR. Severe NPDR — U.S. Definition: Any of the following (4-2-1 rule) and no signs of proliferative retinopathy: Severe intraretinal hemorrhages and microaneurysms in each of four quadrants; Definite venous beading in two or more quadrants; Moderate IRMA in one or more quadrants. International Definition: Any of the following and no signs of proliferative retinopathy: More than 20 intraretinal hemorrhages in each of four quadrants; Definite venous beading in two or more quadrants; Prominent IRMA in one or more quadrants. PDR / One or both of the following: Neovascularization; Vitreous/preretinal hemorrhage. NOTE: Any patient with two or more of the characteristics of severe NPDR is considered to have very severe NPDR.",
};

/** The one ADA recommendation that turns a grade into an appointment. */
const ADA_S12_REFER: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, rec 12.9",
  title: "12. Retinopathy, Neuropathy, and Foot Care — Diabetic Retinopathy",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "12.9 Promptly refer individuals with any level of diabetic macular edema, moderate or worse nonproliferative diabetic retinopathy (a precursor of proliferative diabetic retinopathy [PDR]), or any PDR to an ophthalmologist who is knowledgeable and experienced in the management of diabetic retinopathy. A",
};

/** And the sentence that makes the lens worth a row of its own. */
const ADA_S12_LENS: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12",
  title: "12. Retinopathy, Neuropathy, and Foot Care — Diabetic Retinopathy",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote: "Glaucoma and cataracts occur earlier and more frequently in people with diabetes.",
};

/**
 * The guideline written for the setting this catalog serves: it states, in one
 * page, what the MINIMUM eye examination is when there is no retina specialist —
 * a vision test with a pinhole, an ophthalmoscope, and a rule for what to do when
 * either cannot be obtained. Everything in the acuity group rests on it.
 */
const ICO_2017_SCREENING: Citation = {
  standard: "local",
  version: "ICO Guidelines for Diabetic Eye Care, January 2017, sections 2.1, 2.2 and 3.1",
  title:
    "ICO Guidelines for Diabetic Eye Care — International Council of Ophthalmology (updated 2017)",
  url: "https://vrsp.org.ph/wp-content/uploads/2018/08/ICOGuidelinesforDiabeticEyeCare.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "in a low-/intermediate resource settings, the minimum examination components to assure appropriate referral should include a screening visual acuity exam and retinal examination adequate for DR classification. Vision should be tested prior to pupil dilation. … Presenting visual acuity examination using a 6/12 (20/40) equivalent handheld chart consisting of at least 5 standard letters or symbols and a pin-hole option if visual acuity is reduced. … Minimum referral guidelines are as follows: i. Visual acuity below 6/12 (20/40) or symptomatic vision complaints … iii. If visual acuity or retinal examination cannot be obtained at the screening examination: refer to ophthalmologist. … Detailed patient assessment should include a complete ophthalmic examination, including visual acuity and the identification and grading of severity of DR and presence of DME for each eye.",
  needsCsoInput:
    "The International Council of Ophthalmology is NOT one of the enumerated standard bodies, hence `local`. The document read is the ICO's own January 2017 guideline (its running header and copyright line say so) served from a national ophthalmological society's mirror rather than from icoph.org; the CSO should confirm the mirror against the ICO's own copy. Its referral text and its own Flowchart 1 are very slightly inconsistent — the text says acuity BELOW 6/12 while the flowchart branches at 6/12 OR WORSE — so no threshold from it is asserted as a rule anywhere; the 6/12 boundary appears only as a display reference band.",
};

/**
 * The same guideline's tables. Cited separately because they are a different
 * claim: Table 1's macular-oedema rows define what counts as maculopathy and say
 * plainly what a direct ophthalmoscope cannot see, and Table 2b is where the
 * referral intervals for a low-resource setting are written down.
 */
const ICO_2017_TABLES: Citation = {
  standard: "local",
  version: "ICO Guidelines for Diabetic Eye Care, January 2017, Table 1 and Table 2b",
  title:
    "ICO Guidelines for Diabetic Eye Care — International Classification of Diabetic Retinopathy and Diabetic Macular Edema; re-examination and referral for low-/intermediate resource settings",
  url: "https://vrsp.org.ph/wp-content/uploads/2018/08/ICOGuidelinesforDiabeticEyeCare.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "No DME / No retinal thickening or hard exudates in the macula. Noncentral-involved DME / Retinal thickening in the macula that does not involve the central subfield zone that is 1mm in diameter. Central-involved DME / Retinal thickening in the macula that does involve the central subfield zone that is 1mm in diameter. Hard exudates are a sign of current or previous macular edema. DME is defined as retinal thickening, and this requires a three-dimensional assessment that is best performed by a dilated examination using slit-lamp biomicroscopy and/or stereo fundus photography. … [Table 2b] Moderate nonproliferative DR / 6-12 months / Referral required; Severe nonproliferative DR / < 3 months / Referral required; PDR / < 1 month / Referral required; Noncentral-involved DME / 3 months / Referral required; Central-involved DME / 1 month / Referral required.",
  needsCsoInput:
    "ICO is not one of the enumerated standard bodies, hence `local`. Table 2b's intervals are recorded in this file's header for the divergence they show against ADA's unquantified 'promptly', and are NOT encoded as a screening interval on any feature — a re-examination schedule belongs to a Complication, which this file does not own. CSO to decide which schedule a Ugandan site profile follows.",
};

/** And what the same guideline says to do about a lens that blocks the view. */
const ICO_2017_CATARACT: Citation = {
  standard: "local",
  version: "ICO Guidelines for Diabetic Eye Care, January 2017, section 7.2",
  title: "ICO Guidelines for Diabetic Eye Care — Management of Cataract",
  url: "https://vrsp.org.ph/wp-content/uploads/2018/08/ICOGuidelinesforDiabeticEyeCare.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "DR progresses faster after cataract surgery, so principles of management are as follows: i. Mild cataract - carefully assess DR status. Patients without vision loss with clear fundus view may not require cataract surgery. … iii. Severe to advanced cataract with poor fundus view - if DR status cannot be adequately assessed, consider early cataract surgery followed by assessment and treatment as necessary.",
  needsCsoInput:
    "ICO is not one of the enumerated standard bodies, hence `local`. Cited for the principle that a lens which blocks the view leaves the retinopathy status UNKNOWN rather than absent. No surgical indication and no treatment from that section is asserted in this catalog.",
};

/**
 * Mucormycosis, and the two sentences that decide whether this belongs in a
 * Ugandan catalog at all: the rhino-orbital pattern is the DIABETIC pattern, and
 * the guideline calls a suspected case an emergency in its own words.
 */
const ECMM_2019_ROC: Citation = {
  standard: "local",
  version:
    "Lancet Infect Dis, published online 4 November 2019 (doi 10.1016/S1473-3099(19)30312-3), Clinical manifestations",
  title:
    "Cornely OA, Alastruey-Izquierdo A, Arenz D, et al. Global guideline for the diagnosis and management of mucormycosis: an initiative of the ECMM in cooperation with the MSG ERC",
  url: "https://www.ecmm.info/wp-content/uploads/Cornely-TLID-2019-Global-guideline-for-the-diagnosis-and-management-of-mucormycosis-an-initiative-of-the-ECMM-in-cooperation-with-theMSG-ERC_OC.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Rhino-orbito-cerebral mucormycosis typically develops in patients with diabetes, whereas such patients very rarely develop lung infection. … Rhino-orbital-cerebral infection usually originates from the paranasal sinuses, with bone destruction and subsequent invasion of the orbit, eye, and brain. Unilateral facial oedema, proptosis, and palatal or palpebral fistula developing into necrosis may be present",
  needsCsoInput:
    "ECMM/MSG-ERC is not one of the enumerated standard bodies, hence `local`. Note what the guideline does NOT say: it describes necrosis and a palatal or palpebral fistula, and nowhere uses the phrase 'black eschar' for rhino-orbital disease — that wording belongs to the CUTANEOUS form in the tertiary source also cited here. The findings below are worded from the guideline, with the taught phrase carried only as a synonym.",
};

/** The same guideline on what a suspected case obliges, in its own words. */
const ECMM_2019_ACTION: Citation = {
  standard: "local",
  version:
    "Lancet Infect Dis, published online 4 November 2019 (doi 10.1016/S1473-3099(19)30312-3), Introduction, Diagnosis and Imaging recommendations",
  title:
    "Global guideline for the diagnosis and management of mucormycosis — ECMM in cooperation with the MSG ERC",
  url: "https://www.ecmm.info/wp-content/uploads/Cornely-TLID-2019-Global-guideline-for-the-diagnosis-and-management-of-mucormycosis-an-initiative-of-the-ECMM-in-cooperation-with-theMSG-ERC_OC.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Suspected mucormycosis requires urgent intervention, because of the often rapidly progressive and destructive nature of the infection. Delayed initiation of therapy is associated with increased mortality. … Patients with suspected mucormycosis should be referred immediately to a facility with the highest care level. … In diabetic patients with facial pain, sinusitis, proptosis, ophthalmoplegia, or newly diagnosed amaurosis, or both, cranial CT or MRI is strongly recommended to determine if sinusitis is present. If sinusitis is diagnosed, endoscopy is strongly recommended to diagnose mucormycosis. … Suspected and confirmed mucormycosis are emergencies and require rapid action … The guideline group strongly supports an early complete surgical treatment for mucormycosis whenever possible, in addition to systemic antifungal treatment.",
  needsCsoInput:
    "ECMM/MSG-ERC is not one of the enumerated standard bodies, hence `local`. The antifungal agents and doses in that guideline are deliberately NOT carried anywhere in this catalog; the actions below stop at imaging, endoscopy, referral and surgical opinion.",
};

/**
 * The tertiary description of what the nose actually looks like. Cited because
 * the ECMM guideline states the pattern and the risk but supplies no bedside
 * appearance, and a clinician cannot look for "invasion of the orbit".
 */
const MUCOR_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Mucormycosis, NBK544364",
  title: "Mucormycosis — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK544364/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Intranasal lesions characteristically have ulcerations with exudate and necrotic tissue and usually progress rapidly over days. … can cause facial numbness, blurry vision, ptosis, proptosis, and loss of extraocular muscle function.",
  needsCsoInput:
    "A tertiary reference work, not a guideline. Cited ONLY for the appearance of the lesion and the rate at which it changes. The chapter describes a 'brown-black eschar' in its CUTANEOUS section and not in the rhino-orbital one; the widely taught phrase 'black eschar on the turbinate or palate' is therefore carried below as a synonym and not as a sourced description. No incidence, sensitivity or mortality figure from this chapter is asserted. CSO to ratify.",
};

/**
 * Malignant otitis externa. The same chapter conditions.ts already cites, read
 * again here for the three things an examination needs: what the pain is like,
 * what to look for in the canal, and how often the facial nerve is already gone.
 */
const NOE_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Necrotizing (Malignant) Otitis Externa, NBK556138",
  title: "Necrotizing (Malignant) Otitis Externa — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK556138/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The prototypical patient with NOE commonly experiences unrelenting otalgia, especially at night, and otorrhea that does not improve with usual topical antimicrobial treatments for otitis externa. … For patients with Pseudomonas NOE, the presence of granulation tissue at the bony-cartilaginous junction of the external auditory canal is considered pathognomonic. … Cranial neuropathies can be observed in patients, and facial palsy has been reported in 21% of cases in a recent systematic review. … MRI surpasses CT in precisely determining the anatomical location and extent of invasion into surrounding soft tissues, especially concerning cranial nerves. … Healthcare practitioners should maintain a heightened suspicion level for NOE to identify and initiate treatment promptly",
  needsCsoInput:
    "A tertiary reference work, not a guideline. The 21% facial-palsy figure is quoted as the chapter states it, attributed to a systematic review that was NOT itself retrieved, and no likelihood ratio is derived from it anywhere. The chapter's word 'pathognomonic' is quoted but is deliberately NOT taken as the discrimination tier — see the comment on the granulation finding. CSO to ratify.",
};

/**
 * The third nerve, and the one rule in this segment that discriminates against
 * something the catalog cannot name. Read for the anatomy, because the anatomy
 * is what makes the sign trustworthy and also what limits it.
 */
const CN3_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Cranial Nerve III Palsy (Oculomotor Palsy), NBK526112",
  title: "Cranial Nerve III Palsy (Oculomotor Palsy) — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK526112/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Microvascular ischemia, often termed microvascular palsy or diabetic cranial nerve III palsy, is the most common etiology in adults. … fibers responsible for pupillary constriction are located superficially within the nerve trunk and receive vascular supply from pial blood vessels. In contrast, deeper somatic motor fibers are supplied by the vasa vasorum. … ischemic processes typically spare pupillary function, and accommodation remains intact … Intracranial aneurysm is the most concerning cause of acute cranial nerve III palsy and typically results from external compression by an enlarging aneurysm. The posterior communicating artery constitutes the classic site … Non–pupil-sparing presentations necessitate urgent computed tomography (CT) and CT angiography to rule out a posterior communicating artery aneurysm. … Pupil-sparing oculomotor nerve palsy caused by upward compression of a large posterior communicating artery aneurysm",
  needsCsoInput:
    "A tertiary reference work, not a guideline, and the only source retrieved for this file that states the rule of the pupil and its exception in one place. It is cited for the anatomy, for the imaging instruction and for the fact that an aneurysm has been reported sparing the pupil. No sensitivity, specificity or likelihood ratio for pupil involvement is asserted anywhere, because none was verified. CSO to ratify, and to decide whether a district site that cannot obtain CT angiography should see this instruction at all or a transfer instruction instead.",
};

const EX = "examination";

/**
 * An eye finding, filed under the part of the examination it is found in. The
 * segment bar shows "Eyes"; inside it, vision comes before the fundus because
 * the acuity is measured before the pupil is dilated and because a retina graded
 * without knowing what the person can see is half a finding.
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

/**
 * The acuity of one eye. A MEASUREMENT, and therefore carrying no
 * `discriminates` — a number discriminates through a cited threshold in a rule
 * (ADR 0083), and the only threshold ICO states for this one is a referral
 * criterion, which is a Criterion and not a property of the field.
 *
 * `refRange` is the WHO/ICO no-impairment band expressed in the denominator the
 * clinician writes down, and it is display only: 6/6 through 6/12 is the range
 * in which ICO's screening pathway sends the patient on to ophthalmoscopy rather
 * than to a refraction. Larger denominator means worse vision, which is why the
 * band is open at the good end and closed at the bad one.
 */
const acuity = (code: string, side: string): Feature => ({
  code,
  display: `Visual acuity — ${side} eye`,
  kind: "measurement",
  valueType: "number",
  /** The DENOMINATOR of the Snellen fraction at 6 m. 6/6 is recorded as 6. */
  unit: "Snellen denominator at 6 m",
  /**
   * The same acuity written the other way round, because half the charts in use
   * are 20-foot charts and 6/12 and 20/40 are the same eye. Exact by design:
   * 12 × 10/3 = 40, where a rounded 3.33 would print 39.996.
   */
  altUnit: { unit: "Snellen denominator at 20 ft", factor: 10 / 3 },
  section: EX,
  group: "ey_acuity",
  refRange: { low: 6, high: 12 },
  synonyms: ["Snellen acuity", "VA", "vision", "distance acuity"],
  elicitation:
    "Test BEFORE dilating the pupil, one eye at a time, with the other eye properly covered — a hand, not fingers. Let the patient wear their usual glasses. Use a 6-metre chart at 6 metres, or the handheld 6/12-equivalent card at the distance printed on it, and record the denominator of the smallest line they read (6/6 is 6, 6/60 is 60). If the vision is reduced, REPEAT IT THROUGH A PINHOLE and record the better of the two: a pinhole that restores the vision points at the spectacles or the lens rather than the retina. If they cannot read the top letter, step through counting fingers, hand movements and perception of light, and write that in words in the notes rather than as a number.",
  citation: ICO_2017_SCREENING,
});

export const EYE_FEATURES: Feature[] = [
  /* ── vision ──────────────────────────────────────────────────────────── */
  /**
   * Two fields rather than one, and not for symmetry. Bilateral gradual loss is
   * diabetic eye disease; unilateral loss is a vascular event, a maculopathy or
   * a lens, and those go to different places. A single "vision" field could not
   * express the difference, and the fellow eye is the only comparator the
   * examiner has.
   */
  acuity("visual_acuity_right", "right"),
  acuity("visual_acuity_left", "left"),

  finding("ey_acuity", {
    /**
     * The cheapest sight-threatening finding in the segment, and the one most
     * often written off as age. ADA records that cataract occurs EARLIER and
     * more frequently in diabetes, so a lens opacity in a forty-year-old is a
     * diabetes finding rather than an incidental one.
     *
     * What it argues is narrow and deliberately so. It does NOT argue that the
     * retina is healthy — ICO's cataract section says the opposite, that a poor
     * fundus view leaves the retinopathy status unassessed and that retinopathy
     * accelerates after cataract surgery. So a lens that blocks the view keeps
     * sight-threatening disease live in the list instead of removing it, and the
     * `discriminates` entry below says exactly that and no more.
     *
     * No `importantNegative`. A clear lens refutes nothing: it means only that
     * whatever the fundus shows can be believed, which is what the next finding
     * records.
     */
    code: "cataract",
    display: "Lens opacity (cataract)",
    valueType: "boolean",
    synonyms: ["cataract", "lens opacity", "white pupil", "absent red reflex"],
    elicitation:
      "Darken the room. Hold the ophthalmoscope at arm's length, set to +2 or +3, and look at both pupils together down the beam: a normal lens gives an even orange-red reflex, and an opacity shows as a black shape or as a dull, absent reflex on one side. Then look with a torch from the side for a grey or white lens behind the pupil. Record it in BOTH eyes and say which is worse — and note whether you could still see the retina afterwards, because that is a separate question and the next one.",
    citation: ADA_S12_LENS,
    discriminates: [
      {
        condition: "sight_threatening_retinopathy",
        direction: "supports",
        strength: "weak",
        rationale:
          "ICO treats a lens that blocks the view as a reason the retinopathy status cannot be established rather than as evidence of a healthy retina, and records that retinopathy progresses faster after cataract surgery. A cataract therefore keeps sight-threatening disease in the differential rather than explaining the vision away. Weak, because the opacity itself is not retinal disease and most cataracts sit over a retina that is fine.",
        citation: ICO_2017_CATARACT,
      },
    ],
  }),

  /* ── fundus ──────────────────────────────────────────────────────────── */
  finding("ey_fundus", {
    /**
     * The finding that stops the worst error this segment can make: recording
     * "no retinopathy" because nobody could see. `Assessed<T>` already separates
     * not-done from not-available, but neither of those states covers the third
     * case — the examination WAS attempted, and the view defeated it — and that
     * case is the one ICO writes a referral criterion for.
     *
     * A dense vitreous haemorrhage lives here rather than in the scale below for
     * the same reason: when it is bad enough to matter, it is the reason the
     * retina cannot be graded.
     */
    code: "fundus_view_obscured",
    display: "Fundus could not be adequately seen",
    valueType: "boolean",
    synonyms: [
      "no fundal view",
      "media opacity",
      "poor view",
      "hazy media",
      "vitreous haemorrhage obscuring the view",
    ],
    elicitation:
      "Answer this only after you have genuinely tried. Darken the room, dilate the pupil where it is safe and permitted to do so, and look for the disc, then follow the vessels out into all four quadrants and finally ask the patient to look at the light so you see the macula. Record YES if a cataract, a hazy vitreous, a small pupil or an uncooperative patient stopped you seeing enough of the retina to grade it — and say which, in the notes. Recording NO is a claim that you saw the retina well enough for the grade below to mean something.",
    citation: ICO_2017_SCREENING,
    dangerSign: {
      severity: "amber",
      action:
        "Refer to an ophthalmologist. ICO's minimum referral guidelines state that if visual acuity or retinal examination cannot be obtained at the screening examination, the patient is referred — an ungradable retina is an unknown retina, not a normal one.",
      citation: ICO_2017_SCREENING,
    },
    discriminates: [
      {
        condition: "sight_threatening_retinopathy",
        direction: "supports",
        strength: "weak",
        rationale:
          "ICO makes an examination that could not be obtained a referral criterion in its own right, and its cataract section directs that where retinopathy status cannot be adequately assessed the assessment be brought forward rather than deferred. The finding does not argue that the disease is there; it argues that nothing has yet argued it is not. Weak by construction.",
        citation: ICO_2017_SCREENING,
      },
    ],
  }),

  finding("ey_fundus", {
    /**
     * The grade, on the published five-level scale, for the WORSE eye.
     *
     * Two decisions are worth defending. First, one field rather than one per
     * eye: the referral in ADA 12.9 fires on a person having a grade of moderate
     * or worse anywhere, not on a side, and a pair of fields would fire the same
     * amber twice for one problem — which is how an interface teaches people to
     * scroll past the first one. The fellow eye is recorded as a property below,
     * and the worse-eye convention makes that property gate itself correctly:
     * when the worse eye is `none`, both eyes are clear and there is nothing left
     * to ask.
     *
     * Second, `none` is the literal option value on purpose. The ranker reads
     * `none` as a RECORDED NEGATIVE, so a retina that was examined and graded as
     * clear argues against sight-threatening disease — which is what the examiner
     * meant. Under any other token, a normal fundus would have argued for it.
     *
     * The 4-2-1 findings that separate severe from moderate are in the
     * elicitation, not as four more fields. They are the DEFINITION of a level on
     * a scale the catalog already carries whole; capturing them separately would
     * create a second place for the grade to be decided, and the two would
     * disagree.
     */
    code: "retinopathy_stage",
    display: "Retinopathy grade (worse eye)",
    valueType: "single_select",
    synonyms: [
      "diabetic retinopathy",
      "DR grade",
      "ICDR stage",
      "NPDR",
      "PDR",
      "background retinopathy",
      "proliferative retinopathy",
    ],
    elicitation:
      "Grade what you can see on dilated ophthalmoscopy, quadrant by quadrant, and grade the WORSE eye here. Microaneurysms alone are mild. Anything more than microaneurysms — dot and blot haemorrhages, hard exudates, cotton-wool spots — but short of the next line is moderate. Severe is the 4-2-1 rule: severe intraretinal haemorrhages in all four quadrants (the international wording is more than 20 in each of four quadrants), or definite venous beading in two or more quadrants, or intraretinal microvascular abnormalities in one or more, with no new vessels. Proliferative is new vessels anywhere, or a vitreous or preretinal haemorrhage. If you cannot see enough to choose, do not guess — record the previous finding instead.",
    citation: ICDR_2003_SCALE,
    options: [
      { value: "none", display: "No apparent retinopathy — no abnormalities" },
      { value: "mild_npdr", display: "Mild non-proliferative — microaneurysms only" },
      {
        value: "moderate_npdr",
        display: "Moderate non-proliferative — more than microaneurysms, less than severe",
      },
      {
        value: "severe_npdr",
        display: "Severe non-proliferative — the 4-2-1 rule, no new vessels",
      },
      {
        value: "pdr",
        display: "Proliferative — new vessels, or vitreous or preretinal haemorrhage",
      },
    ],
    dangerSign: {
      severity: "amber",
      action:
        "Refer promptly to an ophthalmologist experienced in diabetic retinopathy. ADA 12.9 attaches this to moderate or worse non-proliferative disease and to any proliferative disease; ICO puts a number on it — under 3 months for severe non-proliferative disease and under 1 month for proliferative disease, in high- and low-resource settings alike.",
      when: {
        id: "sight_threatening_grade",
        label: "Moderate or worse non-proliferative retinopathy, or any proliferative retinopathy",
        any: [
          { feature: "retinopathy_stage", op: "==", value: "moderate_npdr" },
          { feature: "retinopathy_stage", op: "==", value: "severe_npdr" },
          { feature: "retinopathy_stage", op: "==", value: "pdr" },
        ],
        citation: ADA_S12_REFER,
      },
      citation: ADA_S12_REFER,
    },
    discriminates: [
      {
        condition: "sight_threatening_retinopathy",
        direction: "supports",
        strength: "strong",
        rationale:
          "ADA defines the referable disease by this scale's own levels — moderate or worse non-proliferative retinopathy, which it calls a precursor of proliferative disease, and any proliferative disease. A recorded grade is therefore not evidence about the condition, it is very nearly the condition, which is why this is the strongest link in the segment.",
        citation: ADA_S12_REFER,
      },
    ],
    importantNegative: {
      absenceRefutes: ["sight_threatening_retinopathy"],
      caveat:
        "A grade of no apparent retinopathy refutes sight-threatening RETINOPATHY on the day it was recorded and nothing else. It does not exclude macular oedema, which ADA and ICO grade on a SEPARATE scale and which ADA makes referable at any level — so this negative must never be read across to the maculopathy question below. It is worth only as much as the view was: an undilated direct ophthalmoscope sees a narrow field around the disc, and the scale it is being read against was written for a DILATED examination. And it says nothing about next year — the interval to the next look is a separate question on which the standards openly disagree, and it is not answered by any finding in this file.",
      citation: ICDR_2003_SCALE,
    },
  }),
  prop("retinopathy_stage", {
    /**
     * The fellow eye, asked only when the worse eye has something. ICO's detailed
     * assessment asks for a grade for EACH eye, and the pair matters clinically:
     * asymmetric retinopathy is a reason to think about carotid disease or an old
     * vein occlusion rather than about glycaemic control, and it changes which
     * eye is the one that must not be lost.
     */
    code: "retinopathy_other_eye",
    display: "The other eye",
    valueType: "single_select",
    citation: ICO_2017_SCREENING,
    options: [
      { value: "same", display: "Same grade" },
      { value: "none", display: "No apparent retinopathy" },
      { value: "mild_npdr", display: "Mild non-proliferative" },
      { value: "moderate_npdr", display: "Moderate non-proliferative" },
      { value: "severe_npdr", display: "Severe non-proliferative" },
      { value: "pdr", display: "Proliferative" },
      { value: "not_seen", display: "Could not be seen" },
    ],
  }),

  finding("ey_fundus", {
    /**
     * Graded separately from the retinopathy above because the sources grade it
     * separately, and folding the two together would lose the fact ADA 12.9
     * turns on: ANY level of macular oedema is referable, including in an eye
     * whose retinopathy is only mild.
     *
     * The honest position about what a district clinic can see is written into
     * the negative rather than into a capability gate. Macular oedema IS retinal
     * thickening, and ICO says plainly that thickening needs a three-dimensional
     * assessment. A monocular direct ophthalmoscope cannot see thickening. What
     * it CAN see is the hard exudate that ICO calls a sign of current or previous
     * macular oedema, and that is what this field asks for — a proxy, declared as
     * one.
     */
    code: "diabetic_maculopathy",
    display: "Maculopathy — exudates or thickening at the macula",
    valueType: "boolean",
    synonyms: [
      "diabetic macular oedema",
      "DME",
      "DMO",
      "clinically significant macular oedema",
      "maculopathy",
      "circinate exudates",
    ],
    elicitation:
      "Look at the macula LAST, because the light is uncomfortable and the pupil will constrict. Ask the patient to look directly into the beam; the macula is the darker, vessel-free area about two disc diameters temporal to the disc. Record YES for hard exudates at or around the fovea — especially a ring of them — or for any area that looks thickened or loses the foveal reflex. Judge the distance from the CENTRE, not from the disc, because that is what decides how fast the referral has to be. A stereoscopic or camera view will see thickening you cannot; a normal-looking macula down a direct ophthalmoscope does not settle the question.",
    citation: ICO_2017_TABLES,
    dangerSign: {
      severity: "amber",
      action:
        "Refer promptly to an ophthalmologist experienced in diabetic retinopathy. ADA 12.9 makes ANY level of diabetic macular oedema referable; ICO gives 3 months for oedema that spares the central 1 mm and 1 month for oedema that involves it.",
      citation: ADA_S12_REFER,
    },
    discriminates: [
      {
        condition: "sight_threatening_retinopathy",
        direction: "supports",
        strength: "strong",
        rationale:
          "ADA names any level of diabetic macular oedema first among the findings requiring prompt referral, ahead of the retinopathy grade — it is the commonest reason a person with diabetes loses central vision, and it does so at retinopathy grades that are otherwise not referable at all.",
        citation: ADA_S12_REFER,
      },
    ],
    importantNegative: {
      absenceRefutes: ["sight_threatening_retinopathy"],
      caveat:
        "This is the weakest negative in the segment and must be read as such. ICO defines macular oedema as retinal THICKENING requiring a three-dimensional assessment best performed with slit-lamp biomicroscopy or stereo fundus photography; a direct ophthalmoscope gives a flat, monocular image and can only see the hard exudates that mark current or previous oedema. A recorded no therefore excludes visible exudate at the macula, not oedema — and central-involved oedema with dropping vision has been missed exactly this way. Where the acuity has fallen and this field is negative, believe the acuity.",
      citation: ICO_2017_TABLES,
    },
  }),
  prop("diabetic_maculopathy", {
    /**
     * The 1 mm that decides between a month and three. ICO draws the line at the
     * central subfield, and "cannot tell" is a real and common answer down a
     * direct ophthalmoscope — offering it stops the field being filled in with a
     * guess that would then look like a graded finding.
     */
    code: "maculopathy_centre_involved",
    display: "Does it involve the centre",
    valueType: "single_select",
    citation: ICO_2017_TABLES,
    options: [
      { value: "noncentral", display: "Spares the central 1 mm" },
      { value: "central", display: "Involves the central 1 mm" },
      { value: "cannot_tell", display: "Cannot tell from this view" },
    ],
  }),

  /* ── external eye, orbit and cranial nerves ──────────────────────────── */
  finding("ey_external", {
    /**
     * A cranial nerve finding with a home, because the neurological segment
     * explicitly hands the orbit and the eye movements to this one.
     *
     * What it argues INSIDE the catalog is modest: an ophthalmoplegia is one of
     * the four features the mucormycosis guideline names in a diabetic patient as
     * a trigger for cranial imaging. What it argues OUTSIDE the catalog is the
     * whole reason it is here, and the discrimination layer cannot express it —
     * see the pupil property below.
     */
    code: "third_nerve_palsy",
    display: "Third nerve palsy — ptosis with a down-and-out eye",
    valueType: "boolean",
    synonyms: [
      "oculomotor nerve palsy",
      "CN III palsy",
      "diabetic third nerve palsy",
      "ophthalmoplegia",
      "ptosis with diplopia",
    ],
    elicitation:
      "Look at the lids first, from in front and at eye level: a droop that covers more of one pupil than the other. Then hold the head still and take a target through an H, watching each eye separately — a third nerve palsy cannot look up, down or inwards, so the eye sits down and out and the patient sees double when they try. Ask when it started and whether it hurt: a sudden painful one is the presentation that matters most. Then, before anything else, examine the pupil.",
    urgency: "urgent",
    citation: CN3_STATPEARLS,
    discriminates: [
      {
        condition: "rhino_orbito_cerebral_mucormycosis",
        direction: "supports",
        strength: "weak",
        rationale:
          "The ECMM guideline names ophthalmoplegia among the findings in a DIABETIC patient — with facial pain, sinusitis, proptosis or a new amaurosis — that make cranial CT or MRI strongly recommended. Weak on its own: a painless isolated third nerve palsy in a well person is far more often microvascular, and it is the company it keeps that raises this.",
        citation: ECMM_2019_ACTION,
      },
    ],
  }),
  prop("third_nerve_palsy", {
    /**
     * The sparing IS the finding, and this is where it is modelled.
     *
     * The discrimination it carries cannot be written as a `Discrimination`,
     * because the condition it argues against — a compressive posterior
     * communicating artery aneurysm — is not in this catalog and must not be
     * added to it: the engine has no criteria for an aneurysm and would be
     * implying it reasons about one. ADR 0083 anticipates exactly this and its
     * answer for a rule is a named string; the answer for a FINDING is an action.
     * So the argument is carried as the instruction the source itself gives, on
     * the option where it applies, and nowhere is it dressed up as a ranking.
     *
     * The anatomy is what makes it work and also what limits it. The
     * pupilloconstrictor fibres run superficially and are fed by pial vessels;
     * the motor fibres run deep and are fed by the vasa vasorum. An aneurysm
     * compresses from outside and takes the pupil; ischaemia — the diabetic
     * mechanism — starves the core and spares it. But the source records an
     * aneurysm that spared the pupil, so a spared pupil is a reason to be less
     * worried and never a reason not to image. The elicitation says so, and there
     * is deliberately no `importantNegative` claiming otherwise: the thing a
     * spared pupil would refute is not a condition this catalog holds.
     */
    code: "third_nerve_pupil",
    display: "The pupil",
    valueType: "single_select",
    synonyms: ["rule of the pupil", "pupil-sparing", "pupil-involving", "blown pupil"],
    elicitation:
      "Compare the two pupils in dim light before you shine anything: note the size of each. Then swing a bright light between them and watch both the direct and the consensual response. Pupil INVOLVED means the pupil on the affected side is larger and reacts poorly or not at all to light. Record `cannot assess` honestly if the lid is closed over it, if the patient has had drops, or if there is old iris disease — an unassessable pupil is treated the same as an involved one, because the question it was meant to answer is still open.",
    citation: CN3_STATPEARLS,
    options: [
      { value: "spared", display: "Spared — equal size, reacts normally" },
      { value: "involved", display: "Involved — dilated or poorly reactive" },
      { value: "cannot_assess", display: "Cannot assess" },
    ],
    dangerSign: {
      severity: "red",
      action:
        "Treat as a possible compressive aneurysm, not as a diabetic palsy. StatPearls states that non–pupil-sparing presentations necessitate urgent CT and CT angiography to rule out a posterior communicating artery aneurysm; where that cannot be done on site, transfer to somewhere it can. A spared pupil makes an aneurysm less likely and does not exclude it — the same chapter records one that spared the pupil.",
      when: {
        id: "pupil_involving_third_nerve_palsy",
        label: "Third nerve palsy with a pupil that is involved or cannot be assessed",
        any: [
          { feature: "third_nerve_pupil", op: "==", value: "involved" },
          { feature: "third_nerve_pupil", op: "==", value: "cannot_assess" },
        ],
        citation: CN3_STATPEARLS,
      },
      citation: CN3_STATPEARLS,
    },
  }),

  finding("ey_external", {
    /**
     * The finding that is worth the whole segment on the day it appears. Look in
     * the nose of a person who is acidotic and has a painful, swollen face, and
     * either there is dead tissue there or there is not.
     *
     * NO `importantNegative`, and for the same reason the neurological segment
     * gives none to the late signs of raised intracranial pressure: the guideline
     * describes infection ORIGINATING in the paranasal sinuses and invading the
     * orbit and brain afterwards, so a clean-looking nose is the expected finding
     * in exactly the patient who is still salvageable. A recorded negative here
     * refutes nothing, and claiming that it did would be more dangerous than
     * saying nothing.
     */
    code: "nasal_or_palatal_necrosis",
    display: "Necrotic or ulcerated lesion in the nose or on the palate",
    valueType: "boolean",
    synonyms: [
      "black eschar",
      "palatal eschar",
      "necrotic turbinate",
      "palatal necrosis",
      "invasive fungal sinusitis",
    ],
    elicitation:
      "Look, with a torch, in two places people forget to look. Lift the tip of the nose and shine the light along each floor and turbinate: the lesion ulcerates, carries exudate and dead tissue, and the guideline describes it progressing over DAYS, so a nose that was normal last week means nothing today. Then ask the patient to open wide and inspect the whole hard palate, including behind the teeth, for a dark, dusky or frankly dead patch — press gently with a spatula for anaesthesia and for tissue that does not blanch. Take a swab or a biopsy to the laboratory yourself if you can; a delay here is the thing that kills.",
    urgency: "immediate",
    citation: MUCOR_STATPEARLS,
    dangerSign: {
      severity: "red",
      action:
        "Treat as suspected mucormycosis. The ECMM/MSG-ERC global guideline states that suspected and confirmed mucormycosis are emergencies requiring rapid action, that patients with suspected mucormycosis should be referred immediately to a facility with the highest care level, and that early complete surgical treatment is strongly supported in addition to systemic antifungal treatment. Obtain cranial CT or MRI, get an ENT opinion for endoscopy and biopsy, and correct the ketoacidosis in parallel — do not wait for the culture.",
      citation: ECMM_2019_ACTION,
    },
    discriminates: [
      {
        condition: "rhino_orbito_cerebral_mucormycosis",
        direction: "supports",
        strength: "strong",
        rationale:
          "The ECMM guideline places the rhino-orbito-cerebral form squarely in diabetes and describes palatal or palpebral fistula developing into necrosis; the bedside appearance — intranasal ulceration with exudate and necrotic tissue, progressing over days — comes from the tertiary chapter cited on the feature. Strong rather than pathognomonic: necrotic palatal and nasal lesions have other causes, and this catalog holds criteria for none of them.",
        citation: ECMM_2019_ROC,
      },
    ],
  }),

  finding("ey_external", {
    /**
     * The orbital half of the same disease, and the half that arrives first. It
     * carries an AMBER danger sign beside the red above, which is not an
     * inconsistency: the guideline attaches a specific, different instruction to
     * this specific finding — image the cranium — and firing a second red for the
     * same suspicion is how a flag list gets scrolled past. The urgency is
     * `immediate` on both, which is the axis that actually answers "by when".
     *
     * UNILATERAL is in the display because it is in the guideline, and because
     * bilateral periorbital swelling is nephrotic, cardiac or allergic far more
     * often than it is fungal.
     */
    code: "proptosis_or_periorbital_swelling",
    display: "Unilateral proptosis or periorbital or facial swelling",
    valueType: "boolean",
    synonyms: [
      "proptosis",
      "exophthalmos",
      "orbital cellulitis",
      "periorbital oedema",
      "unilateral facial oedema",
    ],
    elicitation:
      "Stand behind the seated patient, tilt their head back and look down over the brow at both corneas together — a globe that is pushed forward shows itself from above long before it does from in front. Compare the lid swelling on the two sides and press gently for tenderness over the maxilla and the medial canthus. Then check what the orbit is doing to the eye: the movements in all directions, the vision in that eye, and the pupil reaction. Ask about facial pain and blocked nose, and look in the nose while you are there.",
    urgency: "immediate",
    citation: ECMM_2019_ROC,
    dangerSign: {
      severity: "amber",
      action:
        "Arrange cranial CT or MRI now. The ECMM/MSG-ERC guideline strongly recommends cranial CT or MRI in diabetic patients with facial pain, sinusitis, proptosis, ophthalmoplegia or a newly diagnosed amaurosis, MRI in preference where eye or brain disease is suspected, followed by endoscopy if sinusitis is found.",
      citation: ECMM_2019_ACTION,
    },
    discriminates: [
      {
        condition: "rhino_orbito_cerebral_mucormycosis",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Unilateral facial oedema and proptosis are the two orbital features the ECMM guideline lists for rhino-orbito-cerebral disease, which it says typically develops in patients with diabetes. Moderate rather than strong because bacterial orbital cellulitis produces the same picture and is commoner; what separates them at the bedside is the nose and the palate, which is the finding above.",
        citation: ECMM_2019_ROC,
      },
    ],
  }),

  finding("ey_external", {
    /**
     * The symptom that has to make somebody look in the ear. It is here rather
     * than with the symptoms because it is meaningless on its own and only
     * becomes a finding beside the canal that is examined two rows down — and
     * because the pattern is the point: pain that is out of proportion, worse at
     * night, in an ear that has already failed the drops.
     */
    code: "deep_otalgia_unresponsive",
    display: "Unrelenting deep ear pain, worse at night, not settling on topical treatment",
    valueType: "boolean",
    synonyms: ["otalgia", "refractory otitis externa", "night ear pain", "deep ear pain"],
    elicitation:
      "Ask three things and record all three: does the pain wake them at night, is it deep behind the ear rather than in the canal, and has it been treated with ear drops already and failed to settle. Then look for discharge and for tenderness over the mastoid and at the temporomandibular joint. Pain that is worse than the canal looks is the whole signal — and in a person with diabetes, a discharging ear that has not settled on drops is examined again rather than given a second bottle.",
    citation: NOE_STATPEARLS,
    discriminates: [
      {
        condition: "malignant_otitis_externa",
        direction: "supports",
        strength: "moderate",
        rationale:
          "StatPearls describes the prototypical patient as having unrelenting otalgia, especially at night, and otorrhoea that does not improve with the usual topical antimicrobial treatment for otitis externa — the combination, in a person with diabetes, is what separates this from the ordinary swimmer's ear it is treated as.",
        citation: NOE_STATPEARLS,
      },
    ],
    importantNegative: {
      absenceRefutes: ["malignant_otitis_externa"],
      caveat:
        "The source calls unrelenting night pain the PROTOTYPICAL presentation, which is a typical picture and not a diagnostic criterion — no source retrieved here states how often the disease presents without it. The same chapter records cranial neuropathies, with facial palsy reported in 21% of cases, so the skull base can already be involved in a patient whose pain was dismissed or who has little pain to report. A negative here never substitutes for looking in the canal.",
      citation: NOE_STATPEARLS,
    },
  }),

  finding("ey_external", {
    /**
     * The sign the source calls pathognomonic — and the tier below is `strong`
     * rather than `pathognomonic` on purpose. ADR 0083 reserves that tier for a
     * finding no other condition IN THIS CATALOG explains, and warns on every
     * use; the word here comes from a tertiary reference work, is qualified in
     * that work to Pseudomonas disease, and granulation in a canal also follows
     * chronic suppuration, a retained foreign body and cholesteatoma — none of
     * which this catalog holds criteria for. Quoting the source's word in the
     * rationale gives the clinician everything the tier would have, and claims
     * less.
     */
    code: "ear_canal_granulation",
    display: "Granulation tissue in the external ear canal",
    valueType: "boolean",
    synonyms: [
      "granulation at the bony-cartilaginous junction",
      "malignant otitis externa",
      "necrotising otitis externa",
      "skull base osteomyelitis",
    ],
    elicitation:
      "Clear the discharge first — you cannot see granulation through debris. Then take the otoscope and look specifically at the FLOOR of the canal at the junction between its cartilaginous outer third and its bony inner two thirds, roughly halfway in: granulation is red, fleshy, bleeds when touched and sits on the bone. Look at the drum too, and record whether you saw it. Examine the facial nerve in the same visit, both sides, and swab the discharge before any antibiotic is started.",
    urgency: "immediate",
    citation: NOE_STATPEARLS,
    dangerSign: {
      severity: "red",
      action:
        "Treat as necrotising (malignant) otitis externa until proven otherwise: same-day ENT referral, cross-sectional imaging — StatPearls states MRI surpasses CT in determining the extent of invasion into surrounding soft tissues, especially concerning cranial nerves — and admission for systemic rather than topical antimicrobial therapy. Send the discharge for culture before antibiotics. Do not discharge on drops.",
      citation: NOE_STATPEARLS,
    },
    discriminates: [
      {
        condition: "malignant_otitis_externa",
        direction: "supports",
        strength: "strong",
        rationale:
          "StatPearls states that for patients with Pseudomonas necrotising otitis externa the presence of granulation tissue at the bony-cartilaginous junction of the external auditory canal is considered pathognomonic, and that most who develop it are older adults who almost invariably have an underlying condition, diabetes being the primary one.",
        citation: NOE_STATPEARLS,
      },
    ],
    importantNegative: {
      absenceRefutes: ["malignant_otitis_externa"],
      caveat:
        "Only if you actually cleared the canal and saw the bony-cartilaginous junction — granulation hides behind discharge and debris, and a canal too swollen to pass an otoscope through has not been examined. The source ties the sign specifically to Pseudomonas disease, so its absence does not speak to the fungal and other organisms the same chapter describes. A clean canal in a person with unrelenting night pain, a facial palsy or a raised inflammatory response is a reason to image, not a reason to stop.",
      citation: NOE_STATPEARLS,
    },
  }),

  finding("ey_external", {
    /**
     * The nerve that says the disease has reached the skull base. It sits in this
     * segment rather than the neurological one by that segment's own explicit
     * hand-off: cranial nerve findings belong to the eye and face examination,
     * and a lateralised limb sign is what `lateralising_neurological_signs`
     * records. There is deliberately no danger sign here — the ear findings above
     * already carry the red, and two alarms for one infection is how the first
     * one gets ignored.
     *
     * `urgency` IS declared, and the citation says whose judgement that is: the
     * source states that cranial neuropathies occur and that MRI is needed to
     * determine their extent, but it attaches no timeframe, so the tier is the
     * catalog's own and is flagged as such rather than presented as the source's.
     */
    code: "facial_nerve_palsy",
    display: "Facial nerve palsy",
    valueType: "boolean",
    synonyms: [
      "seventh nerve palsy",
      "CN VII palsy",
      "lower motor neurone facial weakness",
      "Bell's palsy",
    ],
    elicitation:
      "Watch the face at rest and while they talk, then test the upper and lower halves separately: raise the eyebrows, screw the eyes shut against your thumbs, show the teeth, puff out the cheeks. A LOWER MOTOR NEURONE palsy takes the forehead too and cannot close the eye — that is the one that matters beside a discharging ear, and it is on the SAME side. Record whether the eye closes fully, because a cornea that is not covered will ulcerate within days. Then look in that ear if you have not already.",
    urgency: "urgent",
    citation: {
      ...NOE_STATPEARLS,
      needsCsoInput:
        "As above, and one addition specific to this feature: the URGENCY TIER IS THE CATALOG'S, not the source's. StatPearls records that cranial neuropathies occur in necrotising otitis externa, that facial palsy was reported in 21% of cases in a systematic review it cites, and that MRI is needed to determine the extent of cranial-nerve involvement — but it states no timeframe, and `urgent` is our reading of a skull-base infection with a nerve already lost. CSO to ratify or to strike the tier. Facial palsy also has many causes outside this catalog, and none of them is ranked here.",
    },
    discriminates: [
      {
        condition: "malignant_otitis_externa",
        direction: "supports",
        strength: "moderate",
        rationale:
          "StatPearls records that cranial neuropathies can be observed and that facial palsy has been reported in 21% of cases in a recent systematic review, the facial nerve being affected most often because of its anatomical proximity — in an ear that is discharging and painful, a facial palsy means the infection has left the canal. Moderate rather than strong, because an isolated facial palsy with a normal ear is far more often idiopathic.",
        citation: NOE_STATPEARLS,
      },
    ],
  }),
];
