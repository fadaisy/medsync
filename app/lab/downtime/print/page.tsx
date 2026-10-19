import type { SP } from "../../_lib/v2-redirect";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labDowntimeLiveFor } from "@/lib/lab/feature";
import { one } from "../../_lib/place-tabs";
import { redirectIfV2 } from "../../_lib/v2-redirect";
import { PrintFormsView, printRange } from "../../bench/downtime/_views/print-forms";

export const metadata: Metadata = { title: "Downtime forms · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** The paper forms to print (§5.9). With Lab Workspace v2 on, this answers 308 to /lab/bench/downtime/print. */
export default async function DowntimePrintPage({ searchParams }: { searchParams: Promise<SP> }) {
  await redirectIfV2("/lab/bench/downtime/print", searchParams);
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labDowntimeLiveFor(scope.hospitalId)
  )
    notFound();
  const { from, to } = await searchParams;
  const range = printRange(one(from), one(to));
  if (!range) notFound();
  return <PrintFormsView scope={scope} a={range.a} b={range.b} />;
}
