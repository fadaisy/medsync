import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CriticalAlertView } from "../../_views/critical-alert";
import { labV2 } from "../../../_lib/places";

export const metadata: Metadata = { title: "Critical alert · Laboratory" };
export const dynamic = "force-dynamic";

/** One critical alert, inside Needs you (Appendix C: Criticals → Needs you). */
export default async function NeedsYouCriticalPage({
  params,
}: {
  params: Promise<{ alertId: string }>;
}) {
  const v2 = await labV2();
  if (!v2.live) notFound();
  const { alertId } = await params;
  return <CriticalAlertView alertId={alertId} v2 />;
}
