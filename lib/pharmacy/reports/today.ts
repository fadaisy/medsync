import "server-only";

import type { EmrDb } from "@/lib/emr/db";
import type { TodayItem } from "@/lib/pharmacy/derive/today-types";
import { and, asc, eq } from "drizzle-orm";

import { RC } from "@/content/pharmacy-rework-records";
import { downtimeFormNumbers } from "@/db/schema/lab-safety";
import { appDb } from "@/lib/pharmacy/audit/read";
import { pharmacySheetLabel } from "@/lib/pharmacy/downtime";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Kampala",
});

/**
 * Today items from Records (prototype today.js kind `sheet`): each paper sheet still to enter at this hospital, opened
 * on Records › Paper sheets. One query. The prototype has no report items on Today.
 */
export async function recordsTodayItems(
  hospitalId: string,
  database: EmrDb = appDb(),
): Promise<TodayItem[]> {
  const sheets = await database
    .select({ number: downtimeFormNumbers.number, reservedAt: downtimeFormNumbers.reservedAt })
    .from(downtimeFormNumbers)
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, hospitalId),
        eq(downtimeFormNumbers.workspace, "pharmacy"),
        eq(downtimeFormNumbers.state, "to_enter"),
      ),
    )
    .orderBy(asc(downtimeFormNumbers.number))
    .limit(50);
  return sheets.map((s) => ({
    kind: "sheet" as const,
    key: `sheet:${s.number}`,
    title: RC.today.sheet,
    meta: RC.today.sheetMeta(pharmacySheetLabel(s.number), day.format(s.reservedAt)),
    action: RC.today.sheetAct,
    href: `/pharmacy/records?tab=sheets&sheet=${s.number}`,
  }));
}
