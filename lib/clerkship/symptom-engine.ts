/**
 * Clerkship symptom-capture — PURE projections of the tap-first selections.
 *
 * The capture UI records, per symptom, a list of tapped property values; this
 * turns them into (a) readable clinical prose for the documentation and (b)
 * flat, queryable observation rows. No fabrication — only tapped values render.
 * Decision-support + structured documentation, not autonomous.
 */

export type PropertyValueType =
  | "single_select"
  | "multi_select"
  | "scale"
  | "duration"
  | "boolean"
  | "text";

export interface CapturedPropertyValue {
  propertyCode: string;
  propertyDisplay: string;
  valueType: PropertyValueType;
  /** Resolved display labels for select types (so prose needs no DB lookup). */
  labels?: string[];
  /** scale */
  num?: number;
  /** duration */
  durationValue?: number;
  durationUnit?: string;
  /** boolean */
  bool?: boolean;
  /** text fallback */
  text?: string;
}

export interface CapturedSymptom {
  /** Catalog code, or `adhoc:<slug>` for a per-encounter symptom. */
  symptomCode: string;
  symptomDisplay: string;
  adHoc?: boolean;
  properties: CapturedPropertyValue[];
  /** Last-resort free-text note for the whole symptom. */
  note?: string;
}

const find = (s: CapturedSymptom, code: string) =>
  s.properties.find((p) => p.propertyCode === code);
const labels = (p: CapturedPropertyValue | undefined): string =>
  (p?.labels ?? []).join(", ").toLowerCase();

/** A readable clinical sentence per symptom, composed in a clinical order. */
function proseForSymptom(s: CapturedSymptom): string {
  const character = labels(find(s, "character"));
  // Lead: "[character] symptom"
  let head = character ? `${character} ${s.symptomDisplay.toLowerCase()}` : s.symptomDisplay;
  head = head.charAt(0).toUpperCase() + head.slice(1);

  const clauses: string[] = [];
  const onset = labels(find(s, "onset"));
  if (onset) clauses.push(`${onset} onset`);

  const dur = find(s, "duration");
  if (dur?.durationValue != null && dur.durationUnit) {
    clauses.push(`for ${dur.durationValue} ${dur.durationUnit}`);
  }

  const site = labels(find(s, "site"));
  if (site) clauses.push(`at the ${site}`);

  const radiation = labels(find(s, "radiation"));
  if (radiation && radiation !== "no radiation") clauses.push(`radiating to ${radiation}`);

  const sev = find(s, "severity");
  if (sev?.num != null) clauses.push(`severity ${sev.num}/10`);

  const timing = labels(find(s, "timing"));
  if (timing) clauses.push(timing);

  const freq = labels(find(s, "frequency"));
  if (freq) clauses.push(freq);

  const progression = labels(find(s, "progression"));
  if (progression) clauses.push(progression);

  const exac = labels(find(s, "exacerbating"));
  if (exac) clauses.push(`worse on ${exac}`);

  const reliev = labels(find(s, "relieving"));
  if (reliev) clauses.push(`relieved by ${reliev}`);

  const assoc = labels(find(s, "associated_symptoms"));
  if (assoc) clauses.push(`associated with ${assoc}`);

  // Booleans + remaining selects (e.g. sputum colour, laterality) + flags.
  for (const p of s.properties) {
    if (
      [
        "character",
        "onset",
        "duration",
        "site",
        "radiation",
        "severity",
        "timing",
        "frequency",
        "progression",
        "exacerbating",
        "relieving",
        "associated_symptoms",
      ].includes(p.propertyCode)
    ) {
      continue;
    }
    if (p.valueType === "boolean" && p.bool != null) {
      clauses.push(`${p.bool ? "" : "no "}${p.propertyDisplay.toLowerCase()}`);
    } else if (
      (p.valueType === "single_select" || p.valueType === "multi_select") &&
      p.labels?.length
    ) {
      clauses.push(`${p.propertyDisplay.toLowerCase()} ${labels(p)}`);
    } else if (p.valueType === "text" && p.text?.trim()) {
      clauses.push(p.text.trim());
    }
  }

  if (s.note?.trim()) clauses.push(s.note.trim());

  return clauses.length ? `${head}, ${clauses.join(", ")}.` : `${head}.`;
}

/** The full HPC prose for a list of captured symptoms. */
export function renderSymptomProse(symptoms: CapturedSymptom[]): string {
  return symptoms.map(proseForSymptom).filter(Boolean).join(" ");
}

export interface SymptomObservationRow {
  symptomCode: string;
  symptomDisplay: string;
  adHoc: boolean;
  propertyCode: string | null;
  propertyDisplay: string | null;
  valueType: string | null;
  valueText: string | null;
  valueNum: number | null;
}

function valueText(p: CapturedPropertyValue): string | null {
  if (p.labels?.length) return p.labels.join(", ");
  if (p.valueType === "duration" && p.durationValue != null) {
    return `${p.durationValue} ${p.durationUnit ?? ""}`.trim();
  }
  if (p.valueType === "boolean" && p.bool != null) return p.bool ? "yes" : "no";
  if (p.valueType === "text" && p.text?.trim()) return p.text.trim();
  return null;
}

/** Flatten a captured symptom to queryable rows: a presence row + one per value. */
export function symptomObservationRows(s: CapturedSymptom): SymptomObservationRow[] {
  const base = {
    symptomCode: s.symptomCode,
    symptomDisplay: s.symptomDisplay,
    adHoc: s.adHoc ?? false,
  };
  const rows: SymptomObservationRow[] = [
    {
      ...base,
      propertyCode: null,
      propertyDisplay: null,
      valueType: null,
      valueText: null,
      valueNum: null,
    },
  ];
  for (const p of s.properties) {
    rows.push({
      ...base,
      propertyCode: p.propertyCode,
      propertyDisplay: p.propertyDisplay,
      valueType: p.valueType,
      valueText: valueText(p),
      valueNum: p.valueType === "scale" && p.num != null ? p.num : null,
    });
  }
  return rows;
}
