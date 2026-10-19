import type { Metadata } from "next";

import { redirectIfV2 } from "../../_lib/v2-redirect";
import { ReceiveView } from "../../quality/_views/receive";

export const metadata: Metadata = { title: "Receive a delivery · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Old route (Lab Phase 3 §5.6): 308 to /lab/quality/stock/receive under Lab Workspace v2. */
export default async function ReceivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfV2("/lab/quality/stock/receive", searchParams);
  return <ReceiveView v2={false} />;
}
