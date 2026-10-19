import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ManifestPrint } from "../../../_views/manifest-print";
import { labV2 } from "../../../../_lib/places";

export const metadata: Metadata = { title: "Manifest · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** The printed manifest under Send-outs (prompt 5.6; gate-a §3). */
export default async function SendOutsManifestPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const v2 = await labV2();
  if (!v2.live || !v2.flags.referral) notFound();
  const { id } = await params;
  return <ManifestPrint scope={v2.scope} id={id} />;
}
