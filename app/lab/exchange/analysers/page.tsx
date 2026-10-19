import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labExchangeLiveFor } from "@/lib/lab/feature";
import { redirectIfV2 } from "../../_lib/v2-redirect";
import { AnalysersView } from "../../setup/analysers/_views/analysers";

export const metadata: Metadata = { title: "Analysers · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Analysers (Lab Phase 4 §5.8). With Lab Workspace v2 on, it lives in Set-up (gate-a §3). */
export default async function AnalysersPage() {
  await redirectIfV2("/lab/setup/analysers");
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labExchangeLiveFor(scope.hospitalId)
  )
    notFound();
  return (
    <AnalysersView
      hospitalId={scope.hospitalId}
      v2={false}
      header={
        <PageHeader
          place={`${scope.hospitalName} · ${LAB.place}`}
          placeInTopBar
          title={LABWS2_SETUP.analysers.title}
        />
      }
    />
  );
}
