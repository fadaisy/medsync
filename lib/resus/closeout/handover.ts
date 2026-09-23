import type { AmpleHistory } from "@/lib/resus/exposure";
import type { CareLevel, EpisodePhase, OutcomeCode, Rhythm } from "@/lib/resus/model";
import type { AbcdeLetter } from "@/lib/resus/types";
import type { VitalSnapshot } from "@/lib/resus/vitals";

import { LEVELS_OF_CARE } from "@/lib/resus/reference/levels-of-care";
import { ABCDE_LETTERS } from "@/lib/resus/types";
import { TREND_VITALS } from "@/lib/resus/vitals";

/**
 * SBAR handover draft (docs/clinical/resus-closeout-clinical-catalog.md §1,
 * CO-HO-01..03) — PURE and deterministic: the same input gives the same text.
 * It only restates what the input carries; missing items read "not recorded"
 * rather than being inferred. The leader edits the draft before signing.
 */

export interface HandoverInput {
  patient: { label: string; ageYears: number | null; sex: string | null };
  /** e.g. "Triage Red (rapid)". */
  trigger: string;
  phase: EpisodePhase;
  outcome: OutcomeCode | null;
  /** Treatment-limitation decision summary, if any. */
  treatmentLimitation: string | null;
  ample: AmpleHistory | null;
  weightKg: number | null;
  /** Final A–E states (display labels) with key-finding labels. */
  steps: { step: AbcdeLetter; state: string | null; findings: string[] }[];
  lastVitals: { snapshot: VitalSnapshot; atLabel: string | null; trend: string | null } | null;
  news2: number | null;
  arrest: {
    firstRhythm: Rhythm | null;
    shocks: number;
    /** e.g. "Adrenaline 1 mg IV ×3". */
    drugs: string[];
    timeToRoscMin: number | null;
    totalCprMin: number | null;
    sustained: boolean | null;
  } | null;
  devices: string[];
  outstandingActions: string[];
  /** Post-ROSC bundle targets, as displayed (refValue). */
  targets: string[];
  pendingInvestigations: string[];
  level: { suggested: CareLevel | null; chosen: CareLevel | null };
  escortNeeds: string[];
}

export interface SbarDraft {
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
}

const NR = "not recorded";

const PHASE_LABEL: Record<EpisodePhase, string> = {
  survey: "primary survey",
  arrest: "cardiac arrest",
  post_rosc: "post-ROSC",
  boarding: "boarding",
};

const OUTCOME_LABEL: Record<OutcomeCode, string> = {
  stabilised: "stabilised",
  rosc_sustained: "ROSC, sustained",
  rosc_not_sustained: "ROSC, not sustained",
  died_after_cpr: "died after CPR",
  died_cpr_not_attempted: "died, CPR not attempted",
  transferred_out: "transferred out",
};

const RHYTHM_LABEL: Record<Rhythm, string> = {
  vf_pvt: "VF/pVT",
  pea: "PEA",
  asystole: "Asystole",
  organised: "Organised rhythm",
};

const list = (items: readonly string[]) => (items.length > 0 ? items.join("; ") : "none");
const levelLabel = (l: CareLevel | null) => (l ? LEVELS_OF_CARE[l].label : "none");

function vitalsLine(v: VitalSnapshot): string {
  const parts: string[] = TREND_VITALS.flatMap(({ key, label, unit }) => {
    const n = v[key];
    return typeof n === "number" ? [`${label} ${n} ${unit}`] : [];
  });
  if (v.consciousness) parts.push(`ACVPU ${v.consciousness}`);
  if (v.oxygen) parts.push(v.oxygen === "oxygen" ? "on O₂" : "on air");
  return parts.length > 0 ? parts.join(" · ") : NR;
}

function situation(i: HandoverInput): string {
  const who = [
    i.patient.label,
    i.patient.ageYears !== null ? `${i.patient.ageYears} y` : null,
    i.patient.sex,
  ].filter((s): s is string => !!s);
  const lines = [
    `${who.join(", ")}.`,
    `Trigger: ${i.trigger}.`,
    `Mode: ${PHASE_LABEL[i.phase]}${i.outcome ? `; outcome: ${OUTCOME_LABEL[i.outcome]}` : ""}.`,
  ];
  if (i.treatmentLimitation) lines.push(`Treatment limitation: ${i.treatmentLimitation}.`);
  return lines.join("\n");
}

function background(i: HandoverInput): string {
  const a = i.ample;
  const lines = [
    `Allergies: ${a && a.allergies.length > 0 ? a.allergies.join(", ") : NR}.`,
    `Medications: ${a?.medications || NR}.`,
    `Past history: ${a?.past || NR}.`,
    `Last meal: ${a?.lastMeal || NR}.`,
    `Events: ${a?.events || NR}.`,
  ];
  if (i.weightKg !== null) lines.push(`Weight: ${i.weightKg} kg.`);
  return lines.join("\n");
}

function assessment(i: HandoverInput): string {
  const lines = ABCDE_LETTERS.map((letter) => {
    const s = i.steps.find((x) => x.step === letter);
    if (!s) return `${letter}: ${NR}.`;
    const f = s.findings.length > 0 ? ` (${s.findings.join(", ")})` : "";
    return `${letter}: ${s.state ?? NR}${f}.`;
  });
  if (i.lastVitals) {
    const at = i.lastVitals.atLabel ? ` at ${i.lastVitals.atLabel}` : "";
    lines.push(`Last vitals${at}: ${vitalsLine(i.lastVitals.snapshot)}.`);
    if (i.lastVitals.trend) lines.push(`Trend: ${i.lastVitals.trend}.`);
  } else lines.push(`Last vitals: ${NR}.`);
  lines.push(`NEWS2: ${i.news2 ?? NR}.`);
  if (i.arrest) {
    const r = i.arrest;
    const parts = [
      `first rhythm ${r.firstRhythm ? RHYTHM_LABEL[r.firstRhythm] : NR}`,
      `shocks ${r.shocks}`,
      `drugs ${list(r.drugs)}`,
      `time to ROSC ${r.timeToRoscMin !== null ? `${r.timeToRoscMin} min` : NR}`,
      `total CPR ${r.totalCprMin !== null ? `${r.totalCprMin} min` : NR}`,
      `ROSC ${r.sustained === null ? NR : r.sustained ? "sustained" : "not sustained"}`,
    ];
    lines.push(`Arrest: ${parts.join(", ")}.`);
  }
  lines.push(`Lines, tubes, devices: ${list(i.devices)}.`);
  return lines.join("\n");
}

function recommendation(i: HandoverInput): string {
  return [
    `Outstanding actions: ${list(i.outstandingActions)}.`,
    `Targets: ${list(i.targets)}.`,
    `Pending investigations: ${list(i.pendingInvestigations)}.`,
    `Level of care: suggested ${levelLabel(i.level.suggested)}; chosen ${levelLabel(i.level.chosen)}.`,
    `Escort: ${list(i.escortNeeds)}.`,
  ].join("\n");
}

/** CO-HO-01..03: the deterministic SBAR draft. */
export function buildSbar(input: HandoverInput): SbarDraft {
  return {
    situation: situation(input),
    background: background(input),
    assessment: assessment(input),
    recommendation: recommendation(input),
  };
}
