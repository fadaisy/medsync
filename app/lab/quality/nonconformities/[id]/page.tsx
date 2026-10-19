import type { Metadata } from "next";

import { NcDetailView } from "../../_views/nc-detail";
import { redirectIfV2 } from "../../../_lib/v2-redirect";

export const metadata: Metadata = { title: "Nonconformity · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Old route (Lab Phase 3): 308 to /lab/quality/nc/[id] under Lab Workspace v2, the old page otherwise. */
export default async function NonconformityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  await redirectIfV2(`/lab/quality/nc/${id}`, searchParams);
  return <NcDetailView v2={false} id={id} />;
}
