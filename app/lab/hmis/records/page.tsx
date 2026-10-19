import type { Metadata } from "next";

import { labHmisLiveFor } from "@/lib/lab/feature";
import { redirectIfV2 } from "../../_lib/v2-redirect";
import { requireQualityScope } from "../../quality/_lib/scope";
import { HmisRecordsBody } from "../../reports/hmis/_views/records";

export const metadata: Metadata = { title: "Records counted · HMIS 105 · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** The records behind one HMIS 105 number. With Lab Workspace v2 on: 308 to /lab/reports/hmis/records. */
export default async function HmisRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; rev?: string; key?: string }>;
}) {
  await redirectIfV2("/lab/reports/hmis/records", searchParams);
  const { scope } = await requireQualityScope(labHmisLiveFor);
  return <HmisRecordsBody scope={scope} sp={await searchParams} />;
}
