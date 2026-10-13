import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { fill, LAB3_HMIS } from "@/content/lab-phase-3";
import { db } from "@/db";
import { labHmisReports } from "@/db/schema";
import { identitiesFor } from "@/lib/emr/read/results";
import { labHmisLiveFor } from "@/lib/lab/feature";
import { recordsFor } from "@/lib/lab/hmis-store";
import { monthWords, validMonth } from "../_lib/month";
import { RecordList } from "../../_components/record-list";
import { dateWords, timeWords } from "../../_lib/days";
import { requireQualityScope } from "../../quality/_lib/scope";

export const metadata: Metadata = { title: "Records counted · HMIS 105 · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const H = LAB3_HMIS;
const link = "font-medium text-teal-700 underline-offset-4 hover:underline";

/**
 * Law 7: the records one HMIS number counts, as stored with the report (HM-11 sources), each with two
 * identifiers (Law 12). Lab roles only (this is the lab workspace); restricted results only for staff who
 * release results (Law 9, GATE A §4); QC checks, EQA samples and stock are counted here, never as patients.
 */
export default async function HmisRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; rev?: string; key?: string }>;
}) {
  const { scope } = await requireQualityScope(labHmisLiveFor);
  const sp = await searchParams;
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
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={H.records}
        subline={`${key.replace("|", " · ")} · ${monthWords(month)}`}
        right={
          <Link href={`/lab/hmis?month=${month}`} className={link}>
            {H.title}
          </Link>
        }
      />
      <RecordList
        caption={H.records}
        rows={visible}
        rowKey={(x) => x.id}
        empty="None."
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
          {found.other} quality-control, EQA or stock records are counted here; they are on the
          Quality and Stock pages.
        </p>
      ) : null}
    </div>
  );
}
