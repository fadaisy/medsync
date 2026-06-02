/**
 * Resus dose-currency table (GATE C) — the cited drug-dose constants the
 * ABCDE surface may display.
 *
 * CLINICAL-SAFETY ARTIFACT. "Never ship a remembered dose": every value
 * here was web-verified on 2026-06-01 against a primary/authoritative
 * source and carries a `confidence`. Only TIER-1 web-verified values are
 * fixed constants; everything else is `category` (no fixed mg shown — the
 * clinician doses) or `protocol_surfaced` (the dose comes from the local
 * protocol, not hard-coded here). Paediatric dosing is age/weight-banded
 * and explicitly NOT encoded as adult numbers (see `paediatricNote`).
 *
 * Source of truth: docs/resus-abcde-gate-a-proposal.md §A.3 (CSO-signed
 * 2026-06-02). Doses must be RE-VERIFIED against the primary source at
 * each build per the clinical-safety commitment.
 *
 * The app RECORDS what a clinician administers; it never orders or
 * auto-administers. A constant here is a reference shown to the team.
 */

export const RESUS_DOSE_META = {
  verifiedOn: "2026-06-01",
  guidelineCycle: "2025",
  note: "Adult constants only. Re-verify against the primary source at build. Paediatric doses are banded — never reuse an adult number for a child.",
} as const;

export type DoseConfidence = "verified-web" | "reference-doc-only" | "needs-CSO-verification";

/**
 * - `fixed`             web-verified value, shown as a cited constant.
 * - `protocol_surfaced` value exists but the surface defers the number to
 *                       the local protocol (e.g. major-haemorrhage pack);
 *                       only the time-critical fact is fixed.
 * - `category`          no fixed mg on this surface — the clinician doses.
 */
export type DoseTier = "fixed" | "protocol_surfaced" | "category";

export interface ResusDose {
  id: string;
  drug: string;
  indication: string;
  tier: DoseTier;
  /** The exact adult value for `fixed`; null for `category`. */
  adultDose: string | null;
  /** A fixed time-critical fact even when the dose is protocol-surfaced. */
  timing?: string;
  /** Banded/weight-based note — never a single paediatric number. */
  paediatricNote: string;
  cautions?: string[];
  source: string;
  confidence: DoseConfidence;
}

export const RESUS_DOSES = {
  /* ── TIER 1: fixed cited constants (web-verified) ───────────────── */
  anaphylaxis_adrenaline_im: {
    id: "anaphylaxis_adrenaline_im",
    drug: "Adrenaline (epinephrine) 1:1000",
    indication: "Anaphylaxis — first-line (cross-cutting A/B/C/E)",
    tier: "fixed",
    adultDose: "500 micrograms (0.5 mg) = 0.5 mL of 1:1000, IM anterolateral mid-thigh",
    timing: "Repeat every 5 minutes if no improvement",
    paediatricNote:
      "Age-banded IM 1:1000 (RCUK/BNFc): >12 yr 500 µg; 6–12 yr 300 µg; 6 mo–6 yr 150 µg; <6 mo 100–150 µg. Display banded — verify at build.",
    cautions: [
      "Route is IM, NOT IV, for initial treatment.",
      "Refractory (no improvement after 2 IM doses) → IV adrenaline infusion by experienced clinicians only — infusion rate is NOT shown here.",
      "2025: routine corticosteroids are NO LONGER recommended in acute anaphylaxis.",
    ],
    source:
      "Resuscitation Council UK Anaphylaxis guidance, concurrent with ERC Guidelines 2025 Special Circumstances (0.5 mg IM, repeat if no improvement within 5 min).",
    confidence: "verified-web",
  },
  hypoglycaemia_iv_glucose: {
    id: "hypoglycaemia_iv_glucose",
    drug: "Glucose 10% / 20%, IV",
    indication: "Severe hypoglycaemia (CBG <4.0 mmol/L) with IV access (D)",
    tier: "fixed",
    adultDose: "75 mL of 20% glucose OR 150 mL of 10% glucose IV over 10–15 min",
    timing: "Recheck CBG at 10–15 min; repeat if still <4.0; then long-acting carbohydrate",
    paediatricNote:
      "Paediatric is weight-based (mL/kg of 10% glucose) per APLS — a SEPARATE protocol. Never reuse the adult fixed volume.",
    cautions: ["50% glucose is no longer recommended."],
    source:
      "Joint British Diabetes Societies (JBDS-IP), Hospital Management of Hypoglycaemia in Adults, Jan 2023.",
    confidence: "verified-web",
  },
  hypoglycaemia_glucagon_im: {
    id: "hypoglycaemia_glucagon_im",
    drug: "Glucagon 1 mg, IM",
    indication: "Severe hypoglycaemia when NO IV access (D)",
    tier: "fixed",
    adultDose: "1 mg IM",
    paediatricNote:
      "BNFc bands: <8 yr (or <25 kg) 500 µg IM; ≥8 yr (or ≥25 kg) 1 mg IM. Verify the band cut at build.",
    cautions: [
      "One dose only; less/ineffective if glycogen-depleted (malnourished, alcohol-dependent, hepatic, sulfonylurea overdose) — get IV glucose.",
      "Still give oral/IV carbohydrate once conscious.",
    ],
    source: "JBDS-IP Jan 2023 / BNF / GlucaGen HypoKit SmPC.",
    confidence: "verified-web",
  },
  hypoglycaemia_oral_cho: {
    id: "hypoglycaemia_oral_cho",
    drug: "Oral fast-acting carbohydrate",
    indication: "Hypoglycaemia, conscious and able to swallow (D)",
    tier: "fixed",
    adultDose: "15–20 g quick-acting carbohydrate",
    timing: "Re-test at 10–15 min, repeat up to 3×; then 20 g long-acting carbohydrate",
    paediatricNote:
      "Weight/age-appropriate carbohydrate per paediatric guidance — verify at build.",
    source: "JBDS-IP Jan 2023.",
    confidence: "verified-web",
  },
  oxygen_critically_ill: {
    id: "oxygen_critically_ill",
    drug: "Oxygen, high-concentration",
    indication: "Any critically ill / hypoxaemic patient (A/B, cross-cutting)",
    tier: "fixed",
    adultDose: "15 L/min via non-rebreathe reservoir mask initially",
    timing:
      "Titrate to target SpO₂ 94–98% (88–92% if at risk of hypercapnic/type-2 respiratory failure)",
    paediatricNote:
      "Same SpO₂ targets; paediatric mask sizing/flow per APLS — device differs, targets do not.",
    cautions: [
      "Oxygen is a drug — record the target range.",
      "If hypercapnic risk: controlled O₂ (Venturi) + check ABG.",
    ],
    source: "British Thoracic Society Guideline for Oxygen Use in Adults 2017.",
    confidence: "verified-web",
  },
  sepsis_crystalloid: {
    id: "sepsis_crystalloid",
    drug: "Balanced crystalloid (sepsis)",
    indication: "Sepsis-induced hypoperfusion / septic shock (C)",
    tier: "fixed",
    adultDose: "≥30 mL/kg IV balanced crystalloid within the first 3 h (weak recommendation)",
    timing: "Reassess after every bolus — do not give as a single mandated volume",
    paediatricNote: "Paediatric sepsis fluids are weight-based per APLS — separate protocol.",
    cautions: [
      "Cautious in cardiogenic/heart failure.",
      "30 mL/kg is a WEAK recommendation (SSC 2021) — titrate to response.",
    ],
    source: "Surviving Sepsis Campaign 2021.",
    confidence: "verified-web",
  },
  sepsis_map_target: {
    id: "sepsis_map_target",
    drug: "MAP target (vasopressors)",
    indication: "Septic shock requiring vasopressors (C)",
    tier: "fixed",
    adultDose: "Target MAP ≥ 65 mmHg on vasopressors (strong recommendation)",
    paediatricNote: "Paediatric MAP targets are age-banded — separate protocol.",
    source: "Surviving Sepsis Campaign 2021.",
    confidence: "verified-web",
  },

  /* ── Breathing step (B) — acute asthma (web-verified 2026-06-02) ── */
  asthma_salbutamol_neb: {
    id: "asthma_salbutamol_neb",
    drug: "Salbutamol, nebulised",
    indication: "Acute asthma / bronchospasm — first-line bronchodilator (B)",
    tier: "fixed",
    adultDose: "5 mg nebulised, oxygen-driven",
    timing:
      "Repeat / back-to-back / continuous (5–10 mg/h) in acute severe or life-threatening asthma; reassess after each",
    paediatricNote:
      "Age-banded (e.g. 2.5 mg <5 yr; 5 mg ≥5 yr) per BTS/SIGN & APLS — verify the band at build; never reuse an adult number for a small child.",
    cautions: [
      "Oxygen-driven in acute asthma (air-driven risks hypoxaemia).",
      "In anaphylaxis it is an ADJUNCT — IM adrenaline FIRST.",
      "Monitor for hypokalaemia + tachycardia with repeated/continuous dosing.",
    ],
    source: "BTS/SIGN 158 (2019) acute asthma pathway + GINA 2025.",
    confidence: "verified-web",
  },
  asthma_ipratropium_neb: {
    id: "asthma_ipratropium_neb",
    drug: "Ipratropium bromide, nebulised",
    indication: "Acute severe / life-threatening asthma — add-on antimuscarinic (B)",
    tier: "fixed",
    adultDose: "500 micrograms (0.5 mg) nebulised, oxygen-driven",
    timing: "4–6 hourly; add to salbutamol in acute severe / life-threatening asthma",
    paediatricNote: "Age-banded (e.g. 250 µg) per BTS/SIGN & APLS — verify at build.",
    cautions: ["Add-on to the β2-agonist in severe/life-threatening attacks, not a substitute."],
    source: "BTS/SIGN 158 (2019); GINA 2025.",
    confidence: "verified-web",
  },
  asthma_steroid: {
    id: "asthma_steroid",
    drug: "Systemic corticosteroid",
    indication: "Acute asthma — give early to all (B)",
    tier: "fixed",
    adultDose: "Prednisolone 40–50 mg PO OR hydrocortisone 100 mg IV",
    timing: "Give early in every acute attack; continue for ≥5 days or until recovery",
    paediatricNote:
      "Weight/age-banded prednisolone (e.g. 1–2 mg/kg, max per band) per BTS/SIGN & APLS — verify at build.",
    cautions: [
      "Oral and IV routes are equally effective — use IV only if the patient can't swallow.",
    ],
    source: "BTS/SIGN 158 (2019); GINA 2025.",
    confidence: "verified-web",
  },
  asthma_magnesium_iv: {
    id: "asthma_magnesium_iv",
    drug: "Magnesium sulphate, IV",
    indication: "Life-threatening / poor-response acute severe asthma (B)",
    tier: "fixed",
    adultDose: "1.2–2 g IV over 20 min, single dose",
    timing:
      "Single dose in life-threatening asthma or poor initial response — get senior + ICU help",
    paediatricNote: "Weight-based (40 mg/kg, max 2 g) per APLS — separate protocol.",
    cautions: [
      "Single dose only; senior/ICU decision.",
      "Nebulised magnesium is NOT recommended (GINA 2025).",
      "Monitor for hypotension + flushing.",
    ],
    source: "BTS/SIGN 158 (2019); GINA 2025 (2 g over 20 min).",
    confidence: "verified-web",
  },

  /* ── TIER 1b: protocol-surfaced (value real; dose not hard-coded) ─ */
  txa_trauma: {
    id: "txa_trauma",
    drug: "Tranexamic acid (TXA)",
    indication: "Major traumatic haemorrhage (C)",
    tier: "protocol_surfaced",
    adultDose: null,
    timing:
      "Give EARLY — within 3 h of injury (benefit greatest <1 h); do NOT give beyond 3 h (signal of harm)",
    paediatricNote:
      "Paediatric TXA is weight-based (commonly 15 mg/kg, max 1 g) — verify against the local/RCPCH protocol.",
    cautions: [
      "Dose is surfaced from the local major-haemorrhage protocol, not hard-coded here.",
      "Reference regimen (CRASH-2/CRASH-3): 1 g IV over 10 min then 1 g over 8 h.",
    ],
    source: "CRASH-2 (Lancet 2010/2011 timing analysis); CRASH-3 (Lancet 2019, TBI).",
    confidence: "needs-CSO-verification",
  },

  /* ── TIER 2: category-level only (no fixed mg on this surface) ──── */
  seizure_benzodiazepine: {
    id: "seizure_benzodiazepine",
    drug: "Benzodiazepine (first-line anticonvulsant)",
    indication: "Seizure / convulsive status epilepticus (D)",
    tier: "category",
    adultDose: null,
    timing: "Activate the status-epilepticus pathway; check & treat glucose alongside",
    paediatricNote:
      "Weight/route-banded (e.g. buccal midazolam, IV lorazepam) — defer to NICE NG217 / APLS.",
    cautions: [
      "Agent depends on access: IV lorazepam first-line; buccal midazolam or rectal diazepam if no IV.",
      "Specific mg are clinician/formulary-set — not shown as a constant.",
    ],
    source: "NICE NG217 (status epilepticus, updated Jan 2025).",
    confidence: "needs-CSO-verification",
  },
  naloxone: {
    id: "naloxone",
    drug: "Naloxone",
    indication: "Suspected opioid toxicity with respiratory/CNS depression (D)",
    tier: "category",
    adultDose: null,
    timing:
      "Titrate to adequate VENTILATION, not to full arousal; support ventilation first (a B emergency)",
    paediatricNote: "Weight-based (micrograms/kg) per APLS/BNFc — verify at build.",
    cautions: [
      "Short half-life — repeat doses / infusion may be needed.",
      "Specific starting dose/titration is clinician-set.",
    ],
    source: "Resuscitation Council UK ALS / opioid-toxicity guidance.",
    confidence: "needs-CSO-verification",
  },
  nebulised_bronchodilator: {
    id: "nebulised_bronchodilator",
    drug: "Nebulised bronchodilator (± ipratropium ± steroid)",
    indication: "Severe bronchospasm — asthma/COPD/anaphylaxis-associated wheeze (B)",
    tier: "category",
    adultDose: null,
    paediatricNote: "Weight/age-banded per BTS/SIGN asthma & APLS — verify at build.",
    cautions: [
      "Oxygen-driven; dose is cause-specific (asthma vs COPD vs anaphylaxis).",
      "In anaphylaxis it is an ADJUNCT — never a substitute for IM adrenaline.",
    ],
    source: "BTS/SIGN (BTS/NICE) asthma guideline.",
    confidence: "reference-doc-only",
  },
  flumazenil: {
    id: "flumazenil",
    drug: "Flumazenil",
    indication: "Benzodiazepine reversal (D) — CAUTION, not routine",
    tier: "category",
    adultDose: null,
    cautions: [
      "NOT routine for undifferentiated/mixed overdose or benzodiazepine-dependent patients — risk of seizures/arrhythmia.",
      "Senior/toxicology decision only; no dose shown by design.",
    ],
    paediatricNote: "Not a routine paediatric resus action — specialist decision only.",
    source: "Toxicology/EM consensus (Medscape benzodiazepine toxicity).",
    confidence: "reference-doc-only",
  },

  /* ── Airway step (A) — category-level only (no authoritative fixed adult dose) ── */
  neb_adrenaline_airway_oedema: {
    id: "neb_adrenaline_airway_oedema",
    drug: "Nebulised adrenaline (upper-airway oedema)",
    indication: "Upper-airway oedema / stridor — post-extubation, croup-type, angioedema (A)",
    tier: "category",
    adultDose: null,
    paediatricNote:
      "Paediatric croup neb adrenaline is weight/age-banded — separate protocol; do not reuse an adult number.",
    cautions: [
      "NO authoritative resus body (RCUK/ERC/DAS) fixes an adult dose; adult evidence is weak/extrapolated from paediatric croup; literature doses conflict.",
      "Distinct from systemic IM adrenaline for anaphylaxis, and from the asthma/COPD nebulised bronchodilator. Clinician-/cause-dependent.",
    ],
    source:
      "Upper-airway-obstruction literature (no guideline-fixed adult dose); web-verified 2026-06-02.",
    confidence: "needs-CSO-verification",
  },
  airway_oedema_corticosteroid: {
    id: "airway_oedema_corticosteroid",
    drug: "Corticosteroid (airway oedema)",
    indication: "Inflammatory airway oedema — start early in high-risk patients (A)",
    tier: "category",
    adultDose: null,
    paediatricNote:
      "Paediatric airway-oedema/croup steroid dosing is weight-based — separate protocol.",
    cautions: [
      "NO RCUK/ERC/DAS algorithm fixes an adult airway dose; doses are trial/ICU-protocol and timing/cause-dependent.",
      "Kept SEPARATE from the anaphylaxis pathway — routine corticosteroids are NO LONGER recommended in acute anaphylaxis (2025).",
    ],
    source:
      "DAS 2025 (structural: start early in high-risk inflammatory oedema); no guideline-fixed adult dose; web-verified 2026-06-02.",
    confidence: "needs-CSO-verification",
  },
} as const satisfies Record<string, ResusDose>;

export type ResusDoseId = keyof typeof RESUS_DOSES;

export function getResusDose(id: ResusDoseId): ResusDose {
  return RESUS_DOSES[id];
}
