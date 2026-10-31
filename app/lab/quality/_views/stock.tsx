import type { ItemRow } from "@/lib/lab/stock-read";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CheckIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labStockLiveFor } from "@/lib/lab/feature";
import { loadLabComponents } from "@/lib/lab/qc-plan-form-read";
import { loadLabSections } from "@/lib/lab/read";
import { loadStock } from "@/lib/lab/stock-read";
import { cn } from "@/lib/utils";
import { QList } from "../_components/q-list";
import { conceptOptions } from "../_lib/concepts";
import { MonthsOfStockBar } from "../../_components/v2/quality-charts";
import { FilterChips, SecondaryLink } from "@/components/tide/work/space";
import { dateWords, dayWords } from "../../_lib/days";
import {
  CountDialog,
  ItemDialog,
  ItemPanel,
  SettingsDialog,
  SwitchOnDialog,
} from "../../stock/_components/stock-forms";
import { STOCK as C } from "../../stock/_lib/copy";
import { Frame } from "./frame";

type Filter = "all" | "below" | "expiring" | "quarantined" | "tracer";
const FILTERS: Record<Filter, (i: ItemRow) => boolean> = {
  all: () => true,
  below: (i) => i.belowMinimum || i.onHand <= 0,
  expiring: (i) => i.expiring,
  quarantined: (i) => i.quarantined,
  tracer: (i) => !!i.hmisTracerCode,
};

function Status({ i }: { i: ItemRow }) {
  if (i.onHand <= 0) return <StatusWord tone="caution">{C.status.out}</StatusWord>;
  if (i.belowMinimum) return <StatusWord tone="caution">{C.status.below}</StatusWord>;
  if (i.quarantined) return <StatusWord tone="caution">{C.status.quarantined}</StatusWord>;
  if (i.expiring) return <StatusWord tone="caution">{C.status.expiring}</StatusWord>;
  return (
    <StatusWord icon glyph={CheckIcon}>
      {C.status.inStock}
    </StatusWord>
  );
}

/**
 * Stock and lots (Lab Phase 3 §5.5, artboard 5; ST-1..ST-10, labStock). The table, its filters and the item
 * panel read the ledger at request time. Viewing needs lab.view; the forms post to lib/lab/stock-actions.ts,
 * which checks lab.stock.manage or lab.manage on the server.
 */
export async function StockView({ v2, f }: { v2: boolean; f?: string }) {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive || !emrV1LiveFor(scope.hospitalId) || !labStockLiveFor(scope.hospitalId))
    notFound();
  const filter: Filter = f && f in FILTERS ? (f as Filter) : "all";
  const now = new Date();
  const [[stock, components], sections, devs] = await Promise.all([
    db.transaction((tx) =>
      Promise.all([
        loadStock(tx as never, scope.hospitalId, now),
        loadLabComponents(tx as never, scope.hospitalId),
      ]),
    ),
    loadLabSections(scope.hospitalId),
    db
      .select({ id: devices.id, model: devices.model, serial: devices.serial })
      .from(devices)
      .where(eq(devices.hospitalId, scope.hospitalId))
      .orderBy(devices.model),
  ]);
  const lead = scope.access.permissions.has("lab.manage");
  const keeper = lead || scope.access.permissions.has("lab.stock.manage");
  const rows = stock.items.filter(FILTERS[filter]);
  const due = stock.items.filter((i) => i.countDue).length;
  const concepts = conceptOptions(
    components,
    stock.items.flatMap((i) => i.conceptIds),
  );
  const places = {
    sections,
    devices: devs.map((d) => ({ id: d.id, name: d.serial ? `${d.model} · ${d.serial}` : d.model })),
  };

  return (
    <Frame
      v2={v2}
      hospital={scope.hospitalName}
      title={C.title}
      lede={C.lede}
      right={
        <div className="flex flex-wrap gap-2">
          {keeper ? (
            <>
              {v2 ? (
                <SecondaryLink href="/lab/quality/stock/receive">{C.receive}</SecondaryLink>
              ) : (
                <Link href="/lab/stock/receive" className={buttonVariants()}>
                  {C.receive}
                </Link>
              )}
              <CountDialog items={stock.items} />
            </>
          ) : null}
        </div>
      }
    >
      <p className="text-body-s flex flex-wrap items-center gap-2">
        {due ? <StatusWord tone="caution">{C.countDue(due)}</StatusWord> : null}
        <span className="text-muted-foreground">
          {C.lastCounted(stock.lastCount ? dateWords(stock.lastCount) : null)}
        </span>
      </p>

      {v2 ? (
        <FilterChips
          label={C.title}
          current={filter}
          chips={(Object.keys(FILTERS) as Filter[]).map((k) => ({
            key: k,
            label:
              k === "expiring" ? C.filters.expiring(stock.settings.expiryWindowDays) : C.filters[k],
            count: stock.items.filter(FILTERS[k]).length,
            href: k === "all" ? "/lab/quality?tab=stock" : `/lab/quality?tab=stock&f=${k}`,
          }))}
        />
      ) : (
        <nav aria-label="Filter" className="flex flex-wrap gap-2">
          {(Object.keys(FILTERS) as Filter[]).map((k) => (
            <Link
              key={k}
              href={k === "all" ? "/lab/stock" : `/lab/stock?f=${k}`}
              aria-current={k === filter ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: k === filter ? "soft" : "secondary", size: "sm" }),
                "min-h-11 sm:min-h-[26px]",
              )}
            >
              {k === "expiring"
                ? C.filters.expiring(stock.settings.expiryWindowDays)
                : C.filters[k]}{" "}
              <span className="tabular-nums">{stock.items.filter(FILTERS[k]).length}</span>
            </Link>
          ))}
        </nav>
      )}

      <QList<ItemRow>
        caption={C.title}
        rows={rows}
        rowKey={(i) => i.id}
        empty={stock.items.length ? C.noneFiltered : C.none}
        columns={[
          {
            id: "item",
            header: C.columns[0]!,
            cell: (i) => (
              <span className="flex flex-col">
                <span>{i.name}</span>
                <span className="text-caption text-muted-foreground">
                  {i.packSize ? `${i.unitOfIssue} of ${i.packSize}` : i.unitOfIssue}
                </span>
              </span>
            ),
          },
          {
            id: "on_hand",
            header: C.columns[1]!,
            cell: (i) => <span className="tabular-nums">{i.onHand}</span>,
          },
          {
            id: "months",
            header: C.columns[2]!,
            cell: (i) => (
              <MonthsOfStockBar
                name={i.name}
                months={i.monthsOfStock}
                minMonths={i.minMonths}
                maxMonths={i.maxMonths}
              />
            ),
          },
          {
            id: "expiry",
            header: C.columns[3]!,
            cell: (i) =>
              i.nearestExpiry ? (
                <span className="tabular-nums">{dayWords(i.nearestExpiry)}</span>
              ) : (
                <span className="text-muted-foreground">{C.noExpiry}</span>
              ),
          },
          { id: "status", header: C.columns[4]!, cell: (i) => <Status i={i} /> },
          {
            id: "open",
            header: C.columns[5]!,
            cell: (i) => (
              <ItemPanel
                item={i}
                lookBackMonths={stock.settings.lookBackMonths}
                lead={lead}
                keeper={keeper}
                me={scope.userId}
                places={places}
                concepts={concepts}
                v2={v2}
              />
            ),
          },
        ]}
      />
      <p className="text-caption text-muted-foreground max-w-3xl">{C.footnote}</p>

      {lead ? (
        <div id="stock-settings" className="flex flex-wrap gap-2">
          <ItemDialog concepts={concepts} />
          <SettingsDialog settings={stock.settings} />
          <SwitchOnDialog items={stock.items} />
        </div>
      ) : null}
    </Frame>
  );
}
