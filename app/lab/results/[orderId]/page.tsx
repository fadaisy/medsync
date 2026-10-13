import type { BenchContext } from "@/lib/lab/read";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BiohazardIcon } from "lucide-react";

import { paymentWords } from "@/components/emr/orders/model";
import { CriticalComm } from "@/components/emr/results/critical-comm";
import { ResultEntry } from "@/components/emr/results/result-entry";
import { LAB } from "@/content/lab";
import { CRITICALS_COPY } from "@/content/lab-criticals";
import { LAB2 } from "@/content/lab-phase-2";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";
import { loadResultEntry } from "@/lib/emr/read/results";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { criticalFlaggingActive } from "@/lib/lab/critical-flagging";
import { alertsForOrder, loadLabCriticals, previewRecipients } from "@/lib/lab/criticals/read";
import { criticalsLive, unitsRangesLive } from "@/lib/lab/criticals/readiness";
import { labBenchLiveFor, labHighRiskLiveFor } from "@/lib/lab/feature";
import { flaggingActiveFor } from "@/lib/lab/limits";
import { LAB_TIME_ZONE, requestNow } from "@/lib/lab/page-data";
import { highRiskForOrder, loadBenchContext, loadRejectableSpecimen } from "@/lib/lab/read";
import { fixedForOrder } from "@/lib/lab/units-read";
import { FlaggingNotice } from "../../_components/flagging-notice";
import { RejectSpecimen } from "../../_components/reject-specimen";
import { AlertCell, Caution } from "../../criticals/_components/alert-bits";
import { ClinicalQuestion } from "./_components/clinical-question";
import { LabResultEntry } from "./_components/lab-result-entry";

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
  const scope = await requireLabTechScope();
  if (!emrV1LiveFor(scope.hospitalId)) notFound();
  const loaded = await loadResultEntry(scope, orderId, {
    mode: "direct",
    surface: "lab_result_entry",
  });
  if (!loaded) notFound();
  // Lab Phase 1 §5.1 (LAB_UNITS_RANGES): the catalogue's unit and the signed range, while entering.
  const fixed =
    scope.workspaceLive && loaded.mode === "direct" && (await unitsRangesLive(scope.hospitalId))
      ? await fixedForOrder(
          scope.hospitalId,
          orderId,
          loaded.patientUserId,
          scope.access.permissions.has("lab.manage"),
          undefined,
          // Released: each value as its snapshot holds it (Law 8).
          loaded.report?.released ? loaded.report.id : undefined,
          await criticalsLive(scope.hospitalId),
        )
      : null;
  const data = fixed
    ? {
        ...loaded,
        components: loaded.components.map((c) =>
          fixed[c.conceptId] ? { ...c, fixed: fixed[c.conceptId] } : c,
        ),
      }
    : loaded;
  const workspace = scope.workspaceLive;
  // Lab Phase 1 (§5.2): the mark panel on a result not yet released, and the alert's status after.
  const criticals = workspace && data.mode === "direct" && (await criticalsLive(scope.hospitalId));
  const now = requestNow();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  const preview =
    criticals && !data.report?.released && scope.access.permissions.has("lab.result.release")
      ? await previewRecipients(
          scope,
          { orderId, patientUserId: data.patientUserId, restricted: false },
          now,
        )
      : null;
  const [alerts, list] =
    criticals && data.report?.released
      ? await Promise.all([
          alertsForOrder(scope.hospitalId, orderId),
          loadLabCriticals(scope.hospitalId, now, LAB_TIME_ZONE),
        ])
      : [[], null];
  // Lab Phase 2 §5.6, HR-3: the high-risk warning above the results while it is on.
  const highRisk = labHighRiskLiveFor(scope.hospitalId)
    ? await highRiskForOrder(scope.hospitalId, orderId)
    : null;
  // Lab Phase 2 §5.6 (labBench): the clinical question and this specimen, beside the results.
  const bench = labBenchLiveFor(scope.hospitalId)
    ? await loadBenchContext(scope.hospitalId, orderId)
    : null;
  const specimenId =
    workspace && !data.report?.released
      ? await loadRejectableSpecimen(scope.hospitalId, orderId)
      : null;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href="/lab"
        className="text-body-s tap inline-flex min-h-11 items-center self-start font-medium text-teal-700 underline-offset-4 hover:underline sm:min-h-0"
      >
        Back to the worklist
      </Link>
      {workspace && criticals ? (
        <FlaggingNotice
          phase1={(await flaggingActiveFor(scope.hospitalId, db as never)) ? "on" : "off"}
        />
      ) : workspace && !criticalFlaggingActive(scope.hospitalId) ? (
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

/** Amber, bordered, an icon and the words (never red: a warning to take care, not an emergency). */
function HighRiskBlock({
  source,
  procedure,
}: {
  source: "rule" | "manual";
  procedure: string | null;
}) {
  const link = procedure && /^https?:\/\//i.test(procedure) ? procedure : null;
  return (
    <div
      role="status"
      className="bg-status-caution-bg border-status-caution-fg dark:text-status-caution-fg text-body-s flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-amber-800"
    >
      <BiohazardIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          {source === "manual" ? LAB2.highRisk.manual : LAB2.highRisk.block}
        </p>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="w-fit font-medium underline underline-offset-4"
          >
            Open the procedure
          </a>
        ) : procedure ? (
          <p>Procedure: {procedure}</p>
        ) : null}
      </div>
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

/** "This specimen" (§5.6): payment, identity at collection and the pinned analyser; only what exists. */
function SpecimenCard({ bench, time }: { bench: BenchContext; time: (d: Date) => string }) {
  const B = LAB.bench;
  const payment = bench.paymentState ? paymentWords(bench.paymentState) : null;
  const rows: [string, ReactNode][] = [];
  if (payment) rows.push([B.payment, payment]);
  if (bench.identity)
    rows.push([
      B.identity,
      <>
        {B.outcome[bench.identity.outcome] ?? bench.identity.outcome},{" "}
        {B.method[bench.identity.method] ?? bench.identity.method}, {time(bench.identity.at)}
        {bench.identity.wristband ? (
          <span className="text-muted-foreground block">{LAB2.label.wristband}</span>
        ) : null}
      </>,
    ]);
  if (bench.analyser) rows.push([B.analyser, bench.analyser.model]);
  if (bench.analyser?.bench) rows.push([B.bench, bench.analyser.bench]);
  if (rows.length === 0) return null;
  return (
    <section
      aria-labelledby="this-specimen"
      className="border-border bg-card shadow-card text-body-s flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="this-specimen" className="text-heading-s text-foreground font-medium">
        {B.specimen}
      </h2>
      <dl className="flex flex-col gap-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-caption text-muted-foreground">{k}</dt>
            <dd className="text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
