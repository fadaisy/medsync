import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { cadres } from "@/db/schema/reference-data";
import { serviceLineFees, serviceLines } from "@/db/schema/service-lines";
import { fetchProviderDetail } from "@/lib/patient/discover";
import { requirePatientScope } from "@/lib/patient/scope";
import { FEE_FOOTNOTE, feeRange, rangeLine, WAIVER_NOTE } from "@/supabase/functions/_shared/fees";
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

  // What the line charges, spanning the base and any cadre override. Read
  // here rather than in `fetchProviderDetail` so the browse read stays one
  // query per screen and a free line costs nothing extra.
  const [line] = await db
    .select({
      posture: serviceLines.paymentPosture,
      baseFeeUgx: serviceLines.feeUgx,
      name: serviceLines.name,
    })
    .from(serviceLines)
    .where(eq(serviceLines.id, provider.lineId))
    .limit(1);

  let feeLine: string | null = null;
  if (line && line.posture !== "none" && line.baseFeeUgx !== null) {
    const overrides = await db
      .select({
        cadreId: serviceLineFees.cadreId,
        cadreName: cadres.name,
        feeUgx: serviceLineFees.feeUgx,
      })
      .from(serviceLineFees)
      .innerJoin(cadres, eq(cadres.id, serviceLineFees.cadreId))
      .where(and(eq(serviceLineFees.serviceLineId, provider.lineId)));
    feeLine = rangeLine(
      feeRange({
        posture: line.posture,
        baseFeeUgx: line.baseFeeUgx,
        lineName: line.name,
        cadreFees: overrides,
      }),
    );
  }

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
