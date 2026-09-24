/**
 * Resus Desk v2 — the cross-step Do-now queue (GATE A §2 ⓖ, §7; prompt §5.5).
 * PURE and deterministic: same input → same list.
 *
 * Ranking (bands in this order; ties keep A→E and the engine priority):
 *  1. SV-DN-01 failed actions (they need escalation), any step.
 *  2. SV-DN-02 "Assess X" for a step vitals put under threat but nobody has
 *     assessed, with an evidence line of the real values ("because SBP 70,
 *     MAP 63"). Also for a step whose derived code the engine cannot classify
 *     (D hypoglycaemia alone) — the safer direction.
 *  3. SV-DN-03 indicated emergency actions across steps (orderResusActions:
 *     state band, then engine priority).
 *  4. SV-DN-04/05 engine-triggered returns: GCS ≤ 8 or falling → "Return to A";
 *     opioid toxicity → "Naloxone → back to B" (the D action, with its reason).
 *     A return absorbs its own engine action so it is listed once.
 *  5. SV-DN-06..10 the rest: allergies before a first drug, glucose missing,
 *     re-check vitals after an intervention, core temperature missing (a prompt
 *     is emitted only when the step board does not already carry its engine
 *     action), then every other outstanding action.
 * `top` = the first 3; `rest` = the remainder. Nothing outstanding is dropped.
 */
import type { DoNowItem, StepState } from "@/lib/resus/model";
import type { BoardAction, SurveySignals } from "@/lib/resus/survey/floor";
import type { VitalBandField } from "@/lib/resus/survey/vitals-bands";
import type { AbcdeLetter } from "@/lib/resus/types";

import { orderResusActions } from "@/lib/resus/action-order";
import { GCS_AIRWAY_THRESHOLD } from "@/lib/resus/reference/disability-catalog";
import { passes, VITAL_BAND_RULES } from "@/lib/resus/survey/vitals-bands";
import { ABCDE_LETTERS } from "@/lib/resus/types";

export interface DoNowInput {
  states: readonly StepState[];
  /** Each step's merged, ordered action board (computeSurvey().actions). */
  actions: Readonly<Record<AbcdeLetter, readonly BoardAction[]>>;
  signals: SurveySignals;
  /** The fresh values the rules read (deriveMeasureFindings().values). */
  vitals: Partial<Record<VitalBandField, number>>;
  allergiesRecorded: boolean;
  /** A drug is about to be given for the first time in this episode. */
  firstDrugPending: boolean;
}

const OUTSTANDING = new Set([undefined, "indicated", "in_progress", "failed"]);
const isOutstanding = (a: BoardAction) => OUTSTANDING.has(a.state);

const FIELD_LABEL: Record<VitalBandField, string> = {
  gcs: "GCS",
  rr: "RR",
  spo2: "SpO₂",
  hr: "HR",
  systolicBp: "SBP",
  map: "MAP",
  shockIndex: "SI",
  pulsePressure: "PP",
  glucose: "glucose",
};

/**
 * SV-DN-02: the value at its display precision, with more decimals only when
 * rounding would move it across one of its field's thresholds (MAP 64.67 →
 * "64.7", never "65" beside a MAP < 65 rule). Pulse pressure's rule is a
 * fraction of SBP (the triage flag), not its mmHg value, so it is not checked.
 */
function fmt(field: VitalBandField, v: number): string {
  const base = field === "shockIndex" ? 2 : field === "glucose" ? 1 : 0;
  const rules = field === "pulsePressure" ? [] : VITAL_BAND_RULES.filter((r) => r.field === field);
  let s = String(v);
  for (let d = base; d <= base + 3; d++) {
    const n = Number(v.toFixed(d));
    if (rules.every((r) => passes(n, r.op, r.value) === passes(v, r.op, r.value))) {
      s = v.toFixed(d);
      break;
    }
  }
  return field === "spo2" ? `${s} %` : s;
}

/**
 * SV-DN-02: "because SBP 70, MAP 63" — the recorded values behind the derived
 * codes: only a value that meets its own rule (hypotension by MAP < 65 alone
 * never lists a normal SBP).
 */
export function evidenceLine(
  derivedCodes: readonly string[],
  vitals: Partial<Record<VitalBandField, number>>,
): string | null {
  const parts: string[] = [];
  const seen = new Set<VitalBandField>();
  for (const r of VITAL_BAND_RULES) {
    const v = vitals[r.field];
    if (!derivedCodes.includes(r.code) || v == null || seen.has(r.field)) continue;
    // Pulse pressure: its one rule is the triage fraction flag (see fmt).
    if (r.field !== "pulsePressure" && !passes(v, r.op, r.value)) continue;
    seen.add(r.field);
    parts.push(`${FIELD_LABEL[r.field]} ${fmt(r.field, v)}`);
  }
  return parts.length ? `because ${parts.join(", ")}` : null;
}

function actionItem(a: BoardAction, label = a.label, because = a.rationale || null): DoNowItem {
  return {
    id: `action:${a.step}:${a.code}`,
    kind: "action",
    step: a.step,
    label,
    because,
    rank: 0,
    action: { step: a.step, actionId: a.code, code: a.code, state: a.state ?? "indicated" },
  };
}

function prompt(
  kind: DoNowItem["kind"],
  step: AbcdeLetter | null,
  label: string,
  because: string | null,
): DoNowItem {
  return { id: `${kind}:${step ?? "-"}`, kind, step, label, because, rank: 0 };
}

export function computeDoNow(input: DoNowInput): { top: DoNowItem[]; rest: DoNowItem[] } {
  const { signals, vitals } = input;
  const all = orderResusActions(ABCDE_LETTERS.flatMap((s) => input.actions[s]));
  const find = (step: AbcdeLetter, code: string) =>
    input.actions[step].find((a) => a.code === code && isOutstanding(a) && a.state !== "failed");
  const onBoard = (step: AbcdeLetter, code: string) =>
    input.actions[step].some((a) => a.code === code && isOutstanding(a));
  const used = new Set<BoardAction>();
  const items: DoNowItem[] = [];

  // 1 · failed actions.
  for (const a of all.filter((x) => x.state === "failed")) {
    used.add(a);
    items.push(actionItem(a));
  }

  // 2 · assess a step vitals put under threat.
  for (const s of input.states) {
    if (s.assessed || (!s.fromVitals && s.derivedCodes.length === 0)) continue;
    items.push(prompt("assess", s.step, `Assess ${s.step}`, evidenceLine(s.derivedCodes, vitals)));
  }

  // 4 · returns (built now so they absorb their engine actions from band 3).
  const returns: DoNowItem[] = [];
  const gcsLow = signals.gcsTotal != null && signals.gcsTotal <= GCS_AIRWAY_THRESHOLD;
  if (gcsLow || signals.gcsFalling) {
    const why = [
      gcsLow ? `GCS ${signals.gcsTotal}` : null,
      signals.gcsFalling ? "GCS falling" : null,
    ]
      .filter(Boolean)
      .join(", ");
    const backToA = find("D", "d_back_to_a_airway");
    if (backToA) used.add(backToA);
    returns.push(prompt("return_to_a", "A", "Return to A", `because ${why}`));
  }
  const naloxone = signals.opioid ? find("D", "d_naloxone") : undefined;
  if (naloxone) {
    used.add(naloxone);
    returns.push(actionItem(naloxone, "Naloxone → back to B"));
  }

  // 3 · indicated emergency actions.
  for (const a of all) {
    if (used.has(a) || !a.emergency || (a.state ?? "indicated") !== "indicated") continue;
    used.add(a);
    items.push(actionItem(a));
  }
  items.push(...returns);

  // 5 · system prompts that fill a gap the boards leave, then everything else outstanding.
  if (!input.allergiesRecorded && input.firstDrugPending)
    items.push(prompt("allergies", "E", "Record allergies before the first drug", null));
  if (signals.glucoseMissing && !onBoard("D", "d_check_glucose"))
    items.push(prompt("glucose", "D", "Check glucose", "not yet recorded"));
  if (signals.vitalsStale)
    items.push(
      prompt("vitals_stale", null, "Re-check vitals", "an intervention since the last set"),
    );
  if (signals.coreTempMissing && !onBoard("E", "e_measure_temp"))
    items.push(prompt("core_temp", "E", "Measure core temperature", "not yet recorded"));
  for (const a of all) if (!used.has(a) && isOutstanding(a)) items.push(actionItem(a));

  const ranked = items.map((it, rank) => ({ ...it, rank }));
  return { top: ranked.slice(0, 3), rest: ranked.slice(3) };
}
