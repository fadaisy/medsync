import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labReferralLiveFor } from "@/lib/lab/feature";
import { redirectIfV2 } from "../../../_lib/v2-redirect";
import { ResultBack } from "../../../send-outs/_views/result";

export const metadata: Metadata = { title: "Result back on paper · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Result back on paper (Lab Phase 4 §5.4). With Lab Workspace v2 on, it lives under Send-outs (308). */
export default async function ResultBackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await redirectIfV2(`/lab/send-outs/${id}/result`);
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labReferralLiveFor(scope.hospitalId)
  )
    notFound();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <ResultBack
        scope={scope}
        id={id}
        doneHref="/lab/referrals"
        header={(number) => (
          <PageHeader
            place={`${scope.hospitalName} · ${LAB.place} / Referrals / ${number}`}
            placeInTopBar
            title="Result back on paper"
          />
        )}
      />
    </div>
  );
}
