/**
 * The shared catalogue's seed from an EMHSLU edition (catalogue slice Step 2; ADR 0456). Pure: rows in,
 * proposed medicines out. Nothing here writes, and nothing is a medicine until two curators confirm its
 * proposal (0251). Strength is kept as printed (Law 3); a form or route is mapped only where the printed form
 * names it (`emhslu-form-map.v1.json`), never guessed (Law 5). Every row ends as a proposed medicine or in
 * the report with its reason (S1).
 */
import type { NationalListRow } from "@/lib/pharmacy/national-list";

import formMap from "@/data/pharmacy/catalogue/emhslu-form-map.v1.json";
import names from "@/data/pharmacy/catalogue/names.v1.json";
import { normaliseName } from "@/lib/pharmacy/national-list";

export type ItemKind = "medicine" | "health_supply";

export interface ParsedStrength {
  amount: number;
  unit: string;
  perAmount: number | null;
  perUnit: string | null;
}

export interface SeedIngredient {
  substanceKey: string;
  preferredName: string;
  /** As printed, when it differs from the preferred name (a BAN or former name, a spelling). */
  printedName: string | null;
  /** A printed aside that is not another name for the substance ("with dextrose", "preservative free"). */
  aside: string | null;
  strengthText: string | null;
  parsed: ParsedStrength | null;
}

export interface SeedMedicine {
  key: string;
  displayName: string;
  kind: ItemKind;
  formCode: string | null;
  printedForm: string | null;
  routes: string[];
  issueUnitKind: string | null;
  strengthText: string | null;
  spec: string | null;
  level: string | null;
  ven: "V" | "E" | "N" | null;
  therapeuticClass: string | null;
  flagged: boolean;
  checkNote: string | null;
  ingredients: SeedIngredient[];
  /** The edition's source lines this medicine came from (more than one when rows repeat). */
  lines: number[];
  pages: number[];
  /** What a curator should look at, in words. */
  notes: string[];
}

export interface SeedReport {
  medicines: SeedMedicine[];
  /** Rows that became no medicine, with why. */
  refused: { line: number; reason: string }[];
  /** Rows identical to an earlier row: one medicine, both lines linked. */
  merged: { line: number; into: number }[];
}

type MapEntry = { form: string | null; routes: string[]; issueUnit?: string };
const FORMS = formMap.map as Record<string, MapEntry>;

const PREFERRED = new Map<string, { inn: string }>();
for (const p of names.preferred)
  for (const o of p.others) PREFERRED.set(normaliseName(o[0]!), { inn: p.inn });

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Split at a separator outside parentheses. */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (c === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map(collapse).filter(Boolean);
}

/** "(ritonavir)" → "ritonavir"; "Darunavir (+Ritonavir)" → "Darunavir + Ritonavir". */
const unwrapBooster = (s: string) => s.replace(/\(\s*\+\s*([^)]*)\)/g, "+ $1");
const stripParens = (s: string) => collapse(s.replace(/^\((.*)\)$/, "$1"));

const UNIT = String.raw`(mg|g|mcg|microgram|micrograms|ml|l|iu|units?|%|mmol|mu|meq)`;
const ONE = new RegExp(
  String.raw`^(\d+(?:\.\d+)?)\s*${UNIT}(?:\s*/\s*(\d+(?:\.\d+)?)?\s*(ml|l|g|dose|tablet|vial))?$`,
  "i",
);

/** A search-only parse of one strength part. Null when it does not read cleanly; nothing converts (Law 3). */
export function parseStrength(text: string | null, inheritUnit?: string): ParsedStrength | null {
  if (!text) return null;
  let t = collapse(stripParens(text)).replace(/,/g, "");
  if (inheritUnit && /^\d+(\.\d+)?$/.test(t)) t = `${t} ${inheritUnit}`;
  const m = ONE.exec(t);
  if (!m) return null;
  return {
    amount: Number(m[1]),
    unit: m[2]!.toLowerCase(),
    perAmount: m[4] ? (m[3] ? Number(m[3]) : 1) : null,
    perUnit: m[4]?.toLowerCase() ?? null,
  };
}

const preferredOf = (name: string) => PREFERRED.get(normaliseName(name))?.inn ?? name;

function ingredient(
  printed: string,
  kind: ItemKind,
): Omit<SeedIngredient, "strengthText" | "parsed"> {
  if (kind === "health_supply") {
    const preferredName = collapse(printed);
    return {
      substanceKey: normaliseName(preferredName),
      preferredName,
      printedName: null,
      aside: null,
    };
  }
  // "epinephrine (adrenaline)": the parentheses name the same substance, so they drop. Anything else in
  // parentheses ("with dextrose") is an aside: kept, part of the medicine's identity, and shown to a curator.
  const outside = collapse(printed.replace(/\([^)]*\)/g, " ")) || stripParens(printed);
  const inner = [...printed.matchAll(/\(([^)]*)\)/g)].map((m) => collapse(m[1]!));
  const preferredName = preferredOf(outside.toLowerCase());
  const substanceKey = normaliseName(preferredName);
  const asides = inner.filter((x) => normaliseName(preferredOf(x)) !== substanceKey);
  return {
    substanceKey,
    preferredName,
    printedName: normaliseName(printed) === substanceKey ? null : collapse(printed),
    aside: asides.length && outside ? asides.join("; ") : null,
  };
}

const strengthKey = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, "");

export function seedFromEmhslu(rows: readonly NationalListRow[]): SeedReport {
  const byKey = new Map<string, SeedMedicine>();
  const refused: SeedReport["refused"] = [];
  const merged: SeedReport["merged"] = [];

  for (const r of rows) {
    const kind: ItemKind = r.kind === "supply" ? "health_supply" : "medicine";
    const notes: string[] = [];
    const name = collapse(r.genericName);
    if (normaliseName(name).length < 2) {
      refused.push({
        line: r.line,
        reason: `the name "${r.genericName}" has no letters or digits`,
      });
      continue;
    }

    let parts = [name];
    let strengths: (string | null)[] = [r.strength];
    if (kind === "medicine") {
      const plus = splitTop(unwrapBooster(name), "+").map(stripParens);
      const slash = plus.length === 1 ? splitTop(name, "/") : [];
      parts = plus.length > 1 ? plus : slash.length > 1 ? slash : [name];
      if (parts.length > 1) {
        const sep = plus.length > 1 ? "+" : "/";
        const split = r.strength ? splitTop(unwrapBooster(r.strength), sep).map(stripParens) : [];
        if (split.length === parts.length) strengths = split;
        else {
          strengths = parts.map(() => null);
          notes.push(
            `The strength "${r.strength ?? ""}" does not split across ${parts.length} ingredients; it is kept whole on the medicine.`,
          );
        }
      }
    }
    const lastUnit =
      parts.length > 1 ? parseStrength(strengths[strengths.length - 1] ?? null)?.unit : undefined;
    const ingredients: SeedIngredient[] = parts.map((p, i) => {
      const s = parts.length > 1 ? (strengths[i] ?? null) : kind === "medicine" ? r.strength : null;
      return { ...ingredient(p, kind), strengthText: s, parsed: parseStrength(s, lastUnit) };
    });
    for (const i of ingredients)
      if (i.aside)
        notes.push(`"${i.printedName}" is printed with "${i.aside}": check the ingredients.`);
    const dup = new Set(ingredients.map((i) => i.substanceKey));
    if (dup.size !== ingredients.length) {
      refused.push({
        line: r.line,
        reason: `the same substance is named twice in "${r.genericName}"`,
      });
      continue;
    }

    const printedForm = r.form ? collapse(r.form) : null;
    const mapped =
      kind === "medicine" && printedForm ? FORMS[printedForm.toLowerCase()] : undefined;
    if (kind === "medicine") {
      if (!printedForm) notes.push("No form is printed on the list.");
      else if (!mapped?.form)
        notes.push(`The printed form "${printedForm}" maps to no signed form.`);
      if (!mapped?.routes.length) notes.push("No route is known from the printed form.");
    }
    if (r.checkNote) notes.push(`Flagged on the list: ${r.checkNote}`);

    const formCode = mapped?.form ?? null;
    const key = [
      kind,
      ingredients
        .map(
          (i) =>
            `${i.substanceKey}${i.aside ? `(${normaliseName(i.aside)})` : ""}=${strengthKey(i.strengthText)}`,
        )
        .join("+"),
      strengthKey(r.strength),
      formCode ?? `printed:${normaliseName(printedForm ?? "")}`,
      kind === "health_supply" ? normaliseName(r.unit ?? "") : "",
    ].join("|");

    const existing = byKey.get(key);
    if (existing) {
      // The same medicine under another section of the list: one medicine, every row linked. Level, VEN and
      // class are the row's own; the medicine keeps one only where all its rows agree.
      existing.lines.push(r.line);
      if (r.sourcePage && !existing.pages.includes(r.sourcePage)) existing.pages.push(r.sourcePage);
      merged.push({ line: r.line, into: existing.lines[0]! });
      const disagree: string[] = [];
      if (existing.level !== r.levelOfCare && existing.level !== null)
        disagree.push("level of care");
      if (existing.ven !== r.venClass && existing.ven !== null) disagree.push("VEN");
      if (existing.therapeuticClass !== r.therapeuticClass) existing.therapeuticClass = null;
      if (disagree.length) {
        existing.level = existing.level === r.levelOfCare ? existing.level : null;
        existing.ven = existing.ven === r.venClass ? existing.ven : null;
        existing.notes.push(
          `Listed again at line ${r.line} with a different ${disagree.join(" and ")}; see each row.`,
        );
      }
      if (r.checkNote) {
        existing.flagged = true;
        existing.checkNote ??= r.checkNote;
        existing.notes.push(`Flagged on the list at line ${r.line}: ${r.checkNote}`);
      }
      continue;
    }
    const display = [
      ingredients.map((i) => cap(i.preferredName) + (i.aside ? ` (${i.aside})` : "")).join(" + "),
      kind === "medicine" ? r.strength : null,
      kind === "medicine" ? (printedForm?.toLowerCase() ?? null) : r.unit,
    ]
      .filter(Boolean)
      .join(" ");
    byKey.set(key, {
      key,
      displayName: collapse(display).slice(0, 300),
      kind,
      formCode,
      printedForm,
      routes: mapped?.routes ?? [],
      issueUnitKind: mapped?.issueUnit ?? null,
      strengthText: r.strength,
      spec: kind === "health_supply" ? r.unit : null,
      level: r.levelOfCare,
      ven: r.venClass,
      therapeuticClass: r.therapeuticClass,
      flagged: r.checkNote !== null,
      checkNote: r.checkNote,
      ingredients,
      lines: [r.line],
      pages: r.sourcePage ? [r.sourcePage] : [],
      notes,
    });
  }
  return { medicines: [...byKey.values()], refused, merged };
}
