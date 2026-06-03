import type {
  ExposureDiagnosis,
  ExposureState,
  TempStage,
} from "@/lib/resus/reference/exposure-catalog";
import type { ResusEventKind, TimelineEvent } from "@/lib/resus/types";

import {
  EXPOSURE_CRITICAL_FINDINGS,
  EXPOSURE_HAEMORRHAGE_FINDINGS,
  EXPOSURE_SIGNIFICANT_FINDINGS,
  exposureAction,
  HYPERTHERMIA_MIN,
  HYPOTHERMIA_MILD_MAX,
  HYPOTHERMIA_MODERATE_MAX,
  HYPOTHERMIA_SEVERE_MAX,
} from "@/lib/resus/reference/exposure-catalog";

/**
 * Exposure (E) step engine — PURE + deterministic, mirroring the A/B/C/D
 * engines. Reasons over recorded findings; makes no clinical decision and
 * performs nothing. Everything derives from the immutable resus timeline
 * (step `E`), so no new migration is needed.
 *
 * Two outputs (mirrors C/D):
 *  - `classifyExposure` → the EXPOSURE-STATE (no_new_critical → significant →
 *    temperature_extreme → critical), worst-finding-wins; a temperature extreme
 *    is never downgraded by an otherwise-benign survey.
 *  - `identifyExposureDiagnosis` → the suspected cause that drives the strategy
 *    (anaphylaxis / meningococcal / occult-haemorrhage / hypothermia / …).
 *
 * The E-distinctive element: the RETURN-TO-A LOOP — E is not a dead-end; after
 * treating what's found, the survey cycles back to A. `triggeredActions` always
 * surfaces the E checklist (expose / measure-temp / re-cover / AMPLE /
 * return-to-A) and — learning from the D review — surfaces every CRITICAL
 * findings-based action UNCONDITIONALLY, so a co-morbid critical is never masked
 * by the single winning diagnosis.
 */

export type {
  ExposureDiagnosis,
  ExposureState,
  TempStage,
} from "@/lib/resus/reference/exposure-catalog";

export interface AmpleHistory {
  /** Allergies — `recordExposureFindings` writes these as an allergyCapture note
   *  so they feed the prescribe-time allergy check (same store as NKDA capture). */
  allergies: string[];
  medications?: string;
  past?: string;
  lastMeal?: string;
  events?: string;
}

export interface ExposureFindingSet {
  /** Headline exposure-state read (gestalt); the engine upgrades it. */
  state: ExposureState | null;
  /** Discrete finding codes recorded as PRESENT (skin / injury / patches). */
  present: string[];
  /** Core temperature (°C) — the staging + extremes are computed. */
  coreTempC: number | null;
  /** AMPLE history (allergies feed the prescribing-tool allergy check). */
  ample?: AmpleHistory | null;
  context: {
    /** Trauma — prompts the log-roll (examine the back for occult haemorrhage). */
    trauma?: boolean;
    /** Environmental cold/heat exposure — supports the temperature cause. */
    exposureEnvironment?: boolean;
    /** Serotonergic / neuroleptic drug history — a hyperthermia cause (D overlap). */
    serotonergicOrNeuroleptic?: boolean;
    /** Patient left exposed — the re-cover trap (iatrogenic hypothermia). */
    notRecovered?: boolean;
    /** No pulse / no signs of life — routes to the arrest pathway. */
    noPulse?: boolean;
  };
}

function hasAny(present: readonly string[], group: readonly string[]): boolean {
  return present.some((p) => group.includes(p));
}
const has = (fs: ExposureFindingSet, code: string) => fs.present.includes(code);

/** Stage a core temperature. Null when not measured. Boundary temps round to
 *  the MORE-severe band (28.0 → severe, 32.0 → moderate) so the exact threshold
 *  gets the more-aggressive rewarming pathway (safer-direction; CSO-ratified). */
export function tempStage(coreTempC: number | null): TempStage | null {
  if (coreTempC == null || !Number.isFinite(coreTempC)) return null;
  if (coreTempC <= HYPOTHERMIA_SEVERE_MAX) return "severe_hypothermia";
  if (coreTempC <= HYPOTHERMIA_MODERATE_MAX) return "moderate_hypothermia";
  if (coreTempC <= HYPOTHERMIA_MILD_MAX) return "mild_hypothermia";
  if (coreTempC >= HYPERTHERMIA_MIN) return "hyperthermia";
  if (coreTempC >= 38) return "fever";
  return "normal";
}

const HYPOTHERMIA_STAGES: ReadonlySet<TempStage> = new Set([
  "severe_hypothermia",
  "moderate_hypothermia",
  "mild_hypothermia",
]);

/** A temperature extreme (any hypothermia ≤35, or hyperthermia ≥40). */
function isTempExtreme(stage: TempStage | null): boolean {
  return stage != null && (HYPOTHERMIA_STAGES.has(stage) || stage === "hyperthermia");
}

/**
 * Classify the EXPOSURE-STATE — WORST finding wins. A temperature extreme is
 * never downgraded by an otherwise-benign survey. Returns null when nothing is
 * assessed (no findings, no temperature, no positive read).
 */
export function classifyExposure(fs: ExposureFindingSet): ExposureState | null {
  const stage = tempStage(fs.coreTempC);
  if (fs.state === "critical_finding" || hasAny(fs.present, EXPOSURE_CRITICAL_FINDINGS))
    return "critical_finding";
  if (fs.state === "temperature_extreme" || isTempExtreme(stage)) return "temperature_extreme";
  if (fs.state === "significant_finding" || hasAny(fs.present, EXPOSURE_SIGNIFICANT_FINDINGS))
    return "significant_finding";
  if (fs.state === "no_new_critical_finding") return "no_new_critical_finding";
  return null;
}

/** Unresponsive + no pulse → the arrest seam (with the hypothermia modifier). */
export function isExposureArrest(fs: ExposureFindingSet): boolean {
  return !!fs.context.noPulse || has(fs, "no_pulse");
}

/** E always wants a temperature — flag when none is recorded (like D's glucose). */
export function temperatureMissing(fs: ExposureFindingSet): boolean {
  return fs.coreTempC == null;
}

/**
 * Identify the suspected diagnosis from the findings + temperature — ordered
 * most-time-critical first. Decision-support: the headline cause; the action
 * board surfaces EVERY critical finding's action regardless (no masking).
 */
export function identifyExposureDiagnosis(fs: ExposureFindingSet): ExposureDiagnosis | null {
  const stage = tempStage(fs.coreTempC);
  if (has(fs, "urticaria_angioedema")) return "anaphylaxis";
  if (has(fs, "non_blanching_rash")) return "meningococcal_sepsis";
  if (hasAny(fs.present, EXPOSURE_HAEMORRHAGE_FINDINGS)) return "occult_haemorrhage";
  if (has(fs, "pain_out_of_proportion")) return "necrotising_fasciitis";
  if (has(fs, "limb_ischaemia")) return "limb_threat";
  if (
    stage === "severe_hypothermia" ||
    (HYPOTHERMIA_STAGES.has(stage as TempStage) && fs.context.noPulse)
  )
    return "severe_hypothermia";
  if (stage === "hyperthermia") return "hyperthermia_heatstroke";
  if (stage && HYPOTHERMIA_STAGES.has(stage)) return "hypothermia";
  if (has(fs, "transdermal_opioid_patch")) return "opioid_patch_toxicity";
  return "none";
}

export interface TriggeredAction {
  code: string;
  rationale: string;
  /** Lower = more urgent / surfaced first. */
  priority: number;
  emergency: boolean;
}

/**
 * The deterministic, transparent findings→action mapping (catalog §2–§3). E is
 * a CHECKLIST step: the baseline (expose / measure-temp / re-cover / AMPLE /
 * return-to-A) is always surfaced. Every CRITICAL findings-based action is added
 * UNCONDITIONALLY (the D-review lesson — a co-morbid critical must never be
 * masked by the single winning diagnosis). Arrest (no pulse) returns [] — that
 * routes to the arrest pathway (with the hypothermia modifier).
 */
export function triggeredActions(fs: ExposureFindingSet): TriggeredAction[] {
  if (isExposureArrest(fs)) return [];

  const out: TriggeredAction[] = [];
  const add = (code: string, rationale: string, priority: number) => {
    const emergency = exposureAction(code)?.emergency ?? false;
    out.push({ code, rationale, priority, emergency });
  };

  // ── TRAP measure-temp — pinned at the very top when not yet recorded. ──
  add(
    "e_measure_temp",
    fs.coreTempC == null
      ? "MEASURE CORE TEMPERATURE — not yet recorded (hypothermia/hyperthermia is missed otherwise; sepsis hides in a low temp)"
      : "Temperature recorded — recheck during active rewarming / cooling",
    fs.coreTempC == null ? -1 : 3,
  );
  add("e_expose_examine", "Expose + examine head-to-toe — find what A–D missed", 2);

  // ── CRITICAL findings-based actions — surfaced UNCONDITIONALLY (no masking). ──
  if (has(fs, "non_blanching_rash")) {
    add(
      "e_antibiotics",
      "Non-blanching rash → meningococcal sepsis until proven otherwise → do NOT delay antibiotics (sepsis bundle, overlaps C)",
      0,
    );
    add(
      "e_call_skilled_help",
      "Meningococcaemia — senior + resuscitate; isolation/contact prophylaxis",
      0,
    );
  }
  if (has(fs, "urticaria_angioedema"))
    add(
      "e_anaphylaxis_adrenaline",
      "Anaphylaxis → IM adrenaline FIRST (back to A/B/C) + remove the trigger",
      0,
    );
  if (hasAny(fs.present, EXPOSURE_HAEMORRHAGE_FINDINGS))
    add(
      "e_haemorrhage_control",
      "Occult / major haemorrhage found → control (pressure / binder / tourniquet) + BACK TO C (blood/MHP, TXA, definitive control)",
      0,
    );
  if (has(fs, "pain_out_of_proportion")) {
    add(
      "e_surgical_referral",
      "Pain out of proportion ± crepitus → necrotising fasciitis → urgent surgery",
      0,
    );
    add("e_antibiotics", "Necrotising fasciitis → broad-spectrum antibiotics alongside surgery", 1);
  }
  if (has(fs, "limb_ischaemia"))
    add(
      "e_surgical_referral",
      "Limb cold/pale/pulseless → limb-threatening ischaemia / compartment → urgent surgery",
      0,
    );
  if (has(fs, "transdermal_opioid_patch")) {
    add("e_remove_patch", "Opioid patch found → REMOVE it (may explain low GCS/RR)", 1);
    add(
      "e_naloxone",
      "Opioid patch + low GCS/RR → naloxone (back to D/B); short half-life — re-dose",
      1,
    );
  }
  if (has(fs, "transdermal_patch_other"))
    add("e_remove_patch", "Transdermal patch (GTN/hyoscine/other) → remove where relevant", 2);

  // ── Temperature-driven actions. ──
  const stage = tempStage(fs.coreTempC);
  if (stage === "severe_hypothermia") {
    add(
      "e_ecls_rewarming",
      "Severe hypothermia (<28 °C) / unstable → active internal rewarming / ECLS (treatment of choice); gentle handling (jostling → VF)",
      0,
    );
    add(
      "e_active_rewarming",
      "Active external rewarming (forced-air; packs to groin + axillae)",
      1,
    );
    add(
      "e_warmed_fluids",
      "Warmed IV fluids (~40 °C — never room-temp) → prescribe; cold diuresis → hypovolaemia",
      1,
    );
    add(
      "e_septic_screen",
      "Severe / refractory hypothermia → consider SEPSIS (cold sepsis) / hypothyroid — septic screen + treat the cause",
      1,
    );
  } else if (stage === "moderate_hypothermia") {
    add(
      "e_active_rewarming",
      "Moderate hypothermia (28–32 °C) → active external rewarming (forced-air; groin + axillae); handle gently",
      1,
    );
    add(
      "e_passive_rewarming",
      "Remove wet clothing + passive rewarming (warm blankets / environment)",
      1,
    );
    add("e_warmed_fluids", "Warmed IV fluids (~40 °C) → prescribe", 1);
    add(
      "e_septic_screen",
      "If not rewarming ~1 °C/hr → reconsider SEPSIS (cold sepsis) / hypothyroid",
      2,
    );
  } else if (stage === "mild_hypothermia") {
    add(
      "e_passive_rewarming",
      "Mild hypothermia (32–35 °C) → remove wet clothing + passive rewarming (warm blankets)",
      1,
    );
    add("e_warmed_fluids", "Warmed IV fluids (~40 °C) → prescribe", 2);
    add(
      "e_septic_screen",
      "Unexplained hypothermia → keep SEPSIS (cold sepsis) on the differential",
      2,
    );
  } else if (stage === "hyperthermia") {
    add(
      "e_active_cooling",
      "Hyperthermia / heatstroke (≥40 °C) → active cooling (evaporative + cold packs; immersion for exertional; cooled fluids)",
      0,
    );
    add(
      "e_treat_hyperthermia_cause",
      "Cause-specific: serotonin syndrome / NMS (stop drug + benzodiazepine), thyroid storm, malignant hyperthermia (dantrolene) + ICU",
      1,
    );
  }

  // ── Log-roll / examine the back — for trauma OR any recorded back finding.
  //    A back wound/bleed/spinal sign must escalate to a full back exam; the
  //    back is the classically-missed occult-haemorrhage site. ──
  if (fs.context.trauma || has(fs, "back_finding"))
    add(
      "e_log_roll",
      "Log-roll with C-spine control — examine the back fully (classically-missed wounds / occult bleeding / spinal injury; control any bleeding → back to C)",
      1,
    );

  // ── Baseline checklist — always (E is a continuous-survey step). ──
  add(
    "e_recover_keep_warm",
    fs.context.notRecovered
      ? "RE-COVER NOW — the patient is left exposed (iatrogenic hypothermia → coagulopathy)"
      : "Cover + keep warm after examining — never leave the critically ill exposed",
    fs.context.notRecovered ? 1 : 3,
  );
  add(
    "e_ample_history",
    "Take AMPLE history + review the chart (allergies feed the prescribing-tool allergy check)",
    3,
  );
  add("e_monitoring", "Continuous monitoring continues", 4);
  add(
    "e_return_to_a",
    "Treat what was found, then PRIMARY SURVEY COMPLETE → RETURN TO A and reassess (the ABCDE cycles — it is not a single pass)",
    4,
  );

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
  return exposureAction(code)?.escalatesTo ?? null;
}

/* ─── action-state lifecycle (shared vocab with A/B/C/D) ───────────────── */
export const EXPOSURE_ACTION_STATES = [
  "indicated",
  "in_progress",
  "performed",
  "not_indicated",
  "deferred",
  "failed",
] as const;
export type ExposureActionState = (typeof EXPOSURE_ACTION_STATES)[number];

export interface ExposureActionInstance {
  actionId: string;
  actionCode: string;
  tier: number;
  state: ExposureActionState;
  label: string;
  history: { state: ExposureActionState; at: string }[];
}

/** Type-guard for a stored exposure finding-set payload. */
function readFindingSet(payload: Record<string, unknown>): ExposureFindingSet | null {
  const e = payload.exposure as Partial<ExposureFindingSet> | undefined;
  if (!e || typeof e !== "object") return null;
  return {
    state: (e.state as ExposureState | null) ?? null,
    present: Array.isArray(e.present) ? (e.present as string[]) : [],
    coreTempC: typeof e.coreTempC === "number" ? e.coreTempC : null,
    ample: (e.ample as AmpleHistory | null) ?? null,
    context: (e.context as ExposureFindingSet["context"]) ?? {},
  };
}

/** The most recent step-E assessment finding-set (reassessment appends new). */
export function latestExposureAssessment(
  events: readonly TimelineEvent[],
): ExposureFindingSet | null {
  let latest: { at: string; fs: ExposureFindingSet } | null = null;
  for (const e of events) {
    if (e.kind !== "assessment" || e.step !== "E") continue;
    const fs = readFindingSet(e.payload);
    if (!fs) continue;
    if (!latest || e.recordedAt > latest.at) latest = { at: e.recordedAt, fs };
  }
  return latest?.fs ?? null;
}

const EXPOSURE_ACTION_KINDS: ReadonlySet<ResusEventKind> = new Set([
  "action",
  "drug",
  "fluid",
  "procedure",
]);

/** Fold the timeline's exposure action events (by `payload.actionId`) into the
 *  current action list — each instance's latest state is current. Pure. */
export function buildExposureActions(events: readonly TimelineEvent[]): ExposureActionInstance[] {
  const byId = new Map<string, ExposureActionInstance>();
  const ordered = [...events]
    .filter((e) => e.step === "E" && EXPOSURE_ACTION_KINDS.has(e.kind) && e.payload.actionId)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));

  for (const e of ordered) {
    const p = e.payload as {
      actionId: string;
      actionCode?: string;
      tier?: number;
      state?: ExposureActionState;
      label?: string;
    };
    const state = (p.state ?? "indicated") as ExposureActionState;
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
 * The return-to-A "cycle the primary survey" guard — E is NOT a dead-end. Once
 * the temperature is measured and any critical finding / temperature extreme is
 * being treated, the survey is ready to cycle back to A.
 */
export function exposureCycleGuard(
  state: ExposureState | null,
  coreTempC: number | null,
): { ok: boolean; warning?: string } {
  if (coreTempC == null)
    return { ok: false, warning: "Measure the core temperature before completing E." };
  if (state === null)
    return {
      ok: false,
      warning: "Exposure not yet assessed — expose + examine before completing E.",
    };
  if (state === "critical_finding")
    return { ok: false, warning: "Critical finding — treat + escalate, then return to A." };
  if (state === "temperature_extreme")
    return {
      ok: false,
      warning: "Temperature extreme — actively rewarm / cool, then return to A.",
    };
  return { ok: true, warning: "Primary survey complete — RETURN TO A and reassess (cycle)." };
}
