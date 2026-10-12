import "server-only";

import type { QueuePeriod } from "./read";
import type { EmrDb } from "@/lib/emr/db";
import { cache } from "react";

import { db as appDb } from "@/db";
import { servesRow } from "./queue";
import { countDoses7d, loadQueue } from "./read";
import { loadHospitalContext, loadScopeGroups, pointIsLive } from "./review/load";
import { countSuppliedToday } from "./supply/read";

/**
 * Per-request reads for the pharmacy workspace (as lib/lab/page-data.ts). The layout's sidebar
 * counts and the queue page share one load of today's queue (React `cache`), so the numbers on a
 * page agree.
 */
export const queueFor = cache((hospitalId: string, period: QueuePeriod) =>
  loadQueue(hospitalId, period),
);

export const dosesCountFor = cache((hospitalId: string) => countDoses7d(hospitalId));

/**
 * The nav counts with `pharmacyDispensing` on (5.1, 5.2, 5.7), each what its page shows by default:
 * Queue, the prescriptions in scope with a line at a stage that the acting point serves (the review
 * queue's total for that point; null when the point is not live, so the layout keeps Phase 0's count);
 * Open lines, every open line in scope (the page is not filtered by point); Supplied today, the
 * acting point's hand-overs today.
 * ponytail: the queue page reads the scope groups again through `getReviewQueue`; share one cached
 * load if the layout's read shows up in the page's timing.
 */
export async function dispensingNavCounts(
  hospitalId: string,
  pointId: string | null,
  database: EmrDb = appDb as unknown as EmrDb,
  now = new Date(),
): Promise<{ queue: number | null; open: number; supplied: number }> {
  const ctx = await loadHospitalContext(database, hospitalId);
  const [groups, supplied] = await Promise.all([
    loadScopeGroups(database, ctx),
    pointId ? countSuppliedToday(hospitalId, pointId, database, now) : 0,
  ]);
  const point = ctx.points.find((p) => p.id === pointId);
  const queue =
    point && pointIsLive(point)
      ? groups.filter(
          (g) =>
            g.lines.some((l) => l.status?.kind === "stage") && servesRow(point.serves, g.origin),
        ).length
      : null;
  const open = groups.reduce(
    (n, g) => n + g.lines.filter((l) => l.status?.kind === "open").length,
    0,
  );
  return { queue, open, supplied };
}

export const dispensingNavCountsFor = cache((hospitalId: string, pointId: string | null) =>
  dispensingNavCounts(hospitalId, pointId),
);
