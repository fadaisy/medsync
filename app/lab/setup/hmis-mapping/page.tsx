import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { labV2 } from "../../_lib/places";
import { HmisMappingView } from "./_views/hmis-mapping";

export const metadata: Metadata = { title: "HMIS mapping · Set-up · Laboratory" };
export const dynamic = "force-dynamic";

/** Registers and HMIS mapping, in Set-up (Lab Workspace v2, gate-a §3; was /lab/hmis/mapping). */
export default async function SetupHmisMappingPage() {
  const v2 = await labV2();
  if (!v2.live) notFound();
  // Every lab user who saw the mapping before still reads it; only the lead edits and signs (the editor holds that).
  if (!v2.visible.has("hmis")) notFound();
  return <HmisMappingView scope={v2.scope} v2 />;
}
