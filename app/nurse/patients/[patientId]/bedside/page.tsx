import type { EmrTx } from "@/lib/emr/db";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { loadChart } from "@/lib/emr/read/chart";
import { isOperator } from "@/lib/lab/bedside-store";
import { labBedsideLiveFor } from "@/lib/lab/feature";
import { requireNurseScope } from "@/lib/nurse/scope";
import { BedsideForm } from "./_components/bedside-form";
import { BEDSIDE as C } from "./_lib/copy";
import { loadBedsideForm } from "./_lib/load";

export const metadata: Metadata = { title: "Bedside test · Nurse · MedSync" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ patientId: string }>;
}

/**
 * Bedside tests (Lab Phase 2 §5.7, artboard 7), reached from the nurse's patient page. Nurse scope, the
 * labBedside flag (off: this route does not exist) and a grant from the laboratory lead (D-LAB2-09); the
 * patient's open visit here takes the result, as the patient page's orders do.
 */
export default async function BedsidePage({ params }: PageProps) {
  const { patientId } = await params;
  const scope = await requireNurseScope();
  if (!emrV1LiveFor(scope.hospitalId) || !labBedsideLiveFor(scope.hospitalId)) notFound();

  const shell = (children: ReactNode) => (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href={`/nurse/patients/${patientId}`}
        className="text-body-s text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 transition-colors"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        {C.back}
      </Link>
      <PageHeader place={scope.hospitalName} title={C.title} />
      {children}
    </div>
  );

  if (!(await isOperator(db as unknown as EmrTx, scope.hospitalId, scope.userId)))
    return shell(<CautionNotice tone="neutral" lead={C.notOperator} />);
  const chart = await loadChart("nurse", patientId, { logSurface: "lab_bedside_nurse" });
  if (!chart) return shell(<CautionNotice tone="neutral" lead={C.noAccess} />);
  if (!chart.openEncounterId || !chart.payload.safetyBar.actionsAllowed)
    return shell(<CautionNotice tone="neutral" lead={C.noVisit} />);

  const { ward, tests } = await loadBedsideForm(scope.hospitalId, patientId);
  const now = new Date();
  return shell(
    <>
      <p className="text-body-s text-muted-foreground">
        {ward ? C.ward(ward.name) : C.hospitalWide}
      </p>
      {tests.length === 0 ? (
        <CautionNotice tone="neutral" lead={C.noDevice} />
      ) : (
        <BedsideForm
          patientUserId={chart.patientUserId}
          encounterId={chart.openEncounterId}
          wardId={ward?.id ?? null}
          identity={{ name: chart.payload.safetyBar.name, mrn: chart.payload.safetyBar.mrn }}
          operator={scope.fullName ?? scope.userEmail}
          today={now.toISOString().slice(0, 10)}
          nowMs={now.getTime()}
          tests={tests}
        />
      )}
    </>,
  );
}
