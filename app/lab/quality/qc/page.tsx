import type { Metadata } from "next";

import { QcView } from "../_views/qc";
import { redirectIfV2 } from "../../_lib/v2-redirect";

export const metadata: Metadata = { title: "Quality control · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/** Old route (Lab Phase 3 §5.2, §5.4): 308 to Quality · QC plans under Lab Workspace v2. */
export default async function QualityControlPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await redirectIfV2("/lab/quality?tab=plans", searchParams);
  return <QcView v2={false} tab={(await searchParams).tab === "kits" ? "kits" : "analysers"} />;
}
