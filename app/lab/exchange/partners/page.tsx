import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labReferralLiveFor } from "@/lib/lab/feature";
import { redirectIfV2 } from "../../_lib/v2-redirect";
import { PartnersView } from "../../send-outs/_views/partners";

export const metadata: Metadata = { title: "Partners · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Partners (Lab Phase 4 §5.10). With Lab Workspace v2 on, it is a Send-outs tab (308). */
export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await redirectIfV2("/lab/send-outs?tab=partners", searchParams);
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labReferralLiveFor(scope.hospitalId)
  )
    notFound();
  const { p } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title="Partners" />
      <PartnersView scope={scope} p={p} base="/lab/exchange/partners" />
    </div>
  );
}
