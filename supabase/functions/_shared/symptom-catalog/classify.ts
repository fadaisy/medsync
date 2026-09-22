/**
 * The classifier — a pure interpreter over the content package (PRD
 * MS-PRD-SYM-001 §5.3; ADR 0098 ruling 1). ZERO IMPORTS beyond a type-only
 * `./types.ts` so Deno, Next and Expo run the same function over the same
 * data, offline. No clock, no I/O, no randomness: the same input against
 * the same package gives the same answer for as long as the package exists,
 * which is what makes a stored trace reconstructable (§5.1 principle 6).
 *
 * How it works: each rule is data (R7). The interpreter walks them in
 * order and lets every one VOTE a tier for the items it matched; the answer
 * is the highest vote (R5 is just "every item votes its own tier"). Votes
 * only ever add, so choosing one more item or answering one more escalating
 * qualifier can never lower the tier — the monotonicity invariant the
 * property test hammers (§5.1 principle 2). Free text is never read (R6):
 * the interpreter has no branch that touches it.
 *
 * What comes out is advice to the patient — "get help now" / "be seen
 * today" / "book a visit" — never a triage record. Hospital triage v2
 * re-assesses every arrival (§5.1 principle 4).
 */
import type {
  CatalogItem,
  CatalogPackage,
  Category,
  Classification,
  ItemFlag,
  Rule,
  SubmissionAudience,
  SubmissionInput,
  Tier,
} from "./types.ts";

/** Mirrors `TIER_RANK` — a value import with a `.ts` path fails the app-side typecheck (TS5097). */
const RANK: Record<Tier, number> = { R: 0, U: 1, E: 2 };

const isVisible = (item: CatalogItem, audience: SubmissionAudience): boolean =>
  item.audience.includes("all") || item.audience.includes(audience);

const keysOf = (items: CatalogItem[]): string => items.map((i) => i.key).join(", ");

/** Items this audience may pick, in catalog order (the only order anything ever shows them in). */
export function visibleItems(pkg: CatalogPackage, audience: SubmissionAudience): CatalogItem[] {
  return pkg.items.filter((i) => isVisible(i, audience));
}

/**
 * The grid, in slot order. A child audience sees `child_illness` where an
 * adult sees `skin` (PRD §6.1 slot 12: skin moves into search for children).
 */
export function visibleCategories(pkg: CatalogPackage, audience: SubmissionAudience): Category[] {
  const visible = pkg.categories.filter((c) => !c.audience || c.audience.includes(audience));
  const skinSlot = pkg.categories.find((c) => c.key === "skin")?.slot;
  const skinShown = visible.some((c) => c.key === "skin");
  return visible
    .map((c) =>
      c.key === "child_illness" && !skinShown && skinSlot !== undefined
        ? { ...c, slot: skinSlot }
        : c,
    )
    .sort((a, b) => a.slot - b.slot);
}

/** The landing strip for this audience (Appendix A.0) — the content test pins it at exactly four. */
export function dangerSigns(pkg: CatalogPackage, audience: SubmissionAudience): CatalogItem[] {
  return pkg.items.filter((i) => i.dangerSignFor?.includes(audience));
}

/**
 * Offline search over label + lay synonyms: case-insensitive, every word of
 * the query a substring (so a prefix matches too). Results keep catalog
 * order — never tier or flag order, so search cannot become a ranking.
 */
export function searchItems(
  pkg: CatalogPackage,
  audience: SubmissionAudience,
  query: string,
): CatalogItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return visibleItems(pkg, audience).filter((i) => {
    const hay = [t(pkg, i.labelKey), ...i.synonyms].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** English lookup. Throws on a missing key so a dangling reference fails a test, not a patient. */
export function t(pkg: CatalogPackage, key: string): string {
  const s = pkg.en[key];
  if (s === undefined) throw new Error(`symptom-catalog: no en string for "${key}"`);
  return s;
}

/* ── The interpreter ────────────────────────────────────────────────── */

interface Vote {
  tier: Tier;
  /** The item keys this vote is "because of". */
  reasons: string[];
}

interface Fired {
  votes: Vote[];
  flags: ItemFlag[];
  detail: string;
}

interface Context {
  audience: SubmissionAudience;
  /** Chosen, in catalog, visible — the only items any rule can see. */
  chosen: CatalogItem[];
  answers: SubmissionInput["qualifiers"];
  rulesVersion: string;
}

const quiet = (detail: string): Fired => ({ votes: [], flags: [], detail });

/** One generic branch per rule KIND, none per rule — the data says what each rule matches (R7). */
function interpret(rule: Rule, ctx: Context): Fired {
  switch (rule.kind) {
    case "item_tier": {
      const hits = ctx.chosen.filter((i) => i.tier === rule.tier);
      if (hits.length === 0) return quiet(`no ${rule.tier} item chosen`);
      return {
        votes: hits.map((i) => ({ tier: rule.tier, reasons: [i.key] })),
        flags: [],
        detail: `${keysOf(hits)} → ${rule.tier}`,
      };
    }
    case "qualifier_escalates": {
      const votes: Vote[] = [];
      const seen: string[] = [];
      for (const item of ctx.chosen) {
        for (const q of item.qualifiers ?? []) {
          const answer = ctx.answers[item.key]?.[q.key];
          if (answer === undefined) continue;
          const option = q.options.find((o) => o.key === answer);
          if (!option) {
            seen.push(`${item.key} ${q.key}=${answer} ignored (unknown option)`);
          } else if (option.escalatesTo) {
            votes.push({ tier: option.escalatesTo, reasons: [item.key] });
            seen.push(`${item.key} ${q.key}=${answer} → ${option.escalatesTo}`);
          } else {
            seen.push(`${item.key} ${q.key}=${answer}`);
          }
        }
      }
      return { votes, flags: [], detail: seen.length ? seen.join("; ") : "no qualifier answered" };
    }
    case "audience_modifier": {
      if (ctx.audience !== rule.when.audience) return quiet(`not ${rule.when.audience}`);
      const hits = ctx.chosen.filter((i) => rule.when.anyOf.includes(i.key));
      if (hits.length === 0) return quiet(`${rule.when.audience}: no match`);
      return {
        votes: hits.map((i) => ({ tier: rule.tier, reasons: [i.key] })),
        flags: [],
        detail: `${rule.when.audience}: ${keysOf(hits)} → ${rule.tier}`,
      };
    }
    case "combination": {
      const groups = rule.when.allOfGroups.map((g) => ctx.chosen.filter((i) => g.includes(i.key)));
      const missing = groups.findIndex((g) => g.length === 0);
      if (missing !== -1) return quiet(`group ${missing + 1} unmatched`);
      const hits = groups.flat();
      return {
        votes: [{ tier: rule.tier, reasons: hits.map((i) => i.key) }],
        flags: rule.flags,
        detail: `${groups.map(keysOf).join(" × ")} → ${rule.tier} +${rule.flags.join(",")}`,
      };
    }
    case "max_item_tier": {
      if (ctx.chosen.length === 0) return quiet("no items chosen");
      return {
        votes: ctx.chosen.map((i) => ({ tier: i.tier, reasons: [i.key] })),
        flags: [],
        detail: ctx.chosen.map((i) => `${i.key}=${i.tier}`).join(", "),
      };
    }
    case "free_text_inert":
      return quiet("free text not read");
    case "rules_are_data":
      return quiet(`rules ${ctx.rulesVersion} interpreted as data`);
  }
}

/**
 * Tier a submission. Items not in the package, or not shown to this
 * audience, are ignored and say so in the trace. Item order never matters:
 * the answer is a function of the SET chosen, so reasons come back in
 * catalog order.
 */
export function classify(input: SubmissionInput, pkg: CatalogPackage): Classification {
  const trace: Classification["trace"] = [];
  const byKey = new Map(pkg.items.map((i) => [i.key, i]));
  const wanted = new Set(input.items);
  for (const key of wanted) {
    const item = byKey.get(key);
    if (!item)
      trace.push({ rule: "input", detail: `ignored ${key}: not in catalog ${pkg.version}` });
    else if (!isVisible(item, input.audience)) {
      trace.push({ rule: "input", detail: `ignored ${key}: not shown to ${input.audience}` });
    }
  }
  const chosen = pkg.items.filter((i) => wanted.has(i.key) && isVisible(i, input.audience));
  const ctx: Context = {
    audience: input.audience,
    chosen,
    answers: input.qualifiers,
    rulesVersion: pkg.rules.version,
  };

  const votes: Vote[] = [];
  const ruleFlags: ItemFlag[] = [];
  for (const rule of pkg.rules.rules) {
    const fired = interpret(rule, ctx);
    votes.push(...fired.votes);
    ruleFlags.push(...fired.flags);
    trace.push({ rule: rule.id, detail: fired.detail });
  }

  // Nothing chosen votes nothing: "book a visit" is the floor, never a reassurance.
  const tier = votes.reduce<Tier>((top, v) => (RANK[v.tier] > RANK[top] ? v.tier : top), "R");
  const deciding = new Set(votes.filter((v) => v.tier === tier).flatMap((v) => v.reasons));
  const reasons = chosen.filter((i) => deciding.has(i.key)).map((i) => i.key);

  const flags = [...new Set([...chosen.flatMap((i) => i.flags ?? []), ...ruleFlags])];

  // The hint of the highest-tier hinted item; a strict compare keeps the first on a tie.
  let hinted: CatalogItem | null = null;
  for (const i of chosen) {
    if (i.serviceLineHint && (!hinted || RANK[i.tier] > RANK[hinted.tier])) hinted = i;
  }

  return {
    tier,
    reasons,
    flags,
    trace,
    serviceLineHint: hinted?.serviceLineHint ?? null,
    catalogVersion: pkg.version,
  };
}
