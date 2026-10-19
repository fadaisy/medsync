import "server-only";

import { cache } from "react";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { labHmisReports } from "@/db/schema";
import { loadEquipment } from "@/lib/lab/equipment-read";
import { requestNow } from "@/lib/lab/page-data";
import { heldReports, loadKits, loadNcs, loadQcPlans } from "@/lib/lab/qc-read";
import { loadStock } from "@/lib/lab/stock-read";

/**
 * The Quality place's reads, once per request (Lab Workspace v2): the tab counts and the Today tab ask for the
 * same rows, so each loader is cached by React for the request. Same loaders as the old Quality today page.
 */
const tx = <T>(fn: (t: never) => Promise<T>) => db.transaction((t) => fn(t as never));

export const plansFor = cache((h: string) => tx((t) => loadQcPlans(t, h, requestNow())));
export const kitsFor = cache((h: string, userId: string) =>
  tx((t) => loadKits(t, h, userId, requestNow())),
);
export const stockFor = cache((h: string) => tx((t) => loadStock(t, h, requestNow())));
export const equipmentFor = cache((h: string) => tx((t) => loadEquipment(t, h, requestNow())));
export const ncsFor = cache((h: string) => tx((t) => loadNcs(t, h, requestNow())));
export const heldFor = cache((h: string) => tx((t) => heldReports(t, h)));
export const hmisSignedFor = cache(async (h: string) =>
  (
    await db
      .select({ month: labHmisReports.month })
      .from(labHmisReports)
      .where(
        and(
          eq(labHmisReports.hospitalId, h),
          inArray(labHmisReports.state, ["signed", "exported"]),
        ),
      )
  ).map((r) => r.month.slice(0, 7)),
);

/** QC still to run today: plans not run in their window, and kit or stain lots due (as the old Today tile). */
export async function qcToRun(h: string, userId: string) {
  const [plans, kits] = await Promise.all([plansFor(h), kitsFor(h, userId)]);
  const plansDue = plans.rows.filter((r) => r.status === "not_run_in_window");
  const kitsDue = kits.flatMap((k) => k.lots.filter((l) => l.due.length).map((l) => ({ k, l })));
  return {
    count: plansDue.length + kitsDue.length,
    first: plansDue[0] ?? null,
    firstKit: kitsDue[0] ?? null,
  };
}
