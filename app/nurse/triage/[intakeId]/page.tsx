import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { resusDeskV2 } from "@/lib/resus/feature";
import { requireTriageScope } from "@/lib/triage/scope";
import { fetchTriageWorklistRow } from "@/lib/triage/worklist";
import { TriageDesk } from "../_components/triage-desk";

export const metadata: Metadata = {
  title: "Triage · MedSync",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * /nurse/triage/[intakeId] — the full-page triage desk. Resolves the
 * triaging clinician's scope (authority R1) + the single intake row
 * (audited name reveal), then renders the live engine desk. notFound()
 * if the intake isn't in this clinician's hospital.
 */
export default async function TriageDeskPage({
  params,
}: {
  params: Promise<{ intakeId: string }>;
}) {
  const { intakeId } = await params;
  const scope = await requireTriageScope();
  const row = await fetchTriageWorklistRow({
    intakeId,
    hospitalId: scope.hospitalId,
    clinicianUserId: scope.userId,
  });
  if (!row) notFound();

  return (
    <TriageDesk
      row={row}
      mayDownTriage={scope.authority.mayDownTriage}
      openResusOnArrest={resusDeskV2()}
    />
  );
}
