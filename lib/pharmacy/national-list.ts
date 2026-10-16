/**
 * The national list import, dry run (Pharmacy Phase 1, CT-3, roadmap D-PH-03). Pure.
 *
 * Reads the edition as CSV (columns: generic_name, form, strength, level_of_care, ven_class,
 * therapeutic_class; header row required) and proposes, for each row, the one prescribing-list
 * medicine whose generic name matches it exactly after normalising case, spaces and punctuation.
 * A proposal is never a link: a person confirms every link (Nothing is matched by guess). The
 * prescribing list carries no strength (Step 0, Q6), so strength is never compared and every
 * proposal says so.
 *
 * Optional columns (0136, ADR 0282) carry what the edition prints beside the six: kind (medicine or
 * supply), list_section, unit, specialist, source_page and check_note (why a row was not read with
 * confidence). A missing optional column reads as the old six-column file did: a medicine, unflagged.
 */

export interface NationalListRow {
  line: number;
  genericName: string;
  form: string | null;
  strength: string | null;
  levelOfCare: string | null;
  venClass: "V" | "E" | "N" | null;
  therapeuticClass: string | null;
  kind: "medicine" | "supply";
  listSection: string | null;
  unit: string | null;
  specialist: boolean;
  sourcePage: number | null;
  checkNote: string | null;
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
  const at = (r: string[], c: string) => {
    const i = cols.indexOf(c);
    return i < 0 ? null : r[i]?.trim() || null;
  };
  const rows: NationalListRow[] = [];
  const rejected: MatchReport["rejected"] = [];
  body.forEach((r, i) => {
    const line = i + 2;
    const genericName = at(r, "generic_name");
    const ven = at(r, "ven_class")?.toUpperCase() ?? null;
    if (!genericName) return void rejected.push({ line, reason: "no generic name" });
    if (ven && !["V", "E", "N"].includes(ven))
      return void rejected.push({ line, reason: `class "${ven}" is not V, E or N` });
    const kind = at(r, "kind") ?? "medicine";
    if (kind !== "medicine" && kind !== "supply")
      return void rejected.push({ line, reason: `kind "${kind}" is not medicine or supply` });
    const specialist = at(r, "specialist")?.toLowerCase() ?? "false";
    if (specialist !== "true" && specialist !== "false")
      return void rejected.push({
        line,
        reason: `specialist "${specialist}" is not true or false`,
      });
    const page = at(r, "source_page");
    if (page !== null && !/^[1-9]\d*$/.test(page))
      return void rejected.push({ line, reason: `source page "${page}" is not a page number` });
    rows.push({
      line,
      genericName,
      form: at(r, "form"),
      strength: at(r, "strength"),
      levelOfCare: at(r, "level_of_care"),
      venClass: ven as NationalListRow["venClass"],
      therapeuticClass: at(r, "therapeutic_class"),
      kind,
      listSection: at(r, "list_section"),
      unit: at(r, "unit"),
      specialist: specialist === "true",
      sourcePage: page === null ? null : Number(page),
      checkNote: at(r, "check_note"),
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
    if (row.kind !== "medicine") continue;
    const ids = byName.get(normaliseName(row.genericName)) ?? [];
    if (ids.length === 1) report.proposed.push({ row, medicineId: ids[0]! });
    else if (ids.length > 1) report.ambiguous.push({ row, medicineIds: ids });
    else report.unmatched.push(row);
  }
  return report;
}

/** A loaded row as the CSO's console reads it (0136). */
export interface LoadedRow {
  id: string;
  genericName: string;
  form: string | null;
  strength: string | null;
  levelOfCare: string | null;
  venClass: string | null;
  kind: "medicine" | "supply";
  specialist: boolean;
  sourcePage: number | null;
  checkNote: string | null;
  /** A person recorded checking the flagged row against the source. */
  checked: boolean;
}

export interface LinkProposal {
  medicineId: string;
  generic: string;
  /** The row this medicine is linked to in the edition, if any. */
  linkedRowId: string | null;
  /** Medicine rows of the edition whose generic name matches, in edition order. */
  candidates: (LoadedRow & { linkable: boolean })[];
}

/**
 * CT-3, ADR 0282: for each prescribing-list medicine, the edition's medicine rows with the same generic
 * name (case, spaces and punctuation ignored). A proposal is never a link: the CSO confirms one row per
 * medicine. A flagged row is not linkable until it is checked; a supply row is never a candidate.
 */
export function linkProposals(
  rows: readonly LoadedRow[],
  catalogue: readonly CatalogueMedicine[],
  links: readonly { medicineId: string; rowId: string }[],
): LinkProposal[] {
  const byName = new Map<string, LoadedRow[]>();
  for (const r of rows) {
    if (r.kind !== "medicine") continue;
    const k = normaliseName(r.genericName);
    byName.set(k, [...(byName.get(k) ?? []), r]);
  }
  const linked = new Map(links.map((l) => [l.medicineId, l.rowId]));
  return catalogue.flatMap((m) => {
    const candidates = byName.get(normaliseName(m.generic)) ?? [];
    if (!candidates.length) return [];
    return [
      {
        medicineId: m.id,
        generic: m.generic,
        linkedRowId: linked.get(m.id) ?? null,
        candidates: candidates.map((c) => ({ ...c, linkable: !c.checkNote || c.checked })),
      },
    ];
  });
}

/** The proposals a batch confirm may take: unlinked, exactly one candidate, and that one linkable. */
export const singleCandidate = (ps: readonly LinkProposal[]) =>
  ps.filter((p) => !p.linkedRowId && p.candidates.length === 1 && p.candidates[0]!.linkable);
