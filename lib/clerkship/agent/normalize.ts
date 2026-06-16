/** Normalize a clinical feature string for matching: strip the «» free-text
 *  markers used in the reasoning maps, lowercase, and collapse whitespace. */
export function normalizeFeature(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/[«»]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
