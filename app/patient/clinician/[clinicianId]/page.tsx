import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { feeInputsFor, fetchProviderDetail } from "@/lib/patient/discover";
import { requirePatientScope } from "@/lib/patient/scope";
import {
  FEE_FOOTNOTE,
  quoteLine,
  resolveFee,
  WAIVER_NOTE,
} from "@/supabase/functions/_shared/fees";
import { ProviderScreen } from "./_components/provider-screen";

export const metadata: Metadata = { title: "Clinician · MedSync" };
export const dynamic = "force-dynamic";

/**
 * One clinician, and the booking that starts from them — ADR 0085 §4's
 * "doctor page", which that record names as the web's outstanding follow-up.
 *
 * The fee shown here is this clinician's own number, resolved against their
 * cadre by the same rule the booking core will apply and snapshot (ADR 0092).
 * The line's RANGE belongs on a clinic day whose clinician is not yet named;
 * on a screen about one named person a range would be false.
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

  // THIS clinician's quote — their cadre is known, so the number is one, not
  // the line's range (ADR 0092: a range only where the price is unknowable).
  const inputs = (await feeInputsFor([provider.lineId])).get(provider.lineId);
  const feeLine = inputs ? quoteLine(resolveFee(inputs, provider.cadreId)) : null;

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
