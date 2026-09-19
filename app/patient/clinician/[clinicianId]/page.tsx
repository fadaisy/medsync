import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { feeLinesFor, fetchProviderDetail } from "@/lib/patient/discover";
import { requirePatientScope } from "@/lib/patient/scope";
import { FEE_FOOTNOTE, WAIVER_NOTE } from "@/supabase/functions/_shared/fees";
import { ProviderScreen } from "./_components/provider-screen";

export const metadata: Metadata = { title: "Clinician · MedSync" };
export const dynamic = "force-dynamic";

/**
 * One clinician, and the booking that starts from them — ADR 0085 §4's
 * "doctor page", which that record names as the web's outstanding follow-up.
 *
 * The fee shown here is a RANGE, not a quote: this screen browses, and the
 * quote is only ever promised at the moment of booking, when the core resolves
 * it against the clinician's cadre and snapshots it (ADR 0092). Where a
 * facility has set no cadre overrides — the Ugandan norm — the range collapses
 * to the one number the line charges.
 */
export default async function ClinicianPage({
  params,
}: {
  params: Promise<{ clinicianId: string }>;
}) {
  const { clinicianId } = await params;
  const scope = await requirePatientScope();
  if (!scope.primaryHospitalId) notFound();

  const provider = await fetchProviderDetail(scope.primaryHospitalId, scope.userId, clinicianId);
  if (!provider) notFound();

  // What the line charges — the same read the home's tiles use (ADR 0092).
  const feeLine = (await feeLinesFor([provider.lineId])).get(provider.lineId) ?? null;

  return (
    <ProviderScreen
      provider={provider}
      feeLine={feeLine}
      // Both sentences are non-optional wherever money appears (ADR 0092):
      // MedSync takes no payment, and MoH §2.2(J) makes waiving a duty.
      feeNotes={feeLine ? [FEE_FOOTNOTE, WAIVER_NOTE] : []}
    />
  );
}
