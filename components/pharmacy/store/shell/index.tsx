"use client";

import type { StoreSection } from "@/content/pharmacy-store";
import type { TypeFilter } from "@/content/pharmacy-supplies";
import type { OpenTarget } from "@/lib/pharmacy/derive/store/stats";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { ChartGrid, FigureTiles } from "@/components/pharmacy/charts/card";
import { useStockLive } from "@/components/pharmacy/medicines/use-stock-live";
import { LabButton } from "@/components/tide/work/button";
import { ST } from "@/content/pharmacy-store";
import { itemsCount } from "@/content/pharmacy-supplies";
import { fill } from "@/content/pharmacy-workspace-v2";
import { ugx } from "@/lib/pharmacy/derive/store/format";
import { planFor } from "@/lib/pharmacy/derive/store/orders";
import { navGroups, sectionStats } from "@/lib/pharmacy/derive/store/stats";
import { storeValue } from "@/lib/pharmacy/derive/store/stock";
import { Orders, PutAway } from "../bring-in";
import { CountShelfDialog, IssueNoReqDialog } from "../dialogs";
import {
  Counts,
  Expiry,
  QuarantineLosses,
  StockCards,
  StoreConditions,
  StoreStock,
} from "../look-after";
import { PlaceBalances, StockEverywhere } from "../places";
import { Dispatches, NeedsYouNow, Requisitions, TopUpRuns } from "../send-out";
import { SectionBar } from "./nav";

/** Stock › Main store (STORE.md §A): the header, the section bar, the figures and charts first, then the section. */
const hrefOf = (t: OpenTarget) =>
  `?tab=main&section=${t.section}${t.med ? `&med=${t.med}` : ""}${t.shelf ? `&shelf=${t.shelf}` : ""}`;

export function MainStore({
  world,
  section,
  shelfId = null,
  live = true,
}: {
  world: StoreWorld;
  section: StoreSection;
  shelfId?: string | null;
  /** Off on the fixture, which has no database. */
  live?: boolean;
}) {
  useStockLive(world.hospitalId, live);
  const [filter, setFilter] = useState<string | null>(null);
  const [itemType, setItemType] = useState<TypeFilter>("all");
  const [count, setCount] = useState(false);
  const [issue, setIssue] = useState(false);
  const asked = useSearchParams().get("supplier");
  const supplier = world.suppliers.find((x) => x.id === asked) ?? world.suppliers[0];
  const stats = sectionStats(
    world,
    section,
    section === "order" && supplier
      ? {
          orderQty: new Map(planFor(world, supplier.id).map((l) => [l.medId, l.qty])),
          budget:
            world.orders.find((o) => o.state === "draft" && o.supplierId === supplier.id)?.budget ??
            0,
          order: { supplier: supplier.name },
        }
      : { itemType },
  );
  return (
    <div className="flex flex-col gap-4">
      <header className="bg-card shadow-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <h2 className="text-foreground m-0 text-[17px] leading-6 font-semibold">
          {world.storeName}{" "}
          <span className="text-ink-600 text-[14px] font-normal">
            ·{" "}
            {fill(ST.shell.line, {
              items: itemsCount(
                world.meds.filter((m) => m.itemType === "medicine").length,
                world.meds.filter((m) => m.itemType !== "medicine").length,
              ),
              value: ugx(storeValue(world)),
            })}
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <LabButton onClick={() => setCount(true)}>{ST.shell.countShelf}</LabButton>
          <LabButton onClick={() => setIssue(true)}>{ST.shell.issueNoReq}</LabButton>
          <LabButton
            variant="primary"
            render={<Link href="?tab=receive&start=1" />}
            nativeButton={false}
          >
            {ST.shell.receive}
          </LabButton>
        </div>
      </header>
      <SectionBar groups={navGroups(world)} section={section} />
      <FigureTiles tiles={stats.tiles} hrefOf={hrefOf} filter={filter} onFilter={setFilter} />
      <ChartGrid charts={stats.charts} hrefOf={hrefOf} />
      {section === "home" ? <NeedsYouNow world={world} /> : null}
      {section === "req" ? <Requisitions world={world} /> : null}
      {section === "runs" ? <TopUpRuns world={world} /> : null}
      {section === "disp" ? <Dispatches world={world} filter={filter} /> : null}
      {section === "all" ? <StockEverywhere world={world} filter={filter} /> : null}
      {section === "books" ? <PlaceBalances world={world} /> : null}
      {section === "order" ? <Orders world={world} /> : null}
      {section === "put" ? <PutAway world={world} /> : null}
      {section === "health" ? (
        <StoreStock world={world} filter={filter} itemType={itemType} onItemType={setItemType} />
      ) : null}
      {section === "exp" ? <Expiry world={world} /> : null}
      {section === "card" ? <StockCards world={world} /> : null}
      {section === "count" ? <Counts world={world} shelfId={shelfId} /> : null}
      {section === "quar" ? <QuarantineLosses world={world} /> : null}
      {section === "cond" ? <StoreConditions world={world} /> : null}
      <CountShelfDialog world={world} open={count} onOpenChange={setCount} />
      <IssueNoReqDialog world={world} open={issue} onOpenChange={setIssue} />
    </div>
  );
}
