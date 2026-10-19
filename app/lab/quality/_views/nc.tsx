import Link from "next/link";
import { and, eq, ne } from "drizzle-orm";

import { StatusWord } from "@/components/emr/status-word";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { loadNcs } from "@/lib/lab/qc-read";
import { OpenNcDialog } from "../_components/nc-forms";
import { QList } from "../_components/q-list";
import { QcChip } from "../_components/qc-chip";
import { QUALITY } from "../_lib/copy";
import { ncLiveFor, requireQualityScope } from "../_lib/scope";
import { Ident } from "../../_components/v2/kit";
import { dateWords } from "../../_lib/days";
import { Frame } from "./frame";

const N = QUALITY.nc;

export const ncHref = (v2: boolean, id: string) =>
  v2 ? `/lab/quality/nc/${id}` : `/lab/quality/nonconformities/${id}`;

/** The nonconformity register (Lab Phase 3 §5.9, NC-1..NC-5). Overdue actions are amber; none closes by itself. */
export async function NcListView({ v2 }: { v2: boolean }) {
  const { scope, staff } = await requireQualityScope(ncLiveFor);
  const now = new Date();
  const [rows, machines] = await Promise.all([
    db.transaction((t) => loadNcs(t as never, scope.hospitalId, now)),
    db
      .select({ id: devices.id, model: devices.model })
      .from(devices)
      .where(and(eq(devices.hospitalId, scope.hospitalId), ne(devices.state, "retired"))),
  ]);
  return (
    <Frame
      v2={v2}
      hospital={scope.hospitalName}
      title={N.title}
      lede={N.lede}
      right={staff ? <OpenNcDialog machines={machines} /> : null}
    >
      <QList
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
                href={ncHref(v2, r.id)}
                className="text-primary font-medium underline-offset-4 hover:underline"
              >
                <Ident>{r.number}</Ident>
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
                  <QcChip tone="dashed">{N.openWord}</QcChip>
                )}
                {r.overdue ? (
                  <QcChip tone="amber">{QUALITY.today.overdue(r.overdue)}</QcChip>
                ) : null}
              </span>
            ),
          },
        ]}
      />
    </Frame>
  );
}
