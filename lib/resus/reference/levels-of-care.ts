import type { Capability, CareLevel } from "@/lib/resus/model";
import type { RefConfidence, RefEntry } from "@/lib/resus/reference/ref";

import { indexRefs } from "@/lib/resus/reference/ref";

/**
 * Resus v2 close-out reference — levels of care, the recommender rules, the
 * NEWS2 response, boarding, after-death tasks and idle thresholds.
 *
 * Transcribed from docs/clinical/resus-closeout-clinical-catalog.md (CSO-signed
 * at GATE A, 2026-09-23). Reference data only — the engines live in
 * lib/resus/closeout/*. CO-UTS-* and CO-DBF-* belong to the Utstein / debrief
 * modules and are not listed here.
 */

const VERIFIED_ON = "2026-09-23";
const CATALOG_URL = "docs/clinical/resus-closeout-clinical-catalog.md";

/** The catalog's source key (code → URL). "design" rows point at the catalog itself. */
const SOURCES = {
  "ICS-LOC21": "https://ics.ac.uk/asset/0C68F8B6-D1ED-4B87-8A828592EFDD8021/",
  "RCP-NEWS2": "https://s3.amazonaws.com/nationalearlywarningscore/news_target.pdf",
  "RCUK-ALS25":
    "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/adult-advanced-life-support-guidelines",
  "RCUK-PRC25":
    "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/post-resuscitation-care-guidelines",
  "RCUK-ETH25":
    "https://www.resus.org.uk/professional-library/2025-resuscitation-guidelines/ethics-guidelines",
  "UTS-IH19": "https://www.ahajournals.org/doi/10.1161/CIR.0000000000000710",
} as const;
type SourceCode = keyof typeof SOURCES;

function entry(
  id: string,
  text: string,
  /** The catalog's Source cell (a code, several codes, "design", or a CSO decision). */
  source: string,
  extra: { value?: string; confidence?: RefConfidence; url?: SourceCode } = {},
): RefEntry {
  const primary = (extra.url ?? source.split(",")[0]!.trim()) as SourceCode;
  const url = SOURCES[primary] ?? CATALOG_URL;
  const confidence: RefConfidence =
    extra.confidence ?? (SOURCES[primary] ? "verified-web" : "design");
  return {
    id,
    text,
    ...(extra.value ? { value: extra.value } : {}),
    source,
    url,
    verifiedOn: VERIFIED_ON,
    confidence,
    status: "signed",
  };
}

/* ─── §1 Handover ──────────────────────────────────────────────────────── */

const HANDOVER: RefEntry[] = [
  entry(
    "CO-HO-01",
    "A structured handover tool is used; the desk drafts an SBAR from the record, editable before signing",
    "RCUK-ALS25",
  ),
  entry(
    "CO-HO-02",
    "S — who, trigger, current state and mode (stabilised / post-ROSC), treatment-limitation decision if any. B — AMPLE, weight if recorded. A — final A–E states with key findings; last vitals set + trend + NEWS2; arrest summary if any (first rhythm, shocks, drugs, time to ROSC, total CPR time, sustained or not); lines, tubes, devices. R — outstanding actions carried forward, targets (post-ROSC bundle), pending investigations, suggested vs chosen level of care, escort needs",
    "design",
  ),
  entry(
    "CO-HO-03",
    "The draft is deterministic: the same record gives the same text (snapshot-tested)",
    "design",
  ),
];

/* ─── §2 Levels of care (ICS 2021) ─────────────────────────────────────── */

export interface LevelDefinition {
  level: CareLevel;
  label: string;
  meaning: string;
  examples: string;
}

export const LEVELS_OF_CARE: Record<CareLevel, LevelDefinition> = {
  ward: {
    level: "ward",
    label: "Ward",
    meaning: "Needs met on an acute ward, incl. patients at risk of deterioration",
    examples: "DKA improving without organ support; ED hypotension that responded to fluids",
  },
  l1: {
    level: "l1",
    label: "Level 1",
    meaning:
      "Enhanced care: more observation/intervention incl. basic single-organ support; step-down; outreach-dependent",
    examples:
      "vasopressor (peripheral/central) but otherwise stable; NIV/CPAP for single-organ failure; close monitoring after major surgery (arterial line)",
  },
  l2: {
    level: "l2",
    label: "Level 2",
    meaning:
      "Basic support for ≥ 2 organs, or one organ at an advanced level (other than advanced respiratory); L1 needs + severe agitation; major uncorrected physiological abnormality",
    examples:
      "NIV/CPAP + vasopressor; RRT outside a renal setting; L1 needs + hyperactive delirium; BMI > 40 on NIV/CPAP or a vasopressor",
  },
  l3: {
    level: "l3",
    label: "Level 3",
    meaning:
      "Advanced respiratory support alone; ≥ 2 organs at an advanced level; chronic organ impairment + acute failure of another; L2 needs + delirium",
    examples:
      "mechanical ventilation; RRT + vasopressor or respiratory support; NIV/CPAP + vasopressor with agitation or at risk of escalation; BMI > 40 on NIV/CPAP + vasopressor",
  },
};

/** ward < l1 < l2 < l3. */
export const CARE_LEVEL_RANK: Record<CareLevel, number> = { ward: 0, l1: 1, l2: 2, l3: 3 };

/* ─── §3 NEWS2 response ────────────────────────────────────────────────── */

/** CO-NEWS-01 — emergency response threshold (also CO-R11). */
export const NEWS2_EMERGENCY_MIN = 7;
/** CO-NEWS-02 — urgent response threshold "5 or more" (CO-R12 needs < this). */
export const NEWS2_URGENT_MIN = 5;

const NEWS: RefEntry[] = [
  entry(
    "CO-NEWS-01",
    "NEWS2 ≥ 7: emergency response; continuous monitoring; assessment by a critical-care-competent team incl. advanced airway skills; consider transfer to level 2 or 3 care",
    "RCP-NEWS2",
    { value: "≥ 7" },
  ),
  entry(
    "CO-NEWS-02",
    "NEWS2 5 or more (below 7): urgent response threshold; at least hourly observations",
    "RCP-NEWS2",
    { value: "5 or more" },
  ),
  entry(
    "CO-NEWS-03",
    "3 in any single parameter: at least hourly; the nurse informs the medical team, who decide whether to escalate",
    "RCP-NEWS2",
    { value: "3 in any single parameter" },
  ),
  entry("CO-NEWS-04", "NEWS2 1–4: at least 4–6-hourly", "RCP-NEWS2", { value: "1–4" }),
  entry("CO-NEWS-05", "NEWS2 0: at least 12-hourly", "RCP-NEWS2", { value: "0" }),
];

/* ─── §4 Recommender rules ─────────────────────────────────────────────── */

export const LEVEL_RULE_IDS = [
  "CO-R1",
  "CO-R2",
  "CO-R3",
  "CO-R4",
  "CO-R5",
  "CO-R6",
  "CO-R7",
  "CO-R8",
  "CO-R9",
  "CO-R10",
  "CO-R11",
  "CO-R12",
  "CO-R13",
  "CO-R14",
  "CO-R15",
  "CO-R16",
] as const;
export type LevelRuleId = (typeof LEVEL_RULE_IDS)[number];

/** The level each rule suggests (catalog §4 "Suggested level"). */
export const LEVEL_RULE_LEVEL: Record<LevelRuleId, CareLevel> = {
  "CO-R1": "l3",
  "CO-R2": "l2",
  "CO-R3": "l3",
  "CO-R4": "l3",
  "CO-R5": "l2",
  "CO-R6": "l2",
  "CO-R7": "l1",
  "CO-R8": "l1",
  "CO-R9": "l2",
  "CO-R10": "l3",
  "CO-R11": "l2",
  "CO-R12": "ward",
  "CO-R13": "l3",
  "CO-R14": "l2",
  "CO-R15": "l2",
  "CO-R16": "l3",
};

const RULES: RefEntry[] = [
  entry(
    "CO-R1",
    "Post-ROSC and not obeying commands, or intubated after arrest → L3",
    "RCUK-PRC25, ICS-LOC21",
  ),
  entry(
    "CO-R2",
    "Post-ROSC, awake (obeys commands), brief arrest, stable → ≥ L2 with continuous ECG and cause work-up",
    "CSO decision (D6)",
  ),
  entry(
    "CO-R3",
    "Invasive mechanical ventilation, or an ETT in situ at close-out → L3",
    "ICS-LOC21",
  ),
  entry(
    "CO-R4",
    "NIV/CPAP + vasopressor + agitation/delirium, or at risk of escalation → L3",
    "ICS-LOC21",
  ),
  entry("CO-R5", "NIV/CPAP + vasopressor → L2", "ICS-LOC21"),
  entry("CO-R6", "L1-type needs + hyperactive delirium → L2", "ICS-LOC21"),
  entry("CO-R7", "NIV/CPAP alone (single organ) → L1", "ICS-LOC21"),
  entry("CO-R8", "Vasopressor alone, otherwise stable → L1", "ICS-LOC21"),
  entry(
    "CO-R9",
    "Refractory anaphylaxis (no improvement after 2 IM doses → IV adrenaline infusion) → ≥ L2",
    "existing signed anaphylaxis text",
    { value: "2 IM doses", confidence: "reference-doc-only" },
  ),
  entry(
    "CO-R10",
    "GCS ≤ 8 needing airway protection; status epilepticus needing anaesthetic infusion / intubation → L3",
    "existing D engine, ICS-LOC21",
    { value: "GCS ≤ 8", url: "ICS-LOC21" },
  ),
  entry("CO-R11", "NEWS2 ≥ 7 persisting at close-out → consider L2/L3 (suggests L2)", "RCP-NEWS2", {
    value: "NEWS2 ≥ 7",
  }),
  entry(
    "CO-R12",
    "Stabilised, no organ support, NEWS2 < 5 and no single parameter scoring 3 → Ward (with the NEWS2 monitoring frequency)",
    "ICS-LOC21, RCP-NEWS2",
    { value: "NEWS2 < 5" },
  ),
  entry(
    "CO-R13",
    "RRT needed (recorded) with a vasopressor or respiratory support → L3",
    "ICS-LOC21",
  ),
  entry("CO-R14", "RRT needed alone, outside a renal setting → L2", "ICS-LOC21"),
  entry("CO-R15", "BMI > 40 context and NIV/CPAP or a vasopressor → L2", "ICS-LOC21", {
    value: "BMI > 40",
  }),
  entry("CO-R16", "BMI > 40 context and NIV/CPAP and a vasopressor → L3", "ICS-LOC21", {
    value: "BMI > 40",
  }),
];

/** "No matching rule → no suggestion", never a silent Ward. */
export const NO_SUGGESTION_TEXT = "Insufficient data — choose";

/* ─── §4 Additional destinations ───────────────────────────────────────── */

const DESTINATIONS: RefEntry[] = [
  entry(
    "CO-DST-01",
    "STEMI / suspected coronary occlusion recorded (C ecg_ischaemia, PR-C-05) → Cath lab",
    "design",
  ),
  entry(
    "CO-DST-02",
    "Uncontrolled haemorrhage / surgical source (C haemorrhagic shock type, E occult haemorrhage) → Theatre",
    "design",
  ),
  entry(
    "CO-DST-03",
    "Pregnancy-related cause (pregnancy confirmed/postpartum context) → Obstetric theatre / labour ward",
    "design",
  ),
  entry(
    "CO-DST-04",
    "Head injury, or suspected non-coronary arrest cause → CT before the unit",
    "design",
  ),
];

/* ─── §4 Capability mapping ────────────────────────────────────────────── */

/** Required capabilities per level (catalog §4 table; any unit declaring all qualifies). */
export const REQUIRED_CAPABILITIES: Record<CareLevel, readonly Capability[]> = {
  ward: [],
  l1: ["continuous_ecg", "vasopressors"],
  l2: ["continuous_ecg", "arterial_line", "vasopressors", "niv_cpap"],
  l3: ["continuous_ecg", "arterial_line", "vasopressors", "niv_cpap", "invasive_ventilation"],
};

/** "RRT-driven rules add `rrt`." */
export const RRT_RULE_IDS: readonly LevelRuleId[] = ["CO-R13", "CO-R14"];

/** Age from which a patient matches an adult unit (the desk's paediatric cut, < 16). */
export const ADULT_MIN_AGE_YEARS = 16;

/* ─── §5 Boarding ──────────────────────────────────────────────────────── */

const BOARDING: RefEntry[] = [
  entry(
    "CO-BRD-01",
    "Destination decided but the patient cannot leave yet → phase boarding; the resus clock stops, a boarding clock starts",
    "design",
  ),
  entry(
    "CO-BRD-02",
    "Monitoring cadence prompt follows the NEWS2 response (CO-NEWS-01..05)",
    "RCP-NEWS2",
  ),
  entry(
    "CO-BRD-03",
    "Deterioration → Re-activate resus (back to the survey, same episode)",
    "design",
  ),
  entry("CO-BRD-04", "Boarding time = disposition decision → leaving resus", "design"),
];

/* ─── §6 After-death tasks ─────────────────────────────────────────────── */

const AFTER_DEATH: RefEntry[] = [
  entry(
    "CO-ADT-01",
    "Family informed (who, when, where; offered to see the patient; cultural and religious needs)",
    "RCUK-ETH25",
  ),
  entry("CO-ADT-02", "Senior / consultant informed", "design"),
  entry(
    "CO-ADT-03",
    "Reportable-death screen (per D10); if reportable, leave lines, tubes and devices in place",
    "CSO/legal (D10)",
  ),
  entry("CO-ADT-04", "Last offices", "design"),
  entry("CO-ADT-05", "Property handed over", "design"),
  entry(
    "CO-ADT-06",
    "Certificate of cause of death (pending intent to the encounter record; not built)",
    "design",
  ),
  entry("CO-ADT-07", "Mortuary transfer", "design"),
  entry("CO-ADT-08", "Immediate team debrief", "RCUK-ETH25"),
  entry("CO-ADT-09", "Staff welfare check", "design"),
  entry("CO-ADT-10", "Utstein data completed", "UTS-IH19", { confidence: "reference-doc-only" }),
  entry(
    "CO-ADT-11",
    "Organ donation after cardiac arrest — hidden unless the hospital enables it; must follow local legal and ethical requirements",
    "RCUK-PRC25",
  ),
];

/* ─── §9 Idle episodes (D14 — nothing auto-closes) ─────────────────────── */

const HOUR_MS = 3_600_000;

/** Idle thresholds, ascending (CO-IDLE-01..03). */
export const IDLE_THRESHOLDS = [
  { ruleId: "CO-IDLE-01", class: "idle", minMs: 2 * HOUR_MS },
  { ruleId: "CO-IDLE-02", class: "notify", minMs: 12 * HOUR_MS },
  { ruleId: "CO-IDLE-03", class: "admin_close", minMs: 24 * HOUR_MS },
] as const;

const IDLE: RefEntry[] = [
  entry(
    "CO-IDLE-01",
    'No activity ≥ 2 h → flagged on the board and in the header ("No activity 2 d 16 h — close or continue?")',
    "design",
    { value: "2 h" },
  ),
  entry(
    "CO-IDLE-02",
    "≥ 12 h → in-app notice to the opener, current leader and ward in-charges (once per episode)",
    "design",
    { value: "12 h" },
  ),
  entry(
    "CO-IDLE-03",
    "≥ 24 h → administrative close enabled for the in-charge / head of department, reason required; excluded from clinical statistics, included in data-quality reports",
    "design",
    { value: "24 h" },
  ),
];

/* ─── Index ────────────────────────────────────────────────────────────── */

export const CLOSEOUT_REFS: readonly RefEntry[] = [
  ...HANDOVER,
  ...NEWS,
  ...RULES,
  ...DESTINATIONS,
  ...BOARDING,
  ...AFTER_DEATH,
  ...IDLE,
];

export const CLOSEOUT_REF: Record<string, RefEntry> = indexRefs(CLOSEOUT_REFS);
