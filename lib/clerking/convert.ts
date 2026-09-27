import type { History, HistoryHeader } from "./answers";
import type { Catalogue } from "./catalogue";
import type { NoteContent } from "@/lib/emr/note-rules";

import { emptyHistory } from "./answers";

/**
 * "Continue in the new format" (gate-a §4): a v1 clerking draft → payload v2, copying only what
 * maps. Nothing is migrated silently (the clinician chooses it) and nothing is invented:
 *   - the header (historian, language, interpreter);
 *   - complaints whose v1 token is exactly one catalogue symptom's token, with their duration;
 *     other complaints stay as uncatalogued text;
 *   - the history-of-presenting-complaint narrative as the story;
 *   - Examination, Summary, Impression and Plan (s11–s14) unchanged.
 * Pure.
 */
export function convertV1Draft(
  cat: Catalogue,
  tokenMap: Readonly<Record<string, string>>,
  v1: NoteContent,
): NoteContent {
  const byToken = new Map<string, string>();
  const shared = new Set<string>();
  for (const [sym, token] of Object.entries(tokenMap)) {
    if (byToken.has(token)) shared.add(token);
    byToken.set(token, sym);
  }
  const h: History = emptyHistory();
  let n = 0;
  for (const item of v1.sections.s01?.items ?? []) {
    if (item.kind !== "complaint_token") continue;
    const token = typeof item.token === "string" ? item.token : null;
    const sym = token && !shared.has(token) ? byToken.get(token) : undefined;
    const days =
      typeof item.durationDays === "number" && item.durationDays >= 1
        ? Math.round(item.durationDays)
        : null;
    const label = typeof item.label === "string" ? item.label : null;
    if (!sym && !label) continue;
    h.complaints.push({
      key: `v1-${n++}`,
      symptom: sym && cat.symptom(sym) ? sym : null,
      ...(sym && cat.symptom(sym) ? {} : { text: label ?? "" }),
      ...(days ? { duration: { value: days, unit: "days" as const } } : {}),
      props: {},
      flags: {},
    });
  }
  const story = [v1.sections.s02?.narrative, v1.sections.s01?.narrative]
    .filter((x) => x?.trim())
    .join("\n\n");
  if (story) h.story = story;
  const header = (v1.header ?? {}) as Record<string, unknown>;
  const pick = (k: keyof HistoryHeader) =>
    typeof header[k] === "string" ? (header[k] as string) : undefined;
  const sections = Object.fromEntries(
    Object.entries(v1.sections).filter(([id]) => ["s11", "s12", "s13", "s14"].includes(id)),
  );
  return {
    schema: 2,
    catalogueVersion: cat.version,
    header: {
      historian: pick("historian"),
      language: pick("language"),
      interpreter: pick("interpreter"),
    },
    history: h as unknown as NoteContent["history"],
    sections,
    edited: {},
  };
}
