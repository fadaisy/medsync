import type { Metadata } from "next";

import { BedsideView } from "../_views/bedside";
import { redirectIfV2 } from "../../_lib/v2-redirect";

export const metadata: Metadata = { title: "Bedside quality · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Old route (Lab Phase 3): 308 to /lab/quality?tab=bedside under Lab Workspace v2, the old page otherwise. */
export default async function BedsideQualityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfV2("/lab/quality?tab=bedside", searchParams);
  return <BedsideView v2={false} />;
}
