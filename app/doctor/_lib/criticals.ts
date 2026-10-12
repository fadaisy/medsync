import "server-only";

import { cache } from "react";

import { identitiesFor } from "@/lib/emr/read/results";
import { loadMyAlerts } from "@/lib/lab/criticals/read";
import { criticalsLive } from "@/lib/lab/criticals/readiness";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";

/**
 * The doctor's critical alerts, once per request (Lab Phase 1 §5.4): the layout's header count and
 * announcement and the page's pinned alerts read the same load, so they always agree. Null where
 * LAB_CRITICALS is off, so every doctor screen is the baseline.
 */
export const requestNow = cache(() => new Date());

export const myCriticals = cache(async (userId: string, hospitalId: string) => {
  if (!(await criticalsLive(hospitalId))) return null;
  const now = requestNow();
  const alerts = await loadMyAlerts({ userId, hospitalId }, now, DEFAULT_TIME_ZONE);
  const ids = await identitiesFor(
    { userId, hospitalId },
    [...alerts.open, ...alerts.phoneAckedForMe, ...alerts.acknowledgedByMe].map(
      (a) => a.patientUserId,
    ),
    "doctor_critical_alerts",
  );
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_TIME_ZONE,
  });
  return { alerts, ids, now, time: (d: Date) => fmt.format(d) };
});
