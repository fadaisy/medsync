import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LABWS2 } from "@/content/lab-workspace-v2";
import { OlderView } from "../_views/older";
import { Panel } from "@/components/tide/work/kit";
import { ViewHeader } from "../../_components/v2/view-header";
import { labV2 } from "../../_lib/places";

export const metadata: Metadata = { title: "Older results · Laboratory" };
export const dynamic = "force-dynamic";

/** Older results (Lab Phase 1 CO-4), read-only, from the bench's Released today. */
export default async function BenchOlderPage() {
  const v2 = await labV2();
  if (!v2.live) notFound();
  return (
    <>
      <ViewHeader title={LABWS2.bench.older} />
      <Panel>
        <OlderView v2 />
      </Panel>
    </>
  );
}
