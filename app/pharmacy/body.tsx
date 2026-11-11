import type { QueuePayload } from "./_components/queue-screen";
import type { EmrDb } from "@/lib/emr/db";
import type { QueuePeriod } from "@/lib/pharmacy/read";
import { redirect } from "next/navigation";

import { CautionNotice } from "@/components/medsync/caution-notice";
import { withSignedPairs } from "@/content/pharmacy-clinical";
import { REVIEW } from "@/content/pharmacy-review";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { can } from "@/lib/pharmacy/access";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { anythingNotDone, pharmacyChecksState } from "@/lib/pharmacy/check-state";
import { interactionsStateFor } from "@/lib/pharmacy/clinical/read";
import { servesOf } from "@/lib/pharmacy/dispensing-points";
import { pharmacyDispensingLiveFor, pharmacyInteractionsLiveFor } from "@/lib/pharmacy/feature";
import { queueFor } from "@/lib/pharmacy/page-data";
import { defaultLane } from "@/lib/pharmacy/queue";
import { getReviewQueue } from "@/lib/pharmacy/review/read";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";
import { landingFor } from "@/lib/pharmacy/workspace-v2/places";
import { isLive } from "@/lib/pharmacy/write";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { PharmacyNotice } from "./_components/pharmacy-notice";
import { QueueScreen } from "./_components/queue-screen";
import { ReviewQueue } from "./_components/review-queue";
import { pharmacyV2 } from "./_lib/v2";

const PERIODS: readonly QueuePeriod[] = ["today", "yesterday", "7d"];

/**
 * The queue (§5.3): every prescription written in the period at the viewer's hospital, one row per
 * placed prescription, read-only. Identities are revealed once per load, in one batch (PQ-12).
 *
 * Pharmacy Phase 1 (5.1, 5.2): with `pharmacyDispensing` on and the acting point live, the review
 * queue instead. A point that is not live keeps this Phase 0 queue, unchanged.
 */
type QueueSearch = {
  period?: string;
  lane?: string;
  state?: string;
  from?: string;
  sort?: string;
};

/** Pharmacy Workspace v2 (D-PW-04): with the flag on, /pharmacy lands on Today or Window (307). */
export default async function PharmacyQueuePage({
  searchParams,
}: {
  searchParams: Promise<QueueSearch>;
}) {
  const v2 = await pharmacyV2();
  if (v2.live) redirect(landingFor(v2.places, v2.permissions.has("pharmacy.manage")));
  return <QueueBody searchParams={searchParams} />;
}

/** The old queue page's body, unchanged; Window's queue view renders it where the point is not live. */
export async function QueueBody({ searchParams }: { searchParams: Promise<QueueSearch> }) {
  const scope = await requirePharmacyScope();
  if (pharmacyDispensingLiveFor(scope.hospitalId)) {
    const actor = await requirePharmacyActor();
    const point = actor.points.find((p) => p.id === actor.pointId);
    if (point && isLive(point))
      return <ReviewQueuePage scope={scope} actor={actor} pointId={point.id} />;
  }
  const sp = await searchParams;
  const raw = sp.period;
  const period = PERIODS.includes(raw as QueuePeriod) ? (raw as QueuePeriod) : "today";
  const [{ lines, encounters, serverNow }, serves] = await Promise.all([
    queueFor(scope.hospitalId, period),
    servesOf(scope.hospitalId, scope.departmentId),
  ]);
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
    // DP-4: the viewer's dispensing point picks the opening lane; no point, All.
    defaultLane: defaultLane(serves),
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
    <QueueScreen
      payload={payload}
      notice={
        <PharmacyNotice hospitalId={scope.hospitalId} pairs={await signedPairs(scope.hospitalId)} />
      }
    />
  );
}

/** 5.2 at a live point: the review queue, with the notice at a live point (B-02, CK-1, C1). */
async function ReviewQueuePage({
  scope,
  actor,
  pointId,
}: {
  scope: Awaited<ReturnType<typeof requirePharmacyScope>>;
  actor: Awaited<ReturnType<typeof requirePharmacyActor>>;
  pointId: string;
}) {
  const data = await getReviewQueue(scope.hospitalId, pointId);
  const ids = await identitiesFor(
    scope,
    data.rows.map((r) => r.patientUserId),
    "pharmacy_queue",
  );
  const state = pharmacyChecksState(
    scope.hospitalId,
    data.points.map((p) => ({ id: p.id, live: p.live })),
  );
  const ix = await interactionsStateFor(
    db as unknown as EmrDb,
    scope.hospitalId,
    pharmacyInteractionsLiveFor(scope.hospitalId),
  );
  const refs = state.doseReferences;
  const notice = anythingNotDone(state) ? (
    <CautionNotice
      lead={withSignedPairs(
        refs
          ? REVIEW.fill(REVIEW.noticeQueue, { signed: refs.signed, total: refs.total })
          : REVIEW.noticeQueueNoCounts,
        ix.state === "partial" ? ix.pairs : null,
      )}
    />
  ) : null;
  return (
    <ReviewQueue
      notice={notice}
      payload={{
        ...data,
        hospitalName: scope.hospitalName,
        identities: Object.fromEntries(ids),
        actingPointId: pointId,
        canReview: can(actor.access, "pharmacy.review"),
        canDispense: can(actor.access, "pharmacy.dispense"),
        timeZone: DEFAULT_TIME_ZONE,
      }}
    />
  );
}

/** 5.1: the signed pair count for the notice, with `pharmacyInteractions` on; null leaves it unchanged. */
const signedPairs = async (hospitalId: string) => {
  const ix = await interactionsStateFor(
    db as unknown as EmrDb,
    hospitalId,
    pharmacyInteractionsLiveFor(hospitalId),
  );
  return ix.state === "partial" ? ix.pairs : null;
};
