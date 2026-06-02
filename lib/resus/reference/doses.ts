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
} as const satisfies Record<string, ResusDose>;

export type ResusDoseId = keyof typeof RESUS_DOSES;

export function getResusDose(id: ResusDoseId): ResusDose {
  return RESUS_DOSES[id];
}
