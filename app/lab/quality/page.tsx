import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { loadEquipment } from "@/lib/lab/equipment-read";
import { labEquipmentLiveFor } from "@/lib/lab/feature";
import { heldReports, loadKits, loadNcs, loadQcPlans } from "@/lib/lab/qc-read";
import { analyteName } from "@/lib/lab/qc-store";
import { loadStock } from "@/lib/lab/stock-read";
import { RecordList } from "../_components/record-list";
import { dateWords, timeWords } from "../_lib/days";
import { QcChip } from "./_components/qc-chip";
import { QUALITY } from "./_lib/copy";
import { requireQualityScope } from "./_lib/scope";
import { qcWord } from "./_lib/status";

export const metadata: Metadata = { title: "Quality today · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

const C = QUALITY.today;
const at = (d: Date) => `${dateWords(d)} ${timeWords(d)}`;
const link = "font-medium text-teal-700 underline-offset-4 hover:underline";

type Row = { key: string; what: ReactNode; where: string; last: string; status: ReactNode };

function Tile({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link
      href={href}
      className="border-border bg-card shadow-card focus-visible:shadow-focus flex min-h-24 flex-col justify-between gap-2 rounded-lg border p-4 outline-none"
    >
      <span className="text-body-s text-muted-foreground">{label}</span>
      <span className="text-heading-m text-foreground font-mono font-medium tabular-nums">
        {value}
      </span>
    </Link>
  );
}

/**
 * Quality today (Lab Phase 3 §5.1, artboard 1; labQc): four tiles, today's QC by analyte, kit and stain, and
 * what needs the viewer. Statuses are the engine's over the cached rows (QH-1); every number links to its list.
 */
export default async function QualityTodayPage() {
  const { scope } = await requireQualityScope();
  const now = new Date();
  const h = scope.hospitalId;
  const equipmentOn = labEquipmentLiveFor(h);
  const [plans, held, stock, kits, ncs, equipment] = await db.transaction(async (t) => {
    const tx = t as never;
    return Promise.all([
      loadQcPlans(tx, h, now),
      heldReports(tx, h),
      loadStock(tx, h, now),
      loadKits(tx, h, scope.userId, now),
      loadNcs(tx, h, now),
      equipmentOn ? loadEquipment(tx, h, now) : Promise.resolve(null),
    ]);
  });
  const ids = await identitiesFor(
    scope,
    held.map((r) => r.patientUserId),
    "lab_quality_today",
  );
  const kitRows = kits.flatMap((k) =>
    k.lots.filter((l) => l.due.length || l.state === "quarantined").map((l) => ({ k, l })),
  );
  const toRun =
    plans.rows.filter((r) => r.status === "not_run_in_window").length +
    kitRows.filter(({ l }) => l.due.length).length;
  const expiring = stock.items.filter((i) => i.expiring).length;
  const down = equipment?.filter((e) => e.state === "down") ?? [];
  const below = stock.items.filter((i) => i.belowMinimum).length;
  const open = ncs.filter((n) => n.state === "open");
  const overdue = open.reduce((s, n) => s + n.overdue, 0);
  const S = QUALITY.status;

  const rows: Row[] = [
    ...plans.rows.map((r) => {
      const w = qcWord({ ...r, rules: r.lastRun?.rules ?? [] });
      return {
        key: r.configId,
        what: (
          <Link
            href={`/lab/quality/qc/run?device=${r.deviceId}&concept=${encodeURIComponent(r.conceptId)}`}
            className={link}
          >
            {r.analyte}
          </Link>
        ),
        where: r.device,
        last: r.lastRun ? at(r.lastRun.at) : "—",
        status: <QcChip tone={w.tone}>{w.word}</QcChip>,
      };
    }),
    ...kitRows.map(({ k, l }) => ({
      key: l.id,
      what: (
        <Link href="/lab/quality/qc?tab=kits" className={link}>
          {`${k.name} · ${l.lot}`}
        </Link>
      ),
      where: k.kind === "stain" ? "Stain" : "Kit",
      last: l.last ? at(l.last.at) : "—",
      status:
        l.state === "quarantined" ? (
          <QcChip tone="dark">{S.quarantined}</QcChip>
        ) : (
          <QcChip tone={l.blocks ? "amber" : "dashed"}>
            {l.due.includes("new_lot") ? S.newLot : l.blocks ? S.dueFirst : S.dueToday}
          </QcChip>
        ),
    })),
  ];

  const needs: ReactNode[] = [
    ...down.map((e) => (
      <Link key={e.id} href="/lab/equipment" className={link}>
        {`${e.model} is down${e.breakdown ? ` since ${at(e.breakdown.since)}` : ""}`}
      </Link>
    )),
    ...(below
      ? [
          <Link key="below" href="/lab/stock" className={link}>
            {C.below(below)}
          </Link>,
        ]
      : []),
    ...(open.length
      ? [
          <span key="nc" className="flex flex-col gap-1">
            <Link href="/lab/quality/nonconformities" className={link}>
              {C.openNcs(open.length)}
            </Link>
            {overdue ? <StatusWord tone="caution">{C.overdue(overdue)}</StatusWord> : null}
          </span>,
        ]
      : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={C.title}
        subline={`Updated ${timeWords(now)}`}
        right={
          <Link href="/lab/quality/qc" className={link}>
            {C.record}
          </Link>
        }
      />
      <p className="text-body-s text-muted-foreground max-w-3xl">{C.lede}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={C.tiles.toRun} value={String(toRun)} href="/lab/quality/qc" />
        <Tile label={C.tiles.held} value={String(held.length)} href="#held" />
        <Tile
          label={C.tiles.expiring}
          value={stock.settings.expiryWindowDays === null ? C.windowNotSet : String(expiring)}
          href="/lab/stock"
        />
        {equipment ? (
          <Tile label={C.tiles.down} value={String(down.length)} href="/lab/equipment" />
        ) : null}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="qc-today" className="flex min-w-0 flex-col gap-3">
          <h2 id="qc-today" className="text-heading-s font-medium">
            {C.qcTable}
          </h2>
          <RecordList<Row>
            caption={C.qcTable}
            rows={rows}
            rowKey={(r) => r.key}
            empty={C.none}
            columns={[
              { id: "what", header: C.columns[0]!, cell: (r) => r.what },
              { id: "where", header: C.columns[1]!, cell: (r) => r.where },
              { id: "last", header: C.columns[2]!, cell: (r) => r.last },
              { id: "status", header: C.columns[3]!, cell: (r) => r.status },
            ]}
          />
          <p className="text-caption text-muted-foreground">{C.footnote}</p>
          <h2 id="held" className="text-heading-s pt-2 font-medium">
            {C.heldList}
          </h2>
          <RecordList
            caption={C.heldList}
            rows={held}
            rowKey={(r) => r.reportId}
            empty="None."
            columns={[
              {
                id: "patient",
                header: "Patient",
                cell: (r) => {
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
                id: "test",
                header: "Test",
                cell: (r) => (
                  <Link href={`/lab/results/${r.orderId}`} className={link}>
                    {r.test}
                  </Link>
                ),
              },
              {
                id: "held",
                header: "Held",
                cell: (r) => (
                  <QcChip tone="dark">{(r.held ?? []).map(analyteName).join(", ")}</QcChip>
                ),
              },
              { id: "at", header: "Released", cell: (r) => at(r.at) },
            ]}
          />
        </section>
        <aside
          aria-labelledby="needs-you"
          className="border-border bg-card shadow-card text-body-s flex h-fit flex-col gap-3 rounded-lg border p-4"
        >
          <h2 id="needs-you" className="text-heading-s font-medium">
            {C.needsYou}
          </h2>
          {needs.length ? (
            <ul className="flex flex-col gap-2">
              {needs.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{C.nothing}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
