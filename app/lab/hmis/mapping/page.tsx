import type { Metadata } from "next";

import { labHmisLiveFor } from "@/lib/lab/feature";
import { redirectIfV2 } from "../../_lib/v2-redirect";
import { requireQualityScope } from "../../quality/_lib/scope";
import { HmisMappingView } from "../../setup/hmis-mapping/_views/hmis-mapping";

export const metadata: Metadata = { title: "HMIS mapping · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** The HMIS 105 mapping editor (HM-2). With Lab Workspace v2 on, it lives in Set-up (gate-a §3). */
export default async function HmisMappingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfV2("/lab/setup/hmis-mapping", searchParams);
  const { scope } = await requireQualityScope(labHmisLiveFor);
  return <HmisMappingView scope={scope} v2={false} />;
}
