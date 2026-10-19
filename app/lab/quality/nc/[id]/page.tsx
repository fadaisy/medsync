import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NcDetailView } from "../../_views/nc-detail";
import { labV2 } from "../../../_lib/places";

export const metadata: Metadata = { title: "Nonconformity · Quality · Laboratory" };
export const dynamic = "force-dynamic";

/** Lab Workspace v2: one nonconformity inside the Quality place (gate-a §3). */
export default async function NcPage({ params }: { params: Promise<{ id: string }> }) {
  const v2 = await labV2();
  if (!v2.live) notFound();
  return <NcDetailView v2 id={(await params).id} />;
}
