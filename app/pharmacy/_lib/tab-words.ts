import { PHWS2 } from "@/content/pharmacy-workspace-v2";

/** "place.key" → the tab's word, for Find's Pages group and each place's PillTabs. */
export const PHWS2_TAB_WORDS: Record<string, string> = Object.fromEntries(
  Object.entries(PHWS2.tabs).flatMap(([place, words]) =>
    Object.entries(words).map(([key, word]) => [`${place}.${key}`, word]),
  ),
);
