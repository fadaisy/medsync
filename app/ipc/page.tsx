import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, ClockIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB5 } from "@/content/lab-phase-5";
import { epiWeekStart } from "@/lib/ipc/lab-alerts";
import { flaggedPatients, loadAlerts } from "@/lib/ipc/read";
import { ipcScope } from "@/lib/ipc/scope";
import { AlertDialog, ClearFlagDialog } from "./_components/ipc-forms";
import { IpcNav } from "./_components/ipc-nav";

export const metadata: Metadata = { title: "Lab alerts · Infection prevention · MedSync" };
export const dynamic = "force-dynamic";

const at = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Kampala",
});
const fmt = (d: Date | null) => (d ? at.format(d).toUpperCase() : null);

/**
 * Infection prevention: lab alerts (Lab Phase 5 §5.10, artboard 10; IC-4..IC-8). The IPC team sees every alert, a
 * ward in-charge their ward's, the surveillance focal person the routed ones. The minimum dataset only.
 */
export default async function IpcAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const scope = await ipcScope("/ipc");
  const segment = (await searchParams).s ?? "open";
  const alerts = await loadAlerts(scope);
  const now = new Date();
  const week = epiWeekStart(now);
  const open = alerts.filter((a) => !a.closed);
  const closedWeek = alerts.filter((a) => a.closed && epiWeekStart(a.createdAt) === week);
  const flagged = segment === "flagged" ? await flaggedPatients(scope) : [];
  const shown = segment === "closed" ? closedWeek : open;
  const tab = (key: string, label: string, n: number | null) => (
    <Link
      href={key === "open" ? "/ipc" : `/ipc?s=${key}`}
      aria-current={segment === key ? "page" : undefined}
      className="text-body-s text-primary underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline"
    >
      {label}
      {n !== null ? ` (${n})` : ""}
    </Link>
  );
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={scope.hospitalName} title="Infection prevention" />
      <IpcNav current="/ipc" />
      <nav aria-label="Which alerts" className="flex flex-wrap gap-4">
        {tab("open", "Open", open.length)}
        {tab("closed", "Closed this week", closedWeek.length)}
        {tab("flagged", "Flagged patients", null)}
      </nav>
      {segment === "flagged" ? (
        flagged.length === 0 ? (
          <p className="text-muted-foreground text-body-s">{LAB5.noData}</p>
        ) : (
          <ul className="border-border bg-card divide-ink-150 flex flex-col divide-y rounded-lg border">
            {flagged.map((p) => (
              <li
                key={p.patientUserId}
                className="text-body-s flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span>
                  {p.name} · <span className="font-mono">{p.mrn}</span>
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  {p.flags.map((f) => (
                    <span key={f.entryKey} className="flex items-center gap-2">
                      <StatusWord tone="caution">{`${f.condition} · ${f.precaution.replace(/_/g, " ")}`}</StatusWord>
                      {scope.acts ? (
                        <ClearFlagDialog
                          patientUserId={p.patientUserId}
                          entryKey={f.entryKey}
                          label={f.condition}
                        />
                      ) : null}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : shown.length === 0 ? (
        <p className="border-border text-body-s text-muted-foreground rounded-lg border border-dashed p-8 text-center">
          {segment === "closed" ? "No alerts closed this week." : "No open alerts."}
        </p>
      ) : (
        <div
          className="border-border bg-card overflow-auto rounded-lg border"
          tabIndex={0}
          role="region"
          aria-label="Lab alerts"
        >
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Lab alerts</caption>
            <thead>
              <tr className="bg-muted">
                {[
                  "Released",
                  "Condition",
                  "Patient",
                  "Place",
                  "Precaution and route",
                  "State",
                  "Actions",
                ].map((x) => (
                  <th
                    key={x}
                    scope="col"
                    className="text-ink-600 text-caption border-border h-[34px] border-b px-3 font-medium"
                  >
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((a, i) => {
                const mins = Math.max(
                  0,
                  Math.round((now.getTime() - a.createdAt.getTime()) / 60_000),
                );
                return (
                  <tr
                    key={a.id}
                    className="border-ink-150 text-body-s border-b align-top last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono">{fmt(a.releasedAt ?? a.createdAt)}</td>
                    <td className="px-3 py-2">
                      {a.trigger === "readmission"
                        ? `Flagged patient ${a.episodeKey.startsWith("moved") ? "moved" : "admitted"}: ${a.condition}`
                        : a.condition}
                      {a.screening ? (
                        <span className="text-muted-foreground block">{LAB5.screeningResult}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {a.name}
                      <span className="text-muted-foreground block font-mono">{a.mrn}</span>
                    </td>
                    <td className="px-3 py-2">
                      {[a.ward, a.bed].filter(Boolean).join(" · ") || "Outpatient"}
                    </td>
                    <td className="px-3 py-2">
                      {a.precaution}
                      <span className="text-muted-foreground block">
                        {a.route === "notify_now"
                          ? "IDSR: notify now"
                          : a.route === "weekly_item"
                            ? `IDSR weekly: ${a.idsrItem}`
                            : a.route === "programme_route"
                              ? "Programme route"
                              : "No IDSR route"}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2"
                      role={i === 0 && a.state.state === "new" ? "alert" : undefined}
                    >
                      {a.state.state === "new" ? (
                        <StatusWord
                          tone="caution"
                          glyph={ClockIcon}
                          icon
                        >{`New · ${mins} min`}</StatusWord>
                      ) : a.state.state === "escalated" ? (
                        <StatusWord tone="caution">Escalated</StatusWord>
                      ) : a.state.state === "precautions_started" ? (
                        <StatusWord
                          glyph={CheckIcon}
                          icon
                        >{`Precautions started ${fmt(a.state.at)}`}</StatusWord>
                      ) : a.state.state === "already_in_precautions" ? (
                        <StatusWord glyph={CheckIcon} icon>
                          Already in precautions
                        </StatusWord>
                      ) : a.state.state === "not_needed" ? (
                        <StatusWord>{`Not needed: ${a.state.reason}`}</StatusWord>
                      ) : a.state.state === "notified" ? (
                        <StatusWord
                          glyph={CheckIcon}
                          icon
                        >{`Notified ${fmt(a.state.at)}`}</StatusWord>
                      ) : (
                        <StatusWord>Result corrected</StatusWord>
                      )}
                      {a.contacts !== null ? (
                        <span className="block">{`Contacts to trace: ${a.contacts}`}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <AlertDialog
                        canAct={scope.acts}
                        a={{
                          id: a.id,
                          name: a.name,
                          mrn: a.mrn,
                          ageSex: a.ageSex,
                          place: [a.ward, a.bed].filter(Boolean).join(" · ") || "Outpatient",
                          admitted: fmt(a.admittedAt),
                          condition: a.condition,
                          precaution: a.precaution,
                          stopLine: a.stopLine,
                          specimen: fmt(a.specimenAt),
                          released: fmt(a.releasedAt),
                          route: a.route,
                          screening: a.screening,
                          referralState: a.referralState,
                          restricted: a.restricted,
                          closed: a.closed,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-caption text-muted-foreground">{LAB5.ipcMinimum}</p>
    </main>
  );
}
