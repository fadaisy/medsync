import type { PatientIdentity } from "@/components/emr/orders/model";
import type { AlertSummary, MyAlerts } from "@/lib/lab/criticals/read";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CRITICALS_COPY, CRITICALS_UI } from "@/content/lab-criticals";
import { ago, alertTitles, missedBy } from "@/lib/lab/criticals/words";
import { AckButton, PhoneAckLine } from "./critical-ack";

const D = CRITICALS_UI.doctor;

/**
 * The doctor's pinned critical alerts (Lab Phase 1 §5.4, artboards 5 and 8). The critical tint, its
 * icon and the words "Critical result" live here and on the Critical pill only (D-LAB1-18); the
 * escalation line is amber; everything else is neutral. No sound, no animation (§10).
 */
export function PinnedCriticals({
  alerts,
  ids,
  now,
  time,
}: {
  alerts: MyAlerts;
  ids: Map<string, PatientIdentity>;
  now: Date;
  time: (d: Date) => string;
}) {
  if (alerts.open.length + alerts.phoneAckedForMe.length + alerts.acknowledgedByMe.length === 0)
    return null;
  return (
    <section aria-label="Critical results" className="flex flex-col gap-3">
      {alerts.open.map((a) => (
        <PinnedAlert key={a.id} alert={a} identity={ids.get(a.patientUserId)} now={now} />
      ))}
      {alerts.phoneAckedForMe.map((a) => (
        <div key={a.id} className="border-border rounded-lg border px-4 py-3">
          <p className="text-body-s text-muted-foreground">
            {ids.get(a.patientUserId)?.name ?? "Name withheld"} · {ids.get(a.patientUserId)?.mrn} ·{" "}
            {a.test}
          </p>
          <PhoneAckLine alertId={a.id} time={time(a.acknowledgedAt!)} />
        </div>
      ))}
      {alerts.acknowledgedByMe.map((a) => (
        <p
          key={a.id}
          className="text-body-s border-border flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2"
        >
          <StatusWord>{D.acknowledgedAt(time(a.acknowledgedAt!))}</StatusWord>
          <span>
            {ids.get(a.patientUserId)?.name ?? "Name withheld"} · {a.test}
          </span>
          <Link
            href={`/doctor/patients/${a.patientUserId}`}
            className="text-teal-700 underline-offset-4 hover:underline"
          >
            {D.openChart}
          </Link>
        </p>
      ))}
    </section>
  );
}

function PinnedAlert({
  alert,
  identity,
  now,
}: {
  alert: MyAlerts["open"][number];
  identity: PatientIdentity | undefined;
  now: Date;
}) {
  const titles = alertTitles(alert);
  const escalated = alert.escalatedToMe;
  const whoMissed = missedBy(alert);
  return (
    <article
      aria-labelledby={`alert-${alert.id}`}
      className="border-status-critical-fg/30 bg-status-critical-bg/40 flex flex-col gap-2 rounded-lg border px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusWord tone="critical">
          {escalated
            ? CRITICALS_COPY.escalatedTitle
            : alert.correctionOf
              ? "Corrected result"
              : "Critical result"}
        </StatusWord>
        {alert.correctionOf ? <StatusWord>Correction</StatusWord> : null}
      </div>
      {escalated ? (
        <p className="text-body-s dark:text-status-caution-fg inline-flex items-start gap-1.5 text-amber-800">
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {CRITICALS_COPY.escalatedLine(alert.minutesOpen, whoMissed)}
        </p>
      ) : null}
      <h2 id={`alert-${alert.id}`} className="text-body-m font-medium">
        {titles.map((t) => (
          <span key={t} className="block">
            {t}
          </span>
        ))}
      </h2>
      <p className="text-body-s text-muted-foreground flex flex-wrap gap-x-3">
        <span className="text-foreground font-medium">{identity?.name ?? "Name withheld"}</span>
        <span className="font-mono tabular-nums">{identity?.mrn}</span>
        {alert.place ? <span>{alert.place}</span> : null}
        <span>{D.markedBy(alert.markedByCadre ?? "the lab", ago(alert.sentAt, now))}</span>
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <AckButton alertId={alert.id} label={escalated ? D.takeOver : D.acknowledge} />
        <Link
          href={`/doctor/criticals/${alert.id}`}
          className="text-body-s inline-flex min-h-11 items-center font-medium text-teal-700 underline-offset-4 hover:underline"
        >
          Details
        </Link>
        <Link
          href={`/doctor/patients/${alert.patientUserId}`}
          className="text-body-s inline-flex min-h-11 items-center font-medium text-teal-700 underline-offset-4 hover:underline"
        >
          {D.openChart}
        </Link>
      </div>
    </article>
  );
}

/** For the header count and the announcement: the newest open alert, in words. */
export function newestAnnouncement(
  open: readonly AlertSummary[],
): { id: string; text: string } | null {
  const a = [...open].sort((x, y) => +y.sentAt - +x.sentAt)[0];
  return a ? { id: a.id, text: alertTitles(a).join(" ") } : null;
}

/** §5.4: on the chart, every open alert on this patient, for any clinician who may open it. */
export function ChartCriticals({ alerts }: { alerts: readonly AlertSummary[] }) {
  if (alerts.length === 0) return null;
  return (
    <section
      aria-label="Open critical results"
      className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 pt-4 sm:px-6"
    >
      {alerts.map((a) => (
        <div
          key={a.id}
          className="border-status-critical-fg/30 bg-status-critical-bg/40 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5"
        >
          <StatusWord tone="critical">Critical result</StatusWord>
          <span className="text-body-s min-w-0 flex-1">{alertTitles(a).join(" ")}</span>
          <AckButton alertId={a.id} label={D.acknowledge} />
          <Link
            href={`/doctor/criticals/${a.id}`}
            className="text-body-s font-medium text-teal-700 underline-offset-4 hover:underline"
          >
            Details
          </Link>
        </div>
      ))}
    </section>
  );
}
