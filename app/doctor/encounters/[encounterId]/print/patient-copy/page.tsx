import type { PrintPageProps } from "../_lib/load";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { formatters } from "@/components/emr/format";
import { PrintLayout } from "@/components/emr/print-layout";
import { PrintToolbar } from "@/components/emr/print-toolbar";
import { identityOf } from "@/components/emr/print-views";
import { VisitSummaryView } from "@/components/patient/visit-summary-view";
import { patientVisitSummaries } from "@/db/schema/admissions";
import { requireEmrActor } from "@/lib/emr/actor";
import { patientVisitSummaryLiveFor } from "@/lib/emr/feature";
import { withPatientWrite } from "@/lib/emr/write/context";
import { composeForEncounter } from "@/lib/emr/write/visit-summary";
import { decrypt } from "@/lib/encryption";
import { parseVisitSummary } from "@/lib/patient/visit-summary";
import { loadPrint } from "../_lib/load";

export const metadata: Metadata = { title: "Patient copy · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The patient's copy on paper (ADR 0203): the shared version when there is one, so paper and app never differ;
 * otherwise the copy as it would be shared now (restricted items already gone). Same composer, same view.
 */
export default async function PatientCopyPrintPage({ params }: PrintPageProps) {
  const { encounterId } = await params;
  const { chart, encounter } = await loadPrint(encounterId, "emr_print_patient_copy");
  const actor = await requireEmrActor("doctor");
  if (!patientVisitSummaryLiveFor(actor.hospitalId)) notFound();
  const content = await withPatientWrite(actor, chart.patientUserId, async (ctx) => {
    const [shared] = await ctx.tx
      .select({ ciphertext: patientVisitSummaries.copyCiphertext })
      .from(patientVisitSummaries)
      .where(
        and(
          eq(patientVisitSummaries.encounterId, encounterId),
          eq(patientVisitSummaries.state, "shared"),
          isNull(patientVisitSummaries.supersededAt),
        ),
      );
    if (shared?.ciphertext) return parseVisitSummary(decrypt(shared.ciphertext));
    return (await composeForEncounter(ctx, { patientUserId: chart.patientUserId, encounterId }))
      .content;
  }).catch(() => null);
  if (!content) notFound();
  return (
    <PrintLayout
      title="Your visit"
      hospital={chart.hospitalName}
      patient={identityOf(chart.payload)}
      date={formatters(chart.timeZone).date(encounter.startedAt)}
      toolbar={<PrintToolbar withheld={[]} included={[]} />}
    >
      <VisitSummaryView content={content} timeZone={chart.timeZone} />
    </PrintLayout>
  );
}
