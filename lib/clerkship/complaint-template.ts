/**
 * Doctor-created complaint TEMPLATE — the pure, structure-only normaliser.
 *
 * THE rule (CSO): a catalog template is the symptom DEFINITION + its property
 * STRUCTURE — never a patient's captured values. This function is the single
 * choke-point that builds the persisted structure: it picks ONLY the template
 * fields and discards anything else (so even if a caller passed patient values,
 * they cannot reach the catalog). Pure (no DB / no server-only) → unit-tested.
 */

export interface ComplaintTemplate {
  display: string;
  system: string;
  synonyms: string[];
  /** Codes of EXISTING properties to map — structure, not values. */
  propertyCodes: string[];
}

export function templateStructure(input: unknown): ComplaintTemplate {
  const o = (input ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strArray = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim())
      : [];
  return {
    display: str(o.display),
    system: str(o.system),
    synonyms: [...new Set(strArray(o.synonyms).filter(Boolean))].slice(0, 12),
    propertyCodes: [...new Set(strArray(o.propertyCodes).filter(Boolean))],
  };
}

/** A stable, URL-safe stem for a generated complaint code (caller adds entropy). */
export function complaintSlug(display: string): string {
  return display
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}
