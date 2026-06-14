import type { ManagementPathway, SuggestedManagementPathway } from "./types";

import { suggestManagement } from "./engine";

/**
 * Management-pathway catalog (Plan GATE C) — CITED reference data, fetched from
 * current PRIMARY guideline sources at build time (NEVER from memory) via the
 * build-time research fan-out. Each step carries its source {guideline, version,
 * recommendation, url, retrieved} so staleness is visible and a re-verification
 * cadence can be driven off the version-stamps.
 *
 * HARD RULE — NO DRUG DOSES. A drug step sets `isDrug: true` and names the
 * AGENT/CLASS in `agentClass` only; the dose is the separate prescribing safety
 * engine's job. `tests/clerkship/management.test.ts` rejects any dose/volume/unit
 * token in the catalog.
 *
 * First tranche: sepsis/septic shock, DKA/hyperglycaemic crisis, acute asthma,
 * severe malaria. Decision-support only — it suggests; the clinician decides.
 *
 * MANAGEMENT_PATHWAYS_CSO_SIGNED stays FALSE until Fadhul reviews + signs each
 * pathway against its cited source. Several steps carry Uganda-calibration
 * questions (fluid strategy, SpO₂ target, SC-insulin pathway, FEAST/UCG fluid
 * reconciliation) recorded in MANAGEMENT_PATHWAYS_CSO_NOTES; the suggestion UI
 * renders nothing (hidden) until signed, and the feature is not shown unsigned.
 */

/** Whether the CSO (Fadhul) has signed off this management-pathway tranche. */
export const MANAGEMENT_PATHWAYS_CSO_SIGNED = false;

/** When this tranche was sourced (drives the re-verification cadence). */
export const MANAGEMENT_PATHWAYS_BUILT = "2026-06-14";

/** Build-time sourcing caveats + Uganda-calibration questions the CSO must
 *  resolve before sign-off (verbatim from the research fan-out). */
export const MANAGEMENT_PATHWAYS_CSO_NOTES: string[] = [
  "[Sepsis] SSC 2026 adult guideline FULL TEXT (Springer/LWW) is paywalled — recommendation wording/grades were sourced from the open SCCM guideline pages and corroborated across SCCM/ESICM/IDSA. Verify exact wording/grades against the full Critical Care Medicine April 2026 text (DOI 10.1097/CCM.0000000000007075) before sign-off.",
  "[Sepsis] UGANDA FLUID CALIBRATION: the adult '30 mL/kg in 3 h' is a CONDITIONAL/low-certainty SSC recommendation and may not transfer to Ugandan adults (a Mulago cohort found IMAI fluid resuscitation not associated with better outcomes; FEAST harm signal looms). Steps frame fluids as titrated/reassessed, not a fixed bolus. Ratify the local fluid strategy (volume, rate, reassessment trigger, when to stop).",
  "[Sepsis] MALARIA overlap: severe/cerebral malaria is a leading cause of fever + confusion in Uganda and may coexist with bacterial sepsis. Confirm the RDT/film step + the artesunate handoff (added alongside, not instead of, antibiotics).",
  "[Sepsis] LACTATE & BLOOD CULTURES are limited in many Ugandan IM settings — steps use them WHERE AVAILABLE with a clinical-perfusion fallback. Confirm which facilities have lactate/culture so the tool can branch.",
  "[Sepsis] CORTICOSTEROIDS in septic shock are CONDITIONAL/low certainty (reserved for ongoing vasopressor need) — flagged optional/specialist-gated. Confirm inclusion.",
  "[Sepsis] VASOPRESSOR DELIVERY: norepinephrine is first-line but central-line/pump access is variable in Uganda — peripheral-vasopressor use + ICU referral need a local operational note.",
  "[DKA] AGE SCOPE: calibrated for ADULTS. 16–18 y only if managed by the adult diabetes team; paediatric (BSPED/ISPAD) protocols differ (fluid maths, cerebral-oedema precautions). Confirm the age cut-off.",
  "[DKA] FLUID CHOICE: ADA/EASD 2024 favours balanced crystalloid (faster resolution); JBDS defaults to 0.9% saline mainly for pre-mixed KCl ward-safety. In Uganda Ringer's lactate is widely available but pre-mixed KCl may not be — ratify the default fluid + KCl-handling policy.",
  "[DKA] SC-INSULIN PATHWAY: ADA/EASD 2024 newly endorses SC rapid-acting insulin (1–2 h) for mild/moderate uncomplicated DKA in non-critical settings — highly relevant where pumps/1:1 nursing are absent. Confirm whether the tool defaults to it and fix the exclusion criteria.",
  "[DKA] MONITORING GAP: guidelines assume POC blood-ketone meters + frequent venous gases; many Ugandan facilities have neither. Confirm the fallback (urine ketones + bicarbonate trend + clinical state) with reduced confidence flagged on resolution.",
  "[DKA] DOSES DELIBERATELY OMITTED: all insulin rates, fluid volumes, KCl concentrations, dextrose strengths + the glucose step-down threshold are the prescribing engine's job. Sign off those constants separately.",
  "[DKA] PHOSPHATE/BICARBONATE not recommended routinely (bicarbonate only in extreme acidaemia under critical care) — excluded from routine steps; confirm acceptable.",
  "[Asthma] SpO₂ TARGET differs: BTS/SIGN 94–98% vs GINA 2025 93–95% (controlled O₂). Ratify a single MedSync target; never high-flow 100% O₂.",
  "[Asthma] UGANDA PULSE-OXIMETRY caveat (GINA 2025): skin pigmentation causes oximeters to over-read SpO₂ — a 'normal' SpO₂ may mask hypoxaemia. Decide whether to apply a clinical-correlation rule.",
  "[Asthma] UCG 2023 Acute Asthma (p.330) could not be machine-read this session; pathway is built on GINA 2025 + BTS/SIGN (consistent with UCG). Cross-check UCG for local drug availability + referral tiers.",
  "[Asthma] Acute attacks are governed by SIGN 158 (2019), NOT the BTS/NICE/SIGN 2024 NG244 (which excludes acute attacks) — confirmed correct live source.",
  "[Asthma] Low-resource fallback (MSF): salbutamol via pMDI+spacer where O₂-driven nebulisers are unavailable — consider adding as an explicit branch.",
  "[Severe malaria] DRUG-DOSE FIREWALL: agent/class only; the weight-banded artesunate schedule (0/12/24 h then daily), glucose concentrations, benzodiazepine + antibiotic doses are the prescribing engine's job.",
  "[Severe malaria] FEAST vs UCG fluid nuance: WHO 2025 says rapid boluses are 'contraindicated'; UCG lists a 20 mL/kg NS bolus only under decompensated/hypotensive shock. The bolus is scoped to hypotensive shock only; non-hypotensive children are routed to transfusion/maintenance. Confirm this reconciliation.",
  "[Severe malaria] Hypoglycaemia intervention threshold: WHO uses <3 mmol/L for children <5 y (vs the <2.2 definition) — carried; confirm for the Ugandan paediatric context.",
  "[Severe malaria] Empirical broad-spectrum antibiotics: WHO recommends them broadly for children with suspected severe malaria in moderate/high-transmission areas (most of Uganda) until bacterial infection is excluded — framed as a low threshold; the prescribing engine/local antibiogram picks the agent.",
  "[Severe malaria] Source-access: WHO/FEAST primary URLs returned 403 / JS-only; WHO 2025 content was extracted verbatim from the official NCBI Bookshelf mirror (NBK588130) of the identical 13 Aug 2025 document; FEAST verified via PubMed 21615299. Verify against the canonical PDF before sign-off.",
];

export const MANAGEMENT_PATHWAYS: ManagementPathway[] = [
  {
    pcCodes: ["fever", "confusion"],
    condition: "Sepsis / septic shock (adult)",
    feastGuardrail:
      "FEAST guardrail (paediatric fluids): this pathway is for ADULTS. Do NOT carry an adult crystalloid bolus across to children. In African children with severe febrile illness and impaired perfusion WITHOUT hypotensive shock, rapid fluid boluses INCREASED mortality (FEAST RCT, NEJM 2011). For a child, use maintenance fluids and reserve boluses for decompensated/hypotensive shock with frequent reassessment — hand off to the paediatric sepsis pathway.",
    steps: [
      {
        step: "Recognise sepsis and start the hour-1 resuscitation timer",
        detail:
          "Treat suspected infection + organ dysfunction (new confusion, low BP, abnormal temperature, fast breathing, low urine output) as a time-critical emergency. In Uganda, screen for the local cause of fever — including a malaria RDT/blood film — at first contact. Begin the bundle within the first hour.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock",
          version: "2026 (published 23 March 2026)",
          recommendation:
            "Sepsis and septic shock are medical emergencies; interventions (the hour-1 bundle) should begin as quickly as possible, ideally within 1 hour of recognition.",
          url: "https://www.sccm.org/survivingsepsiscampaign/guidelines-and-resources/surviving-sepsis-campaign-adult-guidelines",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Give oxygen and secure IV access; attach monitoring",
        detail:
          "Correct hypoxaemia, obtain large-bore IV access, and start repeated monitoring of consciousness (GCS/AVPU), BP, pulse, respiratory rate, SpO₂ and temperature. In resource-limited wards, frequent vital-sign monitoring is itself associated with better sepsis survival.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock",
          version: "2026 (published 23 March 2026)",
          recommendation:
            "Resuscitate hypoperfusion/hypoxaemia and monitor patients closely; the hour-1 bundle requires concurrent assessment of perfusion and oxygenation.",
          url: "https://www.sccm.org/survivingsepsiscampaign/guidelines-and-resources/surviving-sepsis-campaign-adult-guidelines",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Obtain blood cultures (and key diagnostics) before antimicrobials",
        detail:
          "Draw blood cultures as soon as possible and ideally before the first antimicrobial, provided this does not substantially delay antibiotics. Send alongside locally available work-up (malaria RDT/film, glucose, HIV status, renal function, FBC) to identify the source and treatable mimics.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock",
          version: "2026 (published 23 March 2026)",
          recommendation:
            "Collecting blood cultures as soon as possible and ideally before the administration of antimicrobial therapy.",
          url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Measure lactate (where available) and trend it to guide resuscitation",
        detail:
          "Check an initial lactate; if elevated, remeasure to track response. Where point-of-care lactate is unavailable, fall back on clinical perfusion endpoints — mental status, capillary refill, urine output and BP/HR trend.",
        isDrug: false,
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock",
          version: "2026 (published 23 March 2026)",
          recommendation:
            "Measuring blood lactate and using serial lactate measurements to guide resuscitation (conditional, low certainty).",
          url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Start empirical broad-spectrum IV antimicrobials within 1 hour",
        detail:
          "Give empirical broad-spectrum cover immediately for septic shock or probable sepsis. Choose agents per the Uganda Clinical Guidelines and the likely source/local resistance; de-escalate once cultures return (stewardship).",
        isDrug: true,
        agentClass: "broad-spectrum IV antibiotic",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock",
          version: "2026 (published 23 March 2026)",
          recommendation:
            "Administering antimicrobial therapy immediately, ideally within 1 hr of recognition (strong recommendation for septic shock and for probable sepsis without shock).",
          url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Test for malaria and, if positive, give a parenteral antimalarial alongside sepsis care",
        detail:
          "In Uganda, severe/cerebral malaria is a leading cause of fever + confusion and may coexist with bacterial sepsis. If RDT/film is positive for severe malaria, start parenteral artesunate in addition to (not instead of) antibacterial cover.",
        isDrug: true,
        agentClass: "IV/IM artesunate (antimalarial)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "Uganda Clinical Guidelines, Ministry of Health Uganda",
          version: "2023 edition",
          recommendation:
            "Severe malaria is a key cause of fever/altered consciousness in Uganda and is treated with parenteral artesunate; it must be actively excluded or treated in the febrile, confused adult.",
          url: "https://www.differentiatedservicedelivery.org/wp-content/uploads/UCG-2023-Publication-Final-PDF-Version-1.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Begin titrated IV balanced-crystalloid resuscitation for hypoperfusion/shock — with Uganda caution",
        detail:
          "For sepsis-induced hypoperfusion/septic shock, give IV crystalloid (balanced preferred over saline). UGANDA CAUTION: give in reassessed aliquots rather than a fixed rapid bolus (a Ugandan cohort found IMAI fluid resuscitation did not improve outcomes; the FEAST harm signal looms). Reassess perfusion, oxygenation and lung crackles after each aliquot; slow/stop if respiratory distress, anaemia, malnutrition or possible heart failure.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "needs_cso_input",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock",
          version: "2026 (published 23 March 2026)",
          recommendation:
            "Administering crystalloid in the first hours, using balanced crystalloids over 0.9% saline (conditional, low/moderate certainty).",
          url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Start vasopressors if hypotensive during/after fluids; target a mean arterial pressure of 65 mmHg",
        detail:
          "If the patient remains hypotensive during or after fluid resuscitation, start a vasopressor with norepinephrine first-line, targeting an initial MAP of 65 mmHg (avoid higher targets). Note local constraints (central access, pumps, ICU referral).",
        isDrug: true,
        agentClass: "first-line vasopressor (norepinephrine)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock",
          version: "2026 (published 23 March 2026)",
          recommendation:
            "Using norepinephrine as the first-line agent (strong, high certainty) and an initial MAP target of 65 mm Hg over higher targets (strong, moderate certainty).",
          url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Identify and achieve source control, ideally within 6 hours",
        detail:
          "Actively seek the anatomical source (abscess, empyema, obstructed urinary tract, infected device, necrotising soft-tissue infection) and arrange the least-invasive effective source-control intervention — drainage, debridement or device removal — ideally within 6 hours of diagnosis.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock",
          version: "2026 (published 23 March 2026)",
          recommendation:
            "Early source control over late source control, ideally within 6 hr of diagnosis (conditional, very low certainty).",
          url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Consider IV corticosteroids in septic shock requiring ongoing vasopressors",
        detail:
          "For septic shock with ongoing vasopressor requirement despite adequate fluids + vasopressor, consider adding a systemic corticosteroid. Conditional/low-certainty — reserve for refractory shock and gate to senior/specialist decision.",
        isDrug: true,
        agentClass: "systemic corticosteroid",
        mustNotMiss: false,
        confidence: "medium",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock",
          version: "2026 (published 23 March 2026)",
          recommendation:
            "Using IV corticosteroids in patients with septic shock (conditional, low certainty).",
          url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Reassess perfusion continuously and escalate/refer",
        detail:
          "Re-examine after each intervention: mental status, BP/MAP, pulse, respiratory rate, SpO₂, capillary refill, urine output and (where available) lactate trend. Escalate to higher-level care/ICU for refractory shock, deteriorating consciousness or worsening respiratory status. Document on the append-only encounter record.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock",
          version: "2026 (published 23 March 2026)",
          recommendation:
            "Use dynamic measures and serial reassessment of perfusion to guide ongoing resuscitation rather than a single static endpoint.",
          url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
          retrieved: "2026-06-14",
        },
      },
    ],
    safetyNetting: [
      "Return immediately (or call for urgent review) if there is new or worsening confusion, drowsiness, or difficulty waking — this can signal worsening sepsis or cerebral malaria and needs same-hour assessment.",
      "Come back at once if breathing becomes fast or laboured, the lips/fingers look blue, oxygen levels fall, or you become cold, clammy, mottled, or pass little/no urine for 6–8 hours (signs of shock).",
      "Seek urgent care if fever persists or climbs despite treatment, you cannot keep fluids down, or you feel suddenly much worse — and return for the scheduled reassessment so BP, pulse, breathing and consciousness can be rechecked.",
      "Where to go: return to the same emergency/medical unit (or nearest facility able to give IV antibiotics and fluids) without delay; do not wait for a routine appointment if any red-flag symptom appears.",
    ],
  },
  {
    pcCodes: ["confusion", "abdominal_pain"],
    condition: "DKA / hyperglycaemic crisis (adult)",
    feastGuardrail:
      "FEAST guardrail (if managing a child/young person): do NOT give rapid fluid boluses to children with severe febrile illness and impaired perfusion but WITHOUT frank hypotensive shock (FEAST RCT, NEJM 2011 — boluses increased 48-h mortality). Paediatric DKA needs a dedicated protocol (BSPED/ISPAD) because of cerebral-oedema risk: calculate maintenance + measured deficit, replace slowly, avoid bolus over-resuscitation, and seek paediatric/senior input.",
    steps: [
      {
        step: "Confirm the diagnosis at the bedside: glucose + ketones + venous blood gas (pH/bicarbonate)",
        detail:
          "Triad = hyperglycaemia (or known diabetes), ketonaemia (capillary β-hydroxybutyrate raised, or urine ketones if no meter) and acidaemia (low venous pH/bicarbonate). Use VENOUS not arterial gas. Beware euglycaemic DKA (SGLT2 inhibitor, pregnancy, starvation) where glucose can be near-normal.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report (ADA/EASD/JBDS/AACE/DTS)",
          version: "Diabetes Care 2024;47(8):1257-1275 (published 22 June 2024)",
          recommendation:
            "We recommend direct measurement of venous or capillary β-hydroxybutyrate, the main ketoacid in DKA, for diagnosis and monitoring of the response to therapy.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Assess severity and circulation; escalate critical / unstable patients to HDU/ICU and senior review",
        detail:
          "Markers of severity / critical-care need: very high ketones, very low bicarbonate, low venous pH, hypokalaemia on admission, reduced GCS, low oxygen saturation, low systolic BP, abnormal pulse, raised anion gap. Reduced consciousness mandates airway assessment + senior input. Identify the nearest HDU capacity early.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "JBDS-IP: The Management of Diabetic Ketoacidosis in Adults",
          version: "Revised March 2023 (JBDS 02)",
          recommendation:
            "Features indicating severe DKA warrant consideration of HDU/ICU and immediate senior review.",
          url: "https://abcd.care/sites/default/files/site_uploads/JBDS_Guidelines_Current/JBDS_02_DKA_Guideline_with_QR_code_March_2023.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Start IV fluid resuscitation: isotonic saline or balanced crystalloid",
        detail:
          "First step of management. If systolic BP is low, give a rapid isotonic-saline bolus and reassess; seek senior help if it stays low. Otherwise replace the deficit with sequential isotonic saline (or balanced crystalloid e.g. Ringer's lactate) titrated to the patient, with more cautious replacement in the young, elderly, pregnant, renal or cardiac failure. Volumes are the prescribing engine's job.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report (ADA/EASD/JBDS/AACE/DTS)",
          version: "Diabetes Care 2024;47(8):1257-1275",
          recommendation:
            "In adults with DKA or HHS without renal or cardiac compromise, we recommend starting isotonic saline or balanced crystalloid solutions; balanced crystalloids result in faster DKA resolution.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Check serum potassium before/with insulin; delay insulin if potassium is low until corrected",
        detail:
          "Insulin drives potassium intracellularly and can precipitate fatal hypokalaemia. If admission potassium is low, start potassium replacement first and DELAY insulin until it has risen to a safe level. Total-body potassium is always depleted even when serum potassium is normal/high. Get an ECG; watch for arrhythmia and respiratory muscle weakness.",
        isDrug: true,
        agentClass: "intravenous potassium chloride (electrolyte replacement)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report (ADA/EASD/JBDS/AACE/DTS)",
          version: "Diabetes Care 2024;47(8):1257-1275",
          recommendation:
            "If low potassium is present on admission, potassium replacement should begin and insulin therapy should be delayed until the potassium level increases to a safe level, to avoid life-threatening arrhythmias and respiratory muscle weakness.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Start insulin: fixed-rate IV infusion of short-acting (soluble) human insulin — once potassium is safe",
        detail:
          "Preferred for severe DKA: a weight-based fixed-rate IV insulin infusion of short-acting/soluble human insulin (no priming bolus). The prescribing engine sets the weight-based rate + the step-down. Where pumps/monitoring are unavailable, the subcutaneous pathway (next step) is the safer alternative for mild/moderate DKA.",
        isDrug: true,
        agentClass: "short-acting (soluble) human insulin, IV infusion (fixed-rate)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "JBDS-IP: The Management of Diabetic Ketoacidosis in Adults",
          version: "Revised March 2023 (JBDS 02)",
          recommendation:
            "A fixed rate intravenous insulin infusion calculated on body weight is recommended; do not use a priming (bolus) dose. Continue until ketones and venous pH have resolved.",
          url: "https://abcd.care/sites/default/files/site_uploads/JBDS_Guidelines_Current/JBDS_02_DKA_Guideline_with_QR_code_March_2023.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Alternative for mild/moderate uncomplicated DKA without infusion capacity: subcutaneous rapid-acting insulin analogue",
        detail:
          "ADA/EASD 2024 endorses managing mild + uncomplicated moderate DKA with subcutaneous rapid-acting insulin analogue (1–2 hourly) in a non-critical-care setting with close nursing supervision — highly relevant for wards lacking pumps and 1:1 monitoring. NOT for severe DKA, HHS, shock, reduced consciousness, pregnancy or critical illness.",
        isDrug: true,
        agentClass: "rapid-acting insulin analogue, subcutaneous",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report (ADA/EASD/JBDS/AACE/DTS)",
          version: "Diabetes Care 2024;47(8):1257-1275",
          recommendation:
            "Patients with uncomplicated mild or moderate DKA may be treated with subcutaneous rapid-acting insulin analogs every 1-2 h as an effective alternative to intravenous infusion, in a noncritical care setting when clinically appropriate.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Continue the patient's usual long-acting (basal) insulin throughout; start basal insulin if newly diagnosed",
        detail:
          "Do NOT stop background basal insulin during DKA treatment — continuing it reduces rebound ketosis when the IV insulin stops. If newly diagnosed type 1 diabetes, commence a weight-based subcutaneous long-acting basal insulin.",
        isDrug: true,
        agentClass: "long-acting (basal) insulin, subcutaneous",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "JBDS-IP: The Management of Diabetic Ketoacidosis in Adults",
          version: "Revised March 2023 (JBDS 02)",
          recommendation:
            "In those already on long acting basal insulin, it should continue to be prescribed at their usual dose. In those newly diagnosed, a long acting basal insulin should be commenced subcutaneously once daily.",
          url: "https://abcd.care/sites/default/files/site_uploads/JBDS_Guidelines_Current/JBDS_02_DKA_Guideline_with_QR_code_March_2023.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Add IV glucose (dextrose) once blood glucose falls below threshold, while continuing insulin to clear ketones",
        detail:
          "When glucose falls below the guideline threshold, add a glucose/dextrose infusion alongside the saline so insulin can keep suppressing ketogenesis without causing hypoglycaemia; at this point consider stepping the IV insulin rate down (per the prescribing engine).",
        isDrug: true,
        agentClass: "intravenous glucose (dextrose) infusion",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report (ADA/EASD/JBDS/AACE/DTS)",
          version: "Diabetes Care 2024;47(8):1257-1275",
          recommendation:
            "Once the plasma glucose concentration falls below the threshold, replacement fluids should contain dextrose in addition to saline to prevent hypoglycemia and allow continued insulin administration until the ketonemia is corrected.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Maintain potassium in target range with replacement banded to the serum level",
        detail:
          "Once potassium is in range and the patient is passing urine, add potassium chloride to the IV fluids to keep it in the target band; give none when potassium is high, more (with senior review) when low. Use pre-mixed KCl bags where available for ward safety. Concentrations are the prescribing engine's job.",
        isDrug: true,
        agentClass: "intravenous potassium chloride (electrolyte replacement)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "JBDS-IP: The Management of Diabetic Ketoacidosis in Adults",
          version: "Revised March 2023 (JBDS 02)",
          recommendation:
            "Potassium replacement is banded to the serum level (none when high; standard replacement in the mid band; senior review + additional potassium when low). Maintain potassium within the target range.",
          url: "https://abcd.care/sites/default/files/site_uploads/JBDS_Guidelines_Current/JBDS_02_DKA_Guideline_with_QR_code_March_2023.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Identify and treat the precipitant",
        detail:
          "DKA rarely occurs without a trigger. Actively look for infection (very common in Uganda — malaria, pneumonia, UTI, sepsis, TB), insulin omission/non-adherence (cost/supply interruption is a major driver), newly diagnosed diabetes, MI, stroke, pancreatitis, pregnancy, and drugs (steroids, SGLT2 inhibitors). Investigate (FBC, U&E, glucose, cultures, ECG, CXR, urinalysis, malaria test) and treat the precipitant in parallel.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report (ADA/EASD/JBDS/AACE/DTS)",
          version: "Diabetes Care 2024;47(8):1257-1275",
          recommendation:
            "Management includes identification and treatment of the precipitating cause; patients should be examined for signs of infection, ischemia, and other potential precipitants.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Establish serial monitoring against the metabolic treatment targets",
        detail:
          "Monitor capillary glucose hourly, hourly blood ketones if a meter is available, and venous pH/bicarbonate/potassium per protocol. Targets: ketones falling, bicarbonate rising, glucose falling, potassium in range. If targets are not met, escalate the insulin rate (per the prescribing engine) and seek senior review. Where ketone meters are unavailable, use the bicarbonate trend + clinical state and flag the gap.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "JBDS-IP: The Management of Diabetic Ketoacidosis in Adults",
          version: "Revised March 2023 (JBDS 02)",
          recommendation:
            "Monitor against metabolic treatment targets (falling ketones, rising bicarbonate, falling glucose, potassium maintained in range); if targets are not achieved, the insulin infusion rate should be increased.",
          url: "https://abcd.care/sites/default/files/site_uploads/JBDS_Guidelines_Current/JBDS_02_DKA_Guideline_with_QR_code_March_2023.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Confirm resolution, transition to subcutaneous insulin, and arrange follow-up/education",
        detail:
          "Resolution = ketones cleared and venous pH normalised. Do not stop IV insulin until the patient is eating/drinking and has had subcutaneous (meal-time + basal) insulin with overlap. Refer to the diabetes team; counsel on the precipitant, sick-day rules, insulin supply/adherence, and provide a ketone meter where possible.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report (ADA/EASD/JBDS/AACE/DTS)",
          version: "Diabetes Care 2024;47(8):1257-1275",
          recommendation:
            "Resolution of DKA is defined by cleared ketones and a normalised venous pH/bicarbonate; transition to subcutaneous insulin with overlap and arrange diabetes follow-up.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
          retrieved: "2026-06-14",
        },
      },
    ],
    safetyNetting: [
      "Return immediately (or call for help) if you become drowsy, confused, very sleepy or hard to wake — this can mean the blood acid or salts are dangerously off, or rarely brain swelling, and needs emergency review at once.",
      "Come back the same day if you keep vomiting, cannot keep fluids down, have worsening tummy pain, fast/deep breathing, a fruity smell on the breath, or home ketones stay high despite taking insulin.",
      "Never stop your insulin when unwell, even if not eating — follow sick-day rules, keep sipping fluids, check glucose and ketones more often, and seek care early. Insulin omission or running out is the commonest cause of this emergency.",
      "If you have signs of infection (fever, chills, cough, painful urination, a wound, or a positive malaria test) seek treatment promptly — infection (including malaria) is a frequent trigger and must be treated alongside the diabetes.",
    ],
  },
  {
    pcCodes: ["dyspnoea", "cough"],
    condition: "Acute asthma exacerbation",
    feastGuardrail:
      "FEAST guardrail: for a child with an acute exacerbation, do NOT give a rapid IV fluid bolus unless the child is objectively shocked/hypotensive (FEAST RCT, NEJM 2011 — boluses increased mortality in febrile children with impaired perfusion but no hypotension). Treat hypoxaemia with controlled oxygen, give maintenance fluids only if oral intake is inadequate, and route any paediatric fluid/drug decision through the resus/prescribing engine with CSO-verified paediatric dosing.",
    steps: [
      {
        step: "Immediate severity assessment: moderate / acute severe / life-threatening / near-fatal",
        detail:
          "Assess at first contact and treat as acute severe until proven otherwise. Any single life-threatening feature (very low PEF, low SpO₂, silent chest, cyanosis, poor respiratory effort, arrhythmia, hypotension, exhaustion, altered consciousness) escalates concern — patients may not appear distressed.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "BTS/SIGN British guideline on the management of asthma (SIGN 158) — acute asthma",
          version: "SIGN 158 (2019), hosted on the NHS Right Decisions SIGN 244 pathway",
          recommendation:
            "Life-threatening features include a markedly reduced PEF, SpO₂ <92%, silent chest, cyanosis or poor respiratory effort, arrhythmia or hypotension, exhaustion, and altered consciousness.",
          url: "https://www.rightdecisions.scot.nhs.uk/asthma-pathway-bts-nice-sign-sign-244/managing-acute-asthma/management-of-acute-asthma-in-adults/asthma-management-algorithms-for-adults/management-of-acute-asthma-in-adults-in-hospital/",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Controlled supplementary oxygen titrated to target SpO₂",
        detail:
          "Give controlled/titrated oxygen to all hypoxaemic patients (BTS/SIGN target 94–98%; GINA 2025 93–95% with controlled, not 100%, oxygen). UGANDA: pulse oximetry over-reads with darker skin pigmentation (GINA 2025) — do not be falsely reassured by a borderline-normal SpO₂; correlate with clinical state. Avoid hyperoxia; do not withhold oxygen for fear of CO₂ retention in asthma.",
        isDrug: true,
        agentClass: "controlled supplemental oxygen (titrated to target SpO₂)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "BTS/SIGN (SIGN 158) acute asthma + GINA 2025",
          version: "SIGN 158 (2019); GINA 2025",
          recommendation:
            "Give controlled supplementary oxygen to all hypoxaemic patients titrated to the target SpO₂; account for the effect of skin colour on pulse oximetry (GINA 2025).",
          url: "https://www.rightdecisions.scot.nhs.uk/asthma-pathway-bts-nice-sign-sign-244/managing-acute-asthma/management-of-acute-asthma-in-adults/treatment-of-acute-asthma-in-adults",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "High-dose inhaled short-acting beta-2 agonist (SABA), as early as possible",
        detail:
          "First-line, given as early as possible via oxygen-driven nebuliser (preferred in acute severe/life-threatening) or pMDI + spacer in milder cases. Repeat at 15–30 minute intervals or use continuous nebulisation if response is inadequate.",
        isDrug: true,
        agentClass: "inhaled/nebulised short-acting beta-2 agonist (SABA, e.g. salbutamol)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "BTS/SIGN (SIGN 158) acute asthma + GINA 2025",
          version: "SIGN 158 (2019); GINA 2025",
          recommendation:
            "Use high-dose inhaled beta-2 agonists as first-line agents and administer as early as possible; repeat at 15-30 min intervals or use continuous nebulisation if the response is inadequate.",
          url: "https://www.rightdecisions.scot.nhs.uk/asthma-pathway-bts-nice-sign-sign-244/managing-acute-asthma/management-of-acute-asthma-in-adults/treatment-of-acute-asthma-in-adults",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Add nebulised ipratropium bromide for acute severe or life-threatening attacks",
        detail:
          "Add nebulised ipratropium bromide to the SABA for acute severe or life-threatening asthma, or a poor initial response to SABA; given combined with the nebulised SABA.",
        isDrug: true,
        agentClass: "nebulised short-acting muscarinic antagonist (ipratropium bromide)",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "BTS/SIGN (SIGN 158) acute asthma + GINA 2025",
          version: "SIGN 158 (2019); GINA 2025",
          recommendation:
            "Add nebulised ipratropium bromide to beta-2 agonist treatment for patients with acute severe or life-threatening asthma.",
          url: "https://www.rightdecisions.scot.nhs.uk/asthma-pathway-bts-nice-sign-sign-244/managing-acute-asthma/management-of-acute-asthma-in-adults/treatment-of-acute-asthma-in-adults",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Systemic corticosteroid early — within the first hour",
        detail:
          "Give a systemic corticosteroid in adequate dose to ALL patients with an acute attack, as early as possible (GINA 2025: within the first hour). Oral prednisolone is as effective as IV; use IV hydrocortisone if the patient cannot swallow/retain oral medication. Continue until recovery; do NOT stop the regular inhaled corticosteroid.",
        isDrug: true,
        agentClass:
          "systemic corticosteroid (oral prednisolone, or IV hydrocortisone if oral not tolerated)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "BTS/SIGN (SIGN 158) acute asthma + GINA 2025",
          version: "SIGN 158 (2019); GINA 2025",
          recommendation:
            "Give steroids in adequate doses to all patients with an acute asthma attack; GINA 2025: systemic corticosteroids within the first hour of presentation.",
          url: "https://www.rightdecisions.scot.nhs.uk/asthma-pathway-bts-nice-sign-sign-244/managing-acute-asthma/management-of-acute-asthma-in-adults/treatment-of-acute-asthma-in-adults",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Consider single-dose IV magnesium sulfate for acute severe asthma not responding to initial treatment",
        detail:
          "Consider a single dose of IV magnesium sulfate for acute severe asthma with a poor response to initial inhaled bronchodilators, and for life-threatening/near-fatal asthma, with senior input. Nebulised magnesium is NOT recommended; repeated IV doses risk hypermagnesaemia.",
        isDrug: true,
        agentClass: "IV magnesium sulfate (single dose)",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "BTS/SIGN (SIGN 158) acute asthma + GINA 2025",
          version: "SIGN 158 (2019); GINA 2025",
          recommendation:
            "Consider giving a single dose of intravenous magnesium sulphate to patients with acute severe asthma who have not had a good initial response; nebulised magnesium sulphate is not recommended.",
          url: "https://www.rightdecisions.scot.nhs.uk/asthma-pathway-bts-nice-sign-sign-244/managing-acute-asthma/management-of-acute-asthma-in-adults/treatment-of-acute-asthma-in-adults",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Do NOT give routine antibiotics",
        detail:
          "Routine antibiotics are not indicated for acute asthma — most exacerbations are viral or non-infective. Reserve antibiotics for a clearly evidenced bacterial infection (then prescribe via the prescribing engine). Supports antimicrobial stewardship.",
        isDrug: false,
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "BTS/SIGN (SIGN 158) acute asthma",
          version: "SIGN 158 (2019)",
          recommendation:
            "Routine prescription of antibiotics is not indicated for patients with acute asthma.",
          url: "https://www.rightdecisions.scot.nhs.uk/asthma-pathway-bts-nice-sign-sign-244/managing-acute-asthma/management-of-acute-asthma-in-adults/treatment-of-acute-asthma-in-adults",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "IV aminophylline only after senior consultation (selected near-fatal/life-threatening cases)",
        detail:
          "Unlikely to add bronchodilation beyond inhaled bronchodilators + steroids and increases side effects (arrhythmias, vomiting). Use only after senior consultation, in near-fatal or life-threatening asthma with a poor response; requires cardiac + level monitoring.",
        isDrug: true,
        agentClass: "IV methylxanthine (aminophylline) — senior decision only",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "BTS/SIGN (SIGN 158) acute asthma",
          version: "SIGN 158 (2019)",
          recommendation:
            "Use IV aminophylline only after consultation with senior medical staff; it is unlikely to add bronchodilation over standard care and increases side effects.",
          url: "https://www.rightdecisions.scot.nhs.uk/asthma-pathway-bts-nice-sign-sign-244/managing-acute-asthma/management-of-acute-asthma-in-adults/treatment-of-acute-asthma-in-adults",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Reassess response; escalate and admit if not improving",
        detail:
          "Monitor PEF, SpO₂ and clinical state. Arrange immediate admission for any life-threatening attack; admit acute severe asthma with no good response, persisting/worsening signs, a low PEF after treatment, previous near-fatal asthma, an attack despite oral steroids, night presentation, pregnancy or poor home support. Refer early to a facility with nebulisers, oxygen, IV magnesium and critical care.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "BTS/SIGN (SIGN 158) acute asthma",
          version: "SIGN 158 (2019)",
          recommendation:
            "Arrange immediate admission for life-threatening cases; admit acute severe asthma if there is no response to treatment.",
          url: "https://www.rightdecisions.scot.nhs.uk/asthma-pathway-bts-nice-sign-sign-244/managing-acute-asthma/management-of-acute-asthma-in-adults/asthma-management-algorithms-for-adults/management-of-acute-asthma-in-adults-in-general-practice/management-of-acute-asthma-in-adults-in-general-practice/",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Refer to ICU / critical care with a doctor able to intubate if deteriorating",
        detail:
          "Transfer to ICU (with a doctor equipped to intubate) for deteriorating PEF, persisting/worsening hypoxia, hypercapnia, a falling arterial pH, exhaustion/feeble respiration, drowsiness/confusion/altered consciousness, or respiratory arrest. Do not delay escalation while awaiting investigations.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "BTS/SIGN (SIGN 158) acute asthma",
          version: "SIGN 158 (2019)",
          recommendation:
            "Indications for ICU include deteriorating PEF, persisting/worsening hypoxia, hypercapnia, falling arterial pH, exhaustion, drowsiness/confusion/altered consciousness and respiratory arrest; transfers should be accompanied by a doctor able to intubate.",
          url: "https://www.rightdecisions.scot.nhs.uk/asthma-pathway-bts-nice-sign-sign-244/managing-acute-asthma/management-of-acute-asthma-in-adults/treatment-of-acute-asthma-in-adults",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Before discharge: review inhaler technique/adherence, supply a steroid course, arrange follow-up",
        detail:
          "Do not discharge until stable on discharge medication with PEF improving and SpO₂ maintained on room air. Ensure an oral corticosteroid course, continued/started inhaled corticosteroid, checked inhaler technique, a written action plan, and follow-up within 1–2 weeks (GINA 2025). Drug supply is the prescribing engine's job.",
        isDrug: false,
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "GINA 2025 + BTS/SIGN (SIGN 158)",
          version: "GINA 2025; SIGN 158 (2019)",
          recommendation:
            "GINA 2025: arrange a follow-up visit within 1-2 weeks of every exacerbation to review triggers and step up controller therapy; do not prescribe SABA-only treatment.",
          url: "https://ginasthma.org/2025-gina-strategy-report/",
          retrieved: "2026-06-14",
        },
      },
    ],
    safetyNetting: [
      "Return immediately / call for emergency transport if breathing gets worse, the reliever is not helping or is needed again within a few hours, you cannot speak in full sentences, lips or fingertips turn blue, or you feel too exhausted to breathe.",
      "Come back the same day if the reliever is not lasting 4 hours, your peak flow stays below half your normal best, you are waking at night breathless, or symptoms are not steadily improving over 24–48 hours.",
      "Finish the full course of steroid tablets even if you feel better, keep taking your regular (preventer) inhaler, and bring all your inhalers to the follow-up visit.",
      "Attend the follow-up within 1–2 weeks; go to the nearest facility with oxygen and nebulisers if a severe attack starts — do not try to wait it out at home.",
    ],
  },
  {
    pcCodes: ["fever"],
    condition: "Severe malaria (severe/complicated falciparum malaria)",
    feastGuardrail:
      "FEAST guardrail — NO rapid fluid bolus in febrile, non-hypotensive children. WHO 2025: rapid bolus infusion is contraindicated in severe malaria; bolus albumin is not recommended. FEAST (Maitland et al., NEJM 2011) showed bolus fluids increased 48-h mortality in African children with severe febrile illness and impaired perfusion who were NOT hypotensive. In a febrile child with impaired perfusion but no hypotension: give maintenance fluids, correct hypoglycaemia, and TRANSFUSE for severe anaemia/acidotic respiratory distress rather than bolusing. A cautious crystalloid bolus is reserved only for decompensated/hypotensive shock.",
    steps: [
      {
        step: "Recognise severe malaria as an emergency and confirm parasitaemia at point of care",
        detail:
          "In a febrile patient with P. falciparum parasitaemia (RDT or slide) PLUS one or more danger features (impaired consciousness, prostration, multiple convulsions, acidosis, hypoglycaemia, severe anaemia, renal impairment, jaundice, pulmonary oedema, significant bleeding, shock, hyperparasitaemia), treat as severe malaria. If signs are present but tests negative with no alternative diagnosis, consider treating anyway, repeat the RDT at 24 h, and add a broad-spectrum antibiotic. Do NOT delay treatment for definitions.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "The attending clinician should not worry unduly about definitions: the severely ill patient requires immediate supportive care, and, if severe malaria is a possibility, parenteral antimalarial drug treatment should be started without delay.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Immediate clinical assessment + baseline tests (ABC, weight, IV access, glucose, Hb, parasitaemia)",
        detail:
          "Secure the airway in unconscious patients; assess breathing and circulation. Weigh or estimate body weight so doses + fluids are correct. Insert an IV cannula and measure blood glucose, haemoglobin/haematocrit and parasitaemia immediately; check renal function in adults. Perform a lumbar puncture in coma/convulsions to exclude bacterial meningitis.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "An open airway should be secured in unconscious patients; weigh the patient; measure blood glucose, haematocrit/haemoglobin, parasitaemia and (in adults) renal function immediately; unconscious patients should undergo a lumbar puncture to exclude bacterial meningitis.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Start full-dose parenteral artesunate (IV, or IM if IV not possible) without delay",
        detail:
          "Parenteral artesunate is the treatment of choice for ALL severe malaria — adults and children including infants, pregnant women in any trimester and lactating women. Give for at least 24 hours and until the patient tolerates oral medication. Therapeutic levels must be achieved ASAP because death can occur within hours. Weight-banded dosing is the prescribing engine's job.",
        isDrug: true,
        agentClass: "IV/IM artesunate (parenteral artemisinin)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "Adults and children with severe malaria (including infants, pregnant women in all trimesters and lactating women) should be treated with intravenous or intramuscular artesunate for at least 24 h and until they can tolerate oral medication.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "If artesunate is unavailable, use a parenteral alternative (artemether preferred over quinine)",
        detail:
          "If artesunate is not available, IM artemether (antero-lateral thigh, NEVER the buttock) is preferred over quinine. If neither artemisinin is available, give parenteral quinine — NEVER as a rapid IV bolus (risk of fatal hypotension/arrhythmia) and with a higher hypoglycaemia risk. Switch to artesunate as soon as it is obtained.",
        isDrug: true,
        agentClass:
          "IM artemether, or parenteral quinine (cinchona alkaloid) as second alternative",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "If artesunate is not available, artemether should be used in preference to quinine for treating children and adults with severe malaria.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Pre-referral treatment when full parenteral care is not available locally",
        detail:
          "At a facility without admission/IV capability, do NOT withhold treatment while referring. Give a single IM dose of artesunate (or IM artemether, or IM quinine) and refer immediately. Where IM artesunate is not possible, children under ~6 years should be given a single RECTAL artesunate dose and referred immediately; rectal artesunate must NOT be used in older children or adults.",
        isDrug: true,
        agentClass: "IM artesunate (or rectal artesunate in young children as pre-referral only)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "Where complete treatment of severe malaria is not possible but injections are available, adults and children should be given a single intramuscular dose of artesunate and referred; where IM artesunate is unavailable, young children should be given a single rectal dose and referred immediately. Rectal artesunate should not be used in older children and adults.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Monitor blood glucose and correct hypoglycaemia with a glucose-containing infusion",
        detail:
          "Monitor glucose regularly, especially in unconscious patients, those on quinine (recurrent hypoglycaemia) and in pregnancy. Treat with IV glucose then maintain with a glucose-containing infusion. Use diluted dextrose by slow IV; never give undiluted concentrated dextrose. Concentrations are the prescribing engine's job.",
        isDrug: true,
        agentClass: "IV glucose (dextrose) infusion for hypoglycaemia",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "Blood glucose should be monitored regularly, particularly in unconscious patients; check blood glucose, correct hypoglycaemia and maintain with a glucose-containing infusion.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Manage fluids individually and cautiously — NO rapid bolus in non-hypotensive patients",
        detail:
          "Assess fluid requirements individually and base resuscitation on the estimated deficit. Adults are very vulnerable to fluid overload/pulmonary oedema; children are harmed by fluid boluses (FEAST). Rapid bolus infusion of crystalloid or colloid is contraindicated. Children with severe anaemia and acidotic 'respiratory distress' should be TRANSFUSED, not bolused. A cautious bolus is reserved only for decompensated/hypotensive shock.",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "Fluid requirements should be assessed individually; rapid bolus infusion of colloid or crystalloids is contraindicated; children with severe anaemia and respiratory distress should be treated by blood transfusion.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Start empirical broad-spectrum antibiotics where bacterial co-infection cannot be excluded",
        detail:
          "Septicaemia and severe malaria overlap, especially in children in moderate/high-transmission areas (enteric bacteria, notably Salmonella). Keep a LOW threshold: take blood cultures where possible, then give empirical parenteral broad-spectrum antibiotics with antimalarials to any shocked/obtunded child where septicaemia cannot be excluded, and to children with suspected severe malaria in moderate/high-transmission areas until bacterial infection is excluded.",
        isDrug: true,
        agentClass: "empirical parenteral broad-spectrum antibiotic",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "The threshold for administering antibiotic treatment should be low in severe malaria; broad-spectrum antibiotic treatment should be given with antimalarial drugs to all children with suspected severe malaria in areas of moderate and high transmission until a bacterial infection is excluded.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Treat convulsions promptly; do NOT use prophylactic anticonvulsants",
        detail:
          "Maintain the airway, place the patient on their side, and check blood glucose with every seizure. Treat active convulsions with an IV (or rectal) benzodiazepine, or IM paraldehyde. Prophylactic anticonvulsants are NOT recommended — prophylactic phenobarbital reduced seizures but increased mortality (respiratory arrest) without respiratory support.",
        isDrug: true,
        agentClass: "IV/rectal benzodiazepine (or IM paraldehyde) for active convulsions",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "Maintain airways; treat convulsions promptly with intravenous or rectal diazepam, lorazepam, midazolam or intramuscular paraldehyde; check blood glucose. Prophylactic anticonvulsants are not recommended.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Transfuse for severe malarial anaemia (and manage other complications)",
        detail:
          "Transfuse screened (cross-matched where possible) blood for severe anaemia per the WHO threshold (individualise; rapidly developing anaemia is worse-tolerated). Manage other complications: cerebral malaria (airway, exclude hypoglycaemia/meningitis), hyperpyrexia, pulmonary oedema (sit up, oxygen, stop IV fluids), acute kidney injury (dialysis if established), bleeding/coagulopathy, and metabolic acidosis (treat hypoglycaemia, hypovolaemia and septicaemia).",
        isDrug: false,
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "Transfuse with screened fresh whole blood for severe anaemia per the recommended haemoglobin thresholds; for acute pulmonary oedema, prop the patient up, give oxygen and stop intravenous fluids.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Complete a full course of oral ACT once the patient can tolerate oral therapy",
        detail:
          "After at least 24 h of parenteral therapy and once oral medication is tolerated, complete treatment with a full 3-day course of an effective oral ACT (do NOT stop at the parenteral phase — this prevents recrudescence). Uganda policy discharges severe-malaria cases on dihydroartemisinin-piperaquine with monthly post-severe-malaria chemoprevention and review for 3 months.",
        isDrug: true,
        agentClass:
          "oral artemisinin-based combination therapy (ACT) — full course (Uganda post-severe-malaria chemoprevention per policy)",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "Once a patient has received at least 24 h of parenteral therapy and can tolerate oral therapy, treatment should be completed with 3 days of an ACT.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
      {
        step: "Provide continuing intensive supportive/nursing care and special-population management",
        detail:
          "Severe malaria needs intensive nursing (ICU where possible): frequent vital signs, coma score, urine output, NG feeding/meds in coma. AVOID harmful adjuncts (heparin, high-dose corticosteroids, adrenaline, dextran, N-acetylcysteine, bolus albumin). PREGNANCY: more common and more lethal — give parenteral artesunate without delay in all trimesters, seek obstetric input, and monitor for hypoglycaemia. Refer for dialysis or any complication not manageable locally.",
        isDrug: false,
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "WHO guidelines for malaria",
          version: "13 August 2025",
          recommendation:
            "Patients with severe malaria require intensive nursing care; heparin, high-dose corticosteroids, adrenaline, N-acetylcysteine and bolus albumin are not recommended; in pregnancy, parenteral artesunate is the treatment of choice in all trimesters and treatment must not be delayed.",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
          retrieved: "2026-06-14",
        },
      },
    ],
    safetyNetting: [
      "Severe malaria is a medical emergency — admit and treat in hospital now, not at home. At a lower-level unit, give the pre-referral artesunate dose and refer immediately to a facility with admission and IV treatment.",
      "Return or call for help IMMEDIATELY if there is drowsiness or confusion, a fit/convulsion, inability to sit/stand/drink or breastfeed (in a child), repeated vomiting, fast or laboured breathing, very pale palms/eyes, dark or reduced urine, yellow eyes, or any bleeding.",
      "After discharge, complete the FULL oral antimalarial course exactly as prescribed even once feeling better, and attend the scheduled monthly reviews for 3 months and the follow-up haemoglobin check.",
      "Come back urgently if fever returns, persists beyond 48 hours, or symptoms recur within 3 weeks of treatment — this needs a repeat blood slide/RDT to check for treatment failure or another cause of fever.",
    ],
  },
];

/** Cited management pathways for the active presenting complaint(s) — gated:
 *  returns nothing until the CSO signs the tranche. */
export function suggestedManagementFor(pcCodes: string[]): SuggestedManagementPathway[] {
  if (!MANAGEMENT_PATHWAYS_CSO_SIGNED) return [];
  return suggestManagement(pcCodes, MANAGEMENT_PATHWAYS);
}
