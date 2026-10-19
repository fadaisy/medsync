import type { WorklistInput } from "@/lib/lab/worklist";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labOneMenuLiveFor } from "@/lib/lab/feature";
import { PatientNameMrn, RecordList } from "../_components/record-list";
import { EmptyState } from "../_components/v2/kit";
import { redirectIfV2 } from "../_lib/v2-redirect";
import { SendPanel } from "../send-outs/_components/send-panel";
import { loadToRefer } from "../send-outs/_lib/to-refer";

export const metadata: Metadata = { title: "To refer · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * To refer (Lab Phase 2 §5.5, OM-7; Lab Phase 4 §5.1): specimens on the worklist whose test the hub marks as
 * referred, or whose analyser is down, today. With `labReferral` on, the send panel records where each goes,
 * on a manifest with no patient names, and an outbreak referral for a high-risk specimen; off, it is Phase 2's
 * list. An order is never cancelled because availability changed or because it was sent. With Lab Workspace v2
 * on, this is the Send-outs board (308).
 */
export default async function ToReferPage() {
  await redirectIfV2("/lab/send-outs?tab=board");
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labOneMenuLiveFor(scope.hospitalId)
  )
    notFound();
  const { plain, ids, restricted, send, canRefer } = await loadToRefer(scope);

  if (!send)
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title="To refer" />
        <p className="text-body-s text-muted-foreground max-w-3xl">
          Specimens for tests the Departments and services hub marks as referred, or whose analyser
          is down, today. Sending them out is recorded on paper until the referral flow arrives.
        </p>
        <RecordList<{
          i: WorklistInput;
          d: { words: string | null; referredTo?: string | null } | null;
        }>
          caption="To refer"
          rows={plain}
          rowKey={(r) => r.i.orderId}
          empty="Nothing to refer today."
          columns={[
            {
              id: "patient",
              header: "Patient",
              cell: (r) => <PatientNameMrn identity={ids.get(r.i.patientUserId)} />,
            },
            {
              id: "test",
              header: "Test",
              cell: (r) => (
                <span className="inline-flex flex-col">
                  <Link
                    href={`/lab/results/${r.i.orderId}`}
                    prefetch={false}
                    className="underline-offset-4 hover:underline"
                  >
                    {r.i.test}
                  </Link>
                  {restricted.has(r.i.orderId) ? (
                    <span className="text-caption text-muted-foreground">Restricted</span>
                  ) : null}
                </span>
              ),
            },
            { id: "why", header: "Why", cell: (r) => <span>{r.d?.words}</span> },
            {
              id: "to",
              header: "Referred to",
              cell: (r) => <span>{r.d?.referredTo ?? "Not named in the hub"}</span>,
            },
          ]}
        />
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title="To refer" />
      {send.rows.length === 0 && send.manifests.length === 0 ? (
        <EmptyState title="Nothing to refer today." />
      ) : (
        <SendPanel
          rows={send.rows}
          partners={send.partners}
          manifests={send.manifests}
          canRefer={canRefer}
          v2={false}
        />
      )}
    </div>
  );
}
