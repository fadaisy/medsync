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

/** secure → ... → apnoeic_arrest. Null = not yet assessed. */
export const AIRWAY_STATES = [
  "secure",
  "threatened",
  "partially_obstructed",
  "completely_obstructed",
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
    /** No signs of life — routes apnoea to the arrest pathway. */
    noSignsOfLife?: boolean;
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

  // Apnoea / arrest (highest).
  if (context.noSignsOfLife) return "apnoeic_arrest";
  if (patency === "apnoeic" || hasAny(present, AIRWAY_APNOEA_FINDINGS)) return "apnoeic_arrest";

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
  if (isArrestPattern(fs)) return [];

  const state = classifyAirway(fs);
  const manoeuvre = fs.context.trauma ? "a_jaw_thrust" : "a_head_tilt_chin_lift";
  const out: TriggeredAction[] = [];
  const add = (code: string, rationale: string, priority: number) => {
    const emergency = airwayAction(code)?.emergency ?? false;
    out.push({ code, rationale, priority, emergency });
  };

  // ── Combination clusters (catalog §3) — most urgent first ──
  // Complete obstruction.
  if (state === "completely_obstructed") {
    add(
      "a_call_skilled_help",
      "Complete obstruction — call skilled help now + prepare advanced airway",
      0,
    );
    add(manoeuvre, "Open the airway", 1);
    add("a_suction", "Clear the airway", 1);
  }
  // Supraglottic / epiglottitis — do NOT distress or instrument.
  if (
    has(fs, "stridor_inspiratory") &&
    (has(fs, "drooling_tripod") || has(fs, "hoarse_muffled_voice"))
  ) {
    add(
      "a_epiglottitis_pathway",
      "Stridor + drooling/muffled voice → supraglottic obstruction (epiglottitis): do not distress/instrument; senior anaesthetic + ENT; theatre",
      0,
    );
    add("a_call_skilled_help", "Senior anaesthetic + ENT immediately", 1);
    add("a_steroids_oedema", "Inflammatory oedema (cause-dependent)", 2);
    add(
      "a_neb_adrenaline_oedema",
      "Nebulised adrenaline for upper-airway oedema (cause-dependent)",
      2,
    );
  }
  // Burns / inhalation — closing airway.
  if (has(fs, "burns_soot")) {
    add(
      "a_burns_early_intubation",
      "Burns/soot/singed hair — inhalation injury: early definitive airway before oedema closes it",
      0,
    );
    add("a_call_skilled_help", "Closing-airway window — escalate now", 1);
  }
  // Anaphylaxis / angioedema with airway swelling.
  if (has(fs, "swelling_face")) {
    const why = fs.context.allergenTrigger
      ? "Facial/lip/tongue swelling after a trigger → anaphylaxis: IM adrenaline first"
      : "Angioedema with airway swelling → IM adrenaline";
    add("a_anaphylaxis_adrenaline", why, 0);
    add("a_call_skilled_help", "Prepare advanced airway + senior/ICU", 1);
  }
  // Reduced GCS — cannot protect the airway.
  if (has(fs, "gcs_le8")) {
    add(
      "a_call_skilled_help",
      "GCS ≤ 8 — cannot protect the airway → definitive airway for protection",
      1,
    );
    add("a_opa", "Adjunct for the unconscious/no-gag patient", 2);
    add(manoeuvre, "Open the airway", 2);
    add("a_suction", "Protect against aspiration", 2);
  }
  // Expanding neck haematoma — threatened airway.
  if (has(fs, "swelling_neck")) {
    add(
      "a_call_skilled_help",
      "Expanding neck swelling/haematoma — threatened airway: senior airway + surgical help",
      1,
    );
  }
  // Laryngospasm.
  if (has(fs, "crowing")) {
    add("a_laryngospasm_management", "Crowing → laryngospasm", 2);
  }

  // ── Single findings (Tier 1) ──
  if (has(fs, "foreign_body")) {
    add("a_remove_foreign_body", "Visible foreign body / secretions — remove under vision", 1);
    add("a_suction", "Clear secretions/blood/vomit", 2);
    if (state === "completely_obstructed")
      add("a_choking_algorithm", "Choking with severe/complete obstruction", 0);
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

  // ── Supportive O₂ (always, for any compromised/critically-ill airway) ──
  add("a_high_flow_o2", "High-flow O₂ for the critically ill patient; target SpO₂ 94–98%", 3);

  // De-duplicate by code (keep the most urgent rationale), then sort.
  const byCode = new Map<string, TriggeredAction>();
  for (const t of out) {
    const held = byCode.get(t.code);
    if (!held || t.priority < held.priority) byCode.set(t.code, t);
  }
  return [...byCode.values()].sort((a, b) => a.priority - b.priority);
}

/** Apnoea + no signs of life → route to the arrest pathway, not airway. */
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
  if (state === "apnoeic_arrest")
    return { ok: false, warning: "Apnoea / arrest — start CPR (do not proceed to B)." };
  if (state === "completely_obstructed" || state === "partially_obstructed")
    return { ok: false, warning: "Open airway obstruction — treat before proceeding to B." };
  if (state === "threatened")
    return { ok: false, warning: "Airway threatened — secure / escalate before proceeding to B." };
  return { ok: true };
}
