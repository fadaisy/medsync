import type { ItemRow } from "@/lib/lab/stock-read";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CheckIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LAB } from "@/content/lab";
import { LAB3 } from "@/content/lab-phase-3";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { labStockLiveFor } from "@/lib/lab/feature";
import { loadLabSections } from "@/lib/lab/read";
import { loadStock } from "@/lib/lab/stock-read";
import { cn } from "@/lib/utils";
import { RecordList } from "../_components/record-list";
import { dateWords, dayWords } from "../_lib/days";
import {
  CountDialog,
  ItemDialog,
  ItemPanel,
  SettingsDialog,
  SwitchOnDialog,
} from "./_components/stock-forms";
import { STOCK as C } from "./_lib/copy";

export const metadata: Metadata = { title: "Stock and lots · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

type Filter = "all" | "below" | "expiring" | "quarantined" | "tracer";
const FILTERS: Record<Filter, (i: ItemRow) => boolean> = {
  all: () => true,
  below: (i) => i.belowMinimum || i.onHand <= 0,
  expiring: (i) => i.expiring,
  quarantined: (i) => i.quarantined,
  tracer: (i) => !!i.hmisTracerCode,
};

const round = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : n);

/** A level bar with the minimum marked; the number is always beside it as text (§10). */
function Level({ i }: { i: ItemRow }) {
  if (i.monthsOfStock === null)
    return <span className="text-body-s text-muted-foreground">{LAB3.notEnoughHistory}</span>;
  const scale = Math.max(i.maxMonths ?? 0, i.monthsOfStock, i.minMonths ?? 0, 1);
  const pct = (m: number) => `${Math.min(100, (m / scale) * 100)}%`;
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="bg-ink-150 relative block h-2 w-24 rounded-xs">
        <span
          className={cn(
            "block h-full rounded-xs",
            i.belowMinimum ? "bg-status-caution-fg" : "bg-ink-500",
          )}
          style={{ width: Number.isFinite(i.monthsOfStock) ? pct(i.monthsOfStock) : "100%" }}
        />
        {i.minMonths !== null ? (
          <span
            className="bg-foreground absolute -top-1 block h-4 w-px"
            style={{ left: pct(i.minMonths) }}
          />
        ) : null}
      </span>
      <span className="text-body-s font-mono tabular-nums">
        {Number.isFinite(i.monthsOfStock) ? round(i.monthsOfStock) : "No use"}
      </span>
    </span>
  );
}

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
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const scope = await requireLabTechScope();
  if (!scope.workspaceLive || !emrV1LiveFor(scope.hospitalId) || !labStockLiveFor(scope.hospitalId))
    notFound();
  const { f } = await searchParams;
  const filter: Filter = f && f in FILTERS ? (f as Filter) : "all";
  const now = new Date();
  const [stock, sections, devs] = await Promise.all([
    db.transaction((tx) => loadStock(tx as never, scope.hospitalId, now)),
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
  const places = {
    sections,
    devices: devs.map((d) => ({ id: d.id, name: d.serial ? `${d.model} · ${d.serial}` : d.model })),
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title={C.title}
        right={
          <div className="flex flex-wrap gap-2">
            {keeper ? (
              <>
                <Link href="/lab/stock/receive" className={buttonVariants()}>
                  {C.receive}
                </Link>
                <CountDialog items={stock.items} />
              </>
            ) : null}
          </div>
        }
      />
      <p className="text-body-s text-muted-foreground max-w-3xl">{C.lede}</p>
      <p className="text-body-s flex flex-wrap items-center gap-2">
        {due ? <StatusWord tone="caution">{C.countDue(due)}</StatusWord> : null}
        <span className="text-muted-foreground">
          {C.lastCounted(stock.lastCount ? dateWords(stock.lastCount) : null)}
        </span>
      </p>

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
            {k === "expiring" ? C.filters.expiring(stock.settings.expiryWindowDays) : C.filters[k]}{" "}
            <span className="font-mono tabular-nums">{stock.items.filter(FILTERS[k]).length}</span>
          </Link>
        ))}
      </nav>

      <RecordList<ItemRow>
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
            cell: (i) => <span className="font-mono tabular-nums">{i.onHand}</span>,
          },
          { id: "months", header: C.columns[2]!, cell: (i) => <Level i={i} /> },
          {
            id: "expiry",
            header: C.columns[3]!,
            cell: (i) =>
              i.nearestExpiry ? (
                <span className="font-mono tabular-nums">{dayWords(i.nearestExpiry)}</span>
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
              />
            ),
          },
        ]}
      />
      <p className="text-caption text-muted-foreground max-w-3xl">{C.footnote}</p>

      {lead ? (
        <div className="flex flex-wrap gap-2">
          <ItemDialog />
          <SettingsDialog settings={stock.settings} />
          <SwitchOnDialog items={stock.items} />
        </div>
      ) : null}
    </div>
  );
}
