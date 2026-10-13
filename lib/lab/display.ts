/**
 * One result line (Lab Phase 2 §6.15, rules DP-1 to DP-3; ADR 0252). Pure. Lanes, reports, prints and the
 * NCD feed format a value the same way: value and unit, the flag or the scheme's category in words, the
 * bedside tag, the basis line and the previous comparable value. Lab-only rows never reach it for a
 * clinician (DP-2): the caller filters them before formatting.
 */
import type { Interpretation } from "@/lib/lab/interpretation";

import { LAB2 } from "@/content/lab-phase-2";
import { formatResult } from "@/lib/lab/catalogue";

export interface LineInput {
  value: string;
  unitDisplay: string;
  decimalPlaces: number | null;
  interpretation: Interpretation | null;
  bedside: boolean;
  method: string | null;
  previous: { value: string; unitDisplay: string; method: string | null; on: string } | null;
}

const FLAG_WORDS = { low: "Low", high: "High", normal: "In range" } as const;
const ARROW = { low: "↓", high: "↑", normal: "" } as const;

export interface Line {
  value: string;
  /** The flag ("↑ High") or the category ("↑ Moderate anaemia"); always words, an arrow when abnormal. */
  flag: string | null;
  abnormal: boolean;
  bedside: string | null;
  basis: string | null;
  notes: string[];
  previous: string | null;
}

const band = (r: Interpretation["reference"]) =>
  r ? `${r.low ?? ""} – ${r.high ?? ""}`.trim() : "no reference interval";

export function formatLine(i: LineInput): Line {
  const t = i.interpretation;
  let flag: string | null = null;
  let abnormal = false;
  if (t?.category) {
    abnormal = t.category.abnormal;
    const arrow = t.category.direction ? `${ARROW[t.category.direction]} ` : "";
    flag = `${arrow}${t.category.label}`; // the category's own words (Law 11)
  } else if (t?.flag) {
    abnormal = t.flag !== "normal";
    flag = `${ARROW[t.flag]} ${FLAG_WORDS[t.flag]}`.trim();
  }
  const notes: string[] = [];
  if (t?.notes.includes("pregnancy_not_recorded")) notes.push(LAB2.basis.pregnancyNotRecorded);
  if (t?.notes.includes("altitude_not_adjusted")) notes.push(LAB2.basis.altitudeNotAdjusted);
  if (t?.fallback) notes.push(LAB2.basis.fallback(t.fallback.replaceAll("_", " ")));
  // DP-3: the previous value only when unit and method match.
  const previous = i.previous
    ? i.previous.unitDisplay === i.unitDisplay && i.previous.method === i.method
      ? `${i.previous.value} ${i.previous.unitDisplay} on ${i.previous.on}`
      : "previous result not comparable"
    : null;
  return {
    value: `${formatResult(i.value, i.decimalPlaces)} ${i.unitDisplay}`,
    flag,
    abnormal,
    bedside: i.bedside ? LAB2.bedside.tag : null,
    basis:
      t?.basis === "scheme" && t.scheme
        ? LAB2.basis.scheme(flag ?? "This result", t.scheme.label, band(t.reference))
        : null,
    notes,
    previous,
  };
}
