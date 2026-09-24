/**
 * MedSync — Emergency & Crash-Cart Drug Catalog (structured reference data).
 *
 * Encodes docs/clinical/emergency-crash-cart-drug-catalog.md (the CSO-supplied
 * "medicine") as VERSIONED, SOURCED reference data the prescribing engine
 * consumes. NOT logic — the engine (lib/prescribing/engine.ts) reasons over it.
 *
 * CLINICAL-SAFETY ARTIFACT — the highest-risk content in the system.
 * "Never ship a remembered dose": every value was web cross-verified on
 * 2026-06-03 against 2025/2026 primary sources (RCUK ALS 2025, ERC 2025/ILCOR,
 * AHA 2025 ACLS Part 9, RCUK Anaphylaxis, GINA 2025 + BTS/SIGN, JBDS, BNF/SmPC)
 * by an 8-agent verification pass (36/36 verified-web), reconciled against the
 * CSO catalog. Confidence is tagged per entry; CSO sign-off is mandatory before
 * clinical use. Decision-support only — the clinician prescribes/confirms; the
 * app records, never auto-administers.
 *
 * CONCENTRATION SAFETY: the crash-cart concentration matters as much as the
 * milligram dose. Where a dangerous look-alike exists (adrenaline 1:1000-IM vs
 * 1:10 000-IV), `lookAlikeGuard` carries the do-not-confuse, and variants share
 * a `drugKey` so the engine can guard the concentration + track cumulative dose.
 *
 * PAEDIATRICS: every entry's `paediatric.note` is weight-based (mg/kg + max) —
 * NEVER an adult flat number. `paediatric.weightBased` flags that a weight/age
 * is required before a paediatric dose may be shown.
 */

export const EMERGENCY_DRUG_CATALOG_META = {
  verifiedOn: "2026-06-03",
  guidelineCycle: "2025",
  basis:
    "RCUK Adult ALS 2025 + ERC 2025 / ILCOR 2025 CoSTR + AHA 2025 ACLS Part 9 + RCUK Anaphylaxis (2021, current) + GINA 2025 & BTS/SIGN 158/SIGN 244 + JBDS hypoglycaemia + BNF/BNFc & SmPCs. 2025 supersedes 2020/2021.",
  crossCheck:
    "8-agent web verification 2026-06-03 returned 36/36 verified-web for the dosed drugs, reconciled against the CSO catalog. Category-level (GTN, furosemide, vasopressor infusions) + record-only (RSI agents, flumazenil) items carry their own per-entry confidence (reference-doc-only / needs-CSO-verification) by design.",
} as const;

export type DrugTier =
  | "arrest"
  | "peri_arrest"
  | "airway_breathing"
  | "circulation"
  | "disability_metabolic"
  | "reversal"
  | "rsi_record_only";

export type DrugAbcdeStep = "A" | "B" | "C" | "D" | "E" | "arrest" | "cross_cutting";
export type DoseConfidence = "verified-web" | "reference-doc-only" | "needs-CSO-verification";
export type AdminRoute =
  | "iv"
  | "io"
  | "im"
  | "sc"
  | "oral"
  | "inhaled"
  | "nebulised"
  | "pr"
  | "buccal"
  | "sublingual"
  | "intranasal"
  | "infusion"
  | "ett";

export interface EmergencyDrug {
  /** Unique prescribable item id (a specific drug+indication+concentration). */
  id: string;
  name: string;
  brand?: string;
  /** Shared across concentration/indication variants of the SAME molecule —
   *  drives the concentration look-alike guard + cumulative-dose tracking. */
  drugKey: string;
  drugClass: string;
  indications: string[];
  tier: DrugTier;
  abcdeStep: DrugAbcdeStep;
  /** The exact adult regimen. `null` for category-level / record-only items. */
  adult: {
    dose: string;
    /** Exact presentation + concentration + volume (NOT just mg). */
    concentration: string;
    route: AdminRoute[];
    interval: string;
    /** Cumulative/max cap where one is defined, else "n/a". */
    max: string;
  } | null;
  paediatric: {
    /** Weight-based formula (mg/kg + max) — never an adult flat number. */
    note: string;
    /** True ⇒ a weight/age is required before a paediatric dose is shown. */
    weightBased: boolean;
  };
  cautions: string[];
  contraindications: string[];
  monitoring: string[];
  /** Controlled drug ⇒ stricter (witnessed) capture even in emergencies. */
  controlled: boolean;
  /** Hard cumulative cap in mg (e.g. atropine 3 mg) — drives the max check. */
  cumulativeMaxMg?: number;
  /** The standard single-dose in mg — for cumulative math (not display). */
  unitDoseMg?: number;
  /** Verified plausibility bounds (mg) for the out-of-range guard on an EDITED
   *  dose, for fixed-regimen drugs that have a defined dose but NO single
   *  unitDoseMg reference (escalating or ranged regimens — e.g. adenosine
   *  6→12→18, amiodarone 150/300). Endpoints are derived from THIS entry's own
   *  already-web-verified fields — `adult.dose`/`adult.max`, and where the
   *  plausible single-administration span is wider, the `adult.interval`
   *  (e.g. salbutamol "up to 10 mg/h" continuous) and the `paediatric` band
   *  (e.g. salbutamol 2.5 mg, ipratropium 250 µg) — NOT a remembered number; the
   *  per-entry comment names each endpoint's source. The band width is the
   *  CSO-ratifiable judgment. An edit inside [low, high] is silent; modestly
   *  outside warns; far outside blocks (override + reason); egregiously outside
   *  additionally requires a typed dose confirmation. Never a hard block. */
  doseRangeMg?: { low: number; high: number };
  /** Concentration / look-alike do-not-confuse warning, where one exists. */
  lookAlikeGuard?: string;
  /** No fixed surface dose — the clinician doses (GTN/furosemide/vasopressors). */
  categoryLevel?: boolean;
  /** Skilled-operator drug the tool only RECORDS (RSI agents) — never pre-doses. */
  recordOnly?: boolean;
  source: string;
  confidence: DoseConfidence;
  /** Hard cap on the NUMBER of doses of this molecule (e.g. benzodiazepine 2). */
  cumulativeMaxDoses?: number;
}

export const EMERGENCY_DRUGS = [
  /* ───────────────────────── 1. CARDIAC ARREST (ALS) ───────────────────── */
  {
    id: "adrenaline_arrest_iv",
    name: "Adrenaline (epinephrine)",
    drugKey: "adrenaline",
    drugClass: "Sympathomimetic vasopressor",
    indications: [
      "Cardiac arrest — non-shockable (PEA/asystole): give as soon as IV/IO access is obtained",
      "Cardiac arrest — shockable (VF/pVT): give after the 3rd shock",
    ],
    tier: "arrest",
    abcdeStep: "arrest",
    adult: {
      dose: "1 mg",
      concentration: "1:10 000 (100 micrograms/mL) — 1 mg in 10 mL prefilled syringe (10 mL bolus)",
      route: ["iv", "io"],
      interval: "every 3–5 min while ALS continues",
      max: "n/a — no cumulative cap in arrest (continue until ROSC or resuscitation stopped)",
    },
    paediatric: {
      note: "10 micrograms/kg IV/IO (0.1 mL/kg of 1:10 000), repeat every 3–5 min; single-dose max 1 mg (RCUK/ERC 2025 PALS, BNFc) — NOT the adult 1 mg flat dose.",
      weightBased: true,
    },
    cautions: [
      "Flush with 20 mL and elevate the limb after a peripheral bolus.",
      "Wrong concentration is the principal hazard — see the guard.",
    ],
    contraindications: [],
    monitoring: ["Rhythm + pulse checks at 2-min cycles", "Capnography (a rise suggests ROSC)"],
    controlled: false,
    unitDoseMg: 1,
    lookAlikeGuard:
      "ARREST = 1:10 000 (100 micrograms/mL, 1 mg in 10 mL) IV/IO. Do NOT use 1:1000 (1 mg/mL ampoule) IV — that is the 10× stronger IM anaphylaxis strength. Confirm the concentration aloud before pushing.",
    source: "RCUK Adult ALS 2025; ERC 2025; AHA 2025 ACLS; SmPC adrenaline 1 mg/10 mL prefilled.",
    confidence: "verified-web",
  },
  {
    id: "amiodarone_arrest_iv",
    name: "Amiodarone",
    drugKey: "amiodarone",
    drugClass: "Class III antiarrhythmic",
    indications: ["Shock-refractory VF/pVT — after the 3rd shock, then after the 5th shock"],
    tier: "arrest",
    abcdeStep: "arrest",
    adult: {
      dose: "300 mg first dose, then 150 mg second dose",
      concentration:
        "300 mg in 10 mL (30 mg/mL) prefilled syringe; or 150 mg/3 mL ampoule (give in 5% glucose)",
      route: ["iv", "io"],
      interval: "300 mg after the 3rd shock; further 150 mg after the 5th shock",
      max: "450 mg in the arrest sequence (300 mg + 150 mg; post-ROSC infusion is a separate decision)",
    },
    paediatric: {
      note: "5 mg/kg IV/IO after the 3rd shock, repeat after the 5th; single-dose max 300 mg (RCUK/ERC 2025 PALS, BNFc) — NOT the adult 300 mg flat dose.",
      weightBased: true,
    },
    cautions: [
      "Vesicant — large vein / central / IO; flush well.",
      "Only ONE antiarrhythmic per arrest (amiodarone OR lidocaine).",
    ],
    contraindications: [],
    monitoring: ["Rhythm", "Post-ROSC BP + heart rate"],
    controlled: false,
    // Single-administration plausibility: 150 mg (2nd dose) … 300 mg (1st dose).
    doseRangeMg: { low: 150, high: 300 },
    lookAlikeGuard:
      "First arrest dose is 300 mg (not 150 mg). Confirm total mg, not volume — the 300 mg/10 mL syringe and 150 mg/3 mL ampoule differ.",
    source: "RCUK Adult ALS 2025; ERC 2025; SmPC amiodarone 30 mg/mL prefilled.",
    confidence: "verified-web",
  },
  {
    id: "lidocaine_arrest_iv",
    name: "Lidocaine (lignocaine)",
    drugKey: "lidocaine",
    drugClass: "Class Ib antiarrhythmic",
    indications: [
      "Shock-refractory VF/pVT — ALTERNATIVE to amiodarone (one or the other, never both)",
    ],
    tier: "arrest",
    abcdeStep: "arrest",
    adult: {
      dose: "100 mg, then a further 50 mg",
      concentration:
        "2% (20 mg/mL) = 100 mg in 5 mL; use the preservative-free cardiac preparation (NEVER lidocaine-with-adrenaline)",
      route: ["iv", "io"],
      interval: "100 mg after 3 shocks (in place of amiodarone); further 50 mg after 5 shocks",
      max: "≈3 mg/kg in the first hour",
    },
    paediatric: {
      note: "1 mg/kg IV/IO as the amiodarone alternative (RCUK/ERC 2025 PALS, BNFc) — confirm against APLS/BNFc for the child.",
      weightBased: true,
    },
    cautions: [
      "Never combine with amiodarone.",
      "Reduce in hepatic impairment / low output / elderly.",
      "Adult flat default 100 mg ≈ 1.5 mg/kg (AHA weight basis 1–1.5 mg/kg, then 0.5–0.75 mg/kg) — may under-dose a large adult; confirm.",
    ],
    contraindications: ["Severe AV block (non-arrest antiarrhythmic context)"],
    monitoring: ["Rhythm", "Post-ROSC neuro (seizure risk) + BP"],
    controlled: false,
    // Single-administration plausibility: 50 mg (further) … 100 mg (first ≈1.5 mg/kg).
    doseRangeMg: { low: 50, high: 100 },
    lookAlikeGuard:
      "Confirm strength: 2% = 20 mg/mL (100 mg in 5 mL). NEVER use a lidocaine-WITH-adrenaline preparation IV.",
    source: "RCUK Adult ALS 2025; ERC 2025; SmPC lidocaine 20 mg/mL.",
    confidence: "verified-web",
  },
  {
    id: "magnesium_arrest_iv",
    name: "Magnesium sulfate",
    drugKey: "magnesium",
    drugClass: "Electrolyte / membrane stabiliser",
    indications: ["Torsades de pointes / hypomagnesaemia in arrest (NOT routine in VF/pVT)"],
    tier: "arrest",
    abcdeStep: "arrest",
    adult: {
      dose: "2 g",
      concentration: "2 g (8 mmol) IV/IO — e.g. 4 mL of 50% magnesium sulfate, diluted",
      route: ["iv", "io"],
      interval: "may repeat once after 10–15 min",
      max: "n/a (clinician-directed)",
    },
    paediatric: {
      note: "Weight-based per APLS/BNFc — not an adult flat number.",
      weightBased: true,
    },
    cautions: [
      "Hypotension / flushing.",
      "Distinct from the asthma magnesium dose (1.2–2 g over 20 min).",
    ],
    contraindications: [],
    monitoring: ["Rhythm", "BP"],
    controlled: false,
    // Fixed arrest bolus: 2 g (= 2000 mg); the asthma 1.2–2 g dose is a separate entry.
    doseRangeMg: { low: 2000, high: 2000 },
    source: "RCUK Adult ALS 2025; ERC 2025.",
    confidence: "verified-web",
  },
  {
    id: "sodium_bicarbonate_iv",
    name: "Sodium bicarbonate 8.4%",
    drugKey: "sodium_bicarbonate",
    drugClass: "Alkalinising agent",
    indications: [
      "NOT routine in arrest — specific only: hyperkalaemia, tricyclic/Na-channel-blocker overdose, severe pre-existing metabolic acidosis",
    ],
    tier: "arrest",
    abcdeStep: "arrest",
    adult: {
      dose: "Indication-specific (e.g. 50 mmol = 50 mL of 8.4%)",
      concentration: "8.4% (1 mmol/mL)",
      route: ["iv", "io"],
      interval: "guided by ABG / cause",
      max: "n/a (cause-directed)",
    },
    paediatric: { note: "1 mmol/kg per APLS — weight-based.", weightBased: true },
    cautions: ["Not routine.", "Incompatible with calcium / catecholamines in the same line."],
    contraindications: [],
    monitoring: ["ABG / electrolytes"],
    controlled: false,
    categoryLevel: true,
    source: "RCUK Adult ALS 2025 (special circumstances); ERC 2025.",
    confidence: "verified-web",
  },
  {
    id: "calcium_chloride_iv",
    name: "Calcium chloride 10%",
    drugKey: "calcium",
    drugClass: "Electrolyte",
    indications: [
      "NOT routine in arrest — specific only: hyperkalaemia, hypocalcaemia, calcium-channel-blocker toxicity, hypermagnesaemia",
    ],
    tier: "arrest",
    abcdeStep: "arrest",
    adult: {
      dose: "10 mL of 10% calcium chloride (6.8 mmol Ca²⁺)",
      concentration: "10% calcium chloride (10 mL ≈ 6.8 mmol)",
      route: ["iv", "io"],
      interval: "repeat per cause / Ca²⁺",
      max: "n/a (cause-directed)",
    },
    paediatric: { note: "0.2 mL/kg of 10% per APLS — weight-based.", weightBased: true },
    cautions: [
      "Not routine.",
      "Necrosis on extravasation.",
      "Never in the same line as bicarbonate.",
    ],
    contraindications: [],
    monitoring: ["Ca²⁺ / K⁺", "Rhythm"],
    controlled: false,
    categoryLevel: true,
    source: "RCUK Adult ALS 2025 (special circumstances); ERC 2025.",
    confidence: "verified-web",
  },

  /* ─────────────────────── 2. PERI-ARREST / ARRHYTHMIA ─────────────────── */
  {
    id: "atropine_bradycardia_iv",
    name: "Atropine (atropine sulfate)",
    drugKey: "atropine",
    drugClass: "Antimuscarinic",
    indications: ["Symptomatic / adverse-sign bradycardia (peri-arrest)"],
    tier: "peri_arrest",
    abcdeStep: "C",
    adult: {
      dose: "500 micrograms",
      concentration: "600 micrograms/mL (1 mL ampoule); or 3 mg in 10 mL prefilled syringe",
      route: ["iv", "io"],
      interval: "every 3–5 min as needed",
      max: "3 mg cumulative",
    },
    cumulativeMaxMg: 3,
    unitDoseMg: 0.5,
    paediatric: {
      note: "20 micrograms/kg IV (min 100 micrograms, max 600 micrograms per dose) per APLS/BNFc — NOT the adult dose.",
      weightBased: true,
    },
    cautions: [
      "Less effective in Mobitz II / complete heart block with broad QRS — consider pacing.",
    ],
    contraindications: [],
    monitoring: ["Rhythm", "Heart rate"],
    controlled: false,
    lookAlikeGuard:
      "Cumulative MAX 3 mg — the engine sums prior atropine and blocks beyond 3 mg. NOT recommended in cardiac arrest (removed from the asystole/PEA algorithm).",
    source: "RCUK Adult ALS 2025 bradycardia algorithm; BNF atropine.",
    confidence: "verified-web",
  },
  {
    id: "adenosine_svt_iv",
    name: "Adenosine",
    drugKey: "adenosine",
    drugClass: "Antiarrhythmic (transient AV-nodal block)",
    indications: ["Regular narrow-complex SVT (peri-arrest tachycardia algorithm)"],
    tier: "peri_arrest",
    abcdeStep: "C",
    adult: {
      dose: "6 mg, then 12 mg, then a further 12–18 mg",
      concentration:
        "3 mg/mL — rapid IV push into a large-bore proximal cannula + immediate 20 mL flush",
      route: ["iv"],
      interval: "1–2 min between escalating doses",
      max: "per protocol (typically up to 30 mg total)",
    },
    paediatric: {
      note: "100 → 200 → 300 micrograms/kg rapid IV per APLS/BNFc — weight-based.",
      weightBased: true,
    },
    cautions: [
      "Transient asystole / flushing / chest tightness — warn the patient.",
      "Very short half-life.",
    ],
    contraindications: [
      "Asthma / severe COPD (bronchospasm risk)",
      "2nd/3rd-degree AV block without pacing",
    ],
    monitoring: ["Continuous ECG rhythm strip through administration"],
    controlled: false,
    // Escalating single doses: 6 mg → 12 mg → 12–18 mg (total typically ≤ 30 mg).
    doseRangeMg: { low: 6, high: 18 },
    source: "RCUK Adult ALS 2025 tachycardia algorithm; BNF adenosine.",
    confidence: "verified-web",
  },
  {
    id: "amiodarone_periarrest_iv",
    name: "Amiodarone",
    drugKey: "amiodarone",
    drugClass: "Class III antiarrhythmic",
    indications: [
      "Peri-arrest tachyarrhythmia (broad-complex / AF with adverse features) — senior-directed",
    ],
    tier: "peri_arrest",
    abcdeStep: "C",
    adult: {
      dose: "300 mg IV over 20–60 min, then infusion (e.g. 900 mg/24 h)",
      concentration: "Dilute in 5% glucose; central/large vein for infusion",
      route: ["iv", "infusion"],
      interval: "loading then maintenance infusion",
      max: "≈1.2 g/24 h (per protocol)",
    },
    paediatric: { note: "5 mg/kg per APLS — weight-based.", weightBased: true },
    cautions: [
      "Hypotension if given too fast.",
      "Use 5% glucose diluent (precipitates in saline).",
    ],
    contraindications: [],
    monitoring: ["BP", "Rhythm + QT"],
    controlled: false,
    categoryLevel: true,
    source: "RCUK Adult ALS 2025 tachycardia algorithm.",
    confidence: "verified-web",
  },

  /* ─────────────────── 3. AIRWAY / BREATHING EMERGENCY ─────────────────── */
  {
    id: "adrenaline_anaphylaxis_im",
    name: "Adrenaline (epinephrine)",
    drugKey: "adrenaline",
    drugClass: "Sympathomimetic",
    indications: ["Anaphylaxis — first-line (cross-cutting A/B/C/E)"],
    tier: "airway_breathing",
    abcdeStep: "cross_cutting",
    adult: {
      dose: "500 micrograms (0.5 mg)",
      concentration: "1:1000 (1 mg/mL) — 0.5 mL IM, anterolateral mid-thigh",
      route: ["im"],
      interval: "repeat after 5 min if no improvement",
      max: "n/a (titrate to response; refractory → infusion by experienced clinicians)",
    },
    paediatric: {
      note: "Age-banded IM 1:1000 (RCUK/BNFc): >12 yr 500 µg; 6–12 yr 300 µg; 6 mo–6 yr 150 µg; <6 mo 100–150 µg — banded, not adult flat.",
      weightBased: true,
    },
    cautions: [
      "Route is IM, NOT IV, for initial treatment.",
      "2025: routine corticosteroids are NO LONGER recommended in acute anaphylaxis.",
    ],
    contraindications: [],
    monitoring: ["Airway / breathing / circulation response", "Repeat obs after each dose"],
    controlled: false,
    unitDoseMg: 0.5,
    lookAlikeGuard:
      "ANAPHYLAXIS = 500 micrograms IM of 1:1000 (1 mg/mL). Do NOT give the 1:10 000 IV ARREST presentation or the 1 mg arrest dose for anaphylaxis. IM 1:1000 vs IV 1:10 000 is the single most dangerous swap in the cart.",
    source: "RCUK Anaphylaxis (2021, current); ERC 2025 Special Circumstances.",
    confidence: "verified-web",
  },
  {
    id: "salbutamol_neb",
    name: "Salbutamol",
    brand: "Ventolin",
    drugKey: "salbutamol",
    drugClass: "Short-acting β₂-agonist",
    indications: ["Acute asthma / bronchospasm (anaphylaxis adjunct after adrenaline)"],
    tier: "airway_breathing",
    abcdeStep: "B",
    adult: {
      dose: "5 mg nebulised",
      concentration: "5 mg nebule, oxygen-driven",
      route: ["nebulised"],
      interval: "repeat back-to-back / continuous (up to 10 mg/h) in life-threatening",
      max: "continuous per response (monitor K⁺ + tachycardia)",
    },
    paediatric: {
      note: "Age-banded (2.5 mg <5 yr; 5 mg ≥5 yr) per BTS/SIGN & APLS — weight/age-banded.",
      weightBased: true,
    },
    cautions: ["Oxygen-driven in asthma.", "In anaphylaxis it is an ADJUNCT — adrenaline first."],
    contraindications: [],
    monitoring: ["SpO₂ + work of breathing", "K⁺ + heart rate with repeated dosing"],
    controlled: false,
    // Nebulised single dose: 2.5 mg (paed/min) … 5 mg (adult), up to ~10 mg in continuous.
    doseRangeMg: { low: 2.5, high: 10 },
    source: "BTS/SIGN 158 (2019)/SIGN 244 (2024); GINA 2025.",
    confidence: "verified-web",
  },
  {
    id: "ipratropium_neb",
    name: "Ipratropium bromide",
    drugKey: "ipratropium",
    drugClass: "Antimuscarinic bronchodilator",
    indications: ["Acute severe / life-threatening asthma — add-on to salbutamol"],
    tier: "airway_breathing",
    abcdeStep: "B",
    adult: {
      dose: "500 micrograms nebulised",
      concentration: "500 micrograms nebule, oxygen-driven, with salbutamol",
      route: ["nebulised"],
      interval: "every 4–6 h",
      max: "n/a",
    },
    paediatric: { note: "Age-banded (e.g. 250 µg) per BTS/SIGN & APLS.", weightBased: true },
    cautions: ["Add-on in severe/life-threatening attacks, not a substitute for the β₂-agonist."],
    contraindications: [],
    monitoring: ["Work of breathing"],
    controlled: false,
    // Nebulised single dose: 250 µg (paed band) … 500 µg (adult) = 0.25–0.5 mg.
    doseRangeMg: { low: 0.25, high: 0.5 },
    source: "BTS/SIGN 158 (2019); GINA 2025.",
    confidence: "verified-web",
  },
  {
    id: "hydrocortisone_iv",
    name: "Hydrocortisone",
    drugKey: "corticosteroid_systemic",
    drugClass: "Systemic corticosteroid",
    indications: [
      "Acute asthma / COPD (IV option)",
      "Adrenal crisis / refractory shock (100 mg IV)",
    ],
    tier: "airway_breathing",
    abcdeStep: "B",
    adult: {
      dose: "100 mg IV",
      concentration: "100 mg vial reconstituted",
      route: ["iv", "im"],
      interval: "6-hourly per indication",
      max: "n/a",
    },
    paediatric: { note: "Weight/age-banded per BNFc/APLS.", weightBased: true },
    cautions: [
      "Steroids take 4–6 h to act — give early.",
      "2025: not routine for anaphylaxis itself.",
    ],
    contraindications: [],
    monitoring: ["Glucose with repeated dosing"],
    controlled: false,
    unitDoseMg: 100,
    source: "BTS/SIGN 158 (2019); GINA 2025; BNF hydrocortisone.",
    confidence: "verified-web",
  },
  {
    id: "prednisolone_po",
    name: "Prednisolone",
    drugKey: "corticosteroid_systemic",
    drugClass: "Systemic corticosteroid",
    indications: ["Acute asthma / COPD (oral option — if able to swallow)"],
    tier: "airway_breathing",
    abcdeStep: "B",
    adult: {
      dose: "40–50 mg PO",
      concentration: "tablets",
      route: ["oral"],
      interval: "once daily; continue ≥5 days or until recovery",
      max: "n/a",
    },
    paediatric: {
      note: "1–2 mg/kg (max per band) PO per BTS/SIGN & BNFc — weight-based.",
      weightBased: true,
    },
    cautions: ["Oral and IV are equally effective — use IV only if unable to swallow."],
    contraindications: [],
    monitoring: [],
    controlled: false,
    // Adult course dose: 40–50 mg once daily.
    doseRangeMg: { low: 40, high: 50 },
    source: "BTS/SIGN 158 (2019); GINA 2025.",
    confidence: "verified-web",
  },
  {
    id: "magnesium_asthma_iv",
    name: "Magnesium sulfate",
    drugKey: "magnesium",
    drugClass: "Electrolyte / bronchodilator adjunct",
    indications: ["Life-threatening / poor-response acute severe asthma"],
    tier: "airway_breathing",
    abcdeStep: "B",
    adult: {
      dose: "1.2–2 g IV over 20 min (single dose)",
      concentration: "diluted IV infusion over 20 min",
      route: ["iv", "infusion"],
      interval: "single dose (senior/ICU)",
      max: "single dose",
    },
    paediatric: { note: "40 mg/kg (max 2 g) per APLS — weight-based.", weightBased: true },
    cautions: ["Hypotension / flushing.", "Nebulised magnesium is NOT recommended (GINA 2025)."],
    contraindications: [],
    monitoring: ["BP", "Reflexes with repeated dosing"],
    controlled: false,
    // Single IV asthma dose: 1.2–2 g (= 1200–2000 mg) over 20 min.
    doseRangeMg: { low: 1200, high: 2000 },
    source: "BTS/SIGN 158 (2019); GINA 2025 (2 g over 20 min).",
    confidence: "verified-web",
  },
  {
    id: "gtn",
    name: "Glyceryl trinitrate (GTN)",
    drugKey: "gtn",
    drugClass: "Nitrate vasodilator",
    indications: ["Acute pulmonary oedema / cardiac chest pain"],
    tier: "airway_breathing",
    abcdeStep: "B",
    adult: null,
    paediatric: { note: "Not a standard paediatric emergency drug here.", weightBased: false },
    cautions: ["Titrated; caution / avoid if hypotensive or in aortic stenosis / RV infarct."],
    contraindications: ["Hypotension"],
    monitoring: ["BP continuously"],
    controlled: false,
    categoryLevel: true,
    source: "NICE CG187; BNF GTN (sublingual / IV infusion, titrated).",
    confidence: "reference-doc-only",
  },
  {
    id: "furosemide_iv",
    name: "Furosemide",
    drugKey: "furosemide",
    drugClass: "Loop diuretic",
    indications: ["Acute pulmonary oedema (fluid overload)"],
    tier: "airway_breathing",
    abcdeStep: "B",
    adult: null,
    paediatric: { note: "Weight-based per BNFc.", weightBased: true },
    cautions: ["Dose per patient + renal function; no single guideline-fixed emergency dose."],
    contraindications: [],
    monitoring: ["U&E", "Urine output", "BP"],
    controlled: false,
    categoryLevel: true,
    source: "NICE CG187 (fixes no dose); BNF furosemide.",
    confidence: "reference-doc-only",
  },

  /* ───────────────────────── 4. CIRCULATION / SHOCK ────────────────────── */
  {
    id: "crystalloid_bolus",
    name: "Balanced crystalloid",
    drugKey: "crystalloid",
    drugClass: "IV fluid",
    indications: ["Hypovolaemia / shock resuscitation (a 'drug' in the emergency record)"],
    tier: "circulation",
    abcdeStep: "C",
    adult: {
      dose: "250–500 mL bolus, reassess",
      concentration: "Hartmann's / Plasma-Lyte / 0.9% sodium chloride",
      route: ["iv", "io"],
      interval: "repeat + reassess after each bolus",
      max: "titrate to response (cautious in cardiogenic / heart failure)",
    },
    paediatric: {
      note: "10–20 mL/kg boluses per APLS — weight-based; reassess after each.",
      weightBased: true,
    },
    cautions: ["Cautious in cardiogenic shock / heart failure.", "Record volume + time."],
    contraindications: [],
    monitoring: ["BP / HR / perfusion / lactate", "Signs of overload"],
    controlled: false,
    source: "RCUK ABCDE; Surviving Sepsis Campaign 2026.",
    confidence: "verified-web",
  },
  {
    id: "txa_trauma",
    name: "Tranexamic acid (TXA)",
    drugKey: "txa",
    drugClass: "Antifibrinolytic",
    indications: ["Major traumatic haemorrhage — give EARLY (within 3 h of injury)"],
    tier: "circulation",
    abcdeStep: "C",
    adult: {
      dose: "1 g IV over 10 min, then 1 g over 8 h",
      concentration: "1 g in 100 mL infusion",
      route: ["iv", "infusion"],
      interval: "loading then maintenance",
      max: "do NOT give beyond 3 h of injury (signal of harm)",
    },
    paediatric: {
      note: "15 mg/kg (max 1 g) per RCPCH/local protocol — weight-based.",
      weightBased: true,
    },
    cautions: ["Time-critical — benefit greatest <1 h."],
    contraindications: [],
    monitoring: ["Haemodynamics"],
    controlled: false,
    // Each administration is a fixed 1 g (= 1000 mg): loading bolus, then the 8 h dose.
    doseRangeMg: { low: 1000, high: 1000 },
    source: "CRASH-2 (Lancet 2010/2011); CRASH-3 (2019).",
    confidence: "verified-web",
  },
  {
    id: "vasopressor_infusion",
    name: "Vasopressor / inotrope infusion",
    drugKey: "vasopressor",
    drugClass: "Catecholamine infusion (noradrenaline / adrenaline / dopamine / dobutamine)",
    indications: ["Shock unresponsive to fluids — titrate to MAP ≥ 65 mmHg"],
    tier: "circulation",
    abcdeStep: "C",
    adult: null,
    paediatric: {
      note: "Weight-based infusion (micrograms/kg/min) per PICU protocol.",
      weightBased: true,
    },
    cautions: [
      "Central access ideally; infusion rate is titrated, NOT a fixed bolus — record-only here.",
    ],
    contraindications: [],
    monitoring: ["Continuous BP (arterial line)", "Rhythm"],
    controlled: false,
    categoryLevel: true,
    recordOnly: true,
    source: "Surviving Sepsis Campaign 2026 (MAP ≥ 65).",
    confidence: "verified-web",
  },

  /* ───────────────── 5. DISABILITY / METABOLIC / REVERSAL ──────────────── */
  {
    id: "glucose_iv",
    name: "Glucose (dextrose) IV",
    drugKey: "glucose",
    drugClass: "Carbohydrate",
    indications: ["Severe hypoglycaemia (CBG < 4.0 mmol/L) with IV access"],
    tier: "disability_metabolic",
    abcdeStep: "D",
    adult: {
      dose: "75 mL of 20% OR 150 mL of 10% IV over 10–15 min",
      concentration: "10% or 20% glucose",
      route: ["iv"],
      interval: "recheck CBG at 10–15 min; repeat if still < 4.0",
      max: "n/a (titrate to CBG)",
    },
    paediatric: {
      note: "2 mL/kg of 10% glucose per APLS — weight-based. NEVER the adult volume.",
      weightBased: true,
    },
    cautions: ["50% glucose is no longer recommended.", "Then give long-acting carbohydrate."],
    contraindications: [],
    monitoring: ["Recheck CBG"],
    controlled: false,
    source: "JBDS-IP Hospital Management of Hypoglycaemia in Adults (2023).",
    confidence: "verified-web",
  },
  {
    id: "glucagon_im",
    name: "Glucagon",
    drugKey: "glucagon",
    drugClass: "Counter-regulatory hormone",
    indications: ["Severe hypoglycaemia when NO IV access"],
    tier: "disability_metabolic",
    abcdeStep: "D",
    adult: {
      dose: "1 mg IM",
      concentration: "1 mg reconstituted kit",
      route: ["im"],
      interval: "one dose only; get IV glucose",
      max: "1 mg (single dose)",
    },
    paediatric: {
      note: "<8 yr (or <25 kg) 500 µg IM; ≥8 yr (or ≥25 kg) 1 mg IM per BNFc.",
      weightBased: true,
    },
    cautions: [
      "Ineffective if glycogen-depleted (alcohol / malnourished / hepatic) — use IV glucose.",
    ],
    contraindications: [],
    monitoring: ["Recheck CBG", "Give carbohydrate once conscious"],
    controlled: false,
    unitDoseMg: 1,
    source: "JBDS-IP (2023); GlucaGen SmPC.",
    confidence: "verified-web",
  },
  {
    id: "naloxone_iv",
    name: "Naloxone",
    drugKey: "naloxone",
    drugClass: "Opioid antagonist",
    indications: ["Opioid toxicity with respiratory / CNS depression"],
    tier: "reversal",
    abcdeStep: "D",
    adult: {
      dose: "400 micrograms IV/IM/IO, titrate to ventilation; repeat",
      concentration: "400 micrograms/mL",
      route: ["iv", "im", "io", "intranasal"],
      interval: "repeat every 2–3 min; infusion if recurrent",
      max: "titrate to adequate VENTILATION, not full arousal",
    },
    paediatric: {
      note: "10 micrograms/kg, repeat per APLS/BNFc — weight-based.",
      weightBased: true,
    },
    cautions: ["Short half-life — re-dose / infusion.", "Precipitates acute withdrawal."],
    contraindications: [],
    monitoring: ["Respiratory rate + SpO₂", "Re-sedation watch"],
    controlled: false,
    unitDoseMg: 0.4,
    source: "RCUK ALS / opioid-toxicity guidance; BNF naloxone.",
    confidence: "verified-web",
  },
  {
    id: "flumazenil_iv",
    name: "Flumazenil",
    drugKey: "flumazenil",
    drugClass: "Benzodiazepine antagonist",
    indications: ["Benzodiazepine reversal — CAUTION, NOT routine (senior/toxicology decision)"],
    tier: "reversal",
    abcdeStep: "D",
    adult: null,
    paediatric: {
      note: "Specialist decision only — not a routine paediatric resus action.",
      weightBased: false,
    },
    cautions: [
      "NOT routine for mixed/undifferentiated overdose or benzodiazepine dependence — seizure / arrhythmia risk.",
      "No fixed dose shown by design — senior/toxicology decision.",
    ],
    contraindications: [
      "Co-ingested pro-convulsant (e.g. tricyclic) overdose",
      "Benzodiazepine dependence",
    ],
    monitoring: ["Conscious level", "Re-sedation"],
    controlled: false,
    categoryLevel: true,
    source: "Toxicology/EM consensus; BNF flumazenil.",
    confidence: "needs-CSO-verification",
  },
  {
    id: "lorazepam_seizure_iv",
    name: "Lorazepam",
    drugKey: "benzodiazepine_seizure",
    drugClass: "Benzodiazepine",
    indications: ["Seizure / convulsive status epilepticus — first-line with IV access"],
    tier: "disability_metabolic",
    abcdeStep: "D",
    adult: {
      dose: "4 mg IV",
      concentration: "4 mg/mL (dilute before IV)",
      route: ["iv"],
      interval: "repeat once after 5–10 min if seizure continues, then status pathway",
      max: "2 doses before escalating to the status pathway",
    },
    paediatric: {
      note: "0.1 mg/kg IV (max 4 mg) per APLS/NICE — weight-based.",
      weightBased: true,
    },
    cautions: [
      "Respiratory depression — monitor airway/breathing.",
      "Check & treat glucose alongside.",
    ],
    contraindications: [],
    monitoring: ["Airway / breathing", "Glucose"],
    controlled: true,
    unitDoseMg: 4,
    cumulativeMaxDoses: 2,
    source: "NICE NG217 (status epilepticus); BNF lorazepam.",
    confidence: "verified-web",
  },
  {
    id: "midazolam_seizure_buccal",
    name: "Midazolam",
    drugKey: "benzodiazepine_seizure",
    drugClass: "Benzodiazepine",
    indications: ["Seizure / status — first-line when NO IV access (buccal/IM)"],
    tier: "disability_metabolic",
    abcdeStep: "D",
    adult: {
      dose: "10 mg buccal or IM",
      concentration: "buccal liquid / IM",
      route: ["buccal", "im"],
      interval: "repeat once after 5–10 min, then status pathway",
      max: "2 doses before escalating",
    },
    paediatric: {
      note: "Age-banded buccal midazolam per NICE/BNFc — weight/age-banded.",
      weightBased: true,
    },
    cautions: ["Respiratory depression.", "Check & treat glucose alongside."],
    contraindications: [],
    monitoring: ["Airway / breathing", "Glucose"],
    controlled: true,
    unitDoseMg: 10,
    cumulativeMaxDoses: 2,
    source: "NICE NG217; BNF midazolam.",
    confidence: "verified-web",
  },
  {
    id: "magnesium_eclampsia_iv",
    name: "Magnesium sulfate",
    drugKey: "magnesium",
    drugClass: "Electrolyte / anticonvulsant (eclampsia)",
    indications: ["Eclampsia / severe pre-eclampsia seizure prophylaxis (obstetric emergency)"],
    tier: "disability_metabolic",
    abcdeStep: "D",
    adult: {
      dose: "4 g IV loading over 5–15 min, then 1 g/hour IV infusion for 24 h",
      concentration:
        "magnesium sulfate — e.g. 4 g diluted in 100 mL over 5–15 min (loading); 1 g/h maintenance infusion",
      route: ["iv", "infusion"],
      interval:
        "loading then maintenance for 24 h after last seizure/delivery; recurrent seizure → further 2–4 g IV over 5 min",
      max: "loading 4–6 g; maintenance 1–2 g/h (1 g/h standard); recurrent-seizure bolus 2–4 g",
    },
    paediatric: {
      note: "Eclampsia is an obstetric emergency; adolescent/peripartum per obstetric protocol + APLS — weight-based, not an adult flat number.",
      weightBased: true,
    },
    cautions: [
      "Magnesium toxicity — monitor deep tendon reflexes, respiratory rate, urine output; CALCIUM GLUCONATE is the antidote.",
      "Eclampsia LOADING is 4 g — distinct from the 2 g arrest and 1.2–2 g asthma magnesium doses.",
    ],
    contraindications: [],
    monitoring: [
      "Deep tendon reflexes",
      "Respiratory rate",
      "Urine output",
      "BP",
      "Fetal monitoring",
    ],
    controlled: false,
    doseRangeMg: { low: 4000, high: 6000 },
    lookAlikeGuard:
      "ECLAMPSIA loading = 4 g (4–6 g) IV. Do NOT give the 2 g arrest or 1.2–2 g asthma magnesium dose — those UNDERDOSE eclampsia. Maintenance 1 g/h; recurrent seizure → 2–4 g over 5 min. Calcium gluconate is the toxicity antidote.",
    source:
      "Collaborative Eclampsia Trial (Lancet 1995); Magpie (2002); RCOG/NICE NG133; ObG consensus bundle. Web-verified 2026-06-03.",
    confidence: "verified-web",
  },

  /* ───────────── Circulation (C) additions — category/record-only ─────────── */
  {
    id: "vasopressin_refractory",
    name: "Vasopressin",
    drugKey: "vasopressin",
    drugClass: "Vasopressor (V1 agonist)",
    indications: ["Refractory septic shock — add-on to noradrenaline (Surviving Sepsis 2026)"],
    tier: "circulation",
    abcdeStep: "C",
    adult: null,
    paediatric: { note: "Specialist/PICU decision — weight-based.", weightBased: true },
    cautions: [
      "Add-on (≈0.03 units/min) when escalating noradrenaline — conditional recommendation; titrated infusion, not a bolus.",
    ],
    contraindications: [],
    monitoring: ["Continuous BP (arterial line)"],
    controlled: false,
    categoryLevel: true,
    recordOnly: true,
    source: "Surviving Sepsis Campaign 2026 (conditional).",
    confidence: "verified-web",
  },
  {
    id: "dobutamine_inotrope",
    name: "Dobutamine",
    drugKey: "dobutamine",
    drugClass: "Inotrope (β1 agonist)",
    indications: ["Cardiogenic shock / low-output state — inotropic support"],
    tier: "circulation",
    abcdeStep: "C",
    adult: null,
    paediatric: { note: "Weight-based infusion (micrograms/kg/min) per PICU.", weightBased: true },
    cautions: [
      "Titrated infusion; can worsen hypotension/tachyarrhythmia — cardiology/ICU; treat the cause (STEMI → PCI).",
    ],
    contraindications: [],
    monitoring: ["Continuous BP + rhythm"],
    controlled: false,
    categoryLevel: true,
    recordOnly: true,
    source: "ESC / cardiogenic-shock guidance.",
    confidence: "verified-web",
  },
  {
    id: "sepsis_antibiotics",
    name: "Broad-spectrum antibiotics (sepsis)",
    drugKey: "sepsis_antibiotics",
    drugClass: "Antimicrobial",
    indications: ["Sepsis / septic shock — early broad-spectrum, within the first hour"],
    tier: "circulation",
    abcdeStep: "C",
    adult: null,
    paediatric: { note: "Weight-based, per local antimicrobial policy.", weightBased: true },
    cautions: [
      "Agent is local-protocol + source-specific; take cultures FIRST where it does not delay antibiotics.",
    ],
    contraindications: [],
    monitoring: ["Lactate trend", "Source control"],
    controlled: false,
    categoryLevel: true,
    source: "Surviving Sepsis Campaign 2026 (early antibiotics).",
    confidence: "verified-web",
  },
  {
    id: "blood_products_mhp",
    name: "Blood products / major-haemorrhage protocol",
    drugKey: "blood_products",
    drugClass: "Blood component therapy",
    indications: ["Haemorrhagic shock — balanced resuscitation (whole blood first-line / ~1:1:1)"],
    tier: "circulation",
    abcdeStep: "C",
    adult: null,
    paediatric: { note: "Weight-based per paediatric MHP.", weightBased: true },
    cautions: [
      "Activate the Major Haemorrhage Protocol; low-titre group O whole blood is first-line (ATLS 11th / NAEMSP 2025), components ~1:1:1 as the alternative; minimise crystalloid.",
      "Monitor ionised calcium (citrate → hypocalcaemia) + maintain normothermia — the lethal diamond.",
    ],
    contraindications: [],
    monitoring: ["Ionised calcium", "Temperature", "Coagulation (TEG/ROTEM where available)"],
    controlled: false,
    categoryLevel: true,
    recordOnly: true,
    source: "ATLS 11th ed (2025); NAEMSP 2025; PROPPR; European trauma guideline 6th ed (2023).",
    confidence: "verified-web",
  },

  /* ───────────────────────── 6. RSI (RECORD-ONLY) ──────────────────────── */
  {
    id: "rsi_induction_agent",
    name: "RSI induction agent",
    drugKey: "rsi_induction",
    drugClass: "Induction agent (ketamine / etomidate / propofol)",
    indications: [
      "Rapid-sequence induction — RECORD-ONLY (skilled operator; full RSI tooling is a later module)",
    ],
    tier: "rsi_record_only",
    abcdeStep: "A",
    adult: null,
    paediatric: {
      note: "Weight-based; the operator doses — recorded, not pre-filled.",
      weightBased: true,
    },
    cautions: [
      "The tool RECORDS what was given (drug/dose/time) — it does not drive the RSI or pre-dose it.",
    ],
    contraindications: [],
    monitoring: ["Continuous monitoring per RSI checklist"],
    controlled: true,
    recordOnly: true,
    source: "Later RSI sub-module; record-only here.",
    confidence: "needs-CSO-verification",
  },
  {
    id: "rsi_neuromuscular_blocker",
    name: "RSI neuromuscular blocker",
    drugKey: "rsi_nmb",
    drugClass: "NMB (rocuronium / suxamethonium)",
    indications: ["Rapid-sequence induction paralysis — RECORD-ONLY (skilled operator)"],
    tier: "rsi_record_only",
    abcdeStep: "A",
    adult: null,
    paediatric: {
      note: "Weight-based; the operator doses — recorded, not pre-filled.",
      weightBased: true,
    },
    cautions: ["Record-only; suxamethonium cautions (hyperkalaemia) handled in the RSI module."],
    contraindications: [],
    monitoring: ["Continuous monitoring per RSI checklist"],
    controlled: false,
    recordOnly: true,
    source: "Later RSI sub-module; record-only here.",
    confidence: "needs-CSO-verification",
  },
] as const satisfies readonly EmergencyDrug[];

export type EmergencyDrugId = (typeof EMERGENCY_DRUGS)[number]["id"];

export function getEmergencyDrug(id: string): EmergencyDrug | null {
  return (EMERGENCY_DRUGS as readonly EmergencyDrug[]).find((d) => d.id === id) ?? null;
}

export function emergencyDrugsByTier(tier: DrugTier): EmergencyDrug[] {
  return (EMERGENCY_DRUGS as readonly EmergencyDrug[]).filter((d) => d.tier === tier);
}

/** All catalog items sharing a molecule (concentration variants) — for the guard. */
export function variantsOf(drugKey: string): EmergencyDrug[] {
  return (EMERGENCY_DRUGS as readonly EmergencyDrug[]).filter((d) => d.drugKey === drugKey);
}

/**
 * Recommendation → prescribable item(s). A resus step's action code resolves to
 * the catalog item(s) the prescribing tool pre-fills; where the recommendation
 * offers a choice (steroid PO vs IV) it lists BOTH options for the clinician.
 * Keyed by the resus action codes (lib/resus/reference/breathing-catalog.ts,
 * airway-catalog.ts). This is the "smart link".
 */
export const RECOMMENDATION_DRUG_MAP: Record<string, EmergencyDrugId[]> = {
  // Breathing (B)
  b_salbutamol_neb: ["salbutamol_neb"],
  b_ipratropium_neb: ["ipratropium_neb"],
  b_asthma_steroid: ["hydrocortisone_iv", "prednisolone_po"],
  b_magnesium_iv: ["magnesium_asthma_iv"],
  b_anaphylaxis_adrenaline: ["adrenaline_anaphylaxis_im"],
  b_pulmonary_oedema: ["gtn", "furosemide_iv"],
  b_sepsis_bundle: ["crystalloid_bolus"],
  // Airway (A)
  a_anaphylaxis_adrenaline: ["adrenaline_anaphylaxis_im"],
  // Cross-cutting (the resus anaphylaxis bar)
  anaphylaxis_im_adrenaline: ["adrenaline_anaphylaxis_im"],
  // Resus Desk v2 arrest console — the fast path's fallback dialog (ALS-DRG-05).
  // Mappings only: the drugs are the existing verified arrest entries.
  als_adrenaline: ["adrenaline_arrest_iv"],
  als_amiodarone: ["amiodarone_arrest_iv"],
  als_lidocaine: ["lidocaine_arrest_iv"],
  // Circulation (C) — drugs route through the prescribing tool
  c_crystalloid_bolus: ["crystalloid_bolus"],
  c_txa: ["txa_trauma"],
  c_blood_mhp: ["blood_products_mhp"],
  c_noradrenaline: ["vasopressor_infusion"],
  c_vasopressin: ["vasopressin_refractory"],
  c_sepsis_antibiotics: ["sepsis_antibiotics"],
  c_anaphylaxis_adrenaline: ["adrenaline_anaphylaxis_im"],
  c_atropine: ["atropine_bradycardia_iv"],
  c_inotrope: ["dobutamine_inotrope"],
  c_hydrocortisone: ["hydrocortisone_iv"],
  // Disability (D) — drugs route through the prescribing tool
  d_glucose: ["glucose_iv", "glucagon_im"],
  d_naloxone: ["naloxone_iv"],
  d_benzodiazepine: ["lorazepam_seizure_iv", "midazolam_seizure_buccal"],
  d_eclampsia_magnesium: ["magnesium_eclampsia_iv"],
  d_flumazenil: ["flumazenil_iv"],
  // Exposure (E) — all already-verified drugs (no new dose); route through the tool
  e_antibiotics: ["sepsis_antibiotics"],
  e_anaphylaxis_adrenaline: ["adrenaline_anaphylaxis_im"],
  e_warmed_fluids: ["crystalloid_bolus"],
  e_naloxone: ["naloxone_iv"],
};

export function drugsForRecommendation(recCode: string): EmergencyDrug[] {
  return (RECOMMENDATION_DRUG_MAP[recCode] ?? [])
    .map(getEmergencyDrug)
    .filter((d): d is EmergencyDrug => d !== null);
}
