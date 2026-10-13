import { LabReportView, reasonWord } from "@/components/lab/lab-report-view";
import { LAB3_REPORTS } from "@/content/lab-phase-3";
import { db } from "@/db";
import { asClinicalReader } from "@/lib/emr/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { labReportsLiveFor } from "@/lib/lab/feature";
import { departmentNames, reportFromCounts, statedTargets } from "@/lib/lab/report-store";

const R = LAB3_REPORTS;

/**
 * The laboratory's indicators on the admin reports page (§5.13, D-LAB3-26, Law 10): the same tiles as the lab's page
 * over the admin's window, read as the clinical reader through `private.lab_indicator_counts` (numbers only, 0118),
 * with no link to any record. Renders nothing while labReports is off.
 */
export async function LabAggregates({
  scope,
  from,
  to,
}: {
  scope: { userId: string; hospitalId: string };
  from: Date;
  to: Date;
}) {
  const h = scope.hospitalId;
  if (!emrV1LiveFor(h) || !labReportsLiveFor(h)) return null;
  const [targets, depts] = await db.transaction((t) =>
    Promise.all([statedTargets(t as never, h), departmentNames(t as never, h)]),
  );
  const report = await asClinicalReader(scope, (tx) =>
    reportFromCounts(tx, { from, to, now: to, targets }),
  );
  if (!report) return null;
  return (
    <section aria-labelledby="lab-heading" className="flex flex-col gap-3">
      <h2 id="lab-heading" className="text-foreground text-heading-s">
        {R.adminTitle}
      </h2>
      <p className="text-muted-foreground text-body-s max-w-xl leading-relaxed">{R.adminLede}</p>
      <LabReportView
        report={report}
        drill={null}
        names={{
          section: (id) => (id ? (depts.get(id) ?? id) : R.noSection),
          ward: (id) => (id ? (depts.get(id) ?? id) : R.noWard),
          reason: reasonWord,
        }}
      />
    </section>
  );
}
