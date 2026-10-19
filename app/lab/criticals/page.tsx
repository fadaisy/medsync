import type { AlertSummary } from "@/lib/lab/criticals/read";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CriticalLive } from "@/components/medsync/critical-live";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { CRITICALS_COPY, CRITICALS_UI } from "@/content/lab-criticals";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { identitiesFor } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { heartbeatStale } from "@/lib/lab/criticals/escalation";
import { loadLabCriticals } from "@/lib/lab/criticals/read";
import { criticalsLive } from "@/lib/lab/criticals/readiness";
import { LAB_TIME_ZONE, requestNow } from "@/lib/lab/page-data";
import { PatientNameMrn, RecordList } from "../_components/record-list";
import { redirectIfV2 } from "../_lib/v2-redirect";
import { AlertCell, Caution, MarkedValues } from "./_components/alert-bits";

export const metadata: Metadata = { title: "Criticals · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Criticals (Lab Phase 1 §5.3, artboard 3): every open alert at the hospital, longest open first,
 * then those acknowledged today. Nothing leaves the open list except by acknowledgement (Law 3).
 * Reading it runs the lazy escalation path first (ES-3); a stale scheduler is said in amber (ES-5).
 */
export default async function LabCriticalsPage() {
  await redirectIfV2("/lab/needs-you?filter=results");
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !(await criticalsLive(scope.hospitalId))
  )
    notFound();
  const now = requestNow();
  const data = await loadLabCriticals(scope.hospitalId, now, LAB_TIME_ZONE);
  const ids = await identitiesFor(
    scope,
    [...data.open, ...data.acknowledgedToday].map((a) => a.patientUserId),
    "lab_criticals",
  );
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  const time = (d: Date) => fmt.format(d);
  const L = CRITICALS_UI.list;
  const columns = [
    {
      id: "patient",
      header: L.columns.patient,
      cell: (a: AlertSummary) => (
        <Link
          href={`/lab/criticals/${a.id}`}
          prefetch={false}
          className="focus-visible:shadow-focus rounded-sm outline-none hover:underline"
        >
          <PatientNameMrn identity={ids.get(a.patientUserId)} />
        </Link>
      ),
    },
    {
      id: "result",
      header: L.columns.result,
      cell: (a: AlertSummary) => <MarkedValues alert={a} />,
    },
    {
      id: "marked",
      header: L.columns.marked,
      cell: (a: AlertSummary) => (
        <span className="inline-flex flex-col">
          <span className="font-mono tabular-nums">{time(a.sentAt)}</span>
          <span className="text-muted-foreground">{a.markedByCadre ?? ""}</span>
        </span>
      ),
    },
    {
      id: "alert",
      header: L.columns.alert,
      cell: (a: AlertSummary) => <AlertCell alert={a} now={now} times={data.times} time={time} />,
    },
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <CriticalLive userId={scope.userId} />
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={L.title}
        subline={L.sub}
      />
      {heartbeatStale(data.heartbeatAt, now) ? (
        <Caution>{CRITICALS_COPY.escalationsDelayed}</Caution>
      ) : null}
      {data.times ? null : <Caution>{CRITICALS_COPY.noResponseTimes}</Caution>}
      {data.smsLive ? null : (
        <p className="text-body-s text-muted-foreground">{CRITICALS_UI.smsOff}</p>
      )}
      <RecordList<AlertSummary>
        caption={L.title}
        rows={data.open}
        rowKey={(a) => a.id}
        empty={L.empty}
        columns={columns}
      />
      {data.acknowledgedToday.length ? (
        <section aria-labelledby="ack-today" className="flex flex-col gap-3">
          <h2 id="ack-today" className="text-heading-s">
            {L.ackToday}
          </h2>
          <RecordList<AlertSummary>
            caption={L.ackToday}
            rows={data.acknowledgedToday}
            rowKey={(a) => a.id}
            empty=""
            columns={columns}
          />
        </section>
      ) : null}
    </div>
  );
}
