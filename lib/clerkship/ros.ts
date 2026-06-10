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
