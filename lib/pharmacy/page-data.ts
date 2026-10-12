import "server-only";

import type { QueuePeriod } from "./read";
import { cache } from "react";

import { countDoses7d, loadQueue } from "./read";

/**
 * Per-request reads for the pharmacy workspace (as lib/lab/page-data.ts). The layout's sidebar
 * counts and the queue page share one load of today's queue (React `cache`), so the numbers on a
 * page agree.
 */
export const queueFor = cache((hospitalId: string, period: QueuePeriod) =>
  loadQueue(hospitalId, period),
);

export const dosesCountFor = cache((hospitalId: string) => countDoses7d(hospitalId));
