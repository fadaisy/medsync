import type { loadStocktakeReports } from "@/lib/pharmacy/store/read";

import { Panel } from "@/components/tide/work/kit";
import { STOCKTAKE_REPORTS as T } from "@/content/pharmacy-store";
import { fmtAt, ugx } from "@/lib/pharmacy/derive/store/format";

/** The stock-takes the main store has closed (STORE.md §F4). Nothing shows until there is one. */
export function StocktakeReports({
  rows,
}: {
  rows: Awaited<ReturnType<typeof loadStocktakeReports>>;
}) {
  if (!rows.length) return null;
  return (
    <Panel title={T.title}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {T.cols.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={`text-ink-600 py-1 pr-3 font-semibold ${i === 1 || i === 2 ? "text-right" : "text-left"}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-ink-100 border-t">
                <td className="py-1.5 pr-3">{fmtAt(r.closedAt)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{r.shelves}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{ugx(r.diff)}</td>
                <td className="py-1.5 pr-3">{r.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
