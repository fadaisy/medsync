import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HmisPrintBody } from "../_views/print";
import { labV2 } from "../../../_lib/places";

export const metadata: Metadata = { title: "HMIS 105 form · Reports · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Reports → HMIS 105 → Print form (gate-a §3; S31): the same print as /lab/hmis/print. */
export default async function ReportsHmisPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; rev?: string }>;
}) {
  const v2 = await labV2();
  if (!v2.live || !v2.visible.has("hmis")) notFound();
  return <HmisPrintBody scope={v2.scope} sp={await searchParams} />;
}
