import type { ArrestContext, CauseKey, CauseState, CauseTile } from "@/lib/resus/model";
import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";

import { classifyAirway, latestAirwayAssessment } from "@/lib/resus/airway";
import { classifyBreathing, latestBreathingAssessment } from "@/lib/resus/breathing";
import { identifyShockType, latestCirculationAssessment } from "@/lib/resus/circulation";
import { identifyNeuroSyndrome, latestDisabilityAssessment } from "@/lib/resus/disability";
import {
  identifyExposureDiagnosis,
  latestExposureAssessment,
  tempStage,
} from "@/lib/resus/exposure";
import { CAUSE_KEYS, CAUSE_STATES } from "@/lib/resus/model";
import {
  BREATHING_STATE_LABEL,
  breathingFindingLabel,
} from "@/lib/resus/reference/breathing-catalog";
import {
  circulationFindingLabel,
  SHOCK_TYPE_LABEL,
} from "@/lib/resus/reference/circulation-catalog";
import { NEURO_SYNDROME_LABEL } from "@/lib/resus/reference/disability-catalog";
import { exposureFindingLabel, TEMP_STAGE_LABEL } from "@/lib/resus/reference/exposure-catalog";
import { artefactFields } from "@/lib/resus/survey/vitals-bands";

/**
 * ALS engine — the 4 Hs & 4 Ts tiles (catalog §6, ALS-RC-01..09). PURE.
 *
 * A tile's state is the latest `decision` {decision: "reversible_cause", cause, state} in the
 * episode. Without one, survey evidence pre-fills "suspected" (the catalog §6 column), read
 * through the signed step engines; nothing is ever auto-marked "excluded". The arrest flags
 * (no signs of life / no pulse) are removed before classifying, so the arrest itself is not
 * read as evidence of a cause. A recorded K⁺ (ALS-RC-03) has no field in the contract yet.
 */

type Evidence = CauseTile["evidence"][number];

const RULE: Record<CauseKey, string> = {
  hypoxia: "ALS-RC-01",
  hypovolaemia: "ALS-RC-02",
  potassium_metabolic: "ALS-RC-03",
  temperature: "ALS-RC-04",
  thrombosis: "ALS-RC-05",
  tension: "ALS-RC-06",
  tamponade: "ALS-RC-07",
  toxins: "ALS-RC-08",
};

const STEP_KEY: Record<AbcdeLetter, string> = {
  A: "airway",
  B: "breathing",
  C: "circulation",
  D: "disability",
  E: "exposure",
};

/** Id of the latest assessment for a step (the same selection the step engines use). */
function latestAssessmentId(tl: readonly TimelineEvent[], step: AbcdeLetter): string | null {
  let best: TimelineEvent | null = null;
  for (const e of tl) {
    if (e.kind !== "assessment" || e.step !== step) continue;
    const p = e.payload[STEP_KEY[step]];
    if (!p || typeof p !== "object") continue;
    if (!best || e.recordedAt > best.recordedAt) best = e;
  }
  return best?.id ?? null;
}

/** Latest vital snapshot value not annotated artefact (SV-VIT-16), with its event id. */
function latestVital(tl: readonly TimelineEvent[], key: string) {
  const artefacts = artefactFields(tl);
  let out: { eventId: string; value: number } | null = null;
  for (const e of tl) {
    if (e.kind !== "vital" || artefacts.has(`${e.id}:${key}`)) continue;
    const v = (e.payload.snapshot as Record<string, unknown> | undefined)?.[key];
    if (typeof v === "number" && Number.isFinite(v)) out = { eventId: e.id, value: v };
  }
  return out;
}

/** Survey + context evidence per cause (catalog §6 "Pre-fills suspected from"). */
function surveyEvidence(
  tl: readonly TimelineEvent[],
  ctx: ArrestContext,
): Record<CauseKey, Evidence[]> {
  const ev = Object.fromEntries(CAUSE_KEYS.map((k) => [k, [] as Evidence[]])) as Record<
    CauseKey,
    Evidence[]
  >;
  const id = (s: AbcdeLetter) => latestAssessmentId(tl, s);
  const contextId = [...tl].reverse().find((e) => e.kind === "context")?.id ?? null;
  const f = ctx.flags;
  const add = (k: CauseKey, eventId: string | null, label: string) =>
    ev[k].push({ eventId, label });

  const a = latestAirwayAssessment(tl);
  if (a) {
    const s = classifyAirway({ ...a, context: { ...a.context, noSignsOfLife: false } });
    if (s === "completely_obstructed") add("hypoxia", id("A"), "A: airway completely obstructed");
    if (s === "apnoeic_ventilate") add("hypoxia", id("A"), "A: apnoeic");
  }
  const b = latestBreathingAssessment(tl);
  if (b) {
    const s = classifyBreathing({ ...b, context: { ...b.context, noSignsOfLife: false } });
    if (s === "failure_decompensating" || s === "peri_arrest" || s === "apnoeic")
      add("hypoxia", id("B"), `B: ${BREATHING_STATE_LABEL[s]}`);
    if (b.present.includes("spo2_lt92"))
      add("hypoxia", id("B"), `B: ${breathingFindingLabel("spo2_lt92")}`);
    if (b.present.includes("trachea_deviated_away"))
      add("tension", id("B"), `B: ${breathingFindingLabel("trachea_deviated_away")}`);
    if (b.present.includes("reduced_breath_sounds") && b.present.includes("hyper_resonant"))
      add("tension", id("B"), "B: reduced breath sounds + hyper-resonant percussion");
  }
  const c = latestCirculationAssessment(tl);
  if (c) {
    const type = identifyShockType({
      ...c,
      present: c.present.filter((p) => p !== "no_pulse"),
      context: { ...c.context, noPulse: false },
    });
    if (type === "hypovolaemic_haemorrhagic" || type === "hypovolaemic_nonhaemorrhagic")
      add("hypovolaemia", id("C"), `C: ${SHOCK_TYPE_LABEL[type]}`);
    const codes: [CauseKey, string[]][] = [
      ["thrombosis", ["ecg_ischaemia", "ecg_pe", "us_rv_strain"]],
      ["tension", ["tracheal_deviation", "unilateral_absent_breath_sounds"]],
      ["tamponade", ["us_tamponade", "muffled_heart_sounds", "raised_jvp", "ecg_tamponade"]],
    ];
    for (const [k, list] of codes)
      for (const code of list)
        if (c.present.includes(code)) add(k, id("C"), `C: ${circulationFindingLabel(code)}`);
  }
  const d = latestDisabilityAssessment(tl);
  const syndrome = d ? identifyNeuroSyndrome(d) : null;
  if (syndrome === "hypoglycaemia")
    add("potassium_metabolic", id("D"), `D: ${NEURO_SYNDROME_LABEL.hypoglycaemia}`);
  if (syndrome === "opioid_toxicity")
    add("toxins", id("D"), `D: ${NEURO_SYNDROME_LABEL.opioid_toxicity}`);
  const glucose = latestVital(tl, "glucose");
  if (
    syndrome !== "hypoglycaemia" &&
    glucose &&
    identifyNeuroSyndrome({
      state: null,
      gcs: null,
      avpu: null,
      glucoseMmol: glucose.value,
      present: [],
      context: {},
    }) === "hypoglycaemia"
  )
    add("potassium_metabolic", glucose.eventId, `Vitals: glucose ${glucose.value} mmol/L`);
  const e = latestExposureAssessment(tl);
  if (e && identifyExposureDiagnosis(e) === "occult_haemorrhage")
    add("hypovolaemia", id("E"), "E: occult / major haemorrhage");
  if (e?.present.includes("transdermal_opioid_patch"))
    add("toxins", id("E"), `E: ${exposureFindingLabel("transdermal_opioid_patch")}`);
  const stage = tempStage(ctx.coreTempC);
  if (stage && stage !== "normal" && stage !== "fever")
    add("temperature", id("E"), `E: core ${ctx.coreTempC} °C — ${TEMP_STAGE_LABEL[stage]}`);

  if (f.trauma) add("hypovolaemia", contextId, "Context: trauma");
  if (f.activeBleeding) add("hypovolaemia", contextId, "Context: active bleeding");
  if (f.renalDialysis) add("potassium_metabolic", contextId, "Context: renal / dialysis");
  if (f.environmentalExposure) add("temperature", contextId, "Context: environmental exposure");
  if (f.peSuspected) add("thrombosis", contextId, "Context: suspected PE");
  if (f.opioidsSuspected) add("toxins", contextId, "Context: opioids suspected");
  if (f.serotonergicOrNeuroleptic) add("toxins", contextId, "Context: serotonergic / neuroleptic");
  return ev;
}

/** Latest recorded state per cause (episode-wide). */
function recordedStates(tl: readonly TimelineEvent[]): Partial<Record<CauseKey, CauseState>> {
  const out: Partial<Record<CauseKey, CauseState>> = {};
  for (const e of tl) {
    const p = e.payload;
    if (e.kind !== "decision" || p.decision !== "reversible_cause") continue;
    const cause = p.cause as CauseKey;
    const state = p.state as CauseState;
    if (CAUSE_KEYS.includes(cause) && CAUSE_STATES.includes(state)) out[cause] = state;
  }
  return out;
}

/**
 * The eight tiles in catalog order. `peHint` is the ALS-RC-09 hint (ETCO₂ < 1.7 kPa with a
 * confirmed tube) — shown on the Thrombosis tile, never a diagnosis. It does NOT pre-fill
 * "suspected": RC-09 also needs adequate minute volume and good compressions, which the
 * record cannot show, so the engine never knows its condition is met (the team marks it).
 */
export function causeTiles(
  tl: readonly TimelineEvent[],
  ctx: ArrestContext,
  peHint: Evidence | null,
): CauseTile[] {
  const evidence = surveyEvidence(tl, ctx);
  const recorded = recordedStates(tl);
  return CAUSE_KEYS.map((key) => ({
    key,
    state: recorded[key] ?? (evidence[key].length > 0 ? "suspected" : "not_assessed"),
    evidence: key === "thrombosis" && peHint ? [...evidence[key], peHint] : evidence[key],
    ruleId: RULE[key],
  }));
}
