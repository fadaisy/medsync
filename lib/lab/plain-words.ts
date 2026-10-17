/**
 * Plain words (Lab Phase 5 §6.3, PW-1..PW-6; ADR 0331). The CSO signs each test's words per language; this file holds
 * the shape, the plain-language checks and the banned-phrase lint. The banned phrases themselves are signed data
 * (the release table's companion); no patient text is written here.
 */
import { z } from "zod";

const band = z.string().trim().min(3).max(160);
export const PlainWordsPayload = z
  .object({
    concept: z.string().regex(/^obs\.[a-z0-9_]+$/),
    language: z.string().regex(/^[a-z]{2,3}$/),
    whatThisTestIs: z.string().trim().min(10).max(400),
    shortLine: z.string().trim().min(5).max(120),
    /** PW-5: the action line per band. */
    action: z.object({ within: band, higher: band, lower: band, noRange: band }),
    /** PW-5: shown only with a signed threshold and its source. */
    harmAnchor: z
      .object({
        text: z.string().trim().min(5).max(200),
        threshold: z.string().min(1).max(20),
        source: z.string().min(3).max(200),
      })
      .nullable(),
    calculated: z
      .array(z.object({ concept: z.string(), line: z.string().trim().min(5).max(200) }))
      .max(5),
    /** PW-2: a readability score from a named method, recorded at signing (reported, not a gate). */
    readability: z.object({ method: z.string().min(2).max(60), score: z.number() }),
    /** PW-4: a translation needs a forward translation, an independent back translation and the reviewer. */
    translation: z
      .object({
        translator: z.string().min(2).max(120),
        backTranslator: z.string().min(2).max(120),
        reviewer: z.string().min(2).max(120),
      })
      .nullable(),
    bannedPhrases: z.array(z.string().trim().min(2).max(80)).max(200),
  })
  .refine((p) => p.language === "en" || p.translation !== null, {
    message: "A translation needs a translator, a back translator and a reviewer.",
  });
export type PlainWords = z.infer<typeof PlainWordsPayload>;

/** PW-3: no diagnosis, dosing, treatment instruction or value-dependent reassurance; plus the signed phrases. */
const ALWAYS = [
  /\b\d+(\.\d+)?\s?(mg|ml|g|tablets?|units?)\b/i,
  /\b(stop|start|increase|reduce) (taking|your)\b/i,
];
export function lint(
  p: Pick<PlainWords, "whatThisTestIs" | "shortLine" | "action" | "calculated">,
  banned: readonly string[],
) {
  const texts = [
    p.whatThisTestIs,
    p.shortLine,
    ...Object.values(p.action),
    ...p.calculated.map((c) => c.line),
  ];
  const hits = new Set<string>();
  for (const t of texts) {
    for (const re of ALWAYS) if (re.test(t)) hits.add(re.source);
    for (const b of banned) if (t.toLowerCase().includes(b.toLowerCase())) hits.add(b);
  }
  return [...hits];
}

/** PW-2 helper: sentence and word lengths (plain-language rules), reported beside the signed score. */
export function plainness(text: string) {
  const sentences = text.split(/[.!?]+\s*/).filter(Boolean);
  const words = text.split(/\s+/).filter(Boolean);
  const longWords = words.filter((w) => w.replace(/[^a-z]/gi, "").length > 12).length;
  return {
    sentences: sentences.length,
    wordsPerSentence: sentences.length ? words.length / sentences.length : 0,
    longWords,
  };
}
