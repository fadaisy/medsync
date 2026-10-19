import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labExchangeLiveFor } from "@/lib/lab/feature";
import { redirectIfV2 } from "../_lib/v2-redirect";
import { ConnectionsView } from "../send-outs/_views/connections";

export const metadata: Metadata = { title: "Connections · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Connections and the message queue (Lab Phase 4 §5.6). With Lab Workspace v2 on, a Send-outs tab (308). */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await redirectIfV2("/lab/send-outs?tab=connections", searchParams);
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labExchangeLiveFor(scope.hospitalId)
  )
    notFound();
  const { view } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="Connections"
      />
      <ConnectionsView scope={scope} view={view} base="/lab/exchange" v2={false} />
    </div>
  );
}
