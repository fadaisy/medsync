import { cache } from "react";
import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { pharmacyLegalAnswers } from "@/db/schema/pharmacy-dispensing";

/**
 * Rework S13 (C1): production permissions follow the hospital's recorded answer to legal question 1 (who may hand
 * over), not an env constant. An answer with no hospital applies to every hospital (0129).
 */
export const legalQ1RecordedFor = cache(async (hospitalId: string): Promise<boolean> => {
  const rows = await db
    .select({ id: pharmacyLegalAnswers.id })
    .from(pharmacyLegalAnswers)
    .where(
      and(
        eq(pharmacyLegalAnswers.question, 1),
        or(
          eq(pharmacyLegalAnswers.hospitalId, hospitalId),
          isNull(pharmacyLegalAnswers.hospitalId),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
});
