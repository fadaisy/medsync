import type { Metadata } from "next";

import { EqaView } from "../_views/eqa";
import { redirectIfV2 } from "../../_lib/v2-redirect";

export const metadata: Metadata = { title: "External quality assessment · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Old route (Lab Phase 3): 308 to /lab/quality?tab=eqa under Lab Workspace v2, the old page otherwise. */
export default async function EqaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfV2("/lab/quality?tab=eqa", searchParams);
  return <EqaView v2={false} />;
}
