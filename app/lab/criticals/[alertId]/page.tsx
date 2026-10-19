import type { Metadata } from "next";

import { redirectIfV2 } from "../../_lib/v2-redirect";
import { CriticalAlertView } from "../../needs-you/_views/critical-alert";

export const metadata: Metadata = { title: "Critical alert · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Lab Workspace v2: 308 to the alert inside Needs you when the flag is on; the Phase 1 page otherwise. */
export default async function LabCriticalDetailPage({
  params,
}: {
  params: Promise<{ alertId: string }>;
}) {
  const { alertId } = await params;
  await redirectIfV2(`/lab/needs-you/criticals/${alertId}`);
  return <CriticalAlertView alertId={alertId} />;
}
