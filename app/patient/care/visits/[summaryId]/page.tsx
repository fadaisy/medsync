import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OneTapAction } from "@/app/patient/appointments/_components/one-tap-action";
import { VisitSummaryView } from "@/components/patient/visit-summary-view";
import { Pill } from "@/components/ui/pill";
import { requirePatientScope } from "@/lib/patient/scope";
import { getVisitSummary, prescriptionsInTracker } from "@/lib/patient/visit-summaries";
import { takeHomePrescriptionIds } from "@/lib/patient/visit-summary";
import { PatientPageHeader } from "../../../_components/page-header";
import { addMedicineFromVisitAction } from "./actions";

export const metadata: Metadata = { title: "Your visit · MedSync" };
export const dynamic = "force-dynamic";

/** One shared visit summary (ADR 0203): the patient's own current copy, or a 404. */
export default async function PatientVisitSummaryPage({
  params,
}: {
  params: Promise<{ summaryId: string }>;
}) {
  const { summaryId } = await params;
  const scope = await requirePatientScope();
  const content = await getVisitSummary(scope.userId, summaryId);
  if (!content) notFound();

  const rxIds = takeHomePrescriptionIds(content);
  const inTracker = await prescriptionsInTracker(scope.userId, rxIds);

  return (
    <div className="stagger-children flex flex-col gap-6">
      <PatientPageHeader
        eyebrow="MedSync · My care"
        title="Your visit"
        description="What your care team shared with you about this visit."
        backHref="/patient/care"
        backLabel="Back to My care"
      />

      <section className="bg-card dark:shadow-card flex flex-col gap-4 rounded-xl p-5 shadow-xs">
        <VisitSummaryView
          content={content}
          itemAction={(item, section) => {
            if (section !== "medicines") return null;
            const prescriptionId = item.id.slice("rx:".length);
            return inTracker.has(prescriptionId) ? (
              <Pill tone="active">In your medicines</Pill>
            ) : (
              <OneTapAction
                action={addMedicineFromVisitAction}
                fields={{ summary_id: summaryId, prescription_id: prescriptionId }}
                label="Add to my medicines"
                pendingLabel="Adding…"
                doneLabel="In your medicines"
                variant="secondary"
              />
            );
          }}
        />
        {rxIds.length > 0 ? (
          <p className="text-caption text-muted-foreground">
            A medicine you add has no dose times yet. Set them in{" "}
            <Link
              href="/patient/track/medications"
              className="text-teal-700 underline-offset-4 hover:underline"
            >
              your medicines
            </Link>
            .
          </p>
        ) : null}
        {content.next ? (
          <Link
            href="/patient/appointments"
            className="text-body-s inline-flex min-h-11 w-fit items-center font-medium text-teal-700 underline-offset-4 hover:underline"
          >
            Your appointments
          </Link>
        ) : null}
      </section>
    </div>
  );
}
