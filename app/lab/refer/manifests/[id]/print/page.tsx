import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labReferralLiveFor } from "@/lib/lab/feature";
import { redirectIfV2 } from "../../../../_lib/v2-redirect";
import { ManifestPrint } from "../../../../send-outs/_views/manifest-print";

export const metadata: Metadata = { title: "Manifest · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** The printed manifest (Lab Phase 4 §5.2). With Lab Workspace v2 on, it lives under Send-outs (308). */
export default async function ManifestPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await redirectIfV2(`/lab/send-outs/manifests/${id}/print`);
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labReferralLiveFor(scope.hospitalId)
  )
    notFound();
  return <ManifestPrint scope={scope} id={id} />;
}
