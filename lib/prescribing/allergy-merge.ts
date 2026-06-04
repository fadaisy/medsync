/**
 * Union allergy substance lists for the prescribing safety check — the resus
 * timeline capture + the persistent (clerked) patient_allergies. Case-insensitive
 * dedupe (first-seen casing wins), blanks dropped. Pure.
 */
export function mergeAllergyLists(...lists: (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const v = raw.trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}
