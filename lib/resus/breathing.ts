import type { BreathingState } from "@/lib/resus/reference/breathing-catalog";
import type { ResusEventKind, TimelineEvent } from "@/lib/resus/types";

import {
  BREATHING_APNOEA_FINDINGS,
  BREATHING_DISTRESS_FINDINGS,
  BREATHING_FAILURE_FINDINGS,
  BREATHING_PERI_ARREST_FINDINGS,
  breathingAction,
} from "@/lib/resus/reference/breathing-catalog";

/**
 * Breathing (B) step engine — PURE + deterministic, mirroring the airway
 * engine. Reasons over recorded findings; makes no clinical decision and
 * performs nothing. Everything derives from the immutable resus timeline
 * (the reconstructTimeline / buildResusVitals pattern), so no new migration
 * is needed (findings/actions are step-`B` timeline events).
 *
 * Decision-support, not autonomous: the clinician records what they find
 * and do; this surfaces the guideline-correct breathing-state classification
 * + (GATE C) the matched actions. B is assessed only once A is secure;
 * return to A on any deterioration.
 */

export type { BreathingState } from "@/lib/resus/reference/breathing-catalog";

/**
 * A recorded breathing finding-set. `state` is the clinician's headline read
 * (gestalt); `present` holds the look/listen/feel/percuss/measure finding
 * codes recorded as PRESENT; `context` carries the trauma / allergen / known-
 * asthma / COPD-risk / PE-suspicion / signs-of-life modifiers that gate the
 * cause-specific clusters (GATE C).
 */
export interface BreathingFindingSet {
  state: BreathingState | null;
  present: string[];
  context: {
    /** Chest trauma / penetrating injury — supports tension/haemothorax/flail. */
    trauma?: boolean;
    /** Likely allergen trigger — supports the anaphylaxis cluster (adrenaline FIRST). */
    allergenTrigger?: boolean;
    /** Known asthmatic — interprets wheeze as asthma + enables PEF reasoning. */
    knownAsthma?: boolean;
    /** Hypercapnic / COPD / CO₂-retainer risk — 88–92% target + NIV pathway. */
    copdRisk?: boolean;
    /** Clinical suspicion of PE (pleuritic pain, risk factors) — gates the PE pathway. */
    peSuspected?: boolean;
    /** No signs of life (pulseless) — routes apnoea to the arrest pathway. */
    noSignsOfLife?: boolean;
  };
}

function hasAny(present: readonly string[], group: readonly string[]): boolean {
  return present.some((p) => group.includes(p));
}

/**
 * Classify breathing from a finding-set — WORST finding wins, so an
 * optimistic headline read never masks a danger finding (e.g. clinician
 * marks "adequate" but a silent chest is present → peri-arrest). Returns
 * null when nothing has been assessed.
 *
 * `apnoeic` covers both apnoea-with-a-pulse (→ ventilate) and apnoea +
 * no-signs-of-life (→ arrest); `isBreathingArrest` makes the safety-critical
 * distinction (GATE C), exactly as the airway engine separates ventilate
 * from CPR.
 */
export function classifyBreathing(fs: BreathingFindingSet): BreathingState | null {
  const { state, present, context } = fs;

  // Apnoea — whether pulseless (arrest) or with a pulse (ventilate), the
  // STATE is apnoeic; pulse-presence is resolved by isBreathingArrest.
  if (context.noSignsOfLife) return "apnoeic";
  if (state === "apnoeic" || hasAny(present, BREATHING_APNOEA_FINDINGS)) return "apnoeic";

  // Peri-arrest — the pre-arrest traps + inadequate effort. NEVER downgrade
  // because a saturation looks normal or the chest went quiet.
  if (state === "peri_arrest" || hasAny(present, BREATHING_PERI_ARREST_FINDINGS))
    return "peri_arrest";

  // Respiratory failure — decompensating.
  if (state === "failure_decompensating" || hasAny(present, BREATHING_FAILURE_FINDINGS))
    return "failure_decompensating";

  // Respiratory distress — compensating.
  if (state === "distress_compensating" || hasAny(present, BREATHING_DISTRESS_FINDINGS))
    return "distress_compensating";

  // Adequate — only on a positive reassuring finding / headline read.
  if (state === "adequate" || present.includes("full_sentences")) return "adequate";

  return null;
}

/** Type-guard for a stored breathing finding-set payload. */
function readFindingSet(payload: Record<string, unknown>): BreathingFindingSet | null {
  const b = payload.breathing as Partial<BreathingFindingSet> | undefined;
  if (!b || typeof b !== "object") return null;
  return {
    state: (b.state as BreathingState | null) ?? null,
    present: Array.isArray(b.present) ? (b.present as string[]) : [],
    context: (b.context as BreathingFindingSet["context"]) ?? {},
  };
}

/**
 * The current breathing finding-set: the most recent `assessment` event on
 * step B that carries a breathing payload. Reassessment appends a new event
 * (the immutable timeline keeps the prior); the latest is current.
 */
export function latestBreathingAssessment(
  events: readonly TimelineEvent[],
): BreathingFindingSet | null {
  let latest: { at: string; fs: BreathingFindingSet } | null = null;
  for (const e of events) {
    if (e.kind !== "assessment" || e.step !== "B") continue;
    const fs = readFindingSet(e.payload);
    if (!fs) continue;
    if (!latest || e.recordedAt > latest.at) latest = { at: e.recordedAt, fs };
  }
  return latest?.fs ?? null;
}

/* ─── GATE C: findings → action engine + action-state lifecycle ──────── */

/** The action-state vocabulary (CSO-ratified, shared with airway). `failed` drives escalation. */
export const BREATHING_ACTION_STATES = [
  "indicated",
  "in_progress",
  "performed",
  "not_indicated",
  "deferred",
  "failed",
] as const;
export type BreathingActionState = (typeof BREATHING_ACTION_STATES)[number];

export interface TriggeredAction {
  code: string;
  rationale: string;
  /** Lower = more urgent / surfaced first. */
  priority: number;
  emergency: boolean;
}

export interface BreathingActionInstance {
  actionId: string;
  actionCode: string;
  tier: number;
  state: BreathingActionState;
  doseId?: string | null;
  label: string;
  history: { state: BreathingActionState; at: string }[];
}

const has = (fs: BreathingFindingSet, code: string) => fs.present.includes(code);

/**
 * The deterministic, transparent findings→action mapping (catalog §2–§3):
 * single findings + the combination/trajectory clusters + the pre-arrest
 * traps. Every entry carries its rationale (the "why"). Returns a de-
 * duplicated list ordered most-urgent-first. Apnoea with no signs of life
 * returns [] — that routes to the arrest pathway, not the breathing engine.
 */
export function triggeredActions(fs: BreathingFindingSet): TriggeredAction[] {
  const state = classifyBreathing(fs);
  // Pulseless arrest → CPR / ALS module, not the breathing engine.
  if (isBreathingArrest(fs)) return [];

  const ctx = fs.context;
  const out: TriggeredAction[] = [];
  const add = (code: string, rationale: string, priority: number) => {
    const emergency = breathingAction(code)?.emergency ?? false;
    out.push({ code, rationale, priority, emergency });
  };

  // ── Apnoea WITH a pulse — peri-arrest respiratory failure → ventilate ──
  if (state === "apnoeic") {
    add(
      "b_bag_mask_ventilation",
      "Apnoea WITH a pulse — open airway + ventilate (BVM) + O₂; confirm the pulse — if none, start CPR",
      0,
    );
    add(
      "b_call_skilled_help",
      "Respiratory arrest — call skilled help + prepare advanced airway/ventilation",
      1,
    );
    add("b_rsi_intubation", "Prepare for intubation + invasive ventilation", 1);
  }

  // ── Pre-arrest traps / peri-arrest — surface at the very top, NEVER as
  //    improvement (catalog §0 / §A.7): silent chest, falling RR, exhaustion,
  //    normalising/rising CO₂, rising EtCO₂ with falling RR. ──
  const periTrap =
    has(fs, "silent_chest") ||
    has(fs, "rr_low_falling") ||
    has(fs, "exhaustion_drowsy") ||
    has(fs, "paco2_rising_normalising") ||
    has(fs, "etco2_rising_falling_rr");
  if (state === "peri_arrest" || periTrap) {
    add(
      "b_call_skilled_help",
      "Peri-arrest: silent chest / falling RR / exhaustion / rising-normalising CO₂ — LIFE-THREATENING; senior + ICU NOW. Do NOT mistake a quiet chest or a 'normal' CO₂ for improvement.",
      0,
    );
    add("b_bag_mask_ventilation", "Inadequate ventilation — support with bag-mask + O₂", 0);
    add("b_rsi_intubation", "Prepare for intubation + invasive ventilation", 1);
  }

  // ── Tension pneumothorax — clinical diagnosis; decompress before imaging/PPV ──
  const tension =
    has(fs, "reduced_breath_sounds") &&
    (has(fs, "hyper_resonant") ||
      has(fs, "trachea_deviated_away") ||
      (has(fs, "raised_jvp") && !!ctx.trauma));
  if (tension) {
    add(
      "b_tension_decompression",
      "Absent breath sounds + hyper-resonance (± deviated trachea / raised JVP / trauma) → TENSION PNEUMOTHORAX: decompress immediately (needle/finger thoracostomy); do NOT wait for imaging; decompress BEFORE positive-pressure ventilation",
      0,
    );
    add("b_chest_drain", "Definitive: intercostal chest drain after decompression", 1);
    add("b_call_skilled_help", "Skilled operator + senior help", 1);
  }

  // ── Massive haemothorax — stony-dull hemithorax with a corroborating sign ──
  if (
    has(fs, "stony_dull") &&
    (has(fs, "reduced_breath_sounds") || has(fs, "asymmetric_expansion") || !!ctx.trauma)
  ) {
    add(
      "b_haemothorax_drain",
      "Stony-dull percussion + absent breath sounds / asymmetric expansion / trauma → massive haemothorax: large-bore chest drain + activate major-haemorrhage/blood + surgery (a C overlap)",
      0,
    );
    add("b_call_skilled_help", "Senior + surgical help", 1);
  }

  // ── Open ("sucking") chest wound ──
  if (has(fs, "open_chest_wound")) {
    add(
      "b_chest_seal",
      "Open ('sucking') chest wound → vented chest seal / three-sided dressing + chest drain (away from the wound)",
      1,
    );
    add("b_chest_drain", "Chest drain, sited away from the wound", 2);
  }

  // ── Flail chest (trauma) — a named B life-threat ──
  if (has(fs, "flail_segment")) {
    add(
      "b_call_skilled_help",
      "Flail segment (trauma) → ventilatory failure: analgesia + watch for underlying lung contusion/pneumothorax; early ventilatory support; senior/critical care",
      1,
    );
  }

  // ── Bronchospasm — anaphylaxis vs COPD vs asthma ──
  const acuteSevereAsthma =
    has(fs, "pef_33_50") ||
    has(fs, "rr_very_high") ||
    has(fs, "cant_complete_sentences") ||
    has(fs, "spo2_lt92");
  const lifeThreatAsthma =
    has(fs, "silent_chest") ||
    has(fs, "spo2_lt92") ||
    has(fs, "pef_lt33") ||
    has(fs, "paco2_rising_normalising") ||
    has(fs, "rr_low_falling") ||
    has(fs, "exhaustion_drowsy");
  // Silent chest counts as bronchospasm ONLY with a wheeze/asthma context
  // (a silent chest from a non-asthma cause must not auto-suggest salbutamol).
  const bronchospasm = has(fs, "wheeze") || (has(fs, "silent_chest") && !!ctx.knownAsthma);
  if (bronchospasm) {
    if (ctx.allergenTrigger) {
      // Anaphylaxis — IM adrenaline FIRST, before salbutamol.
      add(
        "b_anaphylaxis_adrenaline",
        "Bronchospasm after a trigger → anaphylaxis: IM adrenaline FIRST (before salbutamol), repeat after 5 min; remove the trigger; O₂ + IV fluids",
        0,
      );
      add("b_call_skilled_help", "Prepare advanced airway + senior/ICU", 1);
      add(
        "b_salbutamol_neb",
        "Nebulised salbutamol as an ADJUNCT for the wheeze — never a substitute for IM adrenaline",
        2,
      );
    } else if (ctx.copdRisk) {
      add(
        "b_copd_controlled_o2",
        "Wheeze + COPD/CO₂-retainer risk → controlled O₂ (target 88–92%) + nebulised bronchodilators + systemic steroid ± antibiotics; check ABG",
        1,
      );
      add("b_salbutamol_neb", "Nebulised bronchodilator", 1);
      add("b_asthma_steroid", "Systemic corticosteroid", 2);
      if (has(fs, "resp_acidosis") || has(fs, "paco2_rising_normalising"))
        add(
          "b_niv",
          "Hypercapnic respiratory failure with acidosis (pH < 7.35 + PaCO₂ > 6.5 kPa) despite optimal therapy → NIV (BiPAP); senior review",
          1,
        );
    } else {
      // Asthma (default bronchospasm).
      add(
        "b_salbutamol_neb",
        "Bronchospasm → oxygen-driven nebulised salbutamol (back-to-back / continuous if severe)",
        1,
      );
      add("b_asthma_steroid", "Give a systemic steroid early in every acute attack", 2);
    }

    // Shared severe / life-threatening bronchospasm escalation — runs for
    // EVERY cause (asthma, COPD, anaphylaxis), so the magnesium / ipratropium /
    // explicit-ICU escalation is never dropped just because a trigger or COPD
    // flag is set (GATE-E adversarial fix).
    if (acuteSevereAsthma || lifeThreatAsthma)
      add(
        "b_ipratropium_neb",
        "Acute severe / life-threatening bronchospasm → add nebulised ipratropium",
        1,
      );
    if (lifeThreatAsthma) {
      // Magnesium is an asthma drug — surface it for asthma / anaphylactic
      // bronchospasm and explicit asthma-COPD overlap, but not as a routine
      // pure-COPD action.
      if (!ctx.copdRisk || ctx.knownAsthma)
        add(
          "b_magnesium_iv",
          "Life-threatening / poor response → IV magnesium sulphate (single dose); senior + ICU",
          0,
        );
      add(
        "b_call_skilled_help",
        "Life-threatening bronchospasm — senior + ICU; prepare for ventilatory support; NO sedatives",
        0,
      );
    }
  }

  // ── Acute pulmonary oedema ──
  if (has(fs, "crackles") && has(fs, "raised_jvp")) {
    add(
      "b_pulmonary_oedema",
      "Bibasal crackles + raised JVP (± frothy sputum / orthopnoea / hypertension) → acute pulmonary oedema: sit up, O₂, consider GTN + IV furosemide ± CPAP/NIV; treat the cause (ACS/arrhythmia); cardiology",
      1,
    );
  }

  // ── Severe pneumonia / sepsis ──
  if (has(fs, "bronchial_breathing") || (has(fs, "crackles") && has(fs, "raised_lactate"))) {
    add(
      "b_sepsis_bundle",
      "Consolidation (bronchial breathing / coarse crackles) ± raised lactate → severe pneumonia / sepsis: O₂ + sepsis bundle (cultures, early antibiotics, fluids, lactate); escalate",
      1,
    );
  }

  // ── Pulmonary embolism (clinician-suspected; non-specific on exam alone) ──
  if (ctx.peSuspected) {
    add(
      "b_pe_support",
      "Suspected PE (pleuritic pain + hypoxia + raised JVP/tachycardia + risk factors) → O₂ + haemodynamic support; consider thrombolysis if peri-arrest/high-risk; senior/critical care",
      1,
    );
  }

  // ── Sit upright (distress/failure, no trauma/hypotension) ──
  if ((state === "distress_compensating" || state === "failure_decompensating") && !ctx.trauma) {
    add(
      "b_sit_upright",
      "Sit upright if tolerated — improves ventilation (avoid in trauma/hypotension)",
      2,
    );
  }

  // ── Respiratory failure — escalate pre-emptively (late rescue is harder) ──
  if (state === "failure_decompensating") {
    add(
      "b_call_skilled_help",
      "Respiratory failure — call skilled help early (anaesthetics/ICU); late rescue is harder",
      1,
    );
  }

  // ── Supportive O₂ + monitoring (always) — controlled in COPD risk ──
  if (ctx.copdRisk) {
    add(
      "b_copd_controlled_o2",
      "COPD / CO₂-retainer risk → controlled O₂, target SpO₂ 88–92%; check ABG; titrate to avoid hypercapnia",
      3,
    );
  } else {
    add(
      "b_high_flow_o2",
      "High-flow O₂ 15 L/min reservoir for the critically ill; target SpO₂ 94–98%; titrate after stabilising",
      3,
    );
  }
  add(
    "b_continuous_monitoring",
    "Attach continuous monitoring — SpO₂, ECG, RR, capnography if available",
    3,
  );

  // De-duplicate by code (keep the most urgent rationale), then sort.
  const byCode = new Map<string, TriggeredAction>();
  for (const t of out) {
    const held = byCode.get(t.code);
    if (!held || t.priority < held.priority) byCode.set(t.code, t);
  }
  return [...byCode.values()].sort((a, b) => a.priority - b.priority);
}

/** Confirmed cardiac arrest (apnoea + pulseless) → route to CPR/ALS, not the breathing engine. */
export function isBreathingArrest(fs: BreathingFindingSet): boolean {
  return classifyBreathing(fs) === "apnoeic" && !!fs.context.noSignsOfLife;
}

/** The action surfaced when `code` is recorded `failed` (the intensification ladder). */
export function escalationFor(code: string): string | null {
  return breathingAction(code)?.escalatesTo ?? null;
}

const BREATHING_ACTION_KINDS: ReadonlySet<ResusEventKind> = new Set([
  "action",
  "drug",
  "procedure",
]);

/**
 * Fold the timeline's breathing action events (by `payload.actionId`) into
 * the current action list: each instance's latest state is current, with its
 * full state history. Pure — derives from the immutable record.
 */
export function buildBreathingActions(events: readonly TimelineEvent[]): BreathingActionInstance[] {
  const byId = new Map<string, BreathingActionInstance>();
  const ordered = [...events]
    .filter((e) => e.step === "B" && BREATHING_ACTION_KINDS.has(e.kind) && e.payload.actionId)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));

  for (const e of ordered) {
    const p = e.payload as {
      actionId: string;
      actionCode?: string;
      tier?: number;
      state?: BreathingActionState;
      doseId?: string | null;
      label?: string;
    };
    const state = (p.state ?? "indicated") as BreathingActionState;
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
        doseId: p.doseId ?? null,
        label: p.label ?? p.actionCode ?? "",
        history: [{ state, at: e.recordedAt }],
      });
    }
  }
  return [...byId.values()];
}

/**
 * Treat-before-proceeding gate to Circulation. A breathing problem flags
 * (does not hard-block — a resus is non-linear; the UX informs) advancing to
 * C until addressed. Distress "compensating" still flags — it will fail.
 */
export function breathingProceedGuard(state: BreathingState | null): {
  ok: boolean;
  warning?: string;
} {
  if (state === null)
    return { ok: false, warning: "Breathing not yet assessed — assess B before proceeding to C." };
  if (state === "apnoeic")
    return { ok: false, warning: "Apnoea — ventilate (BVM) / confirm pulse; do not proceed to C." };
  if (state === "peri_arrest")
    return {
      ok: false,
      warning: "Peri-arrest breathing — senior + ICU + ventilatory support before C.",
    };
  if (state === "failure_decompensating")
    return { ok: false, warning: "Respiratory failure — treat / escalate before proceeding to C." };
  if (state === "distress_compensating")
    return {
      ok: false,
      warning: "Respiratory distress (compensating, will fail) — treat before proceeding to C.",
    };
  return { ok: true };
}
