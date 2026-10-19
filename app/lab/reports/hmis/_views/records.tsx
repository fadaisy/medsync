import type { LabTechScope } from "@/lib/lab-tech/scope";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { fill, LAB3_HMIS } from "@/content/lab-phase-3";
import { LABWS2_REPORTS } from "@/content/lab-workspace-v2-reports";
import { db } from "@/db";
import { labHmisReports, testCatalogue } from "@/db/schema";
import { identitiesFor } from "@/lib/emr/read/results";
import { hmisForm } from "@/lib/lab/hmis-form";
import { recordsFor } from "@/lib/lab/hmis-store";
import { RecordList } from "../../../_components/record-list";
import { ViewHeader } from "../../../_components/v2/view-header";
import { dateWords, timeWords } from "../../../_lib/days";
import { monthWords, validMonth } from "../../../hmis/_lib/month";

const H = LAB3_HMIS;
const link = "font-medium text-teal-700 underline-offset-4 hover:underline";

/**
 * Law 7: the records one HMIS number counts, as stored with the report (HM-11 sources), each with two
 * identifiers (Law 12). Lab roles only (this is the lab workspace); restricted results only for staff who
 * release results (Law 9, GATE A §4); QC checks, EQA samples and stock are counted here, never as patients.
 */
export async function HmisRecordsBody({
  scope,
  sp,
  v2 = false,
}: {
  scope: LabTechScope;
  sp: { month?: string; rev?: string; key?: string };
  /** Lab Workspace v2: the view's h2 under the shell's top bar, and the way back into Reports. */
  v2?: boolean;
}) {
  const month = validMonth(sp.month, new Date());
  const key = sp.key ?? "";
  const [r] = await db
    .select({ sources: labHmisReports.sources, cells: labHmisReports.cells })
    .from(labHmisReports)
    .where(
      and(
        eq(labHmisReports.hospitalId, scope.hospitalId),
        eq(labHmisReports.month, `${month}-01`),
        eq(labHmisReports.revision, Number(sp.rev) || 1),
      ),
    );
  const sources = (r?.sources as Record<string, string[]> | undefined)?.[key];
  if (!sources) notFound();
  const found = await db.transaction((t) => recordsFor(t as never, scope.hospitalId, sources));
  const restricted = scope.access.permissions.has("lab.result.release");
  const rows = [
    ...found.results.map((x) => ({ id: x.logicalId, ...x, what: x.test })),
    ...found.specimens.map((x) => ({ ...x, at: null, what: `${x.test} · specimen` })),
    ...found.orders.map((x) => ({ ...x, orderId: x.id, what: `${x.test} · order` })),
  ];
  const visible = rows.filter((x) => restricted || x.sensitivity !== "restricted");
  const ids = await identitiesFor(
    scope,
    visible.map((x) => x.patientUserId),
    "lab_hmis_records",
  );
  // The cell in words, as the HMIS 105 page labels it ("10.2.1 Malaria RDT · Number done"), not the raw key.
  const [row = "", column = ""] = key.split("|");
  const formRow = hmisForm().form.rows.find((x) => (x.code ?? x.label) === row);
  const [test] = formRow
    ? []
    : await db
        .select({ name: testCatalogue.display })
        .from(testCatalogue)
        .where(eq(testCatalogue.code, row));
  const rowWords = formRow
    ? `${formRow.code ? `${formRow.code} ` : ""}${formRow.label}`
    : (test?.name ?? row);
  const subline = `${rowWords} · ${column} · ${monthWords(month)}`;
  return (
    <div
      className={
        v2
          ? "flex flex-col gap-4"
          : "mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6"
      }
    >
      {v2 ? (
        <ViewHeader
          title={H.records}
          subline={subline}
          right={
            <Link
              href={`/lab/reports?${new URLSearchParams({ tab: "hmis", month })}`}
              className={link}
            >
              {fill(LABWS2_REPORTS.records.back, { place: H.title })}
            </Link>
          }
        />
      ) : (
        <PageHeader
          place={`${scope.hospitalName} · ${LAB.place}`}
          placeInTopBar
          title={H.records}
          subline={subline}
          right={
            <Link href={`/lab/hmis?month=${month}`} className={link}>
              {H.title}
            </Link>
          }
        />
      )}
      <RecordList
        caption={H.records}
        rows={visible}
        rowKey={(x) => x.id}
        empty={LABWS2_REPORTS.hmis.none}
        columns={[
          {
            id: "patient",
            header: "Patient",
            cell: (x) => {
              const i = ids.get(x.patientUserId);
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
            cell: (x) =>
              x.orderId ? (
                <Link href={`/lab/results/${x.orderId}`} className={link}>
                  {x.what}
                </Link>
              ) : (
                x.what
              ),
          },
          {
            id: "at",
            header: "When",
            cell: (x) => (x.at ? `${dateWords(x.at)} ${timeWords(x.at)}` : "—"),
          },
        ]}
      />
      {rows.length > visible.length ? (
        <p className="text-body-s">
          {fill(H.restrictedHidden, { n: rows.length - visible.length })}
        </p>
      ) : null}
      {found.other ? (
        <p className="text-body-s text-muted-foreground">
          {fill(LABWS2_REPORTS.hmis.other, { n: found.other })}
        </p>
      ) : null}
    </div>
  );
}
