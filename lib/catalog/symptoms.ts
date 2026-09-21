import "server-only";

import { unstable_cache } from "next/cache";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { symptomCatalog } from "@/db/schema/symptom-catalog";

/**
 * The catalogue as a booking surface may see it (ADR 0095): words only.
 * The decision-support flags (must_not_miss, is_pain, uganda_flag,
 * ros_screen) are never selected here — a booking symptom is descriptive,
 * and nothing under lib/triage, lib/clerkship or lib/encounter reads it.
 */
export interface BookingSymptomOption {
  code: string;
  display: string;
  synonyms: string[];
  system: string;
}

/** Shared, active rows in the catalogue's own order. Reference data: cached an hour, like lib/reference-data. */
export const loadBookingSymptoms = unstable_cache(
  async (): Promise<BookingSymptomOption[]> =>
    db
      .select({
        code: symptomCatalog.code,
        display: symptomCatalog.display,
        synonyms: symptomCatalog.synonyms,
        system: symptomCatalog.system,
      })
      .from(symptomCatalog)
      .where(and(eq(symptomCatalog.scope, "shared"), eq(symptomCatalog.active, true)))
      .orderBy(asc(symptomCatalog.system), asc(symptomCatalog.sortOrder)),
  ["loadBookingSymptoms"],
  { revalidate: 3600, tags: ["reference-data"] },
);
