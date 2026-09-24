/**
 * Resus Desk v2 — progressive disclosure of a step's findings (GATE A §3).
 * PURE, presentation only: it decides where each signed code shows, never
 * whether it can be recorded.
 *
 * SV-DIS-01 overall = the step's state (patency) codes.
 * SV-DIS-02 key = the ≤ 8 signed key signs.
 * SV-DIS-03 promoted = codes whose context flag is on, round-robin across the
 *           active flags (each active flag leads with its first code), capped at
 *           the step's cap (4; D 2); a key sign is never promoted twice.
 * SV-DIS-04 more = every other catalog code, by group (look/listen/feel/measure/results).
 * SV-DIS-05 a selected code is always visible: one outside key/promoted moves
 *           from `more` into `selectedExtra` (shown after the promoted row) —
 *           it is never in both, so a chip renders once.
 * SV-DIS-06 search: case-insensitive substring over the catalog label and the
 *           synonym terms (synonyms are search-only, never displayed).
 * SV-DIS-07 derived = the step's vitals-derived (Q13) codes ("From vitals").
 */
import type { PatientContextFlags } from "@/lib/resus/model";
import type { FindingGroup } from "@/lib/resus/reference/presentation";
import type { AbcdeLetter } from "@/lib/resus/types";

import {
  FINDING_GROUPS,
  SEARCH_SYNONYMS,
  STEP_PRESENTATION,
} from "@/lib/resus/reference/presentation";

export interface VisibleFindings {
  overall: string[];
  key: string[];
  promoted: string[];
  more: Record<FindingGroup, string[]>;
  /** Selected codes that would otherwise sit under More (or are not in the catalog). */
  selectedExtra: string[];
  matches: string[];
  derived: string[];
}

/** SV-DIS-03: the promoted codes for the current flags (round-robin, capped). */
export function promotedCodes(step: AbcdeLetter, flags: PatientContextFlags): string[] {
  const p = STEP_PRESENTATION[step];
  const lists = p.promotions.filter((pr) => pr.when(flags)).map((pr) => pr.codes);
  const key = new Set(p.key);
  const out: string[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest && out.length < p.promotionCap; i++) {
    for (const list of lists) {
      const code = list[i];
      if (code && !key.has(code) && !out.includes(code) && out.length < p.promotionCap)
        out.push(code);
    }
  }
  return out;
}

/** SV-DIS-06: the step's codes matching a query (label or synonym term). */
export function searchFindings(step: AbcdeLetter, query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const bySynonym = new Set(
    Object.entries(SEARCH_SYNONYMS)
      .filter(([term]) => term.includes(q))
      .flatMap(([, codes]) => codes),
  );
  return STEP_PRESENTATION[step].findings
    .filter((f) => f.label.toLowerCase().includes(q) || bySynonym.has(f.code))
    .map((f) => f.code);
}

export function visibleFindings(
  step: AbcdeLetter,
  opts: { flags: PatientContextFlags; selected: readonly string[]; query?: string },
): VisibleFindings {
  const p = STEP_PRESENTATION[step];
  const promoted = promotedCodes(step, opts.flags);
  const shown = new Set([...p.overall, ...p.key, ...promoted]);
  const selectedExtra = [...new Set(opts.selected)].filter((c) => !shown.has(c));
  const extra = new Set(selectedExtra);

  const more = Object.fromEntries(FINDING_GROUPS.map((g) => [g, [] as string[]])) as Record<
    FindingGroup,
    string[]
  >;
  for (const f of p.findings) {
    if (!shown.has(f.code) && !extra.has(f.code)) more[f.group].push(f.code);
  }

  return {
    overall: [...p.overall],
    key: [...p.key],
    promoted,
    more,
    selectedExtra,
    matches: searchFindings(step, opts.query ?? ""),
    derived: [...p.derived],
  };
}
