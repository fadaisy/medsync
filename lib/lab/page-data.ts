import "server-only";

import { cache } from "react";

import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { loadLabWorklist, loadRejected, loadReleasedToday } from "./read";

/**
 * Per-request reads for the lab workspace. The layout's sidebar counts and the page share one load
 * of each (React `cache`), and one server "now", so every number on a page agrees and every
 * elapsed time is measured from the same server instant (Law 6).
 */
export const requestNow = cache(() => new Date());

export const labWorklistFor = cache((hospitalId: string) => loadLabWorklist(hospitalId));

export const releasedTodayFor = cache((hospitalId: string) =>
  loadReleasedToday(hospitalId, requestNow(), DEFAULT_TIME_ZONE),
);

export const rejectedFor = cache((hospitalId: string) => loadRejected(hospitalId, requestNow()));

export const LAB_TIME_ZONE = DEFAULT_TIME_ZONE;
