import "server-only";

import { notFound } from "next/navigation";

import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labEqaLiveFor, labQcLiveFor } from "@/lib/lab/feature";

/** A nonconformity page opens with either source of automatic nonconformities on: QC or EQA (Step 7). */
export const ncLiveFor = (h: string) => labQcLiveFor(h) || labEqaLiveFor(h);

/**
 * The quality pages exist only with the lab workspace, the record and their flag on (§5: behind its flag):
 * labQc by default; EQA passes labEqa, bedside quality labPoctQuality, nonconformities either source.
 */
export async function requireQualityScope(live: (hospitalId: string) => boolean = labQcLiveFor) {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive || !emrV1LiveFor(scope.hospitalId) || !live(scope.hospitalId))
    notFound();
  const p = scope.access.permissions;
  return {
    scope,
    lead: p.has("lab.manage"),
    staff: p.has("lab.manage") || p.has("lab.result.release"),
  };
}
