import type { QueuePayload } from "./_components/queue-screen";
import type { QueuePeriod } from "@/lib/pharmacy/read";

import { identitiesFor } from "@/lib/emr/read/results";
import { queueFor } from "@/lib/pharmacy/page-data";
import { defaultLane } from "@/lib/pharmacy/queue";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { PharmacyNotice } from "./_components/pharmacy-notice";
import { QueueScreen } from "./_components/queue-screen";

export const dynamic = "force-dynamic";

const PERIODS: readonly QueuePeriod[] = ["today", "yesterday", "7d"];

/**
 * The queue (§5.3): every prescription written in the period at the viewer's hospital, one row per
 * placed prescription, read-only. Identities are revealed once per load, in one batch (PQ-12).
 */
export default async function PharmacyQueuePage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    lane?: string;
    state?: string;
    from?: string;
    sort?: string;
  }>;
}) {
  const scope = await requirePharmacyScope();
  const sp = await searchParams;
  const raw = sp.period;
  const period = PERIODS.includes(raw as QueuePeriod) ? (raw as QueuePeriod) : "today";
  const { lines, encounters, serverNow } = await queueFor(scope.hospitalId, period);
  const ids = await identitiesFor(
    scope,
    lines.map((l) => l.patientUserId),
    "pharmacy_queue",
  );
  const payload: QueuePayload = {
    hospitalId: scope.hospitalId,
    hospitalName: scope.hospitalName,
    period,
    lines: lines.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
    encounters: [...encounters.values()],
    identities: Object.fromEntries(ids),
    // DP-4: the dispensing point's lane arrives with the hub panel (Step 5); until then, All.
    defaultLane: defaultLane(null),
    initial: {
      lane: sp.lane ?? null,
      state: sp.state ?? null,
      from: sp.from ?? null,
      sort: sp.sort ?? null,
    },
    serverNowIso: serverNow.toISOString(),
    timeZone: DEFAULT_TIME_ZONE,
  };
  return (
    <QueueScreen payload={payload} notice={<PharmacyNotice hospitalId={scope.hospitalId} />} />
  );
}
