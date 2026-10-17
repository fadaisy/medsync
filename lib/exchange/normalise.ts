/**
 * The one normaliser for comparing what a report says with what the record says (gate-a-proposal §6; RB-2,
 * MA-1). Exact after normalisation: no phonetic, fuzzy or "closest" matching (Law 4).
 */
import type { CheckOutcome } from "@/lib/exchange/types";

/** Name: NFKC, case-folded, punctuation dropped, spaces collapsed, tokens sorted ("TWELVE, Fixture" = "Fixture Twelve"). */
export function normaliseName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tokens = raw
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  return tokens.length ? tokens.join(" ") : null;
}

/** An identifier (form, accession, lab or hospital number): trimmed, upper case, spaces and hyphens removed. */
export function normaliseId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
  return v || null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date as `YYYY-MM-DD`, from `YYYY-MM-DD`, `YYYYMMDD`, `DD/MM/YYYY` (Ugandan order) or `DD MMM YYYY`.
 * Anything else, or an impossible date, is null: it cannot be compared, and is never guessed.
 */
export function normaliseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let y: number, m: number, d: number;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(s))) [y, m, d] = [+r[1]!, +r[2]!, +r[3]!];
  else if ((r = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) [y, m, d] = [+r[1]!, +r[2]!, +r[3]!];
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [d, m, y] = [+r[1]!, +r[2]!, +r[3]!];
  else if ((r = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(s))) {
    const i = MONTHS.indexOf(r[2]!.toLowerCase());
    if (i < 0) return null;
    [d, m, y] = [+r[1]!, i + 1, +r[3]!];
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** One check, in words: same, differs, or cannot compare (either side missing or unreadable). */
export function compare(a: string | null, b: string | null): CheckOutcome {
  if (a === null || b === null) return "cannot_compare";
  return a === b ? "same" : "differs";
}
