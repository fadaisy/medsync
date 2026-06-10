/**
 * Review of Systems (ROS) — PURE projections of the system-grouped screening
 * sweep. Each screening symptom is three-state: present / denies / not-asked.
 * not-asked is the ABSENCE of an observation — only present + denies are stored.
 * Turns the sweep into (a) readable documentation prose and (b) flat, queryable
 * rows with status (so pertinent NEGATIVES are queryable too). No fabrication.
 * Decision-support + structured documentation, not autonomous.
 */

import type { CapturedPropertyValue } from "@/lib/clerkship/symptom-engine";

export type RosStatus = "present" | "denies";

export interface RosObservation {
  symptomCode: string;
  symptomDisplay: string;
  /** Body system key (B1–B12: general, cardiovascular, … ent_eyes). */
  system: string;
  status: RosStatus;
  /** Tap-first property values — only when present (optional on a screen). */
  properties?: CapturedPropertyValue[];
  note?: string;
}

export const ROS_SYSTEM_ORDER = [
  "general",
  "cardiovascular",
  "respiratory",
  "gastrointestinal",
  "genitourinary",
  "neurological",
  "musculoskeletal",
  "endocrine",
  "skin",
  "haematological",
  "psychiatric",
  "ent_eyes",
] as const;

export const ROS_SYSTEM_LABEL: Record<string, string> = {
  general: "General",
  cardiovascular: "Cardiovascular",
  respiratory: "Respiratory",
  gastrointestinal: "Gastrointestinal",
  genitourinary: "Genitourinary",
  neurological: "Neurological",
  musculoskeletal: "Musculoskeletal",
  endocrine: "Endocrine",
  skin: "Skin",
  haematological: "Haematological",
  psychiatric: "Psychiatric",
  ent_eyes: "ENT / Eyes",
};

function propValue(p: CapturedPropertyValue): string | null {
  if (p.labels?.length) return p.labels.join(", ");
  if (p.valueType === "scale" && p.num != null) return `${p.num}/10`;
  if (p.valueType === "duration" && p.durationValue != null) {
    return `${p.durationValue} ${p.durationUnit ?? ""}`.trim();
  }
  if (p.valueType === "boolean" && p.bool != null) {
    return p.bool ? p.propertyDisplay.toLowerCase() : `no ${p.propertyDisplay.toLowerCase()}`;
  }
  if (p.valueType === "text" && p.text?.trim()) return p.text.trim();
  return null;
}

function positivePhrase(o: RosObservation): string {
  const parts = (o.properties ?? []).map(propValue).filter((x): x is string => !!x);
  const detail = parts.length ? ` (${parts.join(", ")})` : "";
  const note = o.note?.trim() ? ` — ${o.note.trim()}` : "";
  return `${o.symptomDisplay.toLowerCase()}${detail}${note}`;
}

/** Readable ROS documentation, grouped by system: positives then pertinent negatives. */
export function renderRosProse(ros: RosObservation[]): string {
  const out: string[] = [];
  for (const sys of ROS_SYSTEM_ORDER) {
    const inSys = ros.filter((o) => o.system === sys);
    if (!inSys.length) continue;
    const pos = inSys.filter((o) => o.status === "present");
    const neg = inSys.filter((o) => o.status === "denies");
    const clauses: string[] = [];
    if (pos.length) clauses.push("reports " + pos.map(positivePhrase).join("; "));
    if (neg.length)
      clauses.push("denies " + neg.map((o) => o.symptomDisplay.toLowerCase()).join(", "));
    if (clauses.length) out.push(`${ROS_SYSTEM_LABEL[sys] ?? sys}: ${clauses.join("; ")}.`);
  }
  return out.join(" ");
}

/**
 * ROS scope (clinician's choice). Complete = screen all non-suppressed systems;
 * focused = only `reviewedSystems`. PC-owned systems are HPC-covered in both.
 */
export interface RosScope {
  mode: "complete" | "focused";
  /** Systems explicitly chosen in focused mode (ignored in complete mode). */
  reviewedSystems: string[];
}

/** Truthful per-system coverage — never imply a system was screened when it wasn't. */
export type RosCoverageState =
  | "findings" // reviewed — ≥1 positive
  | "all_negative" // reviewed — all denials
  | "hpc" // owned by the presenting complaint → covered in the HPC
  | "not_reviewed"; // focused-out or simply not screened — NOT the same as negative

/**
 * Per-system coverage from the observations + PC-owned systems. Coverage is
 * driven by what was actually answered (findings/all-negative) or HPC ownership;
 * anything else is honestly `not_reviewed` (never auto-negative). Pure.
 */
export function rosCoverage(args: {
  observations: RosObservation[];
  pcSystems: string[];
  systems: readonly string[];
}): Record<string, RosCoverageState> {
  const pc = new Set(args.pcSystems);
  const out: Record<string, RosCoverageState> = {};
  for (const sys of args.systems) {
    if (pc.has(sys)) {
      out[sys] = "hpc";
      continue;
    }
    const obs = args.observations.filter((o) => o.system === sys);
    if (obs.some((o) => o.status === "present")) out[sys] = "findings";
    else if (obs.length) out[sys] = "all_negative";
    else out[sys] = "not_reviewed";
  }
  return out;
}

/** The honest ROS documentation: HPC-covered, reviewed findings/negatives, not-reviewed. */
export function renderRosSummary(args: {
  observations: RosObservation[];
  pcSystems: string[];
  scope: RosScope;
  systems?: readonly string[];
}): string {
  const systems = args.systems ?? ROS_SYSTEM_ORDER;
  const cover = rosCoverage({
    observations: args.observations,
    pcSystems: args.pcSystems,
    systems,
  });
  const label = (s: string) => ROS_SYSTEM_LABEL[s] ?? s;
  const parts: string[] = [];

  const hpc = systems.filter((s) => cover[s] === "hpc");
  if (hpc.length) parts.push(`${hpc.map(label).join(", ")}: see History of Presenting Complaint.`);

  const findings = renderRosProse(args.observations); // per-system positives + denials
  if (findings) parts.push(findings);

  const notReviewed = systems.filter((s) => cover[s] === "not_reviewed");
  if (notReviewed.length) {
    const tail = args.scope.mode === "focused" ? " (focused assessment)" : "";
    parts.push(`Not reviewed: ${notReviewed.map(label).join(", ")}${tail}.`);
  }
  return parts.join(" ");
}

export interface RosProgress {
  /** Systems with ≥1 reviewed symptom. */
  reviewed: number;
  total: number;
  positives: number;
}

export function rosProgress(
  ros: RosObservation[],
  totalSystems = ROS_SYSTEM_ORDER.length,
): RosProgress {
  return {
    reviewed: new Set(ros.map((o) => o.system)).size,
    total: totalSystems,
    positives: ros.filter((o) => o.status === "present").length,
  };
}

export interface RosObservationRow {
  symptomCode: string;
  symptomDisplay: string;
  system: string;
  status: RosStatus;
  propertyCode: string | null;
  propertyDisplay: string | null;
  valueType: string | null;
  valueText: string | null;
  valueNum: number | null;
}

/** Flatten the ROS to queryable rows: a status row per symptom + a row per present-property value. */
export function rosObservationRows(ros: RosObservation[]): RosObservationRow[] {
  const rows: RosObservationRow[] = [];
  for (const o of ros) {
    const base = {
      symptomCode: o.symptomCode,
      symptomDisplay: o.symptomDisplay,
      system: o.system,
      status: o.status,
    };
    rows.push({
      ...base,
      propertyCode: null,
      propertyDisplay: null,
      valueType: null,
      valueText: null,
      valueNum: null,
    });
    if (o.status === "present") {
      for (const p of o.properties ?? []) {
        rows.push({
          ...base,
          propertyCode: p.propertyCode,
          propertyDisplay: p.propertyDisplay,
          valueType: p.valueType,
          valueText: propValue(p),
          valueNum: p.valueType === "scale" && p.num != null ? p.num : null,
        });
      }
    }
  }
  return rows;
}
