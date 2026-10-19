import type { ReportParams } from "../_lib/params";
import type { DrillId, ReportRow } from "@/lib/lab/report-store";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { fill, LAB3_REPORTS } from "@/content/lab-phase-3";
import { LABWS2_REPORTS } from "@/content/lab-workspace-v2-reports";
import { db } from "@/db";
import { testCatalogue } from "@/db/schema";
import { asClinicalReader } from "@/lib/emr/db";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";
import { identitiesFor } from "@/lib/emr/read/results";
import { labReportsLiveFor } from "@/lib/lab/feature";
import { DRILL, drillRows, filtered, reportRows, statedTargets } from "@/lib/lab/report-store";
import { formatDuration, releasedTurnaround } from "@/lib/lab/turnaround";
import { reportParams } from "../_lib/params";
import { RecordList } from "../../_components/record-list";
import { ViewHeader } from "../../_components/v2/view-header";
import { dateWords, timeWords } from "../../_lib/days";
import { labV2 } from "../../_lib/places";
import { requireQualityScope } from "../../quality/_lib/scope";

export const metadata: Metadata = { title: "Records counted · Lab reports · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const R = LAB3_REPORTS;
const link = "font-medium text-teal-700 underline-offset-4 hover:underline";
const at = (d: Date | null) => (d ? `${dateWords(d)} ${timeWords(d)}` : "—");

/**
 * QI-4, Law 7: the records one lab-report number counts, re-read from `private.lab_indicator_rows` (lab readers only,
 * 0118) with the page's filters; each patient with two identifiers (Law 12, through the audited reveal); restricted
 * records only for staff who release results (Law 9). "Counted" marks the rows the numerator counts.
 */
export default async function LabReportRecordsPage({
  searchParams,
}: {
  searchParams: Promise<ReportParams>;
}) {
  const { scope } = await requireQualityScope(labReportsLiveFor);
  const v2 = (await labV2()).live;
  const sp = await searchParams;
  const tile = sp.tile as DrillId | undefined;
  if (!tile || !(tile in DRILL)) notFound();
  const p = reportParams(sp, new Date());
  const h = scope.hospitalId;
  const [all, targets, tests] = await Promise.all([
    asClinicalReader({ userId: scope.userId, hospitalId: h }, (tx) => reportRows(tx, p.period)),
    db.transaction((t) => statedTargets(t as never, h)),
    db.select({ code: testCatalogue.code, name: testCatalogue.display }).from(testCatalogue),
  ]);
  const testName = new Map(tests.map((t) => [t.code, t.name]));
  let rows = drillRows(filtered(all, p.filters), tile, targets);
  if (sp.section === "none") rows = rows.filter((r) => r.sectionId === null);
  if (sp.reason) rows = rows.filter((r) => r.flag && (r.reason ?? "not_recorded") === sp.reason);
  const release = scope.access.permissions.has("lab.result.release");
  const visible = rows.filter((r) => release || !r.restricted);
  const ids = await identitiesFor(
    scope,
    visible.flatMap((r) => (r.patientUserId ? [r.patientUserId] : [])),
    "lab_report_records",
  );
  const detail: Record<ReportRow["kind"], (r: ReportRow) => string> = {
    released: (r) => {
      const t = r.testCode ? targets[r.testCode] : undefined;
      const tat = releasedTurnaround(r.receivedAt, r.at!, null);
      return [
        tat ? formatDuration(tat.minutes) : "No receipt time",
        t ? `stated ${formatDuration(t)}` : null,
        r.bedside ? "bedside" : null,
        r.flag ? "corrected" : null,
      ]
        .filter(Boolean)
        .join(" · ");
    },
    specimen: (r) =>
      r.flag ? `Rejected: ${REJECTION_REASON_TEXT[r.reason ?? ""] ?? r.reason}` : "Received",
    identity: (r) => r.reason?.replaceAll("_", " ") ?? "",
    critical: (r) => `due ${at(r.dueAt)} · acknowledged ${at(r.doneAt)}`,
    qc_run: (r) => `${r.label} · ${r.reason}`,
    device: (r) => r.label ?? "",
    breakdown: (r) => `${r.label} · down ${at(r.at)} · back ${at(r.doneAt)}`,
  };

  const back = (
    <Link href={`/lab/reports?${p.query()}`} className={link}>
      {v2 ? fill(LABWS2_REPORTS.records.back, { place: LABWS2_REPORTS.tabsLabel }) : R.title}
    </Link>
  );
  const subline = tile === "tat" ? R.turnaround : R.tiles[tile];
  return (
    <div
      className={
        v2
          ? "flex flex-col gap-4"
          : "mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6"
      }
    >
      {/* Lab Workspace v2: the shell's top bar holds the h1, so the view's title is an h2. */}
      {v2 ? (
        <ViewHeader title={R.records} subline={subline} right={back} />
      ) : (
        <PageHeader
          place={`${scope.hospitalName} · ${LAB.place}`}
          placeInTopBar
          title={R.records}
          subline={subline}
          right={back}
        />
      )}
      <RecordList
        caption={R.records}
        rows={visible}
        rowKey={(r) => r.ref}
        empty={LABWS2_REPORTS.hmis.none}
        columns={[
          {
            id: "patient",
            header: "Patient",
            cell: (r) => {
              if (!r.patientUserId) return "—";
              const i = ids.get(r.patientUserId);
              return (
                <span className="flex flex-col">
                  <span>{i?.name ?? "Name withheld"}</span>
                  <span className="text-caption text-muted-foreground font-mono">
                    {i?.mrn ?? "MRN not found"}
                  </span>
                </span>
              );
            },
          },
          {
            id: "what",
            header: "Test",
            cell: (r) => {
              const what = r.testCode ? (testName.get(r.testCode) ?? r.testCode) : (r.label ?? "—");
              return r.orderId ? (
                <Link href={`/lab/results/${r.orderId}`} className={link}>
                  {what}
                </Link>
              ) : (
                what
              );
            },
          },
          { id: "at", header: "When", cell: (r) => at(r.at) },
          { id: "detail", header: "Detail", cell: (r) => detail[r.kind](r) },
          {
            id: "counted",
            header: R.counted,
            cell: (r) => (DRILL[tile].hit(r, targets) ? "Yes" : "No"),
          },
        ]}
      />
      {rows.length > visible.length ? (
        <p className="text-body-s">
          {fill(R.restrictedHidden, { n: rows.length - visible.length })}
        </p>
      ) : null}
    </div>
  );
}
