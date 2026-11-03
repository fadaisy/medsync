"use client";

import type { SectionProps } from "./roster-tab";

import { Panel } from "@/components/tide/work/kit";
import { RS } from "@/content/pharmacy-roster-sections";
import { addDays, load } from "@/lib/pharmacy/derive/roster";
import { cn } from "@/lib/utils";
import { Chip, nameOf, NeedsDb } from "./swaps";

const COLS = ["day", "night", "call", "weekend", "holiday"] as const;

/** §9 Who carries the load: the 5 weeks ending with the shown week; inline bars, never side borders. */
export function LoadTable({ view }: SectionProps) {
  const L = RS.load;
  if (!view.ready) return <NeedsDb title={L.title} />;
  const rows = load(view.duties, view.people, view.weekStart, (d) => !!view.holidays[d]);
  return (
    <Panel title={L.title} note={L.sub(addDays(view.weekStart, -28), addDays(view.weekStart, 6))}>
      {rows.length === 0 ? (
        <p className="text-body-s text-muted-foreground">{L.empty}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="text-muted-foreground text-[11px] tracking-[0.04em] uppercase">
                <th scope="col" className="px-1 py-1.5 text-left font-bold">
                  {L.col.person}
                </th>
                {COLS.map((c) => (
                  <th key={c} scope="col" className="px-1 py-1.5 text-right font-bold">
                    {L.col[c]}
                  </th>
                ))}
                <th scope="col" className="py-1.5 pr-1 pl-2.5 text-left font-bold">
                  {L.col.total}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-border border-t">
                  <th scope="row" className="px-1 py-2 text-left font-semibold whitespace-nowrap">
                    {nameOf(view, r.userId)}
                  </th>
                  {COLS.map((c) => (
                    <td key={c} className="px-1 py-2 text-right">
                      {r[c]}
                    </td>
                  ))}
                  <td className="min-w-36 py-2 pr-1 pl-2.5">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="bg-tide-sunken h-1.5 flex-1 overflow-hidden rounded-full"
                      >
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            r.flag === "heavy"
                              ? "bg-status-caution-fg"
                              : r.flag === "light"
                                ? "bg-ink-400"
                                : "bg-tide-lagoon",
                          )}
                          style={{ width: `${r.pct}%` }}
                        />
                      </span>
                      <b className="min-w-6 text-right font-semibold">{r.total}</b>
                      {r.flag ? (
                        <Chip small tone={r.flag === "heavy" ? "amber" : "grey"}>
                          {r.flag === "heavy" ? L.heavy : L.light}
                        </Chip>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
