import type { QcTone } from "../_lib/status";
import type { ReactNode } from "react";
import Link from "next/link";

import {
  EmptyState,
  Ident,
  KeyFigure,
  KeyFigureGrid,
  NotSet,
  Panel,
  Pill,
  TwoIds,
} from "@/components/tide/work/kit";
import { fill, LAB3_HMIS } from "@/content/lab-phase-3";
import { LABWS2_QUALITY } from "@/content/lab-workspace-v2-quality";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { labEquipmentLiveFor, labHmisLiveFor, labStockLiveFor } from "@/lib/lab/feature";
import { hmisReminder } from "@/lib/lab/hmis105";
import { requestNow } from "@/lib/lab/page-data";
import { loadQcSparks } from "@/lib/lab/qc-spark-read";
import { analyteName } from "@/lib/lab/qc-store";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { QUALITY } from "../_lib/copy";
import {
  equipmentFor,
  heldFor,
  hmisSignedFor,
  kitsFor,
  ncsFor,
  plansFor,
  qcToRun,
  stockFor,
} from "../_lib/quality-data";
import { requireQualityScope } from "../_lib/scope";
import { qcWord } from "../_lib/status";
import { MiniLJ, MonthsOfStockBar } from "../../_components/v2/quality-charts";
import { dateWords, timeWords } from "../../_lib/days";
import { dueWords, monthWords } from "../../hmis/_lib/month";
import { runHref } from "./qc";

const W = LABWS2_QUALITY.today;
const at = (d: Date) => `${dateWords(d)} ${timeWords(d)}`;
const link = "text-primary font-medium underline-offset-4 hover:underline";
const th = "text-caption text-muted-foreground h-9 px-3 text-left font-medium whitespace-nowrap";
const td = "text-body-s px-3 py-2 align-middle";

/** The status pill (5.7): passed is neutral with a check; warning, failed, held and not run are amber, in words. */
function StatusPill({ tone, word }: { tone: QcTone; word: string }) {
  return <Pill tone={tone === "passed" ? "passed" : "caution"}>{word}</Pill>;
}

/**
 * Quality · Today (Lab Workspace v2, prompt 5.7; canvas Quality.dc.html): four key figures, QC today by test and
 * analyser with the mini Levey-Jennings line of the last 10 runs, stock below minimum as months-of-stock bars,
 * nonconformities needing you, and the results held by QC. Statuses are the engine's (QH-1); nothing is decided
 * here.
 */
export async function QualityTodayV2() {
  const { scope, lead } = await requireQualityScope();
  const h = scope.hospitalId;
  const now = requestNow();
  const stockOn = labStockLiveFor(h);
  const equipmentOn = labEquipmentLiveFor(h);
  const hmisOn = labHmisLiveFor(h);
  const [plans, kits, held, stock, equipment, ncs, signed, toRun] = await Promise.all([
    plansFor(h),
    kitsFor(h, scope.userId),
    heldFor(h),
    stockOn ? stockFor(h) : null,
    equipmentOn ? equipmentFor(h) : null,
    ncsFor(h),
    hmisOn ? hmisSignedFor(h) : [],
    qcToRun(h, scope.userId),
  ]);
  const [sparks, ids] = await Promise.all([
    db.transaction((t) => loadQcSparks(t as never, h, plans.rows)),
    identitiesFor(
      scope,
      held.map((r) => r.patientUserId),
      "lab_quality_today",
    ),
  ]);
  const due = hmisOn ? hmisReminder(now, DEFAULT_TIME_ZONE, signed) : null;
  const down = equipment?.filter((e) => e.state === "down") ?? [];
  const below = stock?.items.filter((i) => i.belowMinimum || i.onHand <= 0) ?? [];
  const open = ncs.filter((n) => n.state === "open");
  const kitRows = kits.flatMap((k) =>
    k.lots.filter((l) => l.due.length || l.state === "quarantined").map((l) => ({ k, l })),
  );
  const S = QUALITY.status;
  const windowSet = stock ? stock.settings.expiryWindowDays !== null : true;

  const toRunSub = toRun.first
    ? `${toRun.first.analyte} on ${toRun.first.device}`
    : toRun.firstKit
      ? `${toRun.firstKit.k.name} · ${toRun.firstKit.l.lot}`
      : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel>
        <KeyFigureGrid className="xl:grid-cols-4">
          <KeyFigure
            label={W.figures.toRun}
            value={toRun.count}
            sub={toRunSub}
            href="/lab/quality?tab=runs"
          />
          <KeyFigure
            label={W.figures.held}
            value={held.length}
            sub={held[0] ? W.heldSub(held[0].test, held.length - 1) : undefined}
            href="#held"
          />
          {stock ? (
            windowSet ? (
              <KeyFigure
                label={W.figures.expiring}
                value={stock.items.filter((i) => i.expiring).length}
                sub={W.expiringSub(stock.settings.expiryWindowDays!)}
                href="/lab/quality?tab=stock&f=expiring"
              />
            ) : (
              <div className="rounded-tide-tile flex min-w-0 flex-col gap-1 p-3">
                <span className="text-caption text-muted-foreground font-medium">
                  {W.figures.expiring}
                </span>
                <NotSet
                  label={W.windowNotSet}
                  href="/lab/quality?tab=stock#stock-settings"
                  canSet={lead}
                />
              </div>
            )
          ) : null}
          {equipment ? (
            <KeyFigure
              label={W.figures.down}
              value={down.length}
              sub={
                down[0]
                  ? W.downSub(
                      down[0].model,
                      down[0].breakdown ? timeWords(down[0].breakdown.since) : null,
                    )
                  : undefined
              }
              href="/lab/quality?tab=equipment"
            />
          ) : null}
        </KeyFigureGrid>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={W.qcTitle} note={W.qcNote} labelledBy="qc-today">
            {plans.rows.length + kitRows.length === 0 ? (
              <EmptyState compact title={W.qcEmpty} why={W.qcEmptyWhy} next={W.qcEmptyNext} />
            ) : (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full border-collapse">
                  <caption className="sr-only">{W.qcTitle}</caption>
                  <thead>
                    <tr className="border-border border-b">
                      {W.qcColumns.map((c) => (
                        <th key={c} scope="col" className={th}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plans.rows.map((r) => {
                      const w = qcWord({ ...r, rules: r.lastRun?.rules ?? [] });
                      const sp = sparks.get(r.configId);
                      return (
                        <tr key={r.configId} className="border-border/70 border-b last:border-b-0">
                          <th scope="row" className={`${td} text-left font-medium`}>
                            <Link href={runHref(r.deviceId, r.conceptId)} className={link}>
                              {r.analyte}
                            </Link>
                          </th>
                          <td className={td}>{r.device}</td>
                          <td className={`${td} tabular-nums`}>
                            {r.lastRun ? timeWords(r.lastRun.at) : "—"}
                          </td>
                          <td className={td}>{sp ? <MiniLJ spark={sp.spark} /> : null}</td>
                          <td className={td}>
                            <StatusPill tone={w.tone} word={w.word} />
                          </td>
                          <td className={td}>{sp?.levels ? W.levels(sp.levels) : "—"}</td>
                        </tr>
                      );
                    })}
                    {kitRows.map(({ k, l }) => (
                      <tr key={l.id} className="border-border/70 border-b last:border-b-0">
                        <th scope="row" className={`${td} text-left font-medium`}>
                          <Link href="/lab/quality?tab=runs" className={link}>
                            {k.name} · <Ident>{l.lot}</Ident>
                          </Link>
                        </th>
                        <td className={td}>{W.kitOrStain[k.kind]}</td>
                        <td className={`${td} tabular-nums`}>{l.last ? at(l.last.at) : "—"}</td>
                        <td className={`${td} text-caption text-muted-foreground`}>—</td>
                        <td className={td}>
                          <StatusPill
                            tone={l.state === "quarantined" || l.blocks ? "amber" : "dashed"}
                            word={
                              l.state === "quarantined"
                                ? S.quarantined
                                : l.due.includes("new_lot")
                                  ? S.newLot
                                  : l.blocks
                                    ? S.dueFirst
                                    : S.dueToday
                            }
                          />
                        </td>
                        <td className={td}>—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-caption text-muted-foreground">{QUALITY.today.footnote}</p>
          </Panel>

          <Panel title={W.heldTitle} labelledBy="held" className="scroll-mt-24">
            {held.length === 0 ? (
              <EmptyState compact title={W.heldEmpty} why={W.heldEmptyWhy} />
            ) : (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full border-collapse">
                  <caption className="sr-only">{W.heldTitle}</caption>
                  <thead>
                    <tr className="border-border border-b">
                      {W.heldColumns.map((c) => (
                        <th key={c} scope="col" className={th}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {held.map((r) => {
                      const i = ids.get(r.patientUserId);
                      return (
                        <tr key={r.reportId} className="border-border/70 border-b last:border-b-0">
                          <td className={td}>
                            <TwoIds
                              name={i?.name ?? "Name withheld"}
                              mrn={i?.mrn ?? "MRN not found"}
                            />
                          </td>
                          <td className={td}>
                            <Link href={`/lab/bench/${r.orderId}`} className={link}>
                              {r.test}
                            </Link>
                          </td>
                          <td className={td}>
                            <Pill tone="caution">{(r.held ?? []).map(analyteName).join(", ")}</Pill>
                          </td>
                          <td className={`${td} tabular-nums`}>{at(r.at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          {stock ? (
            <Panel
              title={W.stockTitle}
              note={W.stockNote}
              action={
                <Link href="/lab/quality?tab=stock&f=below" className={`text-body-s ${link}`}>
                  {W.stockLink}
                </Link>
              }
            >
              {below.length === 0 ? (
                <EmptyState compact title={W.stockEmpty} why={W.stockEmptyWhy} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {below.map((i) => (
                    <li key={i.id} className="flex flex-col gap-1">
                      <span className="text-body-s text-foreground font-medium">{i.name}</span>
                      <MonthsOfStockBar
                        name={i.name}
                        months={i.monthsOfStock}
                        minMonths={i.minMonths}
                        maxMonths={i.maxMonths}
                        width={160}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          <Panel
            title={W.ncTitle}
            action={
              <Link href="/lab/quality?tab=nc" className={`text-body-s ${link}`}>
                {W.ncAll(ncs.length)}
              </Link>
            }
          >
            {open.length === 0 && !due && down.length === 0 ? (
              <EmptyState compact title={W.ncEmpty} why={W.ncEmptyWhy} />
            ) : (
              <ul className="divide-border flex flex-col divide-y">
                {open.map((n) => (
                  <Item
                    key={n.id}
                    href={`/lab/quality/nc/${n.id}`}
                    title={n.title}
                    sub={<Ident>{n.number}</Ident>}
                  >
                    {n.testingHalted && !n.resumedAt ? (
                      <Pill tone="caution">{QUALITY.nc.halted}</Pill>
                    ) : null}
                    {n.overdue ? <Pill tone="caution">{W.overdue(n.overdue)}</Pill> : null}
                  </Item>
                ))}
                {down.map((e) => (
                  <Item
                    key={e.id}
                    href="/lab/quality?tab=equipment"
                    title={e.model}
                    sub={e.breakdown ? at(e.breakdown.since) : undefined}
                  >
                    <Pill tone="caution">{W.figures.down}</Pill>
                  </Item>
                ))}
                {due ? (
                  <Item
                    href={`/lab/reports?tab=hmis&month=${due}`}
                    title={fill(LAB3_HMIS.reminder, {
                      month: monthWords(due),
                      date: dueWords(due),
                    })}
                    sub={W.hmis}
                  />
                ) : null}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Item({
  href,
  title,
  sub,
  children,
}: {
  href: string;
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-muted focus-visible:shadow-focus rounded-tide-row flex min-h-11 flex-wrap items-center justify-between gap-2 px-1 py-2 outline-none"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-body-s text-foreground font-medium">{title}</span>
          {sub ? <span className="text-caption text-muted-foreground">{sub}</span> : null}
        </span>
        {children ? <span className="flex flex-wrap gap-1">{children}</span> : null}
      </Link>
    </li>
  );
}
