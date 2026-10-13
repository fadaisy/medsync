"use client";

import type { StockTab } from "@/lib/pharmacy/stock/read";
import Link from "next/link";
import { useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { TabList } from "@/components/medsync/tab-list";
import { STOCK } from "@/content/pharmacy-stock";

/**
 * The Stock table (5.8): filter tabs with their counts in their names (Section 10), then one row per
 * medicine. Each row opens the medicine's own page (W10). States are words; every state but In stock
 * is amber with an icon. Below `md` the rows become cards (wireframe, 390 px).
 */
export interface TableRow {
  medicineId: string;
  name: string;
  venWord: string | null;
  onShelf: number;
  firstExpiry: string | null;
  counted: string;
  stateWord: string;
  caution: boolean;
  supplied7: number;
  tabs: StockTab[];
}

const TABS: StockTab[] = ["all", "out", "low", "expiring", "not_counted"];
const C = STOCK.columns;

export function StockTable({ rows }: { rows: TableRow[] }) {
  const [tab, setTab] = useState<StockTab>("all");
  const shown = rows.filter((r) => r.tabs.includes(tab));
  const id = "stock-rows";
  const state = (r: TableRow) =>
    r.caution ? <StatusWord tone="caution">{r.stateWord}</StatusWord> : <span>{r.stateWord}</span>;
  const empty = rows.length ? STOCK.emptyTab : STOCK.empty;
  return (
    <div className="flex flex-col gap-3">
      <TabList
        label={STOCK.tabs.label}
        controls={id}
        value={tab}
        onChange={setTab}
        options={TABS.map((t) => ({
          value: t,
          label: STOCK.tabs[t],
          count: rows.filter((r) => r.tabs.includes(t)).length,
        }))}
      />
      <div id={id} role="tabpanel">
        <div className="border-border bg-card hidden overflow-x-auto rounded-lg border md:block">
          <table className="text-body-s w-full">
            <caption className="sr-only">{STOCK.title}</caption>
            <thead className="text-muted-foreground bg-muted text-left">
              <tr className="border-border border-b">
                {[C.medicine, C.onShelf, C.firstExpiry, C.counted, C.state, C.supplied].map((c) => (
                  <th key={c} scope="col" className="text-caption px-4 py-2 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground px-4 py-8 text-center">
                    {empty}
                  </td>
                </tr>
              ) : (
                shown.map((r) => (
                  <tr key={r.medicineId} className="hover:bg-ink-25 align-middle">
                    <th scope="row" className="px-4 py-2 text-left font-normal">
                      <Link
                        href={`/pharmacy/stock/${encodeURIComponent(r.medicineId)}`}
                        prefetch={false}
                        className="text-foreground focus-visible:shadow-focus inline-flex min-h-11 items-center gap-2 rounded-sm font-medium underline-offset-4 outline-none hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.venWord ? (
                        <span className="text-muted-foreground text-caption ml-2">{r.venWord}</span>
                      ) : null}
                    </th>
                    <td className="px-4 py-2 font-mono tabular-nums">{r.onShelf}</td>
                    <td className="px-4 py-2 font-mono">{r.firstExpiry ?? "—"}</td>
                    <td className="px-4 py-2 font-mono tabular-nums">{r.counted}</td>
                    <td className="px-4 py-2">{state(r)}</td>
                    <td className="px-4 py-2 font-mono tabular-nums">{r.supplied7}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-col gap-2 md:hidden">
          {shown.length === 0 ? (
            <li className="text-muted-foreground text-body-s py-6 text-center">{empty}</li>
          ) : (
            shown.map((r) => (
              <li key={r.medicineId} className="border-border bg-card rounded-lg border p-3">
                <Link
                  href={`/pharmacy/stock/${encodeURIComponent(r.medicineId)}`}
                  prefetch={false}
                  className="focus-visible:shadow-focus flex min-h-11 flex-col gap-1 rounded-sm outline-none"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-foreground text-body-s font-medium">{r.name}</span>
                    {state(r)}
                  </span>
                  <span className="text-muted-foreground text-caption">
                    {C.onShelf} <span className="font-mono">{r.onShelf}</span> · {C.firstExpiry}{" "}
                    <span className="font-mono">{r.firstExpiry ?? "—"}</span> · {C.counted}{" "}
                    <span className="font-mono">{r.counted}</span>
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
