/**
 * The new-admin guide (ADR 0522): search across the how-tos and the walkthroughs. A match is every word of the
 * query found somewhere in the item's words, ignoring case and curly quotes. Pure and client-safe.
 */

export interface HowToWords {
  q: string;
  what: string;
  steps: readonly string[];
  note: string;
}

export interface WalkWords {
  title: string;
  sub: string;
  steps: readonly (readonly [string, string | null, string, string])[];
}

const fold = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** The query's words; empty for a blank query. */
export const terms = (query: string) => fold(query).split(" ").filter(Boolean);

const matches = (hay: string, words: readonly string[]) => {
  const h = fold(hay);
  return words.length > 0 && words.every((w) => h.includes(w));
};

export const howToText = (a: HowToWords) => [a.q, a.what, ...a.steps, a.note].join(" ");
export const walkText = (w: WalkWords) =>
  [w.title, w.sub, ...w.steps.map((s) => `${s[2]} ${s[3]}`)].join(" ");

/** The how-tos matching a query, in topic order, each with its topic and its place in the topic. */
export function searchHowTos<T extends { key: string; items: readonly HowToWords[] }>(
  query: string,
  topics: readonly T[],
): { topic: T; item: T["items"][number]; index: number }[] {
  const words = terms(query);
  if (!words.length) return [];
  return topics.flatMap((topic) =>
    topic.items
      .map((item, index) => ({ topic, item, index }))
      .filter((h) => matches(howToText(h.item), words)),
  );
}

/** The walkthroughs matching a query; every walkthrough for a blank one. */
export function searchWalks<W extends WalkWords>(query: string, walks: readonly W[]): W[] {
  const words = terms(query);
  if (!words.length) return [...walks];
  return walks.filter((w) => matches(walkText(w), words));
}
