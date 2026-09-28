import type { Origin } from "@/lib/emr/charts/payload";

import { formatClock } from "@/lib/emr/charts/scale";

/**
 * The readings behind a graph, as a table (the graph is a view of it): time, value, where it came
 * from, and an optional detail (the temperature site). Folded under a native disclosure.
 */
export function ReadingsTable({
  title,
  valueHeader,
  detailHeader,
  rows,
}: {
  title: string;
  valueHeader: string;
  detailHeader?: string;
  rows: readonly { at: string; value: string; origin: Origin; detail?: string | null }[];
}) {
  if (rows.length === 0) return null;
  return (
    <details className="text-body-s">
      <summary className="text-caption text-muted-foreground hover:text-foreground w-fit cursor-pointer">
        {title} as a table
      </summary>
      <div className="border-border relative mt-2 max-w-full overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse">
          <thead className="bg-muted">
            <tr>
              {["Time", valueHeader, ...(detailHeader ? [detailHeader] : []), "From"].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="text-caption text-ink-600 px-3 py-1.5 text-left font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.at}>
                <th
                  scope="row"
                  className="border-ink-150 text-ink-600 border-t px-3 py-1.5 text-left font-mono font-normal tabular-nums"
                >
                  {formatClock(r.at)}
                </th>
                <td className="border-ink-150 border-t px-3 py-1.5 font-mono tabular-nums">
                  {r.value}
                </td>
                {detailHeader ? (
                  <td className="border-ink-150 border-t px-3 py-1.5">
                    {r.detail ?? <span className="text-muted-foreground">Not recorded</span>}
                  </td>
                ) : null}
                <td className="border-ink-150 text-muted-foreground border-t px-3 py-1.5">
                  {r.origin === "clerking" ? "At clerking" : "Nursing entry"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
