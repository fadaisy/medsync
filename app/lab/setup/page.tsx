import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import { hubGroups } from "@/lib/lab/setup-hub";
import { loadSetupHub } from "@/lib/lab/setup-hub-read";
import { one } from "../_lib/place-tabs";
import { labV2 } from "../_lib/places";
import { HubFinder } from "./_components/hub-finder";
import { CsoQueue, SignatureQueue } from "./_components/signature-queue";

export const metadata: Metadata = { title: "Set-up · Laboratory" };
export const dynamic = "force-dynamic";

const S = LABWS2_SETUP;

/** Set-up hub (prompt 5.8; gate-a §1): the lead's signature queue and the six groups of settings. */
export default async function SetupHubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live) notFound();
  if (!v2.scope.access.permissions.has("lab.manage")) notFound();
  const sign = one((await searchParams).sign);
  const { queue, facts } = await loadSetupHub(v2.scope.hospitalId, v2.scope.userId, v2.visible);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-muted-foreground">{S.note}</p>
      <HubFinder groups={hubGroups(facts, v2.visible)}>
        <SignatureQueue rows={queue.mine} highlight={sign} />
        {queue.cso.length ? <CsoQueue rows={queue.cso} /> : null}
      </HubFinder>
    </div>
  );
}
