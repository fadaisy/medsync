import type { ReleasedRow } from "@/lib/lab/read";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { identitiesFor } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { LAB_TIME_ZONE, releasedTodayFor } from "@/lib/lab/page-data";
import { sentenceCase } from "../_components/lab-shell";
import { PatientNameMrn, RecordList } from "../_components/record-list";
import { ReleasedTurnaroundCell } from "../_components/turnaround-cell";

export const metadata: Metadata = { title: "Released today · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Released today (Lab Phase 0 §5.5): final results released since 00:00 at the hospital, with
 * their turnaround. Read-only; each row opens the existing result view, where amendment stays.
 */
export default async function ReleasedTodayPage() {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive) notFound();
  const R = LAB.released;
  const emr = emrV1LiveFor(scope.hospitalId);
  const rows = emr ? await releasedTodayFor(scope.hospitalId) : [];
  const ids = await identitiesFor(
    scope,
    rows.map((r) => r.patientUserId),
    "lab_released",
  );
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title={R.title} />
      {emr ? null : <p className="text-body-s text-muted-foreground">{LAB.worklist.legacy}</p>}
      <RecordList<ReleasedRow>
        caption={R.title}
        rows={rows}
        rowKey={(r) => `${r.orderId}-${r.releasedAt.toISOString()}`}
        empty={R.empty}
        columns={[
          {
            id: "patient",
            header: R.columns.patient,
            cell: (r) => <PatientNameMrn identity={ids.get(r.patientUserId)} />,
          },
          {
            id: "test",
            header: R.columns.test,
            cell: (r) => (
              <span className="inline-flex flex-col">
                <Link
                  href={`/lab/results/${r.orderId}`}
                  prefetch={false}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {r.test}
                </Link>
                {r.downtimeForm ? (
                  <span className="text-caption text-muted-foreground">
                    Entered after downtime · paper form DT-{String(r.downtimeForm).padStart(5, "0")}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            id: "released",
            header: R.columns.released,
            cell: (r) => (
              <span>
                <span className="font-mono tabular-nums">{time.format(r.releasedAt)}</span>
                {r.releasedByCadre ? (
                  <span className="text-muted-foreground">, {sentenceCase(r.releasedByCadre)}</span>
                ) : null}
              </span>
            ),
          },
          {
            id: "turnaround",
            header: R.columns.turnaround,
            cell: (r) => <ReleasedTurnaroundCell turnaround={r.turnaround} target={r.target} />,
          },
          {
            id: "state",
            header: R.columns.state,
            cell: (r) => (r.state === "amended" ? R.amended : R.final),
          },
        ]}
      />
      {rows.length ? (
        <p className="text-body-s text-muted-foreground">{R.footer(rows.length)}</p>
      ) : null}
    </div>
  );
}
