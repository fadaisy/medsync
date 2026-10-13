import type { SchemePayload } from "@/lib/lab/signed-config";

import { compareDecimal } from "@/lib/lab/catalogue";
import { bandFromDays } from "./ages";

/**
 * Decision cut-offs in words (§5.12, artboard 12). Pure, server and client. Every number shown is the one
 * stored in the scheme: nothing here computes a boundary, it only says one (gestation weeks are days / 7,
 * for display only).
 */

type Row = SchemePayload["rows"][number];
type Bound = Row["bounds"][number];

export const SEX_WORDS: Record<Row["sex"], string> = {
  any: "Any sex",
  female: "Female",
  male: "Male",
};
export const CONTEXT_WORDS: Record<Row["context"], string> = {
  any: "Pregnant or not",
  not_pregnant: "Not pregnant",
  pregnant: "Pregnant",
};
export const METHOD_WORDS: Record<Row["methods"][number], string> = {
  lab: "Lab analysers",
  bedside: "Bedside",
};

const age = (d: number) => {
  const { n, unit } = bandFromDays(d);
  return `${n} ${n === "1" ? unit.slice(0, -1) : unit}`;
};

/** An age span in days, [from, to): the upper end is not included (lib/lab/interpretation.ts pickRow). */
export function ageWords(from: number | null, to: number | null): string {
  const f = from || null;
  if (f === null && to === null) return "Any age";
  if (f === null) return `Under ${age(to!)}`;
  if (to === null) return `${age(f)} and over`;
  return `${age(f)} to under ${age(to)}`;
}

const weeks = (d: number) => {
  const w = Number((d / 7).toFixed(1));
  return `${w} ${w === 1 ? "week" : "weeks"}`;
};
function gestationWords(from: number | null | undefined, to: number | null | undefined) {
  const f = from || null;
  const t = to ?? null;
  if (f === null && t === null) return null;
  if (f === null) return `under ${weeks(t!)} of gestation`;
  if (t === null) return `${weeks(f)} of gestation and over`;
  return `${weeks(f)} to under ${weeks(t)} of gestation`;
}

export function contextWords(r: Row): string {
  if (r.context !== "pregnant") return CONTEXT_WORDS[r.context];
  const g = gestationWords(r.gestationFromDays, r.gestationToDays);
  return g ? `Pregnant, ${g}` : "Pregnant";
}

export const methodsWords = (m: Row["methods"]) => m.map((x) => METHOD_WORDS[x]).join(" and ");

/** One boundary as stored: "below 8.0", "from 8.0 to below 11.0", "11.0 or more". */
export function boundWords(b: Bound): string {
  if (b.from === null && b.to === null) return "Any value";
  if (b.from === null) return b.toInclusive ? `${b.to} or less` : `below ${b.to}`;
  if (b.to === null) return b.fromInclusive ? `${b.from} or more` : `above ${b.from}`;
  return `${b.fromInclusive ? "from" : "above"} ${b.from} to ${b.toInclusive ? "" : "below "}${b.to}`;
}

/** Lowest first, as the sign check reads them. */
export const sortedBounds = (bounds: readonly Bound[]) =>
  [...bounds].sort((a, b) =>
    a.from === null ? -1 : b.from === null ? 1 : compareDecimal(a.from, b.from),
  );

const FIELD: Record<string, string> = {
  label: "the label",
  source: "the source",
  unit: "the unit",
  concept: "the result",
  categories: "the categories",
  rows: "the rows",
  bounds: "the boundaries",
  methods: "where results come from (lab analysers, bedside or both)",
  category: "the category",
  from: "the lower boundary (a number)",
  to: "the upper boundary (a number)",
  elevation: "the elevation adjustment",
};

/** configSignErrors' codes in words. */
export function signErrorWords(code: string): string {
  const row = /^row_(\d+):(.+)$/.exec(code);
  if (row) {
    const n = Number(row[1]) + 1;
    return row[2] === "gap_or_overlap"
      ? `Row ${n}: a gap or an overlap between categories — each category must start exactly where the one below ends, with exactly one side included`
      : `Row ${n}: a boundary names a category that is not in the list`;
  }
  const parts = code.replace(/^payload:/, "").split(".");
  const NTH: Record<string, string> = { rows: "Row", bounds: "boundary", categories: "category" };
  const where = parts.flatMap((p, i) =>
    NTH[p] && /^\d+$/.test(parts[i + 1] ?? "") ? [`${NTH[p]} ${Number(parts[i + 1]) + 1}`] : [],
  );
  const last = [...parts].reverse().find((p) => !/^\d+$/.test(p) && p !== "") ?? "";
  const field = FIELD[last] ?? "a value";
  return where.length
    ? `${where.join(", ")}: check ${field} — it is missing or not valid`
    : `Check ${field} — it is missing or not valid`;
}

/** The parts of [0, ∞) no span covers; spans are [from, to) in days, null meaning open. */
function uncovered(spans: [number | null, number | null][]): [number, number | null][] {
  const sorted = spans
    .map(([f, t]) => [f ?? 0, t] as [number, number | null])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number | null][] = [];
  let reach = 0;
  for (const [f, t] of sorted) {
    if (f > reach) out.push([reach, f]);
    if (t === null) return out;
    reach = Math.max(reach, t);
  }
  out.push([reach, null]);
  return out;
}

/**
 * Who the scheme does not cover: each of these is flagged on the reference interval instead (DS-2's
 * fallback). ponytail: ages are read across all rows, not per sex and method; a scheme whose rows differ
 * by sex in age span shows no gap where one sex has one. Per-combination gaps if schemes ever need it.
 */
export function schemeGaps(s: SchemePayload): string[] {
  const out: string[] = [];
  const ages = uncovered(s.rows.map((r) => [r.ageFromDays, r.ageToDays]));
  if (ages.length)
    out.push(
      `Ages not covered: ${ages.map(([f, t]) => ageWords(f, t).toLowerCase()).join("; ")}. Patients of these ages are flagged on the reference interval.`,
    );
  const sexes = new Set(s.rows.map((r) => r.sex));
  if (!sexes.has("any"))
    for (const sex of ["female", "male"] as const)
      if (!sexes.has(sex))
        out.push(`${SEX_WORDS[sex]} patients: no row. They are flagged on the reference interval.`);
  for (const m of ["lab", "bedside"] as const)
    if (!s.rows.some((r) => r.methods.includes(m)))
      out.push(`${METHOD_WORDS[m]} results: no row. They are flagged on the reference interval.`);
  const ctx = new Set(s.rows.map((r) => r.context));
  if (!ctx.has("any")) {
    if (!ctx.has("pregnant"))
      out.push("Pregnant patients: no row. They are flagged on the reference interval.");
    if (!ctx.has("not_pregnant"))
      out.push(
        "Patients who are not pregnant: no row. They are flagged on the reference interval.",
      );
  }
  const preg = s.rows.filter((r) => r.context === "pregnant");
  if (preg.length) {
    const g = uncovered(preg.map((r) => [r.gestationFromDays ?? null, r.gestationToDays ?? null]));
    if (g.length)
      out.push(
        `Gestation not covered: ${g.map(([f, t]) => gestationWords(f, t)).join("; ")}. These pregnancies are flagged on the reference interval.`,
      );
  }
  return out;
}
