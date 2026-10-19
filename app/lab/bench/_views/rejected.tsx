import type { RejectedRow } from "@/lib/lab/read";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { sentenceCase } from "@/components/medsync/workspace-shell";
import { LAB } from "@/content/lab";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";
import { identitiesFor } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { LAB_TIME_ZONE, rejectedFor } from "@/lib/lab/page-data";
import { PatientNameMrn, RecordList } from "../../_components/record-list";

const reasonWords = (code: string | null) => {
  const words = code ? REJECTION_REASON_TEXT[code as keyof typeof REJECTION_REASON_TEXT] : null;
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "—";
};

/**
 * Rejected (Lab Phase 0 §5.5): specimens rejected in the last 7 days, with the coded reason and
 * whether the ward has re-collected. Read-only: each order already went back to "to collect".
 */
export async function RejectedView({ v2 = false }: { v2?: boolean }) {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive) notFound();
  const R = LAB.rejected;
  const emr = emrV1LiveFor(scope.hospitalId);
  const rows = emr ? await rejectedFor(scope.hospitalId) : [];
  const ids = await identitiesFor(
    scope,
    rows.map((r) => r.patientUserId),
    "lab_rejected",
  );
  const time = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  return (
    <div
      className={
        v2
          ? "flex flex-col gap-4"
          : "mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6"
      }
    >
      {v2 ? null : (
        <PageHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title={R.title} />
      )}
      {emr ? null : <p className="text-body-s text-muted-foreground">{LAB.worklist.legacy}</p>}
      <RecordList<RejectedRow>
        caption={R.title}
        rows={rows}
        rowKey={(r) => `${r.orderId}-${r.rejectedAt.toISOString()}`}
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
              <Link
                href={`${v2 ? "/lab/bench" : "/lab/results"}/${r.orderId}`}
                prefetch={false}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {r.test}
              </Link>
            ),
          },
          {
            id: "rejected",
            header: R.columns.rejected,
            cell: (r) => (
              <span>
                <span className="tabular-nums">{time.format(r.rejectedAt)}</span>
                {r.rejectedByCadre ? (
                  <span className="text-muted-foreground">, {sentenceCase(r.rejectedByCadre)}</span>
                ) : null}
              </span>
            ),
          },
          { id: "reason", header: R.columns.reason, cell: (r) => reasonWords(r.reasonCode) },
          {
            id: "now",
            header: R.columns.now,
            cell: (r) =>
              r.recollectedAt ? R.recollected(clock.format(r.recollectedAt)) : R.awaiting,
          },
        ]}
      />
      {rows.length ? (
        <p className="text-body-s text-muted-foreground">{R.footer(rows.length)}</p>
      ) : null}
    </div>
  );
}
