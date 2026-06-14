import type { BpStandard } from "@/lib/clerkship/exam/bp";
import type { ExamObservation, RecordedVitals } from "@/lib/clerkship/exam/types";
import type { AdultVitals } from "@/lib/triage/types";

import { bpCategory } from "@/lib/clerkship/exam/bp";
import { gcsTotal } from "@/lib/clerkship/exam/types";
import { scoreNews2 } from "@/lib/triage/scoring/news2";

/**
 * Assessment / Synthesis engine — the clerkship's convergence (GATE A-signed
 * assembly rule). PURE assembly of what is ALREADY captured + flagged abnormal,
 * in clinical order STARTING FROM THE VITALS:
 *
 *   vitals (NEWS2 ≥1 / single-param-3 + the BP hypertension category + glucose +
 *   GCS) → examination (positives + the matchXPatterns clusters) → ROS positives
 *   → relevant background.
 *
 * Decision-support, never autonomous: this ASSEMBLES and PROPOSES (the problem
 * representation + the vitals-first proposed problem list); the clinician
 * decides, edits and commits. It never invents a finding — empty input
 * assembles nothing. Not-examined is never summarised as normal (only recorded
 * positives/flags enter). Reuses the existing engines (NEWS2 scorer, the BP
 * reference categories, the exam cluster engines) — no duplicate thresholds.
 */

/* ── Problem-list eligibility (CSO-signed, strict / Option A) ──────────────────
   A captured exam FIELD is not a problem; a problem candidate is a flagged
   significant abnormality. From a finding's recorded state we keep ONLY genuine
   positives, collapse a finding + its value chips into ONE line (never one line
   per chip), and drop descriptive/normal context. (Vitals, diagnoses + background
   are handled on their own terms; cluster patterns come in as positives already.) */

/** General-exam SELECT fields that are descriptive context, never problems —
 *  per the CSO eligibility rule (consciousness is covered by the GCS vital). */
const DESCRIPTIVE_SELECTS = new Set([
  "wellbeing",
  "distress",
  "habitus",
  "consciousness",
  "position",
]);

/** Select values that are not, in themselves, a positive finding. */
const NORMAL_SELECT = new Set([
  "well",
  "none",
  "normal",
  "not raised",
  "central",
  "present",
  "warm",
  "≤2 s",
  "well-hydrated",
  "symmetrical",
]);

/**
 * Significant positive findings from an exam's recorded observations — the
 * eligibility filter for problem candidates. Keeps a finding ONLY if it is
 * present AND a genuine positive (a panel present, or a select on a pathological
 * value), excluding descriptive selects and selects on a normal value. Each kept
 * finding becomes a SINGLE line carrying its values ("Nails — clubbing,
 * koilonychia"); never split per value chip. not-examined / absent are dropped
 * (honest: absence here is "no significant abnormality", never invented).
 */
export function significantFindings(obs: ExamObservation[]): string[] {
  const out: string[] = [];
  for (const o of obs) {
    if (o.state !== "present") continue;
    if (DESCRIPTIVE_SELECTS.has(o.code)) continue;
    const values = o.values ?? [];
    if (values.length && values.every((v) => NORMAL_SELECT.has(v))) continue;
    out.push(values.length ? `${o.display} — ${values.join(", ")}` : o.display);
  }
  return out;
}

export type AbnormalSource = "vitals" | "examination" | "ros" | "background";
export type AbnormalSeverity = "borderline" | "critical" | "info";

export interface AbnormalItem {
  source: AbnormalSource;
  /** The finding as captured, with its value (e.g. "SpO₂ 88%", "BP 152/94"). */
  label: string;
  /** Why it's flagged / where it came from (provenance). */
  detail?: string;
  severity: AbnormalSeverity;
  mustNotMiss?: boolean;
}

/** RecordedVitals → the NEWS2 scorer's shape (same mapping the vitals panel uses). */
export function recordedToAdult(v: RecordedVitals): AdultVitals {
  const t = gcsTotal(v);
  return {
    respiratoryRate: v.rr ?? null,
    spo2: v.spo2 ?? null,
    spo2Scale: "scale1",
    oxygen: "air",
    systolicBp: v.sbp ?? null,
    pulse: v.hr ?? null,
    consciousness: t == null ? null : t >= 15 ? "A" : "V",
    temperature: v.tempC ?? null,
  };
}

const NEWS2_LABEL: Record<string, (v: RecordedVitals) => string> = {
  respiratory_rate: (v) => `RR ${v.rr}`,
  spo2: (v) => `SpO₂ ${v.spo2}%`,
  pulse: (v) => `HR ${v.hr}`,
  temperature: (v) => `T ${v.tempC}°C`,
};

/**
 * The abnormal-vitals rule (CSO-ratified): NEWS2 parameter points ≥1 (excluding
 * BP + consciousness, handled below on their own clinical terms), the BP
 * HYPERTENSION category (≥ grade/stage 1, or hypotension) by the selected
 * standard, out-of-range glucose, and a reduced GCS (critical ≤8).
 */
export function abnormalVitals(v: RecordedVitals, bpStandard: BpStandard): AbnormalItem[] {
  const items: AbnormalItem[] = [];
  const recorded = Object.values(v).some((x) => x !== undefined && x !== "");
  if (!recorded) return items;

  for (const p of scoreNews2(recordedToAdult(v)).parameters) {
    if (!p.present || p.points < 1) continue;
    const toLabel = NEWS2_LABEL[p.parameter];
    if (!toLabel) continue; // BP via the hypertension category; GCS below.
    items.push({
      source: "vitals",
      label: toLabel(v),
      detail: `NEWS2 +${p.points}`,
      severity: p.points >= 3 ? "critical" : "borderline",
    });
  }

  const bp = bpCategory(v.sbp, v.dbp, bpStandard);
  if (bp && bp.severity !== "normal" && bp.severity !== "elevated") {
    items.push({
      source: "vitals",
      label: `BP ${v.sbp ?? "?"}/${v.dbp ?? "?"}`,
      detail: bp.label,
      severity: bp.severity === "severe" || bp.severity === "low" ? "critical" : "borderline",
    });
  }

  if (v.glucose != null && (v.glucose < 4 || v.glucose > 11)) {
    items.push({
      source: "vitals",
      label: `Glucose ${v.glucose} mmol/L`,
      detail: v.glucose < 4 ? "hypoglycaemia" : "hyperglycaemia",
      severity: v.glucose < 3 ? "critical" : "borderline",
    });
  }

  const gcs = gcsTotal(v);
  if (gcs != null && gcs < 15) {
    items.push({
      source: "vitals",
      label: `GCS ${gcs}/15`,
      detail: `E${v.gcsE ?? "?"}V${v.gcsV ?? "?"}M${v.gcsM ?? "?"}`,
      severity: gcs <= 8 ? "critical" : "borderline",
      mustNotMiss: gcs <= 8,
    });
  }

  return items;
}

export interface ExamAbnormalInput {
  /** The system display (e.g. "Respiratory"). */
  system: string;
  /** Recorded positive findings (the exam engines' reasoning positives). */
  positives: string[];
  /** Cluster patterns the exam engine matched (decision-support). */
  patterns: { label: string; mustNotMiss?: boolean; emergency?: boolean }[];
}

export interface RosPositiveInput {
  symptomDisplay: string;
  system: string;
}

export interface AssembleInput {
  vitals: RecordedVitals;
  bpStandard: BpStandard;
  exam: ExamAbnormalInput[];
  rosPositives: RosPositiveInput[];
  /** Active background conditions (PMH displays). */
  background: string[];
}

/** The vitals-up assembly: vitals → examination → ROS → background. */
export function assembleAbnormal(input: AssembleInput): AbnormalItem[] {
  const items: AbnormalItem[] = [...abnormalVitals(input.vitals, input.bpStandard)];

  for (const ex of input.exam) {
    for (const f of ex.positives) {
      items.push({ source: "examination", label: f, detail: ex.system, severity: "info" });
    }
    for (const p of ex.patterns) {
      items.push({
        source: "examination",
        label: p.label,
        detail: `${ex.system} pattern`,
        severity: p.emergency ? "critical" : "info",
        mustNotMiss: p.mustNotMiss || p.emergency,
      });
    }
  }

  for (const r of input.rosPositives) {
    items.push({ source: "ros", label: r.symptomDisplay, detail: r.system, severity: "info" });
  }

  for (const b of input.background) {
    items.push({ source: "background", label: b, severity: "info" });
  }

  return items;
}

const join = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/**
 * The problem representation — ONE flowing paragraph, vitals-up, assembled from
 * the captured abnormals (never authored from memory). The clinician refines it;
 * it never invents a finding.
 */
export function renderProblemRepresentation(items: AbnormalItem[]): string {
  if (!items.length) return "";
  const by = (s: AbnormalSource) => items.filter((i) => i.source === s);
  const parts: string[] = [];

  const vit = by("vitals");
  if (vit.length)
    parts.push(`Acutely, ${join(vit.map((i) => `${i.label}${i.detail ? ` (${i.detail})` : ""}`))}`);

  const exam = by("examination");
  if (exam.length)
    parts.push(`on examination there is ${join(exam.map((i) => i.label.toLowerCase()))}`);

  const ros = by("ros");
  if (ros.length) parts.push(`the patient reports ${join(ros.map((i) => i.label.toLowerCase()))}`);

  const bg = by("background");
  if (bg.length) parts.push(`on a background of ${join(bg.map((i) => i.label))}`);

  return parts.join("; ") + ".";
}

/* ── The proposed problem list (vitals-first; the doctor confirms) ── */

export type ProblemKind = "vital" | "diagnosis" | "finding" | "background";

export interface ProposedProblem {
  item: string;
  kind: ProblemKind;
  /** Where this proposal came from (auditable). */
  provenance: string;
  mustNotMiss?: boolean;
}

/**
 * Vitals-first proposal: abnormal vitals as FIRST-CLASS problems (until a
 * diagnosis subsumes them) → the clinician's working diagnoses → abnormal
 * findings not yet explained → active background. De-duplicated case-
 * insensitively (a finding already carried as a diagnosis is not repeated).
 * PROPOSED only — the clinician confirms/edits/merges/removes.
 */
export function proposeProblems(
  items: AbnormalItem[],
  workingDx: { text: string }[],
): ProposedProblem[] {
  const out: ProposedProblem[] = [];
  const seen = new Set<string>();
  const push = (p: ProposedProblem) => {
    const k = p.item.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(p);
  };

  for (const i of items.filter((x) => x.source === "vitals")) {
    push({
      item: i.detail && i.severity !== "critical" ? `${i.label} — ${i.detail}` : i.label,
      kind: "vital",
      provenance: `vitals${i.detail ? ` · ${i.detail}` : ""}`,
      mustNotMiss: i.mustNotMiss,
    });
  }

  for (const d of workingDx) {
    push({ item: d.text.trim(), kind: "diagnosis", provenance: "working diagnosis" });
  }

  for (const i of items.filter((x) => x.source === "examination" || x.source === "ros")) {
    push({
      item: i.label,
      kind: "finding",
      provenance: i.detail ?? i.source,
      mustNotMiss: i.mustNotMiss,
    });
  }

  for (const i of items.filter((x) => x.source === "background")) {
    push({ item: i.label, kind: "background", provenance: "active PMH" });
  }

  return out;
}
