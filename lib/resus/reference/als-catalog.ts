import type { RefEntry } from "@/lib/resus/reference/ref";

import { DEATH_CONFIRMATION_REFS } from "@/lib/resus/reference/death-confirmation";
import { indexRefs } from "@/lib/resus/reference/ref";

/**
 * Resus v2 ALS arrest-console reference (Law 3 — no remembered numbers).
 *
 * Transcribed row by row from docs/clinical/resus-als-clinical-catalog.md (CSO-signed at
 * GATE A, 2026-09-23; primary pages re-verified the same day). One RefEntry per ALS-* row
 * (the ALS-DTH rows live in `death-confirmation.ts`), plus the numeric constants the pure
 * engine (`lib/resus/als/**`) imports — each annotated with the rule ID it comes from.
 * Rows marked NOT ENCODED in the catalog carry no `value` and must never produce a number.
 */

const VERIFIED_ON = "2026-09-23";
const CATALOG_DOC = "docs/clinical/resus-als-clinical-catalog.md";

/** The catalog's source key (§ Source key). */
export const ALS_SOURCES = {
  "RCUK-ALS25":
    "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-advanced-life-support-guidelines",
  "RCUK-BLS25":
    "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-basic-life-support-guidelines",
  "RCUK-SC25":
    "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/special-circumstances-guidelines",
  "RCUK-ETH25":
    "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/ethics-guidelines",
  "ERC-ETH25": "https://repository.uantwerpen.be/docman/irua/8f856amotoM6a",
  AOMRC25:
    "https://www.aomrc.org.uk/publication/a-code-of-practice-for-the-diagnosis-and-confirmation-of-death-2025-update/",
  "ANZCOR-11.5":
    "https://www.anzcor.org/home/adult-advanced-life-support/guideline-11-5-medications-in-adult-cardiac-arrest",
  "UTS-IH19": "https://www.ahajournals.org/doi/10.1161/CIR.0000000000000710",
  "UTS-IH97": "https://www.ahajournals.org/doi/10.1161/01.cir.95.8.2213",
} as const;
export type AlsSourceCode = keyof typeof ALS_SOURCES;

/**
 * Build one entry. `source` is the catalog's Source cell; the URL is the first source-key
 * code found in it, else the catalog itself (design / CSO-decision / v1 rows → "design").
 */
export function alsRef(
  id: string,
  text: string,
  source: string,
  opts: { value?: string; unit?: string } = {},
): RefEntry {
  const code = (Object.keys(ALS_SOURCES) as AlsSourceCode[]).find((c) => source.includes(c));
  return {
    id,
    text,
    ...(opts.value !== undefined ? { value: opts.value } : {}),
    ...(opts.unit !== undefined ? { unit: opts.unit } : {}),
    source,
    url: code ? ALS_SOURCES[code] : CATALOG_DOC,
    verifiedOn: VERIFIED_ON,
    confidence: code ? "verified-web" : "design",
    status: "signed",
  };
}

/* ─── Engine constants (each from the signed row named beside it) ───────────── */

const SEC = 1000;
const MIN = 60 * SEC;

/** ALS-CPR-03: rhythm/pulse check every 2 min (cycle 2:00). */
export const CYCLE_MS = 120 * SEC;
/** ALS-CPR-12: "prepare" at +1:45 (design, CSO-adjustable). */
export const CYCLE_PREPARE_MS = 105 * SEC;
/** ALS-CPR-12: overdue (amber) after +2:15 (design, CSO-adjustable). */
export const CYCLE_OVERDUE_MS = 135 * SEC;

/** ALS-ADR-01: adrenaline after the 3rd shock (shockable). */
export const ADRENALINE_AFTER_SHOCKS = 3;
/** ALS-ADR-03: repeat window opens +3:00 after the last dose. */
export const ADRENALINE_OPEN_MS = 3 * MIN;
/** ALS-ADR-03: overdue after +5:00. */
export const ADRENALINE_OVERDUE_MS = 5 * MIN;
/** ALS-MOD-04: core 30–35 °C — window opens +6:00. */
export const HYPOTHERMIC_ADRENALINE_OPEN_MS = 6 * MIN;
/** ALS-MOD-04: core 30–35 °C — overdue after +10:00. */
export const HYPOTHERMIC_ADRENALINE_OVERDUE_MS = 10 * MIN;
/** ALS-ADR-01/02: the adult adrenaline dose as displayed (never shown to a child, ALS-MOD-16). */
export const ADRENALINE_DOSE_TEXT = "1 mg IV";

/** ALS-ACC-01: after 2 failed IV attempts prompt IO. */
export const IV_FAILED_ATTEMPTS_FOR_IO = 2;

/** ALS-AA-01: amiodarone 300 mg after a total of 3 shocks. */
export const AMIODARONE_FIRST_MG = 300;
/** ALS-AA-02: amiodarone further 150 mg after a total of 5 shocks. */
export const AMIODARONE_SECOND_MG = 150;
/** ALS-AA-03: lidocaine 100 mg after 3 shocks. */
export const LIDOCAINE_FIRST_MG = 100;
/** ALS-AA-03: lidocaine 50 mg after 5 shocks. */
export const LIDOCAINE_SECOND_MG = 50;
/** ALS-AA-01 / ALS-AA-03: first antiarrhythmic dose after a total of 3 shocks. */
export const ANTIARRHYTHMIC_FIRST_AFTER_SHOCKS = 3;
/** ALS-AA-02 / ALS-AA-03: second antiarrhythmic dose after a total of 5 shocks. */
export const ANTIARRHYTHMIC_SECOND_AFTER_SHOCKS = 5;

/** ALS-SHK-03: a stack is up to 3 shocks and counts as one. */
export const STACK_MAX_SHOCKS = 3;
/** ALS-SHK-04: refractory VF = continuous after 3 consecutive shocks. */
export const REFRACTORY_VF_SHOCKS = 3;
/** ALS-MOD-02: core < 30 °C — further shocks delayed after 3 shocks. */
export const HYPOTHERMIA_SHOCKS_BEFORE_DELAY = 3;

/** ALS-MOD-01/02/03: core temperature below which adrenaline is withheld (°C). */
export const HYPOTHERMIA_WITHHOLD_BELOW_C = 30;
/** ALS-MOD-04: upper bound of the 30–35 °C extended-interval band (°C). */
export const HYPOTHERMIA_UPPER_C = 35;
/** ALS-MOD-06: a non-core temperature below this prompts a core measurement (°C). */
export const PERIPHERAL_PROMPT_BELOW_C = 32;

/** ALS-ROSC-03: sustained ROSC = 20 consecutive minutes. */
export const ROSC_SUSTAINED_MS = 20 * MIN;
/** ALS-DRG-04: consider CPR 60–90 min after PE thrombolysis (advisory clock). */
export const PE_LYSIS_CPR_MIN_MIN = 60;
/** ALS-DRG-04: upper end of the 60–90 min advisory clock. */
export const PE_LYSIS_CPR_MAX_MIN = 90;
/** ALS-RC-09: ETCO₂ below this (kPa) with a confirmed tube → PE hint. */
export const ETCO2_PE_HINT_BELOW_KPA = 1.7;
/** ALS-TOR-03: ERC 2025 persistent-asystole criterion (informational chip). */
export const ERC_TOR_MIN = 20;
/** ALS-TOR-03: RCUK 2025 detail row — at least 45 min from confirmation of arrest. */
export const RCUK_TOR_MIN = 45;
/** ALS-DTH-01: observe for at least 5 minutes. */
export const DEATH_OBSERVATION_MS = 5 * MIN;
/** ALS-MOD-16 / catalog scope: adults ≥ 16 y; a child (< 16) gets clocks and logging only. */
export const ADULT_MIN_AGE_YEARS = 16;

/* ─── §1 Recognition and declaration ────────────────────────────────────────── */

const RECOGNITION: RefEntry[] = [
  alsRef(
    "ALS-REC-01",
    "Arrest = unresponsive AND (not breathing normally and/or no central pulse / no signs of life); agonal gasps are not normal breathing (v1 seam, lib/resus/arrest.ts)",
    "v1 signed",
    { value: "criterion text" },
  ),
  alsRef("ALS-REC-02", "Apnoea with a pulse → ventilate (bag-mask), not CPR", "v1 signed"),
  alsRef(
    "ALS-REC-03",
    "Highly monitored patient: a sudden fall in ETCO₂ may mean arrest; consider compressions if SBP falls and stays < 50 mmHg despite interventions (hint only)",
    "RCUK-ALS25",
    { value: "< 50", unit: "mmHg" },
  ),
  alsRef(
    "ALS-REC-04",
    "Declaration stamps arrest time and CPR-start time (arrest_detected, cpr_started, arrest number) and switches the desk to the console. One tap.",
    "design",
  ),
  alsRef(
    "ALS-REC-05",
    'A triage Rapid-Red "No palpable pulse / cardiac arrest" opens the resus straight into the console',
    "design",
  ),
  alsRef(
    "ALS-REC-06",
    "A recorded treatment-limitation decision is shown at declaration (who, when); it never suppresses CPR",
    "RCUK-ETH25",
  ),
  alsRef(
    "ALS-REC-07",
    "CPR-not-attempted: a secondary control, reason mandatory (valid recorded treatment-limitation decision, or obvious irreversible death) → straight to confirmation of death",
    "RCUK-ETH25",
  ),
  alsRef(
    "ALS-REC-08",
    "Family role prompt: offer the family the choice to be present, with a trained team member to support them",
    "RCUK-ETH25",
  ),
  alsRef(
    "ALS-REC-09",
    "Utstein fields captured after, never before CPR: collapse time (default = declaration), witnessed, monitored (default unknown), CPR-before-declaration time, first rhythm",
    "UTS-IH19 ⚠",
  ),
];

/* ─── §2 CPR quality and the cycle ──────────────────────────────────────────── */

const CPR: RefEntry[] = [
  alsRef("ALS-CPR-01", "Compression rate", "RCUK-BLS25", { value: "100–120", unit: "/min" }),
  alsRef("ALS-CPR-02", "Compression depth; full recoil; no leaning", "RCUK-BLS25", {
    value: "≥ 5 cm, ≤ 6 cm",
  }),
  alsRef(
    "ALS-CPR-03",
    "Single shock, then 2 min CPR; rhythm/pulse check every 2 min",
    "RCUK-ALS25",
    { value: "2:00", unit: "cycle" },
  ),
  alsRef("ALS-CPR-04", "Identify the rhythm within 5 s", "RCUK-ALS25", { value: "5", unit: "s" }),
  alsRef(
    "ALS-CPR-05",
    "Peri-shock pause < 5 s; charge during compressions; pre-charging acceptable if it does not lengthen the pause",
    "RCUK-ALS25",
    { value: "< 5", unit: "s" },
  ),
  alsRef("ALS-CPR-06", "Resume compressions immediately after the shock", "RCUK-ALS25"),
  alsRef(
    "ALS-CPR-07",
    "Stop early for a check only on a combination of ROSC signs (consciousness, purposeful movement, arterial waveform, sharp ETCO₂ rise)",
    "RCUK-ALS25",
  ),
  alsRef(
    "ALS-CPR-08",
    "Filtered-ECG defibrillator showing asystole: no need to pause for the rhythm check",
    "RCUK-ALS25",
  ),
  alsRef("ALS-CPR-09", "Never shock during manual compressions (even gloved)", "RCUK-ALS25"),
  alsRef(
    "ALS-CPR-10",
    "Oxygen at shock: mask/cannulae/BVM ≥ 1 m from the chest; SGA/ETT circuit stays connected",
    "RCUK-ALS25",
    { value: "≥ 1", unit: "m" },
  ),
  alsRef(
    "ALS-CPR-11",
    "Compressor swap prompted at each rhythm check (the CPR role; time on chest shown)",
    "RCUK-ALS25 cycle; AHA-BLS25 ⚠",
    { value: "at the 2-min pause" },
  ),
  alsRef(
    "ALS-CPR-12",
    'UI timing defaults inside the signed 2-min cycle: "prepare" at +1:45, overdue (amber) after +2:15',
    "design (CSO-adjustable)",
    { value: "+1:45 / +2:15" },
  ),
  alsRef(
    "ALS-CPR-13",
    "Optional metronome at 110 /min (inside ALS-CPR-01), off by default",
    "design (D15)",
    { value: "110", unit: "/min" },
  ),
];

/* ─── §3 Rhythms, shocks, drugs ─────────────────────────────────────────────── */

const RHYTHMS_SHOCKS_DRUGS: RefEntry[] = [
  alsRef(
    "ALS-SHK-01",
    "VF/pVT: shock as early as possible, any amplitude (fine VF included)",
    "RCUK-ALS25",
  ),
  alsRef(
    "ALS-SHK-02",
    "Shocks are counted per arrest, whether VF is sequential or intermittent",
    "RCUK-ALS25",
  ),
  alsRef(
    "ALS-SHK-03",
    "Stacked shocks (up to 3) only in a witnessed, monitored VF/pVT with the defibrillator immediately available; the stack counts as shock 1",
    "RCUK-ALS25",
    { value: "≤ 3" },
  ),
  alsRef(
    "ALS-SHK-04",
    "Refractory VF (continuous after 3 consecutive shocks): consider escalating energy; prepare antero-posterior pads for the next rhythm check (vector change)",
    "RCUK-ALS25 (D7)",
  ),
  alsRef("ALS-SHK-05", "Dual sequential defibrillation is not offered", "RCUK-ALS25 (D7)"),
  alsRef(
    "ALS-SHK-06",
    "Pads antero-lateral first; lateral pad below the armpit, mid-axillary; ICD/pacemaker → pad > 8 cm away",
    "RCUK-ALS25",
    { value: "> 8", unit: "cm" },
  ),
  alsRef(
    "ALS-NRG-01",
    "Energy default = the bay's registered defibrillator profile (waveform + manufacturer sequence, biomed-entered, CSO-approved)",
    "design",
    { value: "profile energy_sequence_j" },
  ),
  alsRef(
    "ALS-NRG-02",
    'No profile / unknown settings: "highest available setting" for every shock. No joule number is shown without a profile',
    "RCUK-ALS25; AHA-ALS25 ⚠",
    { value: "highest available setting" },
  ),
  alsRef(
    "ALS-NRG-03",
    "Reference for profile entry (not shown as a default): rectilinear / truncated-exponential biphasic first shock ≥ 150 J; pulsed biphasic 130–150 J; escalate if the device allows",
    "RCUK-ALS25",
    { value: "≥ 150 J / 130–150 J" },
  ),
  alsRef("ALS-NRG-04", "Obesity: standard energy", "RCUK-ALS25"),
  alsRef("ALS-ADR-01", "Shockable: adrenaline 1 mg IV after the 3rd shock", "RCUK-ALS25", {
    value: "1 mg IV, 1:10,000",
  }),
  alsRef(
    "ALS-ADR-02",
    "Non-shockable (PEA/asystole): adrenaline 1 mg IV as soon as possible",
    "RCUK-ALS25",
    { value: "1 mg IV" },
  ),
  alsRef(
    "ALS-ADR-03",
    "Repeat 1 mg every 3–5 min while ALS continues: window opens +3:00 after the last dose, overdue after +5:00",
    "RCUK-ALS25",
    { value: "3–5", unit: "min" },
  ),
  alsRef("ALS-ADR-04", 'Optional cue "about every second loop"', "ANZCOR-11.5", {
    value: "about every second loop",
  }),
  alsRef(
    "ALS-ADR-05",
    "Shockable → non-shockable before the 3rd shock: adrenaline becomes due now",
    "RCUK-ALS25",
  ),
  // NOT ENCODED as a default (clinician-entered dose only) — deliberately no `value`.
  alsRef(
    "ALS-ADR-06",
    "Monitored arrest with an arterial line: small increments may be used — NOT ENCODED as a default; clinician-entered dose only",
    "RCUK-ALS25",
  ),
  alsRef(
    "ALS-ADR-07",
    "Fast-path adrenaline records concentration 1:10,000 for IV use; the existing look-alike guard applies",
    "RCUK-SC25; prescribing",
    { value: "1:10,000" },
  ),
  alsRef("ALS-AA-01", "Amiodarone 300 mg IV after a total of 3 shocks", "RCUK-ALS25", {
    value: "300",
    unit: "mg",
  }),
  alsRef("ALS-AA-02", "Amiodarone further 150 mg IV after a total of 5 shocks", "RCUK-ALS25", {
    value: "150",
    unit: "mg",
  }),
  alsRef(
    "ALS-AA-03",
    "Lidocaine alternative (hospital setting, D5): 100 mg IV after 3 shocks; 50 mg after 5",
    "RCUK-ALS25",
    { value: "100 / 50", unit: "mg" },
  ),
  alsRef(
    "ALS-AA-04",
    "Antiarrhythmic shown only when eligible; the hospital picks amiodarone (default) or lidocaine",
    "design (D5)",
  ),
  alsRef(
    "ALS-RHY-01",
    'Asystole: prompt "check the ECG for P waves (may respond to pacing)"',
    "RCUK-ALS25",
  ),
  alsRef("ALS-RHY-02", 'Organised rhythm → "Pulse?" Yes → ROSC; No → PEA', "RCUK-ALS25"),
  alsRef(
    "ALS-RHY-03",
    'The first rhythm check fills the Utstein "first documented rhythm"',
    "UTS-IH19 ⚠",
  ),
];

/* ─── §4 Airway, access, monitoring ─────────────────────────────────────────── */

const AIRWAY_ACCESS_MONITORING: RefEntry[] = [
  alsRef(
    "ALS-AIR-01",
    "Start basic; step up by skill until ventilation is effective (BVM → SGA → ETT); highest feasible O₂; each breath over 1 s",
    "RCUK-ALS25",
    { value: "1", unit: "s" },
  ),
  alsRef(
    "ALS-AIR-02",
    "Intubation only by rescuers with > 95 % success within two attempts, with waveform capnography; < 5 s compression interruption; VL preferred",
    "RCUK-ALS25",
    { value: "> 95 % within two attempts; < 5 s" },
  ),
  alsRef(
    "ALS-AIR-03",
    'ETT: ask "sustained ETCO₂ trace confirmed?" (yes / no / capnography not available); warn, never block, if not',
    "RCUK-ALS25",
  ),
  alsRef(
    "ALS-AIR-04",
    "After ETT or SGA: continuous compressions, ventilate 10 /min; SGA leak → 30:2",
    "RCUK-ALS25",
    { value: "10", unit: "/min" },
  ),
  alsRef(
    "ALS-AIR-05",
    "Failed airway: surgical cricothyroidotomy by trained rescuers (record only)",
    "RCUK-ALS25",
  ),
  alsRef(
    "ALS-AIR-06",
    "Ventilator during CPR (text reference, shown on request): VC, Vt 6–8 mL/kg PBW, max FiO₂, RR 10, Ti 1–2 s, PEEP 0–5, peak alarm 60–70 cmH₂O, flow trigger off",
    "RCUK-ALS25",
    {
      value:
        "VC, Vt 6–8 mL/kg PBW, max FiO₂, RR 10, Ti 1–2 s, PEEP 0–5, peak alarm 60–70 cmH₂O, flow trigger off",
    },
  ),
  alsRef("ALS-ACC-01", "IV first; after 2 failed IV attempts prompt IO", "RCUK-ALS25", {
    value: "2",
    unit: "attempts",
  }),
  alsRef("ALS-ETC-01", "Capnography confirms the tube and monitors CPR quality", "RCUK-ALS25"),
  alsRef(
    "ALS-ETC-02",
    'A sharp ETCO₂ rise → "check for ROSC at the next rhythm check; don\'t stop compressions on this alone"',
    "RCUK-ALS25",
  ),
  alsRef("ALS-ETC-03", "Never stop the attempt on a low ETCO₂ alone", "RCUK-ALS25"),
  alsRef(
    "ALS-ETC-04",
    "Physiology-guided CPR (arterial line): aim diastolic ≥ 30 mmHg, ETCO₂ ≥ 3.3 kPa (25 mmHg) — text",
    "RCUK-ALS25",
    { value: "≥ 30 mmHg; ≥ 3.3 kPa" },
  ),
  alsRef(
    "ALS-POC-01",
    "POCUS: skilled operators, no extra or longer pauses; RV dilatation alone ≠ PE; never the sole basis for stopping",
    "RCUK-ALS25",
  ),
  alsRef(
    "ALS-DEV-01",
    "Mechanical CPR only if manual CPR impractical/unsafe; ECPR capability-gated (off for the pilot); REBOA and intra-arrest cooling not routine",
    "RCUK-ALS25",
    { value: "capability flags" },
  ),
];

/* ─── §5 Drugs and fluids — routine and not ─────────────────────────────────── */

const DRUGS_FLUIDS: RefEntry[] = [
  alsRef(
    "ALS-DRG-01",
    "Fluids only if the arrest is caused by hypovolaemia; isotonic saline or balanced crystalloid",
    "RCUK-ALS25",
  ),
  alsRef(
    "ALS-DRG-02",
    "Calcium, sodium bicarbonate, corticosteroids: not routine — shown only inside their reversible-cause tile",
    "RCUK-ALS25",
  ),
  // Doses NOT ENCODED — no `value`.
  alsRef(
    "ALS-DRG-03",
    "CPR-induced consciousness: small sedative/analgesic doses per local protocol; never a neuromuscular blocker alone. Doses NOT ENCODED; controlled-drug witness rule applies (full dialog)",
    "RCUK-ALS25",
  ),
  // The 60–90 min clock is encoded; thrombolytic doses are NOT ENCODED.
  alsRef(
    "ALS-DRG-04",
    "Thrombolysis for suspected PE: consider CPR for 60–90 min after administration (advisory clock). Thrombolytic doses NOT ENCODED",
    "RCUK-ALS25, RCUK-SC25",
    { value: "60–90", unit: "min" },
  ),
  alsRef(
    "ALS-DRG-05",
    "Fast path (D4): a protocol drug tap runs the prescribing safety check synchronously; clear → one tap records drug event + administration with the signed default; block → prescribe dialog pre-filled (override needs a reason); controlled drugs always use the full dialog with a witness",
    "design (D4); ADR 0052",
  ),
  alsRef(
    "ALS-DRG-06",
    'Anaphylaxis bar in arrest: the IM prompt is suppressed and replaced by "In cardiac arrest: follow ALS — adrenaline 1 mg IV"; give an IV crystalloid bolus early',
    "RCUK-SC25 + CSO rule (D21)",
    { value: "follow ALS — adrenaline 1 mg IV" },
  ),
];

/* ─── §6 Reversible causes (4 Hs & 4 Ts) ────────────────────────────────────── */

const REVERSIBLE_CAUSES: RefEntry[] = [
  alsRef("ALS-RC-01", "Hypoxia — airway step-up, max O₂, confirm ventilation", "RCUK-ALS25"),
  alsRef(
    "ALS-RC-02",
    "Hypovolaemia — haemorrhage control, fluids (hypovolaemia only), blood / MHP, TXA (existing local-MHP rule)",
    "RCUK-ALS25",
  ),
  // Calcium gluconate as an arrest substitute is NOT ENCODED (D17).
  alsRef(
    "ALS-RC-03",
    "Hypo/hyperkalaemia, metabolic — hyperkalaemic arrest: 10 mL 10 % calcium chloride IV and 50 mmol sodium bicarbonate IV, separate lines or flush between; hypokalaemic arrest: KCl 20 mmol IV/IO over 2–3 min, then 10 mmol over 2 min",
    "RCUK-SC25",
    { value: "CaCl 10 % 10 mL + NaHCO₃ 50 mmol; KCl 20 mmol over 2–3 min then 10 mmol over 2 min" },
  ),
  alsRef("ALS-RC-04", "Hypo/hyperthermia — see the §7 modifiers", "RCUK-SC25"),
  alsRef(
    "ALS-RC-05",
    "Thrombosis — thrombolysis (PE) starts the 60–90 min clock (ALS-DRG-04); post-ROSC PCI pathway",
    "RCUK-SC25",
  ),
  alsRef("ALS-RC-06", "Tension pneumothorax — decompression (record only)", "RCUK-SC25"),
  alsRef("ALS-RC-07", "Tamponade — pericardiocentesis / thoracotomy (record only)", "RCUK-SC25"),
  alsRef(
    "ALS-RC-08",
    "Toxins — antidote where available; plan prolonged resuscitation; poison information service where available",
    "RCUK-SC25",
  ),
  alsRef(
    "ALS-RC-09",
    "PE hint: ETCO₂ < 1.7 kPa (13 mmHg) with a confirmed tube, adequate minute volume and good compressions — a hint on the Thrombosis tile, never a diagnosis",
    "RCUK-SC25",
    { value: "< 1.7", unit: "kPa" },
  ),
];

/* ─── §7 Special-circumstance modifiers ─────────────────────────────────────── */

const MODIFIERS: RefEntry[] = [
  alsRef(
    "ALS-MOD-01",
    "Core temperature (site = core) < 30 °C: withhold adrenaline (it accumulates); give 1 mg IV (1:10,000) once core reaches 30 °C unless ECPR is about to start",
    "RCUK-SC25",
    { value: "< 30", unit: "°C" },
  ),
  alsRef(
    "ALS-MOD-02",
    "Core < 30 °C, VF after 3 shocks: delay further shocks until core > 30 °C",
    "RCUK-SC25",
    { value: "3 shocks; > 30 °C" },
  ),
  alsRef(
    "ALS-MOD-03",
    "Core < 30 °C, shockable: amiodarone 300 mg loading dose at the standard after-3-shocks point; further doses delayed until > 30 °C (CSO-confirmed engine choice)",
    "RCUK-SC25",
    { value: "300 mg loading; further > 30 °C" },
  ),
  alsRef(
    "ALS-MOD-04",
    "Core 30–35 °C: adrenaline interval 6–10 min (window opens +6:00, overdue after +10:00)",
    "RCUK-SC25",
    { value: "6–10", unit: "min" },
  ),
  alsRef(
    "ALS-MOD-05",
    'Hypothermia (any): check vital signs for up to 1 min; low-reading thermometer; Swiss staging if no core temperature (I 35–32 °C, II 32–28 °C, III 28–24 °C, IV < 24 °C); below 28 °C delayed/intermittent CPR only if continuous CPR is not feasible; termination review shows "rewarm before deciding"',
    "RCUK-SC25",
    { value: "I 35–32 °C, II 32–28 °C, III 28–24 °C, IV < 24 °C" },
  ),
  alsRef(
    "ALS-MOD-06",
    'Temperature peripheral / site unknown and < 32 °C: do not apply ALS-MOD-01..04; prompt "measure core temperature now (low-reading thermometer)"',
    "CSO decision (D8)",
    { value: "< 32", unit: "°C" },
  ),
  // No minute target (D12) — no `value`.
  alsRef(
    "ALS-MOD-07",
    "Pregnancy confirmed/postpartum, gestation > 20 weeks: manual left uterine displacement throughout; seek the 4 Ps; resuscitative hysterotomy is time-sensitive — prepare early, perform as soon as possible at the arrest site by a skilled team. No minute target",
    "RCUK-SC25",
  ),
  alsRef(
    "ALS-MOD-08",
    "Trauma context: treat reversible causes first (haemorrhage control, airway, chest decompression, tamponade); compressions continue unless they delay that; ultrasound helps",
    "RCUK-SC25",
  ),
  alsRef(
    "ALS-MOD-09",
    "Allergen trigger / anaphylaxis features: standard ALS; IM prompt suppressed (ALS-DRG-06); early IV crystalloid bolus",
    "RCUK-SC25 + D21",
  ),
  alsRef(
    "ALS-MOD-10",
    "Local anaesthetic toxicity (LAST): adrenaline ≤ 1 µg/kg instead of 1 mg; 20 % lipid 1.5 mL/kg bolus then 15 mL/kg/h; bolus may repeat twice at 5-min intervals; if no ROSC at 5 min double the rate (30 mL/kg/h); max 12 mL/kg; plan > 1 h resuscitation. Weight mandatory",
    "RCUK-SC25",
    {
      value:
        "adrenaline ≤ 1 µg/kg; lipid 1.5 mL/kg then 15 mL/kg/h (30 mL/kg/h at 5 min); max 12 mL/kg",
    },
  ),
  alsRef(
    "ALS-MOD-11",
    "PE thrombolysis recorded: 60–90 min clock on the termination review (ALS-DRG-04)",
    "RCUK-SC25",
    { value: "60–90", unit: "min" },
  ),
  alsRef(
    "ALS-MOD-12",
    'Toxins tile suspected / treating: "Prolonged resuscitation" flag',
    "RCUK-SC25",
  ),
  alsRef(
    "ALS-MOD-13",
    "Known asthma: 100 % O₂; exclude tension pneumothorax and anaphylaxis; intubate; consider disconnection / manual decompression for dynamic hyperinflation",
    "RCUK-SC25",
    { value: "100 % O₂" },
  ),
  alsRef(
    "ALS-MOD-14",
    "Haemodialysis context: stop dialysis, return blood volume with a fluid bolus, disconnect unless defibrillation-proof, use the access for drugs",
    "RCUK-SC25",
  ),
  alsRef(
    "ALS-MOD-15",
    "Obesity / BMI > 40: standard ALS, standard energy",
    "RCUK-SC25, RCUK-ALS25",
  ),
  alsRef(
    "ALS-MOD-16",
    'Age < 16: clocks + logging only; drug buttons read "weight-based — PLS module not built"; no energies; adult flat doses blocked by the existing paediatric routing',
    "existing invariant (D13)",
    { value: "< 16", unit: "years" },
  ),
];

/* ─── §8 ROSC ───────────────────────────────────────────────────────────────── */

const ROSC: RefEntry[] = [
  alsRef(
    "ALS-ROSC-01",
    "ROSC recognition: a combination of consciousness, purposeful movement, arterial waveform or a sharp ETCO₂ rise; the ROSC record stores which signs were present",
    "RCUK-ALS25",
  ),
  alsRef(
    "ALS-ROSC-02",
    "Any ROSC: return of a palpable pulse / patient-generated blood pressure",
    "UTS-IH19 ⚠",
  ),
  alsRef(
    "ALS-ROSC-03",
    "Sustained ROSC: no compressions needed for 20 consecutive minutes with signs of circulation; a visible 20:00 sustain timer",
    "UTS-IH19 ⚠",
    { value: "20", unit: "min" },
  ),
  alsRef(
    "ALS-ROSC-04",
    "Intermittent ROSC: re-arrest before 20 min → the same arrest continues, counters intact",
    "UTS-IH19 ⚠",
  ),
  alsRef(
    "ALS-ROSC-05",
    "Re-arrest after sustained ROSC opens a new arrest record (sequence + 1); episode drug totals stay visible for dose-safety checks",
    "UTS-IH97 ⚠",
  ),
  alsRef(
    "ALS-ROSC-06",
    '"Time CPR stopped" = start of sustained ROSC, or termination',
    "UTS-IH19 ⚠",
  ),
  alsRef(
    "ALS-ROSC-07",
    "Re-arrest is always one tap (Re-arrest stays on screen after ROSC)",
    "design",
  ),
];

/* ─── §9 Termination of resuscitation ───────────────────────────────────────── */

const TERMINATION: RefEntry[] = [
  alsRef(
    "ALS-TOR-01",
    "A team-based, holistic decision: CPR duration, absence of reversible causes, no response to ALS, the patient's values and preferences",
    "RCUK-ETH25",
  ),
  alsRef(
    "ALS-TOR-02",
    "TOR rules are not used for in-hospital arrest, nor as the sole strategy for stopping",
    "RCUK-ETH25, RCUK-ALS25",
  ),
  alsRef(
    "ALS-TOR-03",
    "Persistent-asystole criterion, informational chip (D1): ERC 2025 — may be considered after 20 min of ALS in persistent asystole, no reversible cause, nothing arguing against; detail: RCUK 2025 — at least 45 min from confirmation of arrest. Never a prompt to stop",
    "ERC-ETH25; RCUK-ETH25",
    { value: "20 min (chip); 45 min (detail)" },
  ),
  alsRef(
    "ALS-TOR-04",
    "Persistently low ETCO₂ is a strong marker that may aid the decision, never in isolation (last three values shown)",
    "RCUK-ETH25",
  ),
  alsRef(
    "ALS-TOR-05",
    "Not a basis for stopping: cardiac ultrasound, blood gases, pupil reactivity",
    "RCUK-ETH25",
  ),
  alsRef(
    "ALS-TOR-06",
    "Carried out in a planned manner; every team member can contribute (team asked / objection); document reasons (structured + free text, audited)",
    "RCUK-ETH25",
  ),
  alsRef(
    "ALS-TOR-07",
    "Continue-flags: hypothermia (rewarm before deciding), toxins / LAST (> 1 h), PE after lysis (60–90 min), persistent or recurrent shockable rhythm, intermittent ROSC, rising ETCO₂, pregnancy with hysterotomy pending, a reversible cause being treated now",
    "RCUK-SC25, RCUK-ETH25",
  ),
  alsRef("ALS-TOR-08", "Reversible causes not yet excluded are listed first (amber)", "design"),
  alsRef(
    "ALS-TOR-09",
    "Who may stop (D9): doctor / clinical officer recommended; any cadre may record the decision with a senior co-sign pending. Never a hard block",
    "CSO decision (D9)",
  ),
  alsRef("ALS-TOR-10", "Debrief immediately after termination", "RCUK-ETH25"),
];

/** Every ALS-* row except ALS-DTH (see `death-confirmation.ts`). */
export const ALS_CATALOG: readonly RefEntry[] = [
  ...RECOGNITION,
  ...CPR,
  ...RHYTHMS_SHOCKS_DRUGS,
  ...AIRWAY_ACCESS_MONITORING,
  ...DRUGS_FLUIDS,
  ...REVERSIBLE_CAUSES,
  ...MODIFIERS,
  ...ROSC,
  ...TERMINATION,
];

/** All ALS-* entries by rule ID, ALS-DTH included (throws on a duplicate ID). */
export const ALS_REFS: Record<string, RefEntry> = indexRefs([
  ...ALS_CATALOG,
  ...DEATH_CONFIRMATION_REFS,
]);
