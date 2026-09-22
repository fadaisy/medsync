import type { CatalogItem } from "@/supabase/functions/_shared/symptom-catalog/types";

import { DISCRIMINATOR_BY_CODE } from "@/lib/triage/discriminators";
import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import { t } from "@/supabase/functions/_shared/symptom-catalog/classify";

/**
 * The ONE place a booking-side symptom key meets a triage label (ADR 0098
 * ruling 4; PRD §8.5 "danger signs in lay + clinical label"). This is a
 * display join for the Incoming board — the triage engine never reads a
 * catalog key, and nothing else under lib/emergency imports lib/triage
 * (tests/emergency/queries-invariants.test.ts pins both).
 */
export interface RedFlagLabel {
  key: string;
  /** Lay label from the catalog package, or the raw key when the key is unknown to this build. */
  lay: string;
  /** The `lib/triage/discriminators.ts` label the item maps to, or null when no clean match exists. */
  clinical: string | null;
}

const ITEM_BY_KEY: ReadonlyMap<string, CatalogItem> = new Map(CATALOG.items.map((i) => [i.key, i]));

export function discriminatorLabel(code: string | null): string | null {
  return code ? (DISCRIMINATOR_BY_CODE.get(code)?.label ?? null) : null;
}

/** Resolves a pre-arrival's `red_flags` keys for the board. Unknown keys print as themselves, never throw. */
export function redFlagLabels(keys: readonly string[]): RedFlagLabel[] {
  return keys.map((key) => {
    const item = ITEM_BY_KEY.get(key);
    if (!item) return { key, lay: key, clinical: null };
    return {
      key,
      lay: t(CATALOG, item.labelKey),
      clinical: discriminatorLabel(item.triageDiscriminatorRef),
    };
  });
}
