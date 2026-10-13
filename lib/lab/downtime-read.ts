import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db as appDb } from "@/db";
import { downtimeEntries, downtimeFormNumbers } from "@/db/schema/lab-safety";

const defaultDb = () => appDb as unknown as EmrDb;

/** The nav count: printed forms still to enter (§5.9). */
export async function countFormsWaiting(
  hospitalId: string,
  database: EmrDb = defaultDb(),
): Promise<number> {
  const [r] = await database
    .select({ n: sql<number>`count(*)::int` })
    .from(downtimeFormNumbers)
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, hospitalId),
        eq(downtimeFormNumbers.workspace, "lab"),
        eq(downtimeFormNumbers.state, "unused"),
      ),
    );
  return r?.n ?? 0;
}

/** DT-7: reports entered after downtime, with the form's times, by report id. */
export async function downtimeFor(reportIds: readonly string[], database: EmrDb = defaultDb()) {
  if (reportIds.length === 0) return new Map<string, typeof downtimeEntries.$inferSelect>();
  const rows = await database
    .select()
    .from(downtimeEntries)
    .where(inArray(downtimeEntries.reportId, [...reportIds]));
  return new Map(rows.map((r) => [r.reportId, r]));
}
