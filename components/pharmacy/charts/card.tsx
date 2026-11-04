import type { HrefOf } from "./forms";
import type { ChartSpec, Tile } from "@/lib/pharmacy/derive/store/stats";
import Link from "next/link";

import { ST } from "@/content/pharmacy-store";
import { cn } from "@/lib/utils";
import { PlotView, Spark } from "./forms";

/** The chart card, the 6-column grid and the figure tiles (STORE.md §B1, §B2). Every chart lists its numbers. */
const SPAN: Record<ChartSpec["span"], string> = {
  2: "min-[1100px]:col-span-2",
  3: "min-[1100px]:col-span-3",
  4: "min-[700px]:col-span-2 min-[1100px]:col-span-4",
  6: "min-[700px]:col-span-2 min-[1100px]:col-span-6",
};

export function ChartCard({ spec, hrefOf }: { spec: ChartSpec; hrefOf?: HrefOf }) {
  return (
    <section
      aria-label={spec.title}
      className={cn(
        "bg-card shadow-card flex h-full min-w-0 flex-col gap-3 rounded-2xl p-4",
        SPAN[spec.span],
        spec.tall && "min-[1100px]:row-span-2",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-foreground m-0 text-[15px] leading-5 font-semibold">{spec.title}</h3>
          <p className="text-ink-600 m-0 mt-0.5 text-[12.5px] leading-[18px]">{spec.sub}</p>
        </div>
        {spec.head ? (
          <div className="shrink-0 text-right">
            <div className="text-foreground text-[18px] leading-6 font-semibold tabular-nums">
              {spec.head}
            </div>
            {spec.headSub ? (
              <div className="text-ink-600 text-[12px] leading-4">{spec.headSub}</div>
            ) : null}
          </div>
        ) : null}
      </header>
      {spec.legend && spec.legend.length > 1 ? (
        <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
          {spec.legend.map((l) => (
            <li key={l.label} className="text-ink-700 flex items-center gap-1.5 text-[12px]">
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="min-w-0">
        <PlotView plot={spec.plot} hrefOf={hrefOf} />
      </div>
      <footer className="border-ink-100 mt-auto flex flex-wrap items-start justify-between gap-2 border-t pt-2">
        <details className="min-w-0 flex-1 text-[12.5px]">
          <summary className="text-primary cursor-pointer font-semibold">
            {ST.chart.showNumbers}
          </summary>
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {spec.table.cols.map((c, i) => (
                    <th
                      key={c}
                      scope="col"
                      className={cn(
                        "text-ink-600 border-ink-100 border-b py-1 pr-2 font-semibold",
                        i ? "text-right" : "text-left",
                      )}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {spec.table.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((v, i) => (
                      <td
                        key={i}
                        className={cn(
                          "border-ink-50 border-b py-1 pr-2",
                          i ? "text-right tabular-nums" : "text-left",
                        )}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        {spec.open && hrefOf ? (
          <Link
            href={hrefOf(spec.open.target)}
            scroll={false}
            className="text-primary text-[12.5px] font-semibold underline-offset-4 hover:underline"
          >
            {spec.open.label} →
          </Link>
        ) : null}
      </footer>
    </section>
  );
}

export function ChartGrid({ charts, hrefOf }: { charts: readonly ChartSpec[]; hrefOf?: HrefOf }) {
  if (!charts.length) return null;
  return (
    <div className="grid grid-cols-1 items-stretch gap-3 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-6">
      {charts.map((c) => (
        <ChartCard key={c.key} spec={c} hrefOf={hrefOf} />
      ))}
    </div>
  );
}

const minOf = (n: number) => (n >= 6 ? 150 : n >= 4 ? 200 : 240);

export function FigureTiles({
  tiles,
  hrefOf,
  filter,
  onFilter,
}: {
  tiles: readonly Tile[];
  hrefOf?: HrefOf;
  filter?: string | null;
  onFilter?: (f: string | null) => void;
}) {
  if (!tiles.length) return null;
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${minOf(tiles.length)}px, 1fr))` }}
    >
      {tiles.map((t) => {
        const on = !!t.filter && t.filter === filter;
        const body = (
          <>
            <span className="text-ink-600 text-[12px] leading-4 font-medium">{t.label}</span>
            <span className="text-foreground text-[22px] leading-7 font-semibold tabular-nums">
              {t.value}
            </span>
            {t.series ? <Spark series={t.series} /> : null}
            <span
              className={cn(
                "text-[12px] leading-4",
                t.good === true
                  ? "text-status-stable-fg"
                  : t.good === false
                    ? "text-status-critical-fg-aa"
                    : "text-ink-600",
              )}
            >
              {t.delta}
            </span>
          </>
        );
        const cls = cn(
          "bg-card shadow-card focus-visible:ring-primary flex min-w-0 flex-col gap-1 rounded-2xl border p-3 text-left no-underline outline-none focus-visible:ring-2",
          on ? "border-primary bg-tide-lagoon-tint" : "border-transparent",
          (t.filter || t.open) && "hover:bg-ink-50 cursor-pointer",
        );
        if (t.filter && onFilter)
          return (
            <button
              key={t.label}
              type="button"
              aria-pressed={on}
              onClick={() => onFilter(on ? null : t.filter!)}
              className={cls}
            >
              {body}
            </button>
          );
        if (t.open && hrefOf)
          return (
            <Link key={t.label} href={hrefOf({ section: t.open })} scroll={false} className={cls}>
              {body}
            </Link>
          );
        return (
          <div key={t.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
