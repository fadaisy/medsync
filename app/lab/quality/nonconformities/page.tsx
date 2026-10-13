import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, ne } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { loadNcs } from "@/lib/lab/qc-read";
import { OpenNcDialog } from "../_components/nc-forms";
import { QcChip } from "../_components/qc-chip";
import { QUALITY } from "../_lib/copy";
import { requireQualityScope } from "../_lib/scope";
import { RecordList } from "../../_components/record-list";
import { dateWords } from "../../_lib/days";

export const metadata: Metadata = { title: "Nonconformities · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const N = QUALITY.nc;

/** The nonconformity register (Lab Phase 3 §5.9, NC-1..NC-5; labQc). Overdue actions are amber; none closes by itself. */
export default async function NonconformitiesPage() {
  const { scope, staff } = await requireQualityScope();
  const now = new Date();
  const [rows, machines] = await Promise.all([
    db.transaction((t) => loadNcs(t as never, scope.hospitalId, now)),
    db
      .select({ id: devices.id, model: devices.model })
      .from(devices)
      .where(and(eq(devices.hospitalId, scope.hospitalId), ne(devices.state, "retired"))),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={N.title}
        right={staff ? <OpenNcDialog machines={machines} /> : null}
      />
      <p className="text-body-s text-muted-foreground max-w-3xl">{N.lede}</p>
      <RecordList
        caption={N.title}
        rows={rows}
        rowKey={(r) => r.id}
        empty={N.none}
        columns={[
          {
            id: "number",
            header: N.columns[0]!,
            cell: (r) => (
              <Link
                href={`/lab/quality/nonconformities/${r.id}`}
                className="font-mono font-medium text-teal-700 underline-offset-4 hover:underline"
              >
                {r.number}
              </Link>
            ),
          },
          { id: "title", header: N.columns[1]!, cell: (r) => r.title },
          { id: "source", header: N.columns[2]!, cell: (r) => N.sources[r.source] ?? r.source },
          { id: "opened", header: N.columns[3]!, cell: (r) => dateWords(r.openedAt) },
          {
            id: "status",
            header: N.columns[4]!,
            cell: (r) => (
              <span className="flex flex-col gap-1">
                {r.state === "closed" ? (
                  <StatusWord>{N.closed}</StatusWord>
                ) : r.testingHalted && !r.resumedAt ? (
                  <QcChip tone="dark">{N.halted}</QcChip>
                ) : (
                  <QcChip tone="amber">{N.openWord}</QcChip>
                )}
                {r.overdue ? (
                  <QcChip tone="amber">{QUALITY.today.overdue(r.overdue)}</QcChip>
                ) : null}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
