import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";

import { CriticalComm } from "@/components/emr/results/critical-comm";
import { ResultEntry } from "@/components/emr/results/result-entry";
import { StatusWord } from "@/components/emr/status-word";
import { CRITICALS_COPY } from "@/content/lab-criticals";
import { fill, LAB3 } from "@/content/lab-phase-3";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { LAB_TIME_ZONE } from "@/lib/lab/page-data";
import { analyteName } from "@/lib/lab/qc-store";
import { FlaggingNotice } from "../../_components/flagging-notice";
import { RejectSpecimen } from "../../_components/reject-specimen";
import { redirectIfV2 } from "../../_lib/v2-redirect";
import { AlertCell, Caution } from "../../criticals/_components/alert-bits";
import { QUALITY } from "../../quality/_lib/copy";
import { ClinicalQuestion } from "./_components/clinical-question";
import { DeltaPanel } from "./_components/delta-panel";
import { LabResultEntry } from "./_components/lab-result-entry";
import { QcHoldActions } from "./_components/qc-hold";
import { HighRiskBlock, SpecimenCard } from "./_components/specimen-bits";
import { loadResultScreen } from "./_lib/load";

const REASONS = Object.entries(REJECTION_REASON_TEXT).map(([value, words]) => ({
  value,
  label: words.charAt(0).toUpperCase() + words.slice(1),
}));

export const metadata: Metadata = { title: "Enter results · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * One screen per panel (gate-a E.9): enter, save a preliminary, release the final version; a
 * released result is read here and amended; a released critical one also takes the call record
 * (E.10). EMR v1 only — with the flag off this route does not exist.
 *
 * LAB_WORKSPACE on (Lab Phase 0): the critical-flagging notice above the results while MedSync is
 * not flagging (§5.6, Law 10), and the specimen's Reject, moved here from the worklist row.
 */
export default async function LabResultEntryPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  await redirectIfV2(`/lab/bench/${orderId}`);
  const scope = await requireLabTechScope();
  const {
    data,
    qc,
    blocked,
    qcHeld,
    delta,
    criticals,
    now,
    preview,
    alerts,
    list,
    highRisk,
    bench,
    specimenId,
    flagging,
  } = await loadResultScreen(
    scope,
    orderId,
    "Release waits for a decision on each delta check above.",
  );
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href="/lab"
        className="text-body-s tap inline-flex min-h-11 items-center self-start font-medium text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
      >
        Back to the worklist
      </Link>
      {flagging === "on" || flagging === "off" ? (
        <FlaggingNotice phase1={flagging} />
      ) : flagging === "notice" ? (
        <FlaggingNotice />
      ) : null}
      {alerts.map((a) => (
        <section key={a.id} aria-label="Critical alert" className="flex flex-col gap-2">
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <span className="font-medium">Critical alert</span>
            <AlertCell
              alert={a}
              now={now}
              times={list?.times ?? null}
              time={(d) => fmt.format(d)}
            />
            <Link
              href={`/lab/criticals/${a.id}`}
              className="text-teal-700 underline-offset-4 hover:underline"
            >
              Open the alert
            </Link>
          </p>
          {a.state === "open" && (a.subState === "not_sent" || a.deliveryFailed) ? (
            <Caution>{CRITICALS_COPY.notSent}</Caution>
          ) : null}
        </section>
      ))}
      {highRisk ? <HighRiskBlock {...highRisk} /> : null}
      <DeltaPanel
        flags={delta}
        component={Object.fromEntries(data.components.map((c) => [c.conceptId, c.display]))}
      />
      {qc && blocked.length ? (
        <div
          role="alert"
          className="bg-status-caution-bg border-status-caution-fg dark:text-status-caution-fg text-body-s flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-amber-800"
        >
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            {blocked.map((c) => {
              const [head, rest] = fill(LAB3.holdBlock, {
                Analyte: c.analyte,
                analyser: qc.device.model,
                time: c.failedAt ? fmt.format(c.failedAt) : "—",
                rules: c.rules.join(", ") || "not run",
              })
                .split("**")
                .filter(Boolean);
              return (
                <p key={c.conceptId}>
                  <span className="font-medium">{head}</span>
                  {rest}
                </p>
              );
            })}
            {qc.others.length ? (
              <p>{QUALITY.hold.elsewhere(qc.others.map((o) => o.model).join(", "))}</p>
            ) : null}
            {!data.report?.released ? (
              <p>
                {`Releasing now sends the others. The doctor sees: ${blocked
                  .map((c) => fill(LAB3.toFollow, { Analyte: c.analyte }))
                  .join(" ")}`}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {qc
        ? qc.components
            .filter((c) => c.status === "not_run_in_window" && !c.blocked)
            .map((c) => (
              <p key={c.conceptId} className="text-body-s">
                <StatusWord tone="caution">
                  {fill(LAB3.qcNotRun, {
                    analyte: c.analyte.toLowerCase(),
                    analyser: qc.device.model,
                  })}
                </StatusWord>
              </p>
            ))
        : null}
      {qc && data.report && (blocked.length || qcHeld.size) ? (
        <QcHoldActions
          patientUserId={data.patientUserId}
          reportId={data.report.id}
          held={blocked.map((c) => c.analyte.toLowerCase())}
          canOverride={scope.access.permissions.has("lab.qc.override")}
          completion={
            data.report.released
              ? [...qcHeld]
                  .filter((c) => !blocked.some((b) => b.conceptId === c))
                  .map((c) => analyteName(c).toLowerCase())
              : []
          }
        />
      ) : null}
      <BesideResults
        aside={
          bench ? (
            <>
              <ClinicalQuestion
                patientUserId={data.patientUserId}
                orderId={orderId}
                question={bench.question}
                orderedBy={bench.orderedBy}
              />
              <SpecimenCard bench={bench} time={(d) => fmt.format(d)} />
            </>
          ) : null
        }
      >
        {preview ? (
          <LabResultEntry
            data={data}
            preview={{
              level0: preview.level0,
              next: preview.next
                ? {
                    people: preview.next.people,
                    at: preview.next.at ? fmt.format(preview.next.at) : null,
                  }
                : null,
              emptyLevels: preview.emptyLevels,
              reachedNobody: preview.reachedNobody,
              timesSigned: preview.times !== null,
              smsLive: preview.smsLive,
              secondCheck: preview.secondCheck,
              labUsers: preview.labUsers,
            }}
          />
        ) : (
          <ResultEntry data={data} surface="lab" />
        )}
      </BesideResults>
      {specimenId && scope.access.permissions.has("lab.receive") ? (
        <RejectSpecimen
          patientUserId={data.patientUserId}
          specimenId={specimenId}
          test={data.test}
          reasons={REASONS}
        />
      ) : null}
      {data.communicate && !criticals ? (
        <CriticalComm
          patientUserId={data.patientUserId}
          identity={data.identity}
          test={data.test}
          target={data.communicate}
        />
      ) : null}
    </div>
  );
}

/** Lab Phase 2 §5.6: the cards on the right from `lg` up, stacked under the results on smaller screens. */
function BesideResults({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  if (!aside) return children;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      <aside className="flex flex-col gap-4">{aside}</aside>
    </div>
  );
}
