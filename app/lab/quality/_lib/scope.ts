import "server-only";

import { notFound } from "next/navigation";

import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labQcLiveFor } from "@/lib/lab/feature";

/** The quality pages exist only with the lab workspace, the record and labQc on (§5: behind its flag). */
export async function requireQualityScope() {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive || !emrV1LiveFor(scope.hospitalId) || !labQcLiveFor(scope.hospitalId))
    notFound();
  const p = scope.access.permissions;
  return {
    scope,
    lead: p.has("lab.manage"),
    staff: p.has("lab.manage") || p.has("lab.result.release"),
  };
}
