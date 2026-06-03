import type { CirculatoryState, ShockType } from "@/lib/resus/reference/circulation-catalog";
import type { ResusEventKind, TimelineEvent } from "@/lib/resus/types";

import {
  CIRCULATION_COMPENSATED_FINDINGS,
  CIRCULATION_DECOMPENSATED_FINDINGS,
  CIRCULATION_PERI_ARREST_FINDINGS,
  circulationAction,
} from "@/lib/resus/reference/circulation-catalog";

/**
 * Circulation (C) step engine — PURE + deterministic, mirroring the airway/
 * breathing engines. Reasons over recorded findings; makes no clinical
 * decision and performs nothing. Everything derives from the immutable resus
 * timeline (step `C`), so no new migration is needed.
 *
 * Two classification axes:
 *  - `classifyCirculation` → the SEVERITY (well_perfused → … → arrest), worst-
 *    finding-wins. A normal BP must NEVER downgrade a shock state (the
 *    compensated/occult-shock trap).
 *  - `identifyShockType`   → the TYPE (haemorrhagic / septic / anaphylactic /
 *    neurogenic / cardiogenic / obstructive / hypovolaemic), which drives the
 *    type-specific fluid/blood/pressor strategy (GATE C). Decision-support.
 */

export type { CirculatoryState, ShockType } from "@/lib/resus/reference/circulation-catalog";

export interface CirculationFindingSet {
  /** Headline circulatory-state read (gestalt); the engine upgrades it. */
  state: CirculatoryState | null;
  /** look/feel/measure finding codes recorded as PRESENT. */
  present: string[];
  context: {
    /** Trauma mechanism — supports the haemorrhagic type. */
    trauma?: boolean;
    /** Obvious / suspected active bleeding (incl. concealed). */
    activeBleeding?: boolean;
    /** Febrile child — the FEAST caution (no adult-style fluid flooding). */
    febrileChild?: boolean;
    /** Reproductive-age woman / pregnancy possible — ectopic + obstetric haemorrhage. */
    pregnancyPossible?: boolean;
    /** Spinal injury — supports the neurogenic type. */
    spinalInjury?: boolean;
    /** Likely allergen trigger — supports anaphylaxis (adrenaline FIRST). */
    allergenTrigger?: boolean;
    /** Head injury / TBI — the permissive-hypotension EXCEPTION. */
    headInjury?: boolean;
    /** No pulse / no signs of life — routes to the arrest pathway. */
    noPulse?: boolean;
  };
}

function hasAny(present: readonly string[], group: readonly string[]): boolean {
  return present.some((p) => group.includes(p));
}
const has = (fs: CirculationFindingSet, code: string) => fs.present.includes(code);

/**
 * Classify the circulatory state — WORST finding wins. Crucially, a normal BP
 * does NOT downgrade: compensated-shock findings (tachycardia, narrow pulse
 * pressure, delayed cap refill, shock index > 0.9) classify as
 * `compensated_shock` regardless of the BP. Returns null when nothing assessed.
 */
export function classifyCirculation(fs: CirculationFindingSet): CirculatoryState | null {
  const { state, present, context } = fs;

  // Cardiac arrest (no pulse) — the only state that routes to CPR/ALS.
  if (context.noPulse || present.includes("no_pulse")) return "arrest";

  // Peri-arrest / haemodynamic collapse.
  if (state === "peri_arrest" || hasAny(present, CIRCULATION_PERI_ARREST_FINDINGS))
    return "peri_arrest";

  // Decompensated shock — hypotension (or a severe marker) present.
  if (state === "decompensated_shock" || hasAny(present, CIRCULATION_DECOMPENSATED_FINDINGS))
    return "decompensated_shock";

  // Compensated shock — shock signs with the BP still normal (NEVER downgraded).
  if (state === "compensated_shock" || hasAny(present, CIRCULATION_COMPENSATED_FINDINGS))
    return "compensated_shock";

  // Well perfused — only on a positive read.
  if (state === "well_perfused") return "well_perfused";

  return null;
}

/** Is there any shock at all (compensated or worse, excluding pure arrest)? */
function hasShock(fs: CirculationFindingSet): boolean {
  const s = classifyCirculation(fs);
  return s === "compensated_shock" || s === "decompensated_shock" || s === "peri_arrest";
}

/**
 * Identify the SHOCK TYPE from the finding combination + context — the core C
 * reasoning, because the type determines whether fluids help or harm. Ordered
 * most-time-critical / most-specific first. Returns null when there is no
 * shock, or "undifferentiated" when shock is present but the type is unclear
 * (→ the UX prompts bedside ultrasound + treating reversible causes).
 */
export function bleedingFindingPresent(fs: CirculationFindingSet): boolean {
  return (
    has(fs, "external_haemorrhage") ||
    has(fs, "abdominal_distension") ||
    has(fs, "pelvic_instability") ||
    has(fs, "long_bone_deformity") ||
    has(fs, "pulsatile_mass") ||
    has(fs, "peritonism") ||
    has(fs, "us_free_fluid")
  );
}
function septicPicture(fs: CirculationFindingSet): boolean {
  return (
    has(fs, "fever_rash") ||
    ((has(fs, "warm_peripheries") || has(fs, "bounding_pulse")) &&
      (has(fs, "lactate_raised") || has(fs, "lactate_severe")))
  );
}
/** Pregnancy considered — from the context flag OR a recorded positive β-hCG. */
export function pregnancyConsidered(fs: CirculationFindingSet): boolean {
  return !!fs.context.pregnancyPossible || has(fs, "bhcg_positive");
}

export function identifyShockType(fs: CirculationFindingSet): ShockType | null {
  if (classifyCirculation(fs) === "arrest") return null;
  if (!hasShock(fs)) return null;
  const ctx = fs.context;

  // Anaphylaxis — adrenaline FIRST; recognise it before anything else.
  if (has(fs, "urticaria_angioedema") || ctx.allergenTrigger) return "distributive_anaphylactic";

  // Obstructive — fluids won't fix it; relieve the obstruction. raised_jvp is
  // the cardinal "fluids will harm" sign and is owned by these branches.
  if (has(fs, "muffled_heart_sounds") || has(fs, "us_tamponade") || has(fs, "ecg_tamponade"))
    return "obstructive_tamponade";
  if (has(fs, "tracheal_deviation") || has(fs, "unilateral_absent_breath_sounds"))
    return "obstructive_tension";
  if (has(fs, "us_rv_strain") || has(fs, "ecg_pe")) return "obstructive_pe";

  // Haemorrhagic — by a hard bleeding FINDING (always wins; blood not floods).
  if (bleedingFindingPresent(fs)) return "hypovolaemic_haemorrhagic";

  // Cardiogenic by ECG ischaemia (STEMI — time-critical) before sepsis.
  if (has(fs, "ecg_ischaemia")) return "cardiogenic";

  // Septic — a positive septic picture beats a bare (possibly stale) trauma flag.
  if (septicPicture(fs)) return "distributive_septic";

  // Cardiogenic by other clues — incl. raised JVP + cold peripheries (pump
  // failure / RV) and palpated AF, so these are NOT routed to a crystalloid flood.
  if (
    has(fs, "irregular_pulse") ||
    has(fs, "ecg_arrhythmia") ||
    (has(fs, "raised_jvp") && has(fs, "cold_peripheries"))
  )
    return "cardiogenic";

  // Neurogenic — loss of sympathetic tone.
  if (
    ctx.spinalInjury &&
    has(fs, "bradycardia") &&
    (has(fs, "warm_peripheries") || has(fs, "flushing_warm"))
  )
    return "distributive_neurogenic";

  // Haemorrhagic by context (trauma / active bleeding) — AFTER sepsis/cardiogenic
  // so a stale trauma flag can't override a clear distributive/cardiogenic picture.
  if (ctx.trauma || ctx.activeBleeding) return "hypovolaemic_haemorrhagic";

  // Hypovolaemic non-haemorrhagic — volume-depleted picture, but NEVER when the
  // JVP is raised (a fluids-may-harm obstructive/cardiogenic picture).
  if (
    !has(fs, "raised_jvp") &&
    (has(fs, "flat_jvp") || has(fs, "cold_peripheries") || has(fs, "us_poor_filling"))
  )
    return "hypovolaemic_nonhaemorrhagic";

  return "undifferentiated";
}

/** Type-guard for a stored circulation finding-set payload. */
function readFindingSet(payload: Record<string, unknown>): CirculationFindingSet | null {
  const c = payload.circulation as Partial<CirculationFindingSet> | undefined;
  if (!c || typeof c !== "object") return null;
  return {
    state: (c.state as CirculatoryState | null) ?? null,
    present: Array.isArray(c.present) ? (c.present as string[]) : [],
    context: (c.context as CirculationFindingSet["context"]) ?? {},
  };
}

/**
 * The current circulation finding-set: the most recent `assessment` event on
 * step C that carries a circulation payload. Reassessment appends a new event;
 * the latest is current.
 */
export function latestCirculationAssessment(
  events: readonly TimelineEvent[],
): CirculationFindingSet | null {
  let latest: { at: string; fs: CirculationFindingSet } | null = null;
  for (const e of events) {
    if (e.kind !== "assessment" || e.step !== "C") continue;
    const fs = readFindingSet(e.payload);
    if (!fs) continue;
    if (!latest || e.recordedAt > latest.at) latest = { at: e.recordedAt, fs };
  }
  return latest?.fs ?? null;
}

/* ─── GATE C: findings → action engine + action-state lifecycle ──────── */

/** The action-state vocabulary (CSO-ratified, shared with airway/breathing). */
export const CIRCULATION_ACTION_STATES = [
  "indicated",
  "in_progress",
  "performed",
  "not_indicated",
  "deferred",
  "failed",
] as const;
export type CirculationActionState = (typeof CIRCULATION_ACTION_STATES)[number];

export interface TriggeredAction {
  code: string;
  rationale: string;
  /** Lower = more urgent / surfaced first. */
  priority: number;
  emergency: boolean;
}

export interface CirculationActionInstance {
  actionId: string;
  actionCode: string;
  tier: number;
  state: CirculationActionState;
  label: string;
  history: { state: CirculationActionState; at: string }[];
}

/** Confirmed cardiac arrest (no pulse) → route to CPR/ALS, not the C engine. */
export function isCirculationArrest(fs: CirculationFindingSet): boolean {
  return classifyCirculation(fs) === "arrest";
}

/**
 * The deterministic, transparent findings→action mapping (catalog §2–§3),
 * driven by the SHOCK TYPE (the type determines whether fluids help or harm).
 * Returns a de-duplicated list ordered most-urgent-first. Arrest (no pulse)
 * returns [] — that routes to the arrest pathway. THE TRAPS are enforced here:
 * no crystalloid flood for cardiogenic/obstructive/haemorrhagic; FEAST caution
 * for the febrile child; β-hCG/ectopic for reproductive-age shock.
 */
export function triggeredActions(fs: CirculationFindingSet): TriggeredAction[] {
  const state = classifyCirculation(fs);
  if (state === null || state === "well_perfused") return [];
  if (isCirculationArrest(fs)) return [];

  const ctx = fs.context;
  const type = identifyShockType(fs);
  const out: TriggeredAction[] = [];
  const add = (code: string, rationale: string, priority: number) => {
    const emergency = circulationAction(code)?.emergency ?? false;
    out.push({ code, rationale, priority, emergency });
  };
  // Crystalloid bolus is gated through this choke point. NEVER flood a patient
  // whose JVP is raised (obstructive/cardiogenic) OR who is actively bleeding
  // (blood, not crystalloid — dilutional coagulopathy). Adversarial #1/#3/NEW-1.
  const fluidsHarm = has(fs, "raised_jvp");
  const bleeding = bleedingFindingPresent(fs);
  const addBolus = (rationale: string, priority: number) => {
    if (fluidsHarm) {
      add(
        "c_call_skilled_help",
        "Raised JVP — fluids may HARM (obstructive/cardiogenic): do NOT bolus; find + relieve the cause (echo/US)",
        0,
      );
      return;
    }
    if (bleeding) return; // active haemorrhage → BLOOD not crystalloid (surfaced by the haemorrhage block)
    add("c_crystalloid_bolus", rationale, priority);
  };

  // Peri-arrest collapse — escalate at the very top.
  if (state === "peri_arrest")
    add(
      "c_call_skilled_help",
      "Haemodynamic collapse — senior/ICU NOW + the type-specific life-saving action",
      0,
    );

  // ── Haemorrhage control + strategy — fires on any bleeding FINDING or the
  //    haemorrhagic type, so it is surfaced even alongside anaphylaxis (#9). ──
  if (type === "hypovolaemic_haemorrhagic" || bleeding) {
    if (
      has(fs, "external_haemorrhage") ||
      has(fs, "pelvic_instability") ||
      has(fs, "long_bone_deformity")
    )
      add(
        "c_haemorrhage_control",
        "Haemorrhage — control it immediately (direct pressure / tourniquet / pelvic binder / packing)",
        0,
      );
    add(
      "c_stop_bleeding",
      ctx.headInjury
        ? "TBI — do NOT use permissive hypotension; target MAP ≥ 80. STOP the bleeding + definitive control"
        : "Haemorrhagic shock → STOP the bleeding + permissive hypotension (SBP ~80–90, palpable radial)",
      0,
    );
    add(
      "c_blood_mhp",
      "Balanced blood-product resuscitation (whole blood first-line) + activate MHP; MINIMISE crystalloid (dilutional coagulopathy); watch iCa²⁺/temp",
      0,
    );
    add("c_txa", "TXA early — within 3 h of injury (harm if later)", 1);
    add(
      "c_definitive_haemorrhage_control",
      "Definitive control (theatre / IR / endoscopy) — call early",
      1,
    );
    if (pregnancyConsidered(fs))
      add(
        "c_call_skilled_help",
        "Reproductive-age woman + shock + abdo pain / +β-hCG → ECTOPIC until excluded → urgent surgery; (peripartum → obstetric haemorrhage / MHP)",
        0,
      );
  }

  switch (type) {
    case "distributive_anaphylactic":
      add(
        "c_anaphylaxis_adrenaline",
        "Anaphylaxis → IM adrenaline FIRST (before fluids); repeat after 5 min; remove the trigger",
        0,
      );
      addBolus("IV fluid bolus — an adjunct AFTER adrenaline", 1);
      add("c_call_skilled_help", "Refractory → adrenaline infusion + senior/ICU", 1);
      break;
    case "obstructive_tamponade":
      add(
        "c_pericardiocentesis",
        "Tamponade (↓BP + raised JVP + muffled heart sounds) → pericardiocentesis; fluids won't fix it",
        0,
      );
      add("c_call_skilled_help", "Senior + echo immediately", 0);
      break;
    case "obstructive_pe":
      add(
        "c_thrombolysis",
        "Massive PE → consider thrombolysis/embolectomy; judicious fluids (over-filling worsens the RV)",
        0,
      );
      add("c_call_skilled_help", "Senior / critical care", 1);
      break;
    case "obstructive_tension":
      add(
        "c_decompress",
        "Tension pneumothorax → immediate needle/finger decompression (with B); fluids won't fix it",
        0,
      );
      add("c_call_skilled_help", "Skilled operator + chest drain", 1);
      break;
    case "hypovolaemic_haemorrhagic":
      // Haemorrhage strategy is handled in the pre-switch block above (so it is
      // also surfaced for anaphylaxis/other types that co-present with bleeding).
      break;
    case "distributive_septic":
      add(
        "c_sepsis_antibiotics",
        "Septic shock → cultures + early broad-spectrum antibiotics (first hour) + trend lactate",
        0,
      );
      addBolus(
        ctx.febrileChild
          ? "FEAST CAUTION (febrile child): do NOT apply adult 30 mL/kg flooding — cautious boluses; blood if severe anaemia"
          : "Balanced crystalloid (~30 mL/kg) — reassess responsiveness after each; don't reflexively chase lactate to normal",
        1,
      );
      add(
        "c_noradrenaline",
        "MAP < 65 despite fluids → noradrenaline FIRST-LINE, target MAP ≥ 65 (60–65 if ≥ 65y); peripheral is OK — don't delay",
        1,
      );
      add("c_vasopressin", "Refractory → add vasopressin", 2);
      add("c_hydrocortisone", "Refractory septic shock → consider hydrocortisone", 2);
      break;
    case "cardiogenic":
      if (has(fs, "ecg_ischaemia"))
        add("c_pci_activate", "STEMI / ischaemia → activate PCI / reperfusion", 0);
      add(
        "c_inotrope",
        "Cardiogenic → inotrope (dobutamine) ± vasopressor; CAUTION with fluids (worsen pulmonary oedema)",
        1,
      );
      add(
        "c_call_skilled_help",
        "Cardiology / ICU; consider mechanical support; sit up + treat oedema",
        1,
      );
      break;
    case "distributive_neurogenic":
      addBolus("Neurogenic → fluids (loss of sympathetic tone)", 1);
      add("c_noradrenaline", "Vasopressors to maintain perfusion", 1);
      if (has(fs, "bradycardia")) add("c_atropine", "Atropine for the bradycardia", 1);
      add("c_call_skilled_help", "C-spine care + senior", 2);
      break;
    case "hypovolaemic_nonhaemorrhagic":
      addBolus(
        "Hypovolaemic (non-haemorrhagic) → balanced crystalloid boluses; reassess perfusion after each",
        0,
      );
      if (has(fs, "narrow_pulse_pressure") || has(fs, "pallor"))
        add(
          "c_call_skilled_help",
          "Narrow pulse pressure / pallor — rule out CONCEALED haemorrhage (crossmatch, FAST)",
          1,
        );
      break;
    case "undifferentiated":
    default:
      if (pregnancyConsidered(fs))
        add(
          "c_call_skilled_help",
          "Reproductive-age woman + shock / +β-hCG → ECTOPIC until excluded; bedside ultrasound",
          0,
        );
      else
        add(
          "c_call_skilled_help",
          "Undifferentiated shock → bedside ultrasound + the picture to find the type; treat reversible (obstructive) causes early",
          1,
        );
      addBolus(
        ctx.febrileChild
          ? "FEAST CAUTION (febrile child): cautious fluids, NOT adult flooding; blood if severe anaemia"
          : "Cautious crystalloid bolus while identifying the type — reassess + STOP if cardiogenic/obstructive",
        2,
      );
      break;
  }

  // Tier 1 baseline — any shock.
  add(
    "c_iv_access",
    "IV access ×2 large-bore; IO if access fails within ~2 attempts (don't delay)",
    1,
  );
  add("c_bloods", "Bloods at cannulation — incl. group & save / crossmatch + lactate", 1);
  add("c_monitoring", "Continuous monitoring — ECG · BP · SpO₂", 2);
  add("c_ecg_12lead", "12-lead ECG (rhythm / ischaemia / PE / tamponade)", 2);
  add(
    "c_position",
    "Position by type — flat / legs up; sit up if pulmonary oedema (cardiogenic)",
    3,
  );
  add("c_catheter", "Catheterise — urine output is a perfusion marker", 3);
  add("c_high_flow_o2", "High-flow O₂ — shock increases oxygen demand", 3);
  if (state === "decompensated_shock")
    add("c_call_skilled_help", "Decompensated (hypotensive) — call senior/ICU early", 1);

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
  return circulationAction(code)?.escalatesTo ?? null;
}

const CIRCULATION_ACTION_KINDS: ReadonlySet<ResusEventKind> = new Set([
  "action",
  "drug",
  "fluid",
  "procedure",
]);

/**
 * Fold the timeline's circulation action events (by `payload.actionId`) into
 * the current action list: each instance's latest state is current, with its
 * full state history. Pure — derives from the immutable record.
 */
export function buildCirculationActions(
  events: readonly TimelineEvent[],
): CirculationActionInstance[] {
  const byId = new Map<string, CirculationActionInstance>();
  const ordered = [...events]
    .filter((e) => e.step === "C" && CIRCULATION_ACTION_KINDS.has(e.kind) && e.payload.actionId)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0));

  for (const e of ordered) {
    const p = e.payload as {
      actionId: string;
      actionCode?: string;
      tier?: number;
      state?: CirculationActionState;
      label?: string;
    };
    const state = (p.state ?? "indicated") as CirculationActionState;
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
 * Treat-before-proceeding gate to Disability. An open shock state flags (does
 * not hard-block — a resus is non-linear) advancing to D until addressed.
 */
export function circulationProceedGuard(state: CirculatoryState | null): {
  ok: boolean;
  warning?: string;
} {
  if (state === null)
    return {
      ok: false,
      warning: "Circulation not yet assessed — assess C before proceeding to D.",
    };
  if (state === "arrest")
    return { ok: false, warning: "No pulse — start CPR (do not proceed to D)." };
  if (state === "peri_arrest")
    return { ok: false, warning: "Haemodynamic collapse — resuscitate + escalate before D." };
  if (state === "decompensated_shock")
    return { ok: false, warning: "Decompensated shock — treat (by type) before proceeding to D." };
  if (state === "compensated_shock")
    return {
      ok: false,
      warning:
        "Compensated shock (BP still normal — pre-collapse) — treat NOW, don't wait; address before D.",
    };
  return { ok: true };
}
