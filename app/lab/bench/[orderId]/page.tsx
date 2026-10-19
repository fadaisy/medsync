import type { Gate } from "../../_components/v2/before-release";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TriangleAlertIcon } from "lucide-react";

import { CriticalComm } from "@/components/emr/results/critical-comm";
import { EntryHeadingAs } from "@/components/emr/results/heading-level";
import { ResultEntry } from "@/components/emr/results/result-entry";
import { CriticalPill, StatusWord } from "@/components/emr/status-word";
import { CRITICALS_COPY } from "@/content/lab-criticals";
import { fill as fill3, LAB3 } from "@/content/lab-phase-3";
import { fill, LABWS2 } from "@/content/lab-workspace-v2";
import { db } from "@/db";
import { labLabels } from "@/db/schema";
import { asClinicalReader } from "@/lib/emr/db";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";
import { lastResults } from "@/lib/lab/last-results-read";
import { LAB_TIME_ZONE, labWorklistFor } from "@/lib/lab/page-data";
import { analyteName } from "@/lib/lab/qc-store";
import { BenchFrame } from "../_components/frame";
import { loadBench } from "../_lib/bench";
import { FlaggingNotice } from "../../_components/flagging-notice";
import { RejectSpecimen } from "../../_components/reject-specimen";
import { BeforeRelease } from "../../_components/v2/before-release";
import { Sparkline } from "../../_components/v2/charts";
import { Panel } from "../../_components/v2/kit";
import { PatientBand } from "../../_components/v2/patient-band";
import { one } from "../../_lib/place-tabs";
import { labV2 } from "../../_lib/places";
import { AlertCell, Caution } from "../../criticals/_components/alert-bits";
import { QUALITY } from "../../quality/_lib/copy";
import { ClinicalQuestion } from "../../results/[orderId]/_components/clinical-question";
import { DeltaPanel } from "../../results/[orderId]/_components/delta-panel";
import { LabResultEntry } from "../../results/[orderId]/_components/lab-result-entry";
import { QcHoldActions } from "../../results/[orderId]/_components/qc-hold";
import { HighRiskBlock, SpecimenCard } from "../../results/[orderId]/_components/specimen-bits";
import { loadResultScreen } from "../../results/[orderId]/_lib/load";

export const metadata: Metadata = { title: "Bench · Laboratory" };
export const dynamic = "force-dynamic";

const B = LABWS2.bench;
const REASONS = Object.entries(REJECTION_REASON_TEXT).map(([value, words]) => ({
  value,
  label: words.charAt(0).toUpperCase() + words.slice(1),
}));

/**
 * The bench work pane (prompt 5.5): the patient on a navy band, the clinical question, the existing result
 * entry (parsing, validation, release, amend, critical marking unchanged), and on the right Before release —
 * the existing gates' states with the delta decision — and the main component's last results.
 */
export default async function BenchResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live || !v2.places.includes("bench")) notFound();
  const { orderId } = await params;
  const sp = await searchParams;
  const { scope } = v2;
  const screen = await loadResultScreen(scope, orderId, LABWS2.release.reasonDelta);
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
  } = screen;
  // The queue opens on the order's own stage unless the link says otherwise.
  const worklist = await labWorklistFor(scope.hospitalId);
  const open = worklist.inputs.find((i) => i.orderId === orderId);
  const [benchData, label] = await Promise.all([
    loadBench(v2, {
      stage: one(sp.stage) ?? open?.stage,
      section: one(sp.section),
      patient: undefined,
    }),
    db
      .select({ labelNo: labLabels.labelNo })
      .from(labLabels)
      .where(
        and(
          eq(labLabels.orderId, orderId),
          eq(labLabels.hospitalId, scope.hospitalId),
          isNull(labLabels.voidedAt),
        ),
      )
      .orderBy(desc(labLabels.labelNo))
      .limit(1),
  ]);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: LAB_TIME_ZONE,
  });
  const dayFmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: LAB_TIME_ZONE,
  });
  const main = data.components.find((c) => c.valueType === "quantity");
  const trend = main
    ? await asClinicalReader({ userId: scope.userId, hospitalId: scope.hospitalId }, (tx) =>
        lastResults(tx, {
          hospitalId: scope.hospitalId,
          patientUserId: data.patientUserId,
          conceptId: main.conceptId,
          orderId,
          now,
        }),
      )
    : [];

  // Before release: each existing gate's state, read, never re-decided (Law 4).
  const undecided = delta.filter((f) => !f.outcome);
  const qcState: Gate = !qc
    ? { key: "qc", label: B.gates.qc, state: "none", line: B.gates.qcNotRequired }
    : blocked.length
      ? {
          key: "qc",
          label: B.gates.qc,
          state: "wait",
          line: fill(B.qcHeldOn, { analyser: qc.device.model }),
        }
      : qc.components.some((c) => c.status === "not_run_in_window")
        ? {
            key: "qc",
            label: B.gates.qc,
            state: "wait",
            line: fill(B.qcNotRunOn, { analyser: qc.device.model }),
          }
        : {
            key: "qc",
            label: B.gates.qc,
            state: "ok",
            line: fill(B.qcOn, { analyser: qc.device.model }),
          };
  const gates: Gate[] = [
    { key: "units", label: B.gates.units, state: "ok", line: B.gates.unitsOk },
    qcState,
    {
      key: "delta",
      label: B.gates.delta,
      state: undecided.length ? "wait" : delta.length ? "ok" : "none",
      line: undecided.length
        ? B.gates.deltaWaiting
        : delta.length
          ? B.gates.deltaDecided
          : B.gates.deltaNone,
      control: delta.length ? (
        <DeltaPanel
          flags={delta}
          component={Object.fromEntries(data.components.map((c) => [c.conceptId, c.display]))}
        />
      ) : undefined,
    },
    {
      key: "crit",
      label: B.gates.critical,
      state: data.report?.critical || alerts.length ? "wait" : criticals ? "ok" : "none",
      line:
        data.report?.critical || alerts.length ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <CriticalPill />
            {alerts.length ? B.criticalRaised : B.gates.criticalYes}
          </span>
        ) : criticals ? (
          B.criticalLimits
        ) : (
          B.criticalOff
        ),
    },
  ];

  return (
    <BenchFrame
      v2={v2}
      bench={benchData}
      selected={orderId}
      right={
        <>
          <BeforeRelease gates={gates} />
          {main ? (
            <Panel title={fill(B.lastResults, { test: main.display })} labelledBy="last-results">
              {trend.length ? (
                <>
                  <Sparkline
                    className="h-12 w-full"
                    points={trend.map((t) => t.value)}
                    label={fill(B.lastResultsAlt, {
                      test: main.display,
                      points: trend
                        .map((t) =>
                          fill(B.pointWords, { date: dayFmt.format(t.at), value: t.value }),
                        )
                        .join(", "),
                    })}
                  />
                  <p className="text-caption text-muted-foreground tabular-nums">
                    {trend
                      .map((t) => fill(B.pointWords, { date: dayFmt.format(t.at), value: t.value }))
                      .join(" · ")}
                    {trend[0]?.unit ? ` ${trend[0].unit}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-body-s text-muted-foreground">{B.lastResultsNone}</p>
              )}
            </Panel>
          ) : null}
          {bench ? <SpecimenCard bench={bench} time={(d) => fmt.format(d)} /> : null}
        </>
      }
    >
      <PatientBand
        name={data.identity.name}
        mrn={data.identity.mrn}
        ageSex={data.identity.ageSex}
        labNo={label[0]?.labelNo ?? null}
        ward={open?.from?.name ?? null}
        received={open?.receivedAt ? fmt.format(open.receivedAt) : null}
        test={data.test}
      />
      {bench ? (
        <ClinicalQuestion
          patientUserId={data.patientUserId}
          orderId={orderId}
          question={bench.question}
          orderedBy={bench.orderedBy}
        />
      ) : null}
      {flagging === "on" || flagging === "off" ? (
        <FlaggingNotice phase1={flagging} />
      ) : flagging === "notice" ? (
        <FlaggingNotice />
      ) : null}
      {alerts.map((a) => (
        <section key={a.id} aria-label={B.criticalAlert} className="flex flex-col gap-2">
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <AlertCell
              alert={a}
              now={now}
              times={list?.times ?? null}
              time={(d) => fmt.format(d)}
            />
            <Link
              href={`/lab/needs-you/criticals/${a.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {LABWS2.needsYou.actions.alert}
            </Link>
          </p>
          {a.state === "open" && (a.subState === "not_sent" || a.deliveryFailed) ? (
            <Caution>{CRITICALS_COPY.notSent}</Caution>
          ) : null}
        </section>
      ))}
      {highRisk ? <HighRiskBlock {...highRisk} /> : null}
      {qc && blocked.length ? (
        <div
          role="alert"
          className="bg-status-caution-bg text-body-s rounded-tide-row flex items-start gap-2.5 px-3.5 py-3 text-amber-800 shadow-[inset_0_0_0_1px_var(--tide-caution-edge)]"
        >
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            {blocked.map((c) => {
              const [head, rest] = fill3(LAB3.holdBlock, {
                Analyte: c.analyte,
                analyser: qc.device.model,
                time: c.failedAt ? fmt.format(c.failedAt) : LABWS2.today.dash,
                rules: c.rules.join(", ") || LABWS2.today.qc.not_run_in_window,
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
          </div>
        </div>
      ) : null}
      {qc
        ? qc.components
            .filter((c) => c.status === "not_run_in_window" && !c.blocked)
            .map((c) => (
              <p key={c.conceptId} className="text-body-s">
                <StatusWord tone="caution">
                  {fill3(LAB3.qcNotRun, {
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
      <Panel>
        <EntryHeadingAs level={2}>
          {/* The grid scrolls inside its card on a narrow screen, never the page (5.1). */}
          <div className="-mx-1 min-w-0 overflow-x-auto px-1">
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
          </div>
        </EntryHeadingAs>
      </Panel>
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
    </BenchFrame>
  );
}
