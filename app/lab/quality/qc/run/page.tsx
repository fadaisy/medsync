import type { Metadata } from "next";

import { QcRunView } from "../../_views/run";
import { labV2 } from "../../../_lib/places";

export const metadata: Metadata = { title: "QC run · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * One analyte on one analyser (Lab Phase 3 §5.2). The path stays under Lab Workspace v2 (gate-a §3) and renders
 * inside the shell; with no item chosen it lists the plans to pick from ("Record a QC run").
 */
export default async function QcRunPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string; concept?: string; level?: string; days?: string }>;
}) {
  const v2 = await labV2();
  return <QcRunView v2={v2.live} sp={await searchParams} />;
}
