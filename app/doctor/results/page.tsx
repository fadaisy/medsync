import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { sortReview } from "@/components/emr/results/model";
import { ReviewList } from "@/components/emr/results/review-list";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { clinicianOptions, identitiesFor, loadResultsToReview } from "@/lib/emr/read/results";
import { reportsWithOpenAlert } from "@/lib/lab/criticals/read";
import { labReferralLiveFor } from "@/lib/lab/feature";
import { loadSentOutForClinician } from "@/lib/lab/referral-read";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { PinnedCriticals } from "../_components/critical-alerts";
import { PageHeader } from "../_components/page-header";
import { myCriticals } from "../_lib/criticals";
import { SentOut } from "./sent-out";

export const metadata: Metadata = { title: "Results to review · Doctor · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Results to review (gate-a E.10, D-EMR-07): released results on orders I placed or cover, not
 * yet acknowledged at their current version — critical first, then amended, then oldest. The
 * workspace's Critical results and Results to review lanes land here. EMR v1 only.
 */
export default async function ResultsToReviewPage() {
  const scope = await requireDoctorScope();
  if (!emrV1LiveFor(scope.hospitalId)) notFound();
  const [items, staff, criticals, sentOut] = await Promise.all([
    loadResultsToReview(scope),
    clinicianOptions(scope.hospitalId),
    myCriticals(scope.userId, scope.hospitalId),
    labReferralLiveFor(scope.hospitalId) ? loadSentOutForClinician(scope) : Promise.resolve([]),
  ]);
  const sentIds = await identitiesFor(
    scope,
    sentOut.map((r) => r.patientUserId),
    "doctor_sent_out",
  );
  // CA-12: a report with an open critical alert is acknowledged through its alert, never in a batch.
  const alerted = criticals
    ? await reportsWithOpenAlert(
        scope.hospitalId,
        items.map((i) => i.reportId),
      )
    : new Set<string>();
  const n = items.length;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader
        place={[scope.hospitalName, scope.departmentName].filter(Boolean).join(" · ")}
        placeInTopBar
        title="Results to review"
        subline={
          n === 0
            ? "Nothing waiting."
            : `${n} ${n === 1 ? "result" : "results"} waiting for acknowledgement.`
        }
      />
      {criticals ? (
        <PinnedCriticals
          alerts={criticals.alerts}
          ids={criticals.ids}
          now={criticals.now}
          time={criticals.time}
        />
      ) : null}
      <SentOut rows={sentOut} ids={sentIds} />
      <ReviewList
        // An open critical alert first (CA-12): the baseline left it fourth of four.
        items={[...sortReview(items)].sort(
          (a, b) => Number(alerted.has(b.reportId)) - Number(alerted.has(a.reportId)),
        )}
        notInBatch={alerted}
        staff={staff.filter((s) => s.userId !== scope.userId)}
        surface="doctor"
        timeZone={DEFAULT_TIME_ZONE}
      />
    </div>
  );
}
