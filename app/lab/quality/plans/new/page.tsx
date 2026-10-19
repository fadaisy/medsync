import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { NewPlanView } from "../../_views/new-plan";
import { ViewHeader } from "../../../_components/v2/view-header";
import { one } from "../../../_lib/place-tabs";
import { labV2 } from "../../../_lib/places";

export const metadata: Metadata = { title: "New QC plan · Quality · Laboratory" };
export const dynamic = "force-dynamic";

/** Lab Workspace v2: New QC plan (prompt 5.11), the laboratory lead's. */
export default async function NewQcPlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live) notFound();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ViewHeader title={LABWS2_QUALITY.newPlan.title} subline={LABWS2_QUALITY.newPlan.subline} />
      <NewPlanView device={one((await searchParams).device)} />
    </div>
  );
}
