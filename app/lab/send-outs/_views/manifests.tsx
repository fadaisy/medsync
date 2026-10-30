import "server-only";

import type { LabTechScope } from "@/lib/lab-tech/scope";

import { LABWS2_SEND_OUTS as S } from "@/content/lab-workspace-v2-send-outs";
import { db } from "@/db";
import { loadOpenManifests } from "@/lib/lab/referral-read";
import { Manifests } from "../_components/send-panel";
import { EmptyState } from "@/components/tide/work/kit";

/** Manifests (Lab Phase 4 §5.1, §5.2): open, sealed and handed over, with Seal, Print, Hand over and Record receipt. */
export async function ManifestsView({ scope, m }: { scope: LabTechScope; m?: string }) {
  const manifests = await db.transaction((tx) => loadOpenManifests(tx, scope.hospitalId));
  const canRefer =
    scope.access.permissions.has("lab.refer") || scope.access.permissions.has("lab.manage");
  if (!manifests.length) return <EmptyState title={S.manifestsEmpty} next={S.manifestsEmptyNext} />;
  return <Manifests manifests={manifests} canRefer={canRefer} v2 highlight={m} />;
}
