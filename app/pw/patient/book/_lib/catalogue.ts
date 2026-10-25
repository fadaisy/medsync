import "server-only";

import type { CatalogRenderMode } from "@/lib/emergency/feature";

import { catalogRenderMode } from "@/lib/emergency/feature";
import { fetchCatalogVersionStatus } from "@/lib/emergency/queries";
import {
  CATALOG,
  CATALOG_CHECKSUM,
} from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import { t, visibleCategories } from "@/supabase/functions/_shared/symptom-catalog/classify";

/**
 * Gate CS (ADR 0098 ruling 2) as the old /patient/symptoms reads it: the flag, then a signed version carrying
 * the bundled checksum; a database without the versions table is "not signed", never a crash.
 */
export async function catalogueMode(): Promise<CatalogRenderMode> {
  const status = await fetchCatalogVersionStatus(CATALOG.version, CATALOG_CHECKSUM).catch(
    () => null,
  );
  return catalogRenderMode(status?.signed === true);
}

/** The adult areas the Book door shows, with the package's own words (W2). */
export function adultAreas(): { key: string; label: string }[] {
  return visibleCategories(CATALOG, "adult").map((c) => ({
    key: c.key,
    label: t(CATALOG, c.labelKey),
  }));
}
