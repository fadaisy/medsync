import type { EItem, Tile } from "../_components/pre-alert-form";
import type { CatalogItem } from "@/supabase/functions/_shared/symptom-catalog/types";

import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import {
  dangerSigns,
  t,
  visibleItems,
} from "@/supabase/functions/_shared/symptom-catalog/classify";

/**
 * The pre-alert form's two catalogue inputs, shared by the Emergency page and the patient web's
 * /emergency/tell (moved here from page.tsx unchanged, so neither page forks them).
 */

/** The adult danger-sign strip (Appendix A.0) plus the next emergency items in catalog order. */
export function tiles(): Tile[] {
  const strip = dangerSigns(CATALOG, "adult");
  const seen = new Set(strip.map((i) => i.key));
  const more = visibleItems(CATALOG, "adult").filter((i) => i.tier === "E" && !seen.has(i.key));
  return [...strip, ...more].slice(0, 8).map((i) => ({
    key: i.key,
    label: t(CATALOG, i.labelKey),
    icon: i.icon,
  }));
}

/** Every emergency item as a small label map — the client bundle never carries the package. */
export function emergencyItems(): EItem[] {
  return (CATALOG.items as CatalogItem[])
    .filter((i) => i.tier === "E")
    .map((i) => ({
      key: i.key,
      label: t(CATALOG, i.labelKey),
      stroke: i.flags?.includes("stroke_time") ?? false,
      isolation: i.flags?.includes("isolation") ?? false,
    }));
}
