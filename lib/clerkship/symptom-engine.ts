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

const labels = (p: CapturedPropertyValue | undefined): string =>
  (p?.labels ?? []).join(", ").toLowerCase();
const rawLabels = (p: CapturedPropertyValue | undefined): string => (p?.labels ?? []).join(", ");

// Per-symptom property codes are prefixed (`cp_site`, `dysp_pattern`, …) by 0043;
// the generic codes (`site`, `severity`, …) are unprefixed. Both resolve to the
// same clinical ROLE so the prose reads the same regardless of which catalog row
// produced the value.
const SYMPTOM_PREFIXES = new Set([
  "cp",
  "abdo",
  "ha",
  "dysp",
  "cough",
  "palp",
  "oed",
  "syn",
  "fever",
  "vom",
  "diar",
  "dizz",
  "jaun",
  "haem",
  "wl",
  "fat",
]);

type Role =
  | "character"
  | "onset"
  | "duration"
  | "site"
  | "distribution"
  | "radiation"
  | "severity"
  | "mrc"
  | "timing"
  | "progression"
  | "exacerbating"
  | "relieving"
  | "associated"
  | "redflags"
  | "generic";

function roleOf(p: CapturedPropertyValue): Role {
  const code = p.propertyCode;
  const us = code.indexOf("_");
  const tail = us > 0 && SYMPTOM_PREFIXES.has(code.slice(0, us)) ? code.slice(us + 1) : code;
  switch (tail) {
    case "character":
      return "character";
    case "onset":
      return "onset";
    case "duration":
      return "duration";
    case "site":
      return "site";
    case "distribution":
      return "distribution";
    case "radiation":
      return "radiation";
    case "severity":
      return "severity";
    case "mrc":
      return "mrc";
    case "timing":
    case "pattern":
    case "diurnal":
    case "duration2":
    case "frequency":
      return "timing";
    case "progression":
      return "progression";
    case "exac":
    case "exacerbating":
      return "exacerbating";
    case "reliev":
    case "relieving":
      return "relieving";
    case "assoc":
    case "associated_symptoms":
      return "associated";
    case "redflags":
      return "redflags";
    default:
      return "generic";
  }
}

/** A readable clinical sentence per symptom, composed in a clinical order. */
function proseForSymptom(s: CapturedSymptom): string {
  const pick = (role: Role) => s.properties.find((p) => roleOf(p) === role);

  const character = labels(pick("character"));
  let head = character ? `${character} ${s.symptomDisplay.toLowerCase()}` : s.symptomDisplay;
  head = head.charAt(0).toUpperCase() + head.slice(1);

  const clauses: string[] = [];
  const redFlagClauses: string[] = [];

  const onset = labels(pick("onset"));
  if (onset) clauses.push(`${onset} onset`);

  const dur = pick("duration");
  if (dur?.durationValue != null && dur.durationUnit) {
    clauses.push(`for ${dur.durationValue} ${dur.durationUnit}`);
  }

  const site = labels(pick("site"));
  if (site) clauses.push(`at the ${site}`);

  const distribution = labels(pick("distribution"));
  if (distribution) clauses.push(distribution);

  const radiation = labels(pick("radiation"));
  if (radiation && radiation !== "no radiation") clauses.push(`radiating to ${radiation}`);

  const sev = pick("severity");
  if (sev?.num != null) clauses.push(`severity ${sev.num}/10`);

  const mrc = rawLabels(pick("mrc"));
  if (mrc) clauses.push(mrc);

  // Remaining roles, in property order, so symptom-specific selects read naturally.
  for (const p of s.properties) {
    const role = roleOf(p);
    if (
      [
        "character",
        "onset",
        "duration",
        "site",
        "distribution",
        "radiation",
        "severity",
        "mrc",
      ].includes(role)
    ) {
      continue;
    }
    if (role === "redflags") {
      if (p.labels?.length) redFlagClauses.push(labels(p));
      continue;
    }
    if (p.valueType === "boolean" && p.bool != null) {
      clauses.push(`${p.bool ? "" : "no "}${p.propertyDisplay.toLowerCase()}`);
      continue;
    }
    const value = labels(p);
    if ((p.valueType === "single_select" || p.valueType === "multi_select") && value) {
      if (role === "exacerbating") clauses.push(`worse on ${value}`);
      else if (role === "relieving") clauses.push(`relieved by ${value}`);
      else if (role === "associated") clauses.push(`associated with ${value}`);
      else if (role === "timing" || role === "progression") clauses.push(value);
      else clauses.push(`${p.propertyDisplay.toLowerCase()} ${value}`);
    } else if (p.valueType === "text" && p.text?.trim()) {
      clauses.push(p.text.trim());
    }
  }

  if (s.note?.trim()) clauses.push(s.note.trim());
  // Red flags are safety-critical — render them last, explicitly flagged.
  if (redFlagClauses.length) clauses.push(`red flags: ${redFlagClauses.join(", ")}`);

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
