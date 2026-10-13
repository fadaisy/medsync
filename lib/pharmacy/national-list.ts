/**
 * The national list import, dry run (Pharmacy Phase 1, CT-3, roadmap D-PH-03). Pure.
 *
 * Reads the edition as CSV (columns: generic_name, form, strength, level_of_care, ven_class,
 * therapeutic_class; header row required) and proposes, for each row, the one prescribing-list
 * medicine whose generic name matches it exactly after normalising case, spaces and punctuation.
 * A proposal is never a link: a person confirms every link (Nothing is matched by guess). The
 * prescribing list carries no strength (Step 0, Q6), so strength is never compared and every
 * proposal says so.
 */

export interface NationalListRow {
  line: number;
  genericName: string;
  form: string | null;
  strength: string | null;
  levelOfCare: string | null;
  venClass: "V" | "E" | "N" | null;
  therapeuticClass: string | null;
}

export interface CatalogueMedicine {
  id: string;
  generic: string;
}

export interface MatchReport {
  rows: number;
  /** Exactly one catalogue medicine has this generic name: a proposal for a person to confirm. */
  proposed: { row: NationalListRow; medicineId: string }[];
  /** More than one catalogue medicine (different ids per fluid strength, for example). */
  ambiguous: { row: NationalListRow; medicineIds: string[] }[];
  unmatched: NationalListRow[];
  /** Lines that could not be read, with why. */
  rejected: { line: number; reason: string }[];
}

const COLUMNS = [
  "generic_name",
  "form",
  "strength",
  "level_of_care",
  "ven_class",
  "therapeutic_class",
] as const;

export const normaliseName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** RFC 4180: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    out.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field !== "" || row.length) endRow();
  return out.filter((r) => r.some((f) => f.trim() !== ""));
}

export function readNationalList(text: string): {
  rows: NationalListRow[];
  rejected: MatchReport["rejected"];
} {
  const [header, ...body] = parseCsv(text);
  const cols = (header ?? []).map((h) => h.trim().toLowerCase());
  const missing = COLUMNS.filter((c) => !cols.includes(c));
  if (missing.length)
    return { rows: [], rejected: [{ line: 1, reason: `missing columns: ${missing.join(", ")}` }] };
  const at = (r: string[], c: (typeof COLUMNS)[number]) => r[cols.indexOf(c)]?.trim() || null;
  const rows: NationalListRow[] = [];
  const rejected: MatchReport["rejected"] = [];
  body.forEach((r, i) => {
    const line = i + 2;
    const genericName = at(r, "generic_name");
    const ven = at(r, "ven_class")?.toUpperCase() ?? null;
    if (!genericName) return void rejected.push({ line, reason: "no generic name" });
    if (ven && !["V", "E", "N"].includes(ven))
      return void rejected.push({ line, reason: `class "${ven}" is not V, E or N` });
    rows.push({
      line,
      genericName,
      form: at(r, "form"),
      strength: at(r, "strength"),
      levelOfCare: at(r, "level_of_care"),
      venClass: ven as NationalListRow["venClass"],
      therapeuticClass: at(r, "therapeutic_class"),
    });
  });
  return { rows, rejected };
}

export function matchNationalList(
  text: string,
  catalogue: readonly CatalogueMedicine[],
): MatchReport {
  const { rows, rejected } = readNationalList(text);
  const byName = new Map<string, string[]>();
  for (const m of catalogue) {
    const k = normaliseName(m.generic);
    byName.set(k, [...(byName.get(k) ?? []), m.id]);
  }
  const report: MatchReport = {
    rows: rows.length,
    proposed: [],
    ambiguous: [],
    unmatched: [],
    rejected,
  };
  for (const row of rows) {
    const ids = byName.get(normaliseName(row.genericName)) ?? [];
    if (ids.length === 1) report.proposed.push({ row, medicineId: ids[0]! });
    else if (ids.length > 1) report.ambiguous.push({ row, medicineIds: ids });
    else report.unmatched.push(row);
  }
  return report;
}
