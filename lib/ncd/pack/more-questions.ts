import type { NcdCatalog } from "@/lib/ncd/catalog/schema";

import { PACK_FEATURE_HOME } from "./from-clerking";
import { PACK_ONLY_CODE, RENAMED } from "./live";

/** Form code → pack code (the form keeps the live names; the pack has its own). */
const PACK_CODE: Record<string, string> = Object.fromEntries(
  [...Object.entries(RENAMED), ...Object.entries(PACK_ONLY_CODE)].map(([pack, form]) => [
    form,
    pack,
  ]),
);

/**
 * "More diabetes questions" (ADR 0216): the pack's form cut to what the clerking does not ask
 * (PACK_FEATURE_HOME "more"), with the findings those questions hang from. Sections left empty go.
 */
export function moreQuestionsCatalog(cat: NcdCatalog): NcdCatalog {
  const byCode = new Map(cat.features.map((f) => [f.code, f]));
  const keep = new Set<string>();
  const add = (code: string) => {
    if (keep.has(code)) return;
    keep.add(code);
    const parent = byCode.get(code)?.parent;
    if (parent) add(parent);
  };
  for (const f of cat.features)
    if (PACK_FEATURE_HOME[PACK_CODE[f.code] ?? f.code] === "more") add(f.code);
  const features = cat.features.filter((f) => keep.has(f.code));
  const used = new Set(features.map((f) => f.section));
  return { ...cat, sections: cat.sections.filter((s) => used.has(s.id)), features };
}
