import type { AirwayPatency } from "@/lib/resus/reference/airway-catalog";
import type { ResusEventKind, TimelineEvent } from "@/lib/resus/types";

import {
  AIRWAY_APNOEA_FINDINGS,
  AIRWAY_COMPLETE_FINDINGS,
  AIRWAY_PARTIAL_FINDINGS,
  AIRWAY_THREATENED_FINDINGS,
  airwayAction,
} from "@/lib/resus/reference/airway-catalog";

/**
 * Airway step engine (GATE B: finding capture + state classification) —
 * PURE + deterministic. Reasons over recorded findings; makes no clinical
 * decision and performs nothing. The findings→action engine + the
 * action-state lifecycle are added in GATE C.
 *
 * Decision-support, not autonomous: the clinician records what they find
 * and do; this surfaces the guideline-correct classification + (GATE C)
 * the matched actions. Everything derives from the immutable resus
 * timeline (the reconstructTimeline / buildResusVitals pattern), so no
 * new migration is needed.
 */

/**
 * secure → ... → apnoeic_arrest. Null = not yet assessed.
 * `apnoeic_ventilate` = apnoea WITH signs of life (peri-arrest respiratory
 * failure / opioid toxicity) — open airway + ventilate, NOT chest
 * compressions. Only `apnoeic_arrest` (pulseless) routes to CPR/ALS.
 */
export const AIRWAY_STATES = [
  "secure",
  "threatened",
  "partially_obstructed",
  "completely_obstructed",
  "apnoeic_ventilate",
  "apnoeic_arrest",
] as const;
export type AirwayState = (typeof AIRWAY_STATES)[number];

/**
 * A recorded airway finding-set. `present` holds the look/listen/feel
 * finding codes recorded as PRESENT (absent / not-assessed simply aren't
 * listed); `difficulty` holds the difficulty-screen flags; `context`
 * carries the trauma / allergen / signs-of-life modifiers.
 */
export interface AirwayFindingSet {
  patency: AirwayPatency | null;
  present: string[];
  difficulty: string[];
  context: {
    /** Trauma / suspected C-spine — selects jaw-thrust over head-tilt. */
    trauma?: boolean;
    /** Likely allergen trigger — supports the anaphylaxis cluster. */
    allergenTrigger?: boolean;
    /** No signs of life (pulseless) — routes apnoea to the arrest pathway. */
    noSignsOfLife?: boolean;
    /** Gag present / clenched jaw — an OPA is unsuitable; prefer an NPA. */
    gagPresent?: boolean;
  };
}

function hasAny(present: readonly string[], group: readonly string[]): boolean {
  return present.some((p) => group.includes(p));
}

/**
 * Classify the airway from a finding-set — WORST finding wins, so an
 * optimistic patency never masks a dangerous finding (e.g. "talking" but
 * stridor present → partially obstructed). Returns null when nothing has
 * been assessed.
 */
export function classifyAirway(fs: AirwayFindingSet): AirwayState | null {
  const { patency, present, context } = fs;

  // Cardiac arrest (pulseless) — the ONLY airway state that routes to CPR.
  if (context.noSignsOfLife) return "apnoeic_arrest";
  // Apnoea WITH signs of life = peri-arrest respiratory failure → open
  // airway + ventilate (BVM), NOT chest compressions. Confirm the pulse.
  if (patency === "apnoeic" || hasAny(present, AIRWAY_APNOEA_FINDINGS)) return "apnoeic_ventilate";

  // Complete obstruction.
  if (patency === "completely_obstructed" || hasAny(present, AIRWAY_COMPLETE_FINDINGS))
    return "completely_obstructed";

  // Partial obstruction.
  if (patency === "partially_obstructed" || hasAny(present, AIRWAY_PARTIAL_FINDINGS))
    return "partially_obstructed";

  // Threatened (patent now, but at risk). A difficulty flag alone does NOT
  // downgrade a secure airway — it changes the action plan, not the state.
  if (patency === "patent_at_risk" || hasAny(present, AIRWAY_THREATENED_FINDINGS))
    return "threatened";

  // Secure — only when there is a positive patent finding.
  if (patency === "patent_talking" || present.includes("normal_speech")) return "secure";

  return null;
}

/** Type-guard for a stored airway finding-set payload. */
function readFindingSet(payload: Record<string, unknown>): AirwayFindingSet | null {
  const a = payload.airway as Partial<AirwayFindingSet> | undefined;
  if (!a || typeof a !== "object") return null;
  return {
    patency: (a.patency as AirwayPatency | null) ?? null,
    present: Array.isArray(a.present) ? (a.present as string[]) : [],
    difficulty: Array.isArray(a.difficulty) ? (a.difficulty as string[]) : [],
    context: (a.context as AirwayFindingSet["context"]) ?? {},
  };
}

/**
 * The current airway finding-set: the most recent `assessment` event on
 * step A that carries an airway payload. Reassessment appends a new event
 * (the immutable timeline keeps the prior); the latest is current.
 */
export function latestAirwayAssessment(events: readonly TimelineEvent[]): AirwayFindingSet | null {
  let latest: { at: string; fs: AirwayFindingSet } | null = null;
  for (const e of events) {
    if (e.kind !== "assessment" || e.step !== "A") continue;
    const fs = readFindingSet(e.payload);
    if (!fs) continue;
    if (!latest || e.recordedAt > latest.at) latest = { at: e.recordedAt, fs };
  }
  return latest?.fs ?? null;
}

/* ─── GATE C: findings → action engine + action-state lifecycle ──────── */

/** The action-state vocabulary (CSO-ratified). `failed` drives escalation. */
export const AIRWAY_ACTION_STATES = [
  "indicated",
  "in_progress",
  "performed",
  "not_indicated",
  "deferred",
  "failed",
] as const;
export type AirwayActionState = (typeof AIRWAY_ACTION_STATES)[number];

export interface TriggeredAction {
  code: string;
  rationale: string;
  /** Lower = more urgent / surfaced first. */
  priority: number;
  emergency: boolean;
}

export interface AirwayActionInstance {
  actionId: string;
  actionCode: string;
  tier: number;
  state: AirwayActionState;
  doseId?: string | null;
  label: string;
  history: { state: AirwayActionState; at: string }[];
}

const has = (fs: AirwayFindingSet, code: string) => fs.present.includes(code);

/**
 * The deterministic, transparent findings→action mapping (catalog §2–§3):
 * single findings + the combination/trajectory clusters. Every entry
 * carries its rationale (the "why"). Returns a de-duplicated list ordered
 * most-urgent-first (least-invasive shown, emergencies prominent). Apnoea
 * with no signs of life returns [] — that routes to the arrest pathway,
 * not the airway engine.
 */
export function triggeredActions(fs: AirwayFindingSet): TriggeredAction[] {
  const state = classifyAirway(fs);
  // Pulseless arrest → CPR / ALS module, not the airway engine.
  if (state === "apnoeic_arrest") return [];

  const manoeuvre =
    fs.context.trauma || has(fs, "facial_neck_trauma") ? "a_jaw_thrust" : "a_head_tilt_chin_lift";
  const adjunct = fs.context.gagPresent ? "a_npa" : "a_opa";
  const out: TriggeredAction[] = [];
  const add = (code: string, rationale: string, priority: number) => {
    const emergency = airwayAction(code)?.emergency ?? false;
    out.push({ code, rationale, priority, emergency });
  };

  // Epiglottitis / supraglottic obstruction — anchored on DROOLING (present
  // before stridor, which is a late sign). Drives the do-not-instrument
  // suppression at the end (catalog §3 cluster 2).
  const epiglottitis =
    has(fs, "drooling_tripod") &&
    (has(fs, "hoarse_muffled_voice") || has(fs, "stridor_inspiratory"));

  // ── Apnoea WITH a pulse — peri-arrest respiratory failure → ventilate ──
  if (state === "apnoeic_ventilate") {
    add(
      "a_bag_mask_ventilation",
      "Apnoea WITH a pulse — open airway + ventilate (BVM); confirm the pulse — if none, start CPR",
      0,
    );
    add(manoeuvre, "Open the airway", 1);
    add(adjunct, "Airway adjunct to support ventilation", 1);
    add(
      "a_call_skilled_help",
      "Respiratory arrest — call skilled help + prepare advanced airway",
      1,
    );
  }

  // ── Complete obstruction ──
  if (state === "completely_obstructed") {
    add(manoeuvre, "Open the airway", 0);
    add(
      "a_call_skilled_help",
      "Complete obstruction — call skilled help now + prepare advanced airway",
      0,
    );
    add("a_suction", "Clear the airway", 1);
    add(adjunct, "Airway adjunct", 1);
    if (has(fs, "foreign_body"))
      add("a_choking_algorithm", "Foreign body + complete obstruction → choking algorithm", 0);
  }

  // ── Supraglottic / epiglottitis (do NOT distress or instrument) ──
  if (epiglottitis) {
    add(
      "a_epiglottitis_pathway",
      "Drooling + muffled voice/stridor → supraglottic obstruction (epiglottitis): do NOT distress or instrument; senior anaesthetic + ENT; controlled airway in theatre",
      0,
    );
    add("a_call_skilled_help", "Senior anaesthetic + ENT immediately", 1);
    add("a_steroids_oedema", "Inflammatory oedema (cause-dependent)", 2);
    add(
      "a_neb_adrenaline_oedema",
      "Nebulised adrenaline for upper-airway oedema (cause-dependent)",
      2,
    );
  } else if (has(fs, "stridor_inspiratory") && has(fs, "hoarse_muffled_voice")) {
    // Laryngeal oedema (stridor + hoarse, no drooling) — adrenaline-responsive;
    // NOT the do-not-touch epiglottitis pathway. Consider anaphylaxis.
    add(
      "a_neb_adrenaline_oedema",
      "Stridor + hoarse voice → laryngeal oedema: nebulised adrenaline (cause-dependent)",
      1,
    );
    add("a_steroids_oedema", "Inflammatory oedema (cause-dependent)", 2);
    add(
      "a_call_skilled_help",
      "Laryngeal oedema — call skilled help; consider anaphylaxis (IM adrenaline) if features present",
      1,
    );
  }

  // ── Burns / inhalation — closing airway ──
  if (has(fs, "burns_soot")) {
    add(
      "a_burns_early_intubation",
      "Burns/soot/singed hair — inhalation injury: early definitive airway before oedema closes it",
      0,
    );
    add("a_call_skilled_help", "Closing-airway window — escalate now", 1);
  }

  // ── Facial/airway swelling — anaphylaxis vs non-allergic angioedema ──
  if (has(fs, "swelling_face")) {
    if (fs.context.allergenTrigger) {
      add(
        "a_anaphylaxis_adrenaline",
        "Facial/lip/tongue swelling after a trigger → anaphylaxis: IM adrenaline first",
        0,
      );
      add("a_call_skilled_help", "Prepare advanced airway + senior/ICU", 1);
    } else {
      add(
        "a_call_skilled_help",
        "Facial/airway swelling — airway protection + senior/ENT; adrenaline may be INEFFECTIVE in ACE-inhibitor / hereditary (bradykinin) angioedema",
        1,
      );
      add(
        "a_anaphylaxis_adrenaline",
        "IF anaphylaxis suspected (urticaria / wheeze / hypotension after a trigger) → IM adrenaline",
        2,
      );
    }
  }

  // ── Reduced GCS — cannot protect the airway ──
  if (has(fs, "gcs_le8")) {
    add(
      "a_call_skilled_help",
      "GCS ≤ 8 — cannot protect the airway → definitive airway for protection",
      1,
    );
    add(
      adjunct,
      fs.context.gagPresent
        ? "Gag present / clenched jaw — nasopharyngeal adjunct (OPA unsuitable)"
        : "Adjunct for the unconscious / no-gag patient",
      2,
    );
    add(manoeuvre, "Open the airway", 2);
    add("a_suction", "Protect against aspiration", 2);
    if (!fs.context.trauma && !has(fs, "facial_neck_trauma"))
      add("a_recovery_position", "Unconscious + breathing + no trauma → recovery position", 3);
  }

  // ── Expanding neck haematoma ──
  if (has(fs, "swelling_neck")) {
    add(
      "a_call_skilled_help",
      "Expanding neck swelling/haematoma — threatened airway: senior airway + surgical help",
      1,
    );
  }
  // ── Laryngospasm ──
  if (has(fs, "crowing")) add("a_laryngospasm_management", "Crowing → laryngospasm", 2);

  // ── Stridor / laryngeal / fatiguing (progression) — escalate early ──
  if (has(fs, "stridor_inspiratory") || has(fs, "crowing") || has(fs, "weakening_cough")) {
    add(
      "a_call_skilled_help",
      "Stridor / laryngeal / fatiguing airway — call skilled help early (don't wait for desaturation)",
      1,
    );
  }
  // ── Central cyanosis — severe hypoxaemia (late sign) → escalate ──
  if (has(fs, "central_cyanosis")) {
    add("a_call_skilled_help", "Central cyanosis — severe hypoxaemia (late sign): escalate", 1);
  }

  // ── Single findings (Tier 1) ──
  if (has(fs, "foreign_body")) {
    add("a_remove_foreign_body", "Visible foreign body / secretions — remove under vision", 1);
    add("a_suction", "Clear secretions/blood/vomit", 2);
    if (
      state === "completely_obstructed" ||
      (state === "partially_obstructed" && has(fs, "weakening_cough"))
    )
      add(
        "a_choking_algorithm",
        "Foreign body + severe/ineffective-cough obstruction → choking algorithm (5 back blows / 5 abdominal thrusts)",
        0,
      );
  }
  if (has(fs, "gurgling")) add("a_suction", "Gurgling — liquid in the airway → suction", 2);
  if (has(fs, "snoring"))
    add(manoeuvre, "Snoring (tongue obstruction) → airway-opening manoeuvre", 2);

  // ── Difficulty anticipation + pre-emptive escalation ──
  if (fs.difficulty.length > 0 && state && state !== "secure") {
    add(
      "a_call_skilled_help",
      "Difficulty flag(s) present — anticipate a difficult airway: most-skilled operator + adjuncts + eFONA kit + plan A→D",
      1,
    );
  }
  if (state === "threatened") {
    add(
      "a_call_skilled_help",
      "Threatened airway — escalate pre-emptively (late rescue is harder)",
      1,
    );
  }

  // ── Supportive O₂ (critically ill) ──
  add(
    "a_high_flow_o2",
    "High-flow O₂ for the critically ill; target SpO₂ 94–98% (88–92% if COPD / type-2 RF risk)",
    3,
  );

  // Epiglottitis: suppress instrumentation UNLESS the airway is already
  // complete/apnoeic (then you must act) — avoid precipitating total
  // obstruction (catalog §3 cluster 2 / §2 Tier 2).
  let result = out;
  if (epiglottitis && state !== "completely_obstructed" && state !== "apnoeic_ventilate") {
    const INSTRUMENT = new Set([
      "a_suction",
      "a_head_tilt_chin_lift",
      "a_jaw_thrust",
      "a_opa",
      "a_npa",
      "a_remove_foreign_body",
      "a_choking_algorithm",
    ]);
    result = out.filter((t) => !INSTRUMENT.has(t.code));
  }

  // De-duplicate by code (keep the most urgent rationale), then sort.
  const byCode = new Map<string, TriggeredAction>();
  for (const t of result) {
    const held = byCode.get(t.code);
    if (!held || t.priority < held.priority) byCode.set(t.code, t);
  }
  return [...byCode.values()].sort((a, b) => a.priority - b.priority);
}

/** Confirmed cardiac arrest (pulseless) → route to CPR/ALS, not the airway engine. */
export function isArrestPattern(fs: AirwayFindingSet): boolean {
  return classifyAirway(fs) === "apnoeic_arrest";
}

/** The action surfaced when `code` is recorded `failed` (the DAS ladder). */
export function escalationFor(code: string): string | null {
  return airwayAction(code)?.escalatesTo ?? null;
}

const AIRWAY_ACTION_KINDS: ReadonlySet<ResusEventKind> = new Set(["action", "drug", "procedure"]);

/**
 * Fold the timeline's airway action events (by `payload.actionId`) into the
 * current action list: each instance's latest state is current, with its
 * full state history. Pure — derives from the immutable record.
 */
export function buildAirwayActions(events: readonly TimelineEvent[]): AirwayActionInstance[] {
  const byId = new Map<string, AirwayActionInstance>();
  const ordered = [...events]
    .filter((e) => e.step === "A" && AIRWAY_ACTION_KINDS.has(e.kind) && e.payload.actionId)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));

  for (const e of ordered) {
    const p = e.payload as {
      actionId: string;
      actionCode?: string;
      tier?: number;
      state?: AirwayActionState;
      doseId?: string | null;
      label?: string;
    };
    const state = (p.state ?? "indicated") as AirwayActionState;
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
 * Treat-before-proceeding gate to Breathing. An open airway threat flags
 * (does not hard-block — a resus is non-linear; the UX informs) advancing
 * to B until addressed.
 */
export function airwayProceedGuard(state: AirwayState | null): { ok: boolean; warning?: string } {
  if (state === null)
    return { ok: false, warning: "Airway not yet assessed — assess A before proceeding to B." };
  if (state === "apnoeic_arrest")
    return { ok: false, warning: "Apnoea + no signs of life — start CPR (do not proceed to B)." };
  if (state === "apnoeic_ventilate")
    return { ok: false, warning: "Apnoea — open airway + ventilate (BVM); confirm the pulse." };
  if (state === "completely_obstructed" || state === "partially_obstructed")
    return { ok: false, warning: "Open airway obstruction — treat before proceeding to B." };
  if (state === "threatened")
    return { ok: false, warning: "Airway threatened — secure / escalate before proceeding to B." };
  return { ok: true };
}
