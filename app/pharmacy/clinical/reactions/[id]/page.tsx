import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { REACTIONS_UI as U } from "@/content/pharmacy-clinical";
import { db } from "@/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { reportFor } from "@/lib/pharmacy/clinical/reaction-read";
import { reportFields, reportText } from "@/lib/pharmacy/clinical/reactions";
import { pharmacyReactionsLiveFor } from "@/lib/pharmacy/feature";
import { ReportActions } from "./_components/report-actions";

export const metadata: Metadata = { title: "Reaction report · Pharmacy" };
export const dynamic = "force-dynamic";

/**
 * 5.6 one report, in the national form's order (sections A to F), with initials, age and sex only (AR-5). Print with
 * CSS; copy as text; record the submission (route and date) or close it with a reason. MedSync sends nothing.
 */
export default async function ReactionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePharmacyActor();
  if (!pharmacyReactionsLiveFor(actor.hospitalId)) notFound();
  const { id } = await params;
  // On the app connection: the clinical reader may not read the profile's name columns, which the
  // print turns into initials (AR-5).
  const r = await reportFor(db as unknown as EmrDb, actor.hospitalId, id);
  if (!r) notFound();
  const fields = reportFields(
    {
      reference: r.report.reference,
      kind: r.report.kind as Parameters<typeof reportFields>[0]["kind"],
      patient: r.patient,
      medicines: r.medicines,
      reactionText: r.report.reactionText,
      startedOn: r.report.startedOn,
      seriousness: r.report.seriousness,
      outcome: r.report.outcome,
      actionTaken: r.report.actionTaken,
      rechallenge: r.report.rechallenge,
      causality: r.causality,
      reporter: { role: r.report.reporter, cadre: r.report.recorderCadre },
    },
    new Date(),
  );
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="print:hidden">
        <PageHeader
          place={PHARMACY.place}
          placeInTopBar
          title={`${U.title}: ${r.report.reference}`}
          subline={<span className="text-body-s text-muted-foreground">{U.state[r.state]}</span>}
        />
      </div>
      <p className="text-body-s print:hidden">{U.notSent}</p>
      <dl className="text-body-s grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr] print:text-black">
        {fields.map((f) => (
          <div key={`${f.section}-${f.label}`} className="contents">
            <dt className="text-muted-foreground print:text-black">
              {f.section}. {f.label}
            </dt>
            <dd className="m-0">{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className="print:hidden">
        <ReportActions reportId={r.report.id} text={reportText(fields)} state={r.state} />
      </div>
    </div>
  );
}
