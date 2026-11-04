"use client";

import type { MiniChart, ReceiveFigure } from "@/lib/pharmacy/derive/receive";

import { Chip } from "@/components/pharmacy/charts/chip";
import { Card, Scroll, tdCls, thCls } from "@/components/pharmacy/store/places/parts";
import { LabButton } from "@/components/tide/work/button";
import { RC } from "@/content/pharmacy-receive";
import { RA } from "@/content/pharmacy-receive-after";
import { figures, num, supplierStats } from "@/lib/pharmacy/derive/receive";
import { cn } from "@/lib/utils";
import { useReceive } from "../provider";

const SUB = {
  ok: "text-status-stable-fg",
  warn: "text-status-caution-fg-aa",
  "": "text-ink-600",
} as const;

/** The column chart of §G1: y labels, the target line, bars teal on target and amber off it, the latest one solid. */
function Mini({ chart, label }: { chart: MiniChart; label: string }) {
  const n = chart.bars.length;
  return (
    <div
      className="mt-2 flex flex-col gap-1"
      role="group"
      aria-label={RA.figures.chartLabel(label)}
    >
      <div className="flex gap-2">
        <div
          aria-hidden
          className="text-ink-600 flex h-24 shrink-0 flex-col justify-between text-[11px] leading-3 tabular-nums"
        >
          <span>{chart.yMax}</span>
          <span>{RA.figures.yZero}</span>
        </div>
        <div className="border-ink-300 relative flex h-24 min-w-0 flex-1 items-end gap-1 border-b border-l pl-1">
          <span
            aria-hidden
            className="border-ink-500 pointer-events-none absolute right-0 left-0 border-t border-dashed"
            style={{ bottom: `${chart.refBottom}%` }}
          >
            <span className="bg-card text-ink-700 absolute right-0 bottom-0.5 px-1 text-[11px] leading-3 whitespace-nowrap">
              {chart.refLabel}
            </span>
          </span>
          {chart.bars.map((b, i) => (
            <span
              key={i}
              tabIndex={0}
              role="img"
              title={b.tip}
              aria-label={b.tip}
              className="group focus-visible:ring-primary relative flex h-full min-w-0 flex-1 items-end rounded-sm outline-none focus-visible:ring-2"
            >
              <span
                className={cn(
                  "block w-full rounded-t-sm",
                  b.good ? "bg-tide-lagoon" : "bg-status-caution-fg",
                  !b.last && "opacity-45",
                )}
                style={{ height: `${b.height}%` }}
              />
              <span
                aria-hidden
                className={cn(
                  "bg-tide-navy-900 text-tide-on-band pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md px-2 py-1 text-[11.5px] leading-4 whitespace-nowrap group-hover:block group-focus-visible:block",
                  i < n / 3 ? "left-0" : i >= (n * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                )}
              >
                {b.tip}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div aria-hidden className="text-ink-600 flex justify-between pl-8 text-[11px] leading-3">
        <span>{chart.xFirst}</span>
        <span>{RC.figure.latest}</span>
      </div>
    </div>
  );
}

/** A bar with its value at the tip; room for the value is held back so it never leaves the track. */
function Track({ share, value, room }: { share: number; value: string; room: number }) {
  const w = `calc((100% - ${room}px) * ${share.toFixed(3)})`;
  return (
    <span className="relative block h-5 w-full min-w-0">
      <span
        className="bg-tide-lagoon absolute top-0.5 bottom-0.5 left-0 rounded-sm"
        style={{ width: w }}
      />
      <span
        className="text-foreground absolute top-0 text-[12px] leading-5 font-semibold whitespace-nowrap tabular-nums"
        style={{ left: `calc(${w} + 6px)` }}
      >
        {value}
      </span>
    </span>
  );
}

function FigureCard({ f }: { f: ReceiveFigure }) {
  const { world, open } = useReceive();
  const empty = f.key !== "claims" && !f.chart;
  const oldest = world.claims.find((c) => c.id === f.oldestClaimId);
  return (
    <section className="bg-card shadow-card flex min-w-0 flex-col gap-1 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h3 className="text-ink-700 m-0 text-[13px] leading-[18px] font-semibold">{f.label}</h3>
        {f.onTarget === null ? null : (
          <Chip tone={f.onTarget ? "teal" : "warn"}>
            {f.onTarget ? RC.figure.onTarget : RC.figure.offTarget}
          </Chip>
        )}
      </div>
      <span className="text-foreground text-heading-m tabular-nums">
        {empty ? RC.dash : f.value}
      </span>
      {empty ? (
        <p className="text-ink-600 m-0 text-[12.5px] leading-[18px]">{RA.figures.noData}</p>
      ) : (
        <span className={cn("text-[12.5px] leading-[18px]", SUB[f.subTone])}>{f.sub}</span>
      )}
      {f.chart ? <Mini chart={f.chart} label={f.label} /> : null}
      {f.key === "claims" ? (
        f.split.length ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {f.split.map((r) => (
              <div
                key={r.name}
                className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-2"
              >
                <b className="text-foreground min-w-0 text-[12.5px] leading-4 font-semibold break-words">
                  {r.name}
                </b>
                <Track share={r.share} value={r.value} room={78} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ink-600 m-0 mt-1 text-[12.5px] leading-[18px]">
            {RA.figures.noClaims}
          </p>
        )
      ) : null}
      {oldest ? (
        <div className="mt-1">
          <LabButton
            size="sm"
            variant="text"
            className="-ml-2"
            onClick={() =>
              open({
                kind: "claim",
                claimId: oldest.id,
                step: oldest.state === "draft" ? "send" : "credit",
              })
            }
          >
            {RC.figure.oldest}
          </LabButton>
        </div>
      ) : null}
    </section>
  );
}

/** RECEIVE §G: four figure cards and the suppliers table, all worked out from the deliveries, orders and claims. */
export function ReceivingFigures() {
  const { world } = useReceive();
  const cards = figures(world.figureRows, world.claims, world.rules);
  const stats = supplierStats(world.supplierRows, new Map(world.differencesBy));
  const supplier = (id: string) => world.suppliers.find((s) => s.id === id)?.name ?? RC.dash;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h2 className="text-heading-s text-foreground m-0">{RA.figures.title}</h2>
      <div
        role="group"
        aria-label={RA.figures.group}
        className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {cards.map((f) => (
          <FigureCard key={f.key} f={f} />
        ))}
      </div>
      <Card title={RA.figures.suppliers} note={RA.figures.suppliersNote}>
        {stats.length ? (
          <Scroll label={RA.figures.suppliers}>
            <table className="w-full min-w-[620px] border-collapse text-[13px]">
              <thead>
                <tr>
                  {RA.figures.cols.map((c) => (
                    <th key={c} scope="col" className={thCls}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.supplierId}>
                    <th scope="row" className={cn(tdCls, "text-left font-semibold")}>
                      {supplier(s.supplierId)}
                    </th>
                    <td className={cn(tdCls, "min-w-[10rem]")}>
                      <Track share={s.fill / 100} value={`${s.fill}%`} room={56} />
                    </td>
                    <td
                      className={cn(
                        tdCls,
                        s.lead > s.promised && "text-status-caution-fg-aa font-semibold",
                      )}
                    >
                      {RA.figures.lead(s.lead, s.promised)}
                    </td>
                    <td className={tdCls}>{s.onTime}%</td>
                    <td className={tdCls}>{num(s.differences)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        ) : (
          <p className="text-ink-600 border-ink-200 m-0 border-t py-2.5 text-[14px]">
            {RA.figures.noSuppliers}
          </p>
        )}
      </Card>
    </div>
  );
}
