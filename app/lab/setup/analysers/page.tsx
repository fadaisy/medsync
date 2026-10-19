import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { SetupHeader } from "../_components/setup-header";
import { labV2 } from "../../_lib/places";
import { AnalysersView } from "./_views/analysers";

export const metadata: Metadata = { title: "Analysers · Set-up · Laboratory" };
export const dynamic = "force-dynamic";

/** Analyser bridge and code maps, in Set-up (Lab Workspace v2, gate-a §3; was /lab/exchange/analysers). */
export default async function SetupAnalysersPage() {
  const v2 = await labV2();
  if (!v2.live) notFound();
  // Read-only for every lab user who saw Analysers before (parity); signing and editing stay the lead's.
  if (!v2.visible.has("analysers")) notFound();
  return (
    <AnalysersView
      hospitalId={v2.scope.hospitalId}
      v2
      header={
        <SetupHeader
          place={v2.scope.hospitalName}
          placeInTopBar
          title={LABWS2_SETUP.analysers.title}
        />
      }
    />
  );
}
