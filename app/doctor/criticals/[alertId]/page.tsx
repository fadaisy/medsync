import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CRITICALS_COPY, CRITICALS_UI } from "@/content/lab-criticals";
import { db } from "@/db";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { resolveEmrAccess } from "@/lib/emr/access";
import { identitiesFor } from "@/lib/emr/read/results";
import { escalateLazily, loadAlertDetail } from "@/lib/lab/criticals/read";
import { criticalsLive } from "@/lib/lab/criticals/readiness";
import { settingsOf } from "@/lib/lab/criticals/store";
import { ago, alertTitles, missedBy, timelineLine } from "@/lib/lab/criticals/words";
import { AckPanel, PhoneAckLine, SeenOnce } from "../../_components/critical-ack";
import { myCriticals } from "../../_lib/criticals";

export const metadata: Metadata = { title: "Critical result · Doctor · MedSync" };
export const dynamic = "force-dynamic";

const D = CRITICALS_UI.doctor;

/**
 * One critical alert for the doctor (§5.4, artboards 5, 7, 8): the whole report with the lab's ranges
 * and flags, what the lab checked and said, the timeline when it was escalated, then Acknowledge with
 * three optional one-tap responses. Visible to its recipients and to anyone who may open the patient
 * (D-LAB1-29). Opening it writes `seen` for a recipient (CA-5), which the lab never reads as acknowledged.
 */
export default async function DoctorCriticalDetailPage({
  params,
}: {
  params: Promise<{ alertId: string }>;
}) {
  const { alertId } = await params;
  const scope = await requireDoctorScope();
  if (!(await criticalsLive(scope.hospitalId))) notFound();
  await escalateLazily(scope.hospitalId);
  const detail = await loadAlertDetail(scope.hospitalId, alertId);
  if (!detail) notFound();
  const { alert } = detail;
  const recipient = detail.recipients.includes(scope.userId);
  const allowed =
    recipient ||
    (await db.transaction(
      async (tx) =>
        (
          await resolveEmrAccess(tx as never, {
            userId: scope.userId,
            patientUserId: alert.patientUserId,
            hospitalId: scope.hospitalId,
          })
        ).allowed,
    ));
  if (!allowed) notFound();
  const [ids, settings, mine] = await Promise.all([
    identitiesFor(scope, [alert.patientUserId], "doctor_critical_detail"),
    db.transaction((tx) => settingsOf(tx as never, scope.hospitalId)),
    myCriticals(scope.userId, scope.hospitalId),
  ]);
  const who = ids.get(alert.patientUserId);
  const now = mine?.now ?? new Date();
  const time = mine?.time ?? ((d: Date) => d.toISOString().slice(11, 16));
  const escalated = mine?.alerts.open.find((a) => a.id === alert.id)?.escalatedToMe ?? false;
  const minutesOpen = Math.floor((now.getTime() - alert.sentAt.getTime()) / 60_000);
  const whoMissed = missedBy(alert);
  const marked = new Set(alert.marked.map((m) => m.conceptId));
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8 lg:py-10">
      {alert.state === "open" && recipient ? <SeenOnce alertId={alert.id} /> : null}
      <Link
        href="/doctor/criticals"
        className="text-body-s inline-flex min-h-11 items-center self-start font-medium text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
      >
        Back to critical results
      </Link>
      <header className="flex flex-col gap-2">
        <StatusWord tone="critical" className="self-start">
          {escalated
            ? CRITICALS_COPY.escalatedTitle
            : alert.correctionOf
              ? "Corrected result"
              : "Critical result"}
        </StatusWord>
        {escalated && alert.state === "open" ? (
          <p className="text-body-s dark:text-status-caution-fg inline-flex items-start gap-1.5 text-amber-800">
            <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {CRITICALS_COPY.escalatedLine(minutesOpen, whoMissed)}
          </p>
        ) : null}
        <h1 className="text-heading-s">
          {alertTitles(alert).map((t) => (
            <span key={t} className="block">
              {t}
            </span>
          ))}
        </h1>
        <p className="text-body-s text-muted-foreground flex flex-wrap gap-x-3">
          <span className="text-foreground font-medium">{who?.name ?? "Name withheld"}</span>
          <span className="font-mono tabular-nums">{who?.mrn}</span>
          {who?.ageSex ? <span>{who.ageSex}</span> : null}
          {alert.place ? <span>{alert.place}</span> : null}
          <span>{D.markedBy(alert.markedByCadre ?? "the lab", ago(alert.sentAt, now))}</span>
        </p>
      </header>

      <section aria-labelledby="report" className="flex flex-col gap-2">
        <h2 id="report" className="text-heading-s">
          {alert.test}
        </h2>
        <table className="text-body-s w-full border-collapse text-left">
          <thead>
            <tr className="text-caption text-muted-foreground border-border border-b">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Result
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Value
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Laboratory range
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Lab flag
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.report.map((r) => (
              <tr key={r.conceptId} className="border-border border-b last:border-b-0">
                <td className="py-1.5 pr-3">
                  {r.display}
                  {marked.has(r.conceptId) ? (
                    <span className="text-muted-foreground"> · marked critical</span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-3 font-mono font-medium tabular-nums">
                  {r.value}
                  {r.unit ? ` ${r.unit}` : ""}
                </td>
                <td className="py-1.5 pr-3 font-mono tabular-nums">{r.range ?? "None given"}</td>
                <td className="py-1.5">{r.flag ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="from-lab" className="flex flex-col gap-1">
        <h2 id="from-lab" className="text-heading-s">
          {D.fromLab}
        </h2>
        {alert.marked.map((m) => (
          <p key={m.conceptId} className="text-body-s">
            {m.display}:{" "}
            {m.check === "repeated"
              ? D.checks.repeated(String(m.repeatValue ?? ""))
              : m.check === "could_not_check"
                ? `${D.checks.could_not_check}: ${CRITICALS_COPY.couldNotCheck[m.couldNotCheck as keyof typeof CRITICALS_COPY.couldNotCheck] ?? ""}`
                : D.checks.checked_not_repeated}
          </p>
        ))}
        {detail.noteFromLab ? (
          <p className="text-body-s">&ldquo;{detail.noteFromLab}&rdquo;</p>
        ) : null}
      </section>

      {escalated ? (
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
      ) : null}

      {alert.state === "open" ? (
        <AckPanel
          alertId={alert.id}
          label={escalated ? D.takeOver : D.acknowledge}
          labPhone={settings.labPhone}
        />
      ) : alert.acknowledgedVia === "phone" && alert.acknowledgedBy === scope.userId ? (
        <PhoneAckLine alertId={alert.id} time={time(alert.acknowledgedAt!)} />
      ) : (
        <p className="text-body-s flex flex-wrap items-center gap-2">
          <StatusWord>{D.acknowledgedAt(time(alert.acknowledgedAt!))}</StatusWord>
          {alert.acknowledgedByCadre ? <span>by {alert.acknowledgedByCadre}</span> : null}
          <Link
            href={`/doctor/patients/${alert.patientUserId}`}
            className="text-teal-700 underline-offset-4 hover:underline"
          >
            {D.openChart}
          </Link>
        </p>
      )}
    </div>
  );
}
