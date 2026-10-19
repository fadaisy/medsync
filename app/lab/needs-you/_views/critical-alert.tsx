import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { CriticalLive } from "@/components/medsync/critical-live";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { CRITICALS_COPY, CRITICALS_UI } from "@/content/lab-criticals";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { identitiesFor } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { callTargets, loadAlertDetail, loadLabCriticals } from "@/lib/lab/criticals/read";
import { criticalsLive } from "@/lib/lab/criticals/readiness";
import { timelineLine } from "@/lib/lab/criticals/words";
import { LAB_TIME_ZONE, requestNow } from "@/lib/lab/page-data";
import { PatientBand } from "../../_components/v2/patient-band";
import { AlertCell, Caution, MarkedValues } from "../../criticals/_components/alert-bits";
import { CallLog } from "../../criticals/_components/call-log";

/**
 * One alert (§5.3 detail panel): two identifiers, the values, the check, the timeline in time order
 * with times as text (§10), then Log a phone call and Could not reach anyone while it is open.
 */
export async function CriticalAlertView({
  alertId,
  v2 = false,
}: {
  alertId: string;
  v2?: boolean;
}) {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !(await criticalsLive(scope.hospitalId))
  )
    notFound();
  const now = requestNow();
  // The list read runs the lazy escalation first, so this page is never behind the clock.
  const list = await loadLabCriticals(scope.hospitalId, now, LAB_TIME_ZONE);
  const detail = await loadAlertDetail(scope.hospitalId, alertId);
  if (!detail) notFound();
  const { alert } = detail;
  const [ids, targets] = await Promise.all([
    identitiesFor(scope, [alert.patientUserId], "lab_critical_detail"),
    alert.state === "open" ? callTargets(scope.hospitalId) : Promise.resolve([]),
  ]);
  const who = ids.get(alert.patientUserId);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  const time = (d: Date) => fmt.format(d);
  const created = detail.timeline.find((e) => e.kind === "created");
  const emptyLevels = (created?.detail.emptyLevels as number[] | undefined) ?? [];
  const canAct = scope.access.permissions.has("lab.result.release");
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <CriticalLive userId={scope.userId} />
      <Link
        href={v2 ? "/lab/needs-you?filter=results" : "/lab/criticals"}
        className="text-body-s tap inline-flex min-h-11 items-center self-start font-medium text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
      >
        Back to Criticals
      </Link>
      {v2 ? null : (
        <PageHeader
          place={`${scope.hospitalName} · ${LAB.place}`}
          placeInTopBar
          title={who?.name ?? "Name withheld"}
          subline={[who?.mrn, who?.ageSex, alert.place].filter(Boolean).join(" · ")}
        />
      )}
      {v2 ? (
        <PatientBand
          name={who?.name ?? "Name withheld"}
          mrn={who?.mrn ?? ""}
          ageSex={who?.ageSex ?? ""}
          labNo={null}
          ward={alert.place}
          received={null}
          test={alert.test}
        />
      ) : null}
      <section aria-label="The result" className="flex flex-col gap-2">
        <p className="text-body-m">
          <MarkedValues alert={alert} />
        </p>
        <p className="text-body-s text-muted-foreground">
          {alert.test} · marked {time(alert.sentAt)}
          {alert.markedByCadre ? ` by ${alert.markedByCadre}` : ""}
        </p>
        <AlertCell alert={alert} now={now} times={list.times} time={time} />
      </section>
      {alert.state === "open" && (alert.subState === "not_sent" || alert.deliveryFailed) ? (
        <Caution>{CRITICALS_COPY.notSent}</Caution>
      ) : null}
      {alert.state === "open" && emptyLevels.length && alert.subState !== "not_sent" ? (
        <Caution>{CRITICALS_COPY.emptyLevel}</Caution>
      ) : null}
      {alert.state === "open" && !list.times ? (
        <Caution>{CRITICALS_COPY.noResponseTimes}</Caution>
      ) : null}
      {detail.noteFromLab ? (
        <p className="text-body-s">
          <span className="text-muted-foreground">Note to the doctor: </span>
          {detail.noteFromLab}
        </p>
      ) : null}
      <section aria-labelledby="timeline" className="flex flex-col gap-2">
        <h2 id="timeline" className="text-heading-s">
          {CRITICALS_UI.detail.timeline}
        </h2>
        <ol className="flex flex-col gap-1.5">
          {detail.timeline.map((e) => {
            const line = timelineLine(e);
            return line ? (
              <li key={e.id} className="text-body-s flex gap-3">
                <time
                  dateTime={e.at.toISOString()}
                  className="text-muted-foreground w-12 shrink-0 font-mono tabular-nums"
                >
                  {time(e.at)}
                </time>
                <span>{line}</span>
              </li>
            ) : null;
          })}
        </ol>
      </section>
      {alert.state === "open" && canAct ? (
        <CallLog alertId={alert.id} targets={targets} lastLevel={alert.level === 2} />
      ) : alert.state === "acknowledged" ? (
        <StatusWord>Acknowledged</StatusWord>
      ) : null}
    </div>
  );
}
