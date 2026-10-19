import type { Metadata } from "next";

import { NcListView } from "../_views/nc";
import { redirectIfV2 } from "../../_lib/v2-redirect";

export const metadata: Metadata = { title: "Nonconformities · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Old route (Lab Phase 3 §5.9): 308 to Quality · Nonconformities under Lab Workspace v2. */
export default async function NonconformitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfV2("/lab/quality?tab=nc", searchParams);
  return <NcListView v2={false} />;
}
