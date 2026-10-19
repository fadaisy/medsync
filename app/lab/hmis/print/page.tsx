import type { Metadata } from "next";

import { labHmisLiveFor } from "@/lib/lab/feature";
import { redirectIfV2 } from "../../_lib/v2-redirect";
import { requireQualityScope } from "../../quality/_lib/scope";
import { HmisPrintBody } from "../../reports/hmis/_views/print";

export const metadata: Metadata = { title: "HMIS 105 form · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** HM-12, the printed HMIS 105. With Lab Workspace v2 on: 308 to /lab/reports/hmis/print (gate-a §3). */
export default async function HmisPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; rev?: string }>;
}) {
  await redirectIfV2("/lab/reports/hmis/print", searchParams);
  const { scope } = await requireQualityScope(labHmisLiveFor);
  return <HmisPrintBody scope={scope} sp={await searchParams} />;
}
