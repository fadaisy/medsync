import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HmisRecordsBody } from "../_views/records";
import { labV2 } from "../../../_lib/places";

export const metadata: Metadata = {
  title: "Records counted · HMIS 105 · Reports · Laboratory · MedSync",
};
export const dynamic = "force-dynamic";

/** Reports → HMIS 105 → the records behind one number (gate-a §3), as at /lab/hmis/records. */
export default async function ReportsHmisRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; rev?: string; key?: string }>;
}) {
  const v2 = await labV2();
  if (!v2.live || !v2.visible.has("hmis")) notFound();
  return <HmisRecordsBody scope={v2.scope} sp={await searchParams} v2 />;
}
