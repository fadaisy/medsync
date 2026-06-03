import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TriageDesk } from "@/app/nurse/triage/_components/triage-desk";
import { requireTriageScope } from "@/lib/triage/scope";
import { fetchTriageWorklistRow } from "@/lib/triage/worklist";

export const metadata: Metadata = {
  title: "Triage · MedSync",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * /doctor/triage/[intakeId] — the doctor-side full-page triage desk. Mirrors
 * the nurse desk page with the /doctor base path so the back-to-worklist nav
 * stays inside the doctor workspace. Doctors may down-triage (seed policy).
 */
export default async function DoctorTriageDeskPage({
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
    <TriageDesk row={row} mayDownTriage={scope.authority.mayDownTriage} basePath="/doctor/triage" />
  );
}
