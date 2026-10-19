import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labExchangeLiveFor, labReferralLiveFor } from "@/lib/lab/feature";
import { redirectIfV2 } from "../_lib/v2-redirect";
import { ReferralsBoard } from "../send-outs/_views/board";

export const metadata: Metadata = { title: "Referrals · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Referrals (Lab Phase 4 §5.3, artboard 3): where every referred specimen is, who said so, and when it is
 * expected back. With Lab Workspace v2 on, this is the Send-outs board (308), keeping month, partner, view and r.
 */
export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; partner?: string; view?: string; r?: string }>;
}) {
  await redirectIfV2("/lab/send-outs?tab=board", searchParams);
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labReferralLiveFor(scope.hospitalId)
  )
    notFound();
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title="Referrals" />
      <ReferralsBoard
        scope={scope}
        q={await searchParams}
        v2={false}
        base="/lab/referrals"
        toRefer={false}
        exchange={labExchangeLiveFor(scope.hospitalId)}
      />
    </div>
  );
}
