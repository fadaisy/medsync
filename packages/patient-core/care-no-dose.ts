/**
 * Law L5 at the edge of the patient's own list (S15). A medicine row can carry words the patient never
 * typed: a visit record writes the prescription's drug name and "route, frequency, for duration"
 * (`lib/patient/visit-medicine.ts`), and the pharmacy writes its directions as written. Either may hold an
 * amount ("Amlodipine 5 mg", "1 tab twice daily"). Care shows names and times of day only, so:
 * - a name keeps its words with every amount taken out;
 * - instructions that hold any amount are not shown at all (half a sentence would mislead).
 * The patterns are Appendix B's no-dose guard, plus a counted form in words ("one tablet").
 * Pure: shared by the phone and the web.
 */

const AMOUNT =
  /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|g|IU|units?|mL|ml|l)\b(?:\s*\/\s*\d*(?:[.,]\d+)?\s?(?:mg|mcg|µg|g|mL|ml|l)\b)?/gi;
const COUNT =
  /\b(?:\d+(?:[.,]\d+)?|½|¼|one|two|three|four|half(?:\s+a)?)\s?(?:tablets?|tabs?|capsules?|caps?|puffs?|drops?|sachets?|spoons?|teaspoons?|tsp)\b/gi;

/** True when the text holds a dose amount or a counted dose. */
export function hasDose(text: string | null | undefined): boolean {
  if (!text) return false;
  AMOUNT.lastIndex = 0;
  COUNT.lastIndex = 0;
  return AMOUNT.test(text) || COUNT.test(text);
}

/** A medicine's name with every amount taken out: "Amlodipine 5 mg tablet" → "Amlodipine tablet". */
export function nameWithoutDose(name: string): string {
  const out = name
    .replace(AMOUNT, " ")
    .replace(COUNT, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s*[/,]\s*(?=[/,]|$)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out || "Medicine";
}

/** Instructions as shown on Care: null when they hold any amount. */
export function instructionsWithoutDose(text: string | null): string | null {
  const t = text?.trim();
  return t && !hasDose(t) ? t : null;
}
