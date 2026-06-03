import type { DisabilityState, NeuroSyndrome } from "@/lib/resus/reference/disability-catalog";
import type { ResusEventKind, TimelineEvent } from "@/lib/resus/types";

import {
  DISABILITY_RAISED_ICP_FINDINGS,
  disabilityAction,
  GCS_AIRWAY_THRESHOLD,
  GLUCOSE_TREAT_THRESHOLD,
} from "@/lib/resus/reference/disability-catalog";

/**
 * Disability (D) step engine — PURE + deterministic, mirroring the airway/
 * breathing/circulation engines. Reasons over recorded findings; makes no
 * clinical decision and performs nothing. Everything derives from the immutable
 * resus timeline (step `D`), so no new migration is needed.
 *
 * Two outputs (mirrors C's severity + type):
 *  - `classifyDisability` → the NEURO-STATE (alert → … → raised_icp_herniation),
 *    worst-finding-wins. A normal GCS total must NEVER downgrade a recorded
 *    seizure / raised-ICP / fixed-pupil sign.
 *  - `identifyNeuroSyndrome` → the CAUSE (hypoglycaemia / opioid / status /
 *    eclampsia / raised-ICP / stroke / …), which drives the reversible-first
 *    strategy. Glucose is ALWAYS considered first (the trap).
 *
 * The D-distinctive element: GCS is computed from its components, and the SERIAL
 * TREND (a falling GCS → return-to-A) is read from successive step-D events.
 */

export type { DisabilityState, NeuroSyndrome } from "@/lib/resus/reference/disability-catalog";

export type Avpu = "A" | "V" | "P" | "U";

export interface GcsComponents {
  /** Eye opening /4. */
  eye: number;
  /** Verbal /5 (scored 1 = "T" when intubated). */
  verbal: number;
  /** Motor /6. */
  motor: number;
  /** Verbal not testable (intubated) — verbal scores 1, noted "T". */
  intubated?: boolean;
}

export interface DisabilityFindingSet {
  /** Headline neuro-state read (gestalt); the engine upgrades it. */
  state: DisabilityState | null;
  /** GCS components (the total + trend are computed). */
  gcs: GcsComponents | null;
  /** Rapid AVPU (alternative / adjunct to GCS). */
  avpu: Avpu | null;
  /** Capillary blood glucose (mmol/L) — the "Don't Ever Forget Glucose" value. */
  glucoseMmol: number | null;
  /** Discrete finding codes recorded as PRESENT (pupils / focal / seizure / posture). */
  present: string[];
  /** Stroke onset time (free text/ISO) — for the thrombolysis/thrombectomy window. */
  focalOnset?: string | null;
  /** Seizure duration (min) — ≥5 = status. */
  seizureDurationMin?: number | null;
  context: {
    /** Opioids suspected (history / track marks) — supports opioid toxicity. */
    opioidsSuspected?: boolean;
    /** Low respiratory rate — supports opioid toxicity (with pinpoint pupils). */
    lowRespRate?: boolean;
    /** Pregnant / ≤6 wk postpartum — a seizure here is ECLAMPSIA (magnesium first). */
    pregnancyPostpartum?: boolean;
    /** Head injury / TBI — neuroprotection nuances. */
    headInjury?: boolean;
    /** Malnourished / alcohol — give thiamine (Wernicke's) with glucose. */
    alcoholMalnourished?: boolean;
    /** Fever + meningism — supports meningitis/encephalitis. */
    feverMeningism?: boolean;
    /** A/B/C abnormal — reduced GCS is likely SECONDARY (fix A-B-C first). */
    abcAbnormal?: boolean;
    /** No pulse / no signs of life — routes to the arrest pathway. */
    noPulse?: boolean;
  };
}

function hasAny(present: readonly string[], group: readonly string[]): boolean {
  return present.some((p) => group.includes(p));
}
const has = (fs: DisabilityFindingSet, code: string) => fs.present.includes(code);

/** GCS total from components (verbal scored 1 when intubated). Null if incomplete. */
export function gcsTotal(gcs: GcsComponents | null): number | null {
  if (!gcs) return null;
  const { eye, verbal, motor, intubated } = gcs;
  const v = intubated ? 1 : verbal;
  if (
    typeof eye !== "number" ||
    typeof v !== "number" ||
    typeof motor !== "number" ||
    Number.isNaN(eye) ||
    Number.isNaN(v) ||
    Number.isNaN(motor)
  )
    return null;
  return eye + v + motor;
}

/**
 * Classify the NEURO-STATE — WORST finding wins. A normal GCS total does NOT
 * downgrade a recorded seizure / raised-ICP / fixed-pupil sign (mirrors C's
 * "normal BP never downgrades shock"). Returns null when nothing is assessed.
 */
export function classifyDisability(fs: DisabilityFindingSet): DisabilityState | null {
  const { state, avpu } = fs;
  const total = gcsTotal(fs.gcs);

  // Raised ICP / herniation — the most ominous neuro-state.
  if (state === "raised_icp_herniation" || hasAny(fs.present, DISABILITY_RAISED_ICP_FINDINGS))
    return "raised_icp_herniation";

  // Active seizure / status — more specific than bare coma.
  if (state === "active_seizure_status" || has(fs, "active_seizure"))
    return "active_seizure_status";

  // Severe impairment / coma — GCS ≤8 or AVPU P/U (airway at risk).
  if (
    state === "severe_impairment_coma" ||
    (total != null && total <= GCS_AIRWAY_THRESHOLD) ||
    avpu === "P" ||
    avpu === "U"
  )
    return "severe_impairment_coma";

  // Mild–moderate impairment — GCS 9–14 or AVPU V.
  if (
    state === "mild_moderate_impairment" ||
    (total != null && total >= 9 && total <= 14) ||
    avpu === "V"
  )
    return "mild_moderate_impairment";

  // Alert — only on a positive read.
  if (state === "alert" || total === 15 || avpu === "A") return "alert";

  return null;
}

/** Unresponsive + no pulse → the arrest seam (not the D engine). */
export function isDisabilityArrest(fs: DisabilityFindingSet): boolean {
  return !!fs.context.noPulse || has(fs, "no_pulse");
}

/** Any altered consciousness / seizure / focal sign that warrants the D workup. */
function needsNeuroWorkup(fs: DisabilityFindingSet): boolean {
  const s = classifyDisability(fs);
  return (
    (s != null && s !== "alert") ||
    has(fs, "active_seizure") ||
    has(fs, "non_convulsive_suspected") ||
    has(fs, "focal_deficit")
  );
}

/**
 * The "Don't Ever Forget Glucose" trap — a reduced-consciousness / seizure /
 * stroke patient with NO glucose recorded is flagged (like ESI's missing-vital).
 */
export function mandatoryGlucoseMissing(fs: DisabilityFindingSet): boolean {
  return needsNeuroWorkup(fs) && fs.glucoseMmol == null;
}

function glucoseLow(fs: DisabilityFindingSet): boolean {
  return (
    has(fs, "hypoglycaemia") || (fs.glucoseMmol != null && fs.glucoseMmol < GLUCOSE_TREAT_THRESHOLD)
  );
}

/**
 * Identify the NEURO-SYNDROME from the finding combination + context — the
 * action-driving axis. Reversible-first + catastrophic; GLUCOSE is checked
 * FIRST (hypoglycaemia mimics everything + is instantly reversible). Returns
 * null when there is nothing to attribute.
 */
export function identifyNeuroSyndrome(fs: DisabilityFindingSet): NeuroSyndrome | null {
  const reduced = needsNeuroWorkup(fs);

  // Hypoglycaemia — ALWAYS first (instantly reversible; mimics stroke/sepsis/coma).
  if (glucoseLow(fs)) return "hypoglycaemia";

  // Opioid toxicity — pinpoint pupils + reduced consciousness (or supporting context).
  if (
    has(fs, "pinpoint_pupils") &&
    (reduced || fs.context.opioidsSuspected || fs.context.lowRespRate)
  )
    return "opioid_toxicity";

  // Eclampsia BEFORE status — a seizure in pregnancy/postpartum is magnesium-first.
  if (has(fs, "active_seizure") && fs.context.pregnancyPostpartum) return "eclampsia";

  // Status epilepticus — an active seizure.
  if (has(fs, "active_seizure")) return "status_epilepticus";

  // Raised ICP / herniation.
  if (hasAny(fs.present, DISABILITY_RAISED_ICP_FINDINGS)) return "raised_icp_herniation";

  // Stroke — a focal/lateralising deficit.
  if (has(fs, "focal_deficit") || has(fs, "gaze_deviation")) return "stroke";

  // Meningitis / encephalitis.
  if (has(fs, "meningism") || fs.context.feverMeningism) return "meningitis_encephalitis";

  // DKA / HHS — hyperglycaemic crisis.
  if (has(fs, "hyperglycaemia_ketotic") || (fs.glucoseMmol != null && fs.glucoseMmol > 15))
    return "dka_hhs";

  // Non-convulsive status — seizure stopped but not waking.
  if (has(fs, "non_convulsive_suspected")) return "non_convulsive_status";

  // Reduced consciousness with an abnormal A/B/C — likely secondary.
  if (reduced && fs.context.abcAbnormal) return "secondary_to_abc";

  // Reduced consciousness, cause unclear.
  if (reduced) return "undifferentiated";

  return null;
}

export interface TriggeredAction {
  code: string;
  rationale: string;
  /** Lower = more urgent / surfaced first. */
  priority: number;
  emergency: boolean;
}

/**
 * The deterministic, transparent findings→action mapping (catalog §2–§3),
 * driven by the NEURO-SYNDROME. Returns a de-duplicated list ordered
 * most-urgent-first. Arrest (no pulse) returns [] — that routes to the arrest
 * pathway. THE TRAPS are enforced here: check-glucose pinned at the top of any
 * altered patient; GCS≤8→back-to-A; Cushing's=raised-ICP (don't treat the BP);
 * benzodiazepine at the full dose; eclampsia→magnesium-first (not a benzo).
 */
export function triggeredActions(fs: DisabilityFindingSet): TriggeredAction[] {
  if (isDisabilityArrest(fs)) return [];
  const state = classifyDisability(fs);
  const reduced = needsNeuroWorkup(fs);
  // Alert with nothing abnormal (and no low glucose) → nothing to do.
  if (!reduced && !glucoseLow(fs)) return [];

  const out: TriggeredAction[] = [];
  const add = (code: string, rationale: string, priority: number) => {
    const emergency = disabilityAction(code)?.emergency ?? false;
    out.push({ code, rationale, priority, emergency });
  };

  // ── TRAP "DON'T EVER FORGET GLUCOSE" — pinned at the very top (priority −1). ──
  add(
    "d_check_glucose",
    fs.glucoseMmol == null
      ? "CHECK CAPILLARY GLUCOSE NOW — not yet recorded. Hypoglycaemia mimics stroke/sepsis/coma and is instantly reversible."
      : "Glucose recorded — recheck after any treatment / if the picture changes.",
    -1,
  );

  // ── TRAP GCS≤8 → back to A → definitive airway. ──
  const total = gcsTotal(fs.gcs);
  const airwayAtRisk =
    state === "severe_impairment_coma" ||
    (total != null && total <= GCS_AIRWAY_THRESHOLD) ||
    fs.avpu === "P" ||
    fs.avpu === "U";
  if (airwayAtRisk)
    add(
      "d_back_to_a_airway",
      "GCS ≤8 / not protecting the airway → BACK TO A → prepare a definitive airway (RSI); call skilled help",
      0,
    );

  const syndrome = identifyNeuroSyndrome(fs);
  switch (syndrome) {
    case "hypoglycaemia":
      add(
        "d_glucose",
        "Hypoglycaemia → IV glucose (or IM glucagon if no IV) → prescribe; then RECHECK glucose",
        0,
      );
      add(
        "d_recheck_glucose",
        "Recheck capillary glucose after treatment (repeat if still low)",
        1,
      );
      if (fs.context.alcoholMalnourished)
        add(
          "d_thiamine",
          "Malnourished / alcohol → give thiamine (Wernicke's) alongside glucose",
          1,
        );
      break;
    case "opioid_toxicity":
      add(
        "d_naloxone",
        "Opioid toxicity → naloxone titrated to VENTILATION (not full arousal) → prescribe + support breathing (back to B); short half-life — re-dose/infusion",
        0,
      );
      break;
    case "eclampsia":
      add(
        "d_eclampsia_magnesium",
        "Eclampsia (seizure in pregnancy/postpartum) → magnesium sulfate FIRST (NOT a benzodiazepine) → prescribe + control BP",
        0,
      );
      add(
        "d_call_skilled_help",
        "Obstetric emergency — urgent obstetric + senior; plan delivery",
        0,
      );
      break;
    case "status_epilepticus":
      add(
        "d_benzodiazepine",
        "Status epilepticus → FULL-dose benzodiazepine NOW (lorazepam 4 mg IV / midazolam 10 mg buccal-IM) → prescribe — DO NOT underdose (the dominant error); protect airway",
        0,
      );
      add(
        "d_second_line_anticonvulsant",
        "Seizing after 2 adequate benzodiazepine doses → urgent second-line (levetiracetam / valproate / fosphenytoin) + senior/anaesthetic/ICU",
        1,
      );
      break;
    case "raised_icp_herniation":
      add(
        "d_neurosurgery_ct",
        "Raised ICP / herniation → urgent CT head + neurosurgery referral; head-up 30°; optimise O₂/CO₂/BP ± osmotherapy. Do NOT treat the Cushing's hypertension as primary",
        0,
      );
      add("d_call_skilled_help", "Neurosurgical emergency — senior + neurosurgery NOW", 0);
      break;
    case "stroke":
      add(
        "d_stroke_pathway",
        "Stroke (focal deficit) → urgent CT head + activate the stroke pathway (thrombolysis/thrombectomy window — note onset time); BP per protocol",
        0,
      );
      break;
    case "meningitis_encephalitis":
      add(
        "d_antimicrobials",
        "Suspected meningitis / encephalitis → do NOT delay antibiotics ± antivirals; senior (rash → E)",
        0,
      );
      break;
    case "dka_hhs":
      add(
        "d_dka_pathway",
        "DKA / HHS → fluids + fixed-rate insulin + K⁺ + find the precipitant (overlaps C / metabolic)",
        1,
      );
      break;
    case "non_convulsive_status":
      add(
        "d_eeg",
        "Seizure stopped but NOT waking → consider non-convulsive status → escalate + EEG",
        1,
      );
      break;
    case "secondary_to_abc":
      add(
        "d_reconfirm_abc",
        "Reduced GCS is usually SECONDARY — re-confirm + optimise A-B-C (oxygenation/perfusion/glucose) before attributing to a primary neuro cause; reassess GCS",
        0,
      );
      break;
    case "undifferentiated":
    default:
      add(
        "d_call_skilled_help",
        "Reduced consciousness, cause unclear → work the cause-screen (the reversible + the dangerous); senior; reassess",
        1,
      );
      break;
  }

  // ── Always-surface CRITICAL findings-based actions (NOT mutually exclusive
  //    with the single winning syndrome — mirrors C's haemorrhage block). The
  //    state is worst-wins but the syndrome is reversible-first, so a herniating
  //    patient who is ALSO seizing/opioid-toxic must still get neurosurgery+CT,
  //    and a seizing pregnant patient who is ALSO hypoglycaemic/postictal must
  //    still get magnesium. De-dup keeps the most-urgent rationale. ──
  if (hasAny(fs.present, DISABILITY_RAISED_ICP_FINDINGS)) {
    add(
      "d_neurosurgery_ct",
      "Raised ICP / herniation sign → urgent CT head + neurosurgery; head-up 30°; optimise O₂/CO₂/BP ± osmotherapy. Do NOT treat the Cushing's hypertension as primary",
      0,
    );
    add("d_call_skilled_help", "Neurosurgical emergency — senior + neurosurgery NOW", 0);
  }
  if (
    fs.context.pregnancyPostpartum &&
    (has(fs, "active_seizure") || has(fs, "non_convulsive_suspected"))
  ) {
    add(
      "d_eclampsia_magnesium",
      "Seizure in pregnancy/postpartum → ECLAMPSIA until proven otherwise → magnesium sulfate FIRST (NOT a benzodiazepine) → prescribe + control BP",
      0,
    );
    add("d_call_skilled_help", "Obstetric emergency — urgent obstetric + senior; plan delivery", 0);
  }

  // ── Tier 1 baseline — any altered patient. ──
  add(
    "d_reconfirm_abc",
    "Re-confirm + optimise A-B-C — most reduced consciousness is secondary (hypoxia/hypercapnia/hypoperfusion/glucose)",
    1,
  );
  add("d_high_flow_o2", "High-flow O₂ + ensure perfusion (coordinate with A/B/C)", 2);
  add("d_monitoring", "Continuous monitoring — incl. serial GCS + pupils", 2);
  add("d_serial_gcs", "Serial GCS + pupils — the trend is the monitoring (a fall → back to A)", 2);
  add("d_iv_access", "IV access (if not already)", 3);
  add("d_protect_airway", "Position / protect the airway (recovery position if appropriate)", 3);

  // De-duplicate by code (keep the most-urgent rationale), then sort.
  const byCode = new Map<string, TriggeredAction>();
  for (const t of out) {
    const held = byCode.get(t.code);
    if (!held || t.priority < held.priority) byCode.set(t.code, t);
  }
  return [...byCode.values()].sort((a, b) => a.priority - b.priority);
}

/** The action surfaced when `code` is recorded `failed`. */
export function escalationFor(code: string): string | null {
  return disabilityAction(code)?.escalatesTo ?? null;
}

/* ─── action-state lifecycle (shared vocab with airway/breathing/circulation) ── */
export const DISABILITY_ACTION_STATES = [
  "indicated",
  "in_progress",
  "performed",
  "not_indicated",
  "deferred",
  "failed",
] as const;
export type DisabilityActionState = (typeof DISABILITY_ACTION_STATES)[number];

export interface DisabilityActionInstance {
  actionId: string;
  actionCode: string;
  tier: number;
  state: DisabilityActionState;
  label: string;
  history: { state: DisabilityActionState; at: string }[];
}

/** Type-guard for a stored disability finding-set payload. */
function readFindingSet(payload: Record<string, unknown>): DisabilityFindingSet | null {
  const d = payload.disability as Partial<DisabilityFindingSet> | undefined;
  if (!d || typeof d !== "object") return null;
  return {
    state: (d.state as DisabilityState | null) ?? null,
    gcs: (d.gcs as GcsComponents | null) ?? null,
    avpu: (d.avpu as Avpu | null) ?? null,
    glucoseMmol: typeof d.glucoseMmol === "number" ? d.glucoseMmol : null,
    present: Array.isArray(d.present) ? (d.present as string[]) : [],
    focalOnset: (d.focalOnset as string | null) ?? null,
    seizureDurationMin: typeof d.seizureDurationMin === "number" ? d.seizureDurationMin : null,
    context: (d.context as DisabilityFindingSet["context"]) ?? {},
  };
}

/** The most recent step-D assessment finding-set (reassessment appends new). */
export function latestDisabilityAssessment(
  events: readonly TimelineEvent[],
): DisabilityFindingSet | null {
  let latest: { at: string; fs: DisabilityFindingSet } | null = null;
  for (const e of events) {
    if (e.kind !== "assessment" || e.step !== "D") continue;
    const fs = readFindingSet(e.payload);
    if (!fs) continue;
    if (!latest || e.recordedAt > latest.at) latest = { at: e.recordedAt, fs };
  }
  return latest?.fs ?? null;
}

/** Serial GCS totals over time (the D-distinctive monitoring trend). */
export function gcsTrend(events: readonly TimelineEvent[]): { at: string; total: number }[] {
  const out: { at: string; total: number }[] = [];
  for (const e of events) {
    if (e.kind !== "assessment" || e.step !== "D") continue;
    const fs = readFindingSet(e.payload);
    const total = fs ? gcsTotal(fs.gcs) : null;
    if (total != null) out.push({ at: e.recordedAt, total });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** A GCS that is falling NOW (the most recent reading is below the one before
 *  it) — a return-to-A trigger. A patient who dropped then RECOVERED is not
 *  falling now (avoids crying wolf on a transient dip). */
export function isGcsFalling(events: readonly TimelineEvent[]): boolean {
  const trend = gcsTrend(events);
  if (trend.length < 2) return false;
  const last = trend[trend.length - 1]!.total;
  const prev = trend[trend.length - 2]!.total;
  return last < prev;
}

const DISABILITY_ACTION_KINDS: ReadonlySet<ResusEventKind> = new Set([
  "action",
  "drug",
  "fluid",
  "procedure",
]);

/** Fold the timeline's disability action events (by `payload.actionId`) into
 *  the current action list — each instance's latest state is current. Pure. */
export function buildDisabilityActions(
  events: readonly TimelineEvent[],
): DisabilityActionInstance[] {
  const byId = new Map<string, DisabilityActionInstance>();
  const ordered = [...events]
    .filter((e) => e.step === "D" && DISABILITY_ACTION_KINDS.has(e.kind) && e.payload.actionId)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));

  for (const e of ordered) {
    const p = e.payload as {
      actionId: string;
      actionCode?: string;
      tier?: number;
      state?: DisabilityActionState;
      label?: string;
    };
    const state = (p.state ?? "indicated") as DisabilityActionState;
    const existing = byId.get(p.actionId);
    if (existing) {
      existing.state = state;
      existing.history.push({ state, at: e.recordedAt });
      if (p.actionCode) existing.actionCode = p.actionCode;
      if (p.label) existing.label = p.label;
    } else {
      byId.set(p.actionId, {
        actionId: p.actionId,
        actionCode: p.actionCode ?? "",
        tier: p.tier ?? 0,
        state,
        label: p.label ?? p.actionCode ?? "",
        history: [{ state, at: e.recordedAt }],
      });
    }
  }
  return [...byId.values()];
}

/**
 * Treat-before-proceeding gate to Exposure. An open D problem flags (does not
 * hard-block — a resus is non-linear) advancing to E; GCS≤8 routes BACK TO A.
 */
export function disabilityProceedGuard(
  state: DisabilityState | null,
  total: number | null,
): { ok: boolean; warning?: string } {
  if (state === null)
    return { ok: false, warning: "Disability not yet assessed — assess D before proceeding to E." };
  if (state === "raised_icp_herniation")
    return {
      ok: false,
      warning: "Raised ICP / herniation — neurosurgery + CT; do not proceed to E until addressed.",
    };
  if (state === "active_seizure_status")
    return {
      ok: false,
      warning: "Active seizure — treat (benzodiazepine, or magnesium if eclampsia) before E.",
    };
  if (state === "severe_impairment_coma" || (total != null && total <= GCS_AIRWAY_THRESHOLD))
    return {
      ok: false,
      warning: "GCS ≤8 — airway at risk → back to A (definitive airway) before proceeding to E.",
    };
  if (state === "mild_moderate_impairment")
    return {
      ok: false,
      warning: "Reduced consciousness — find + treat the cause (glucose / A-B-C) before E.",
    };
  return { ok: true };
}
