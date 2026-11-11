import type { loadLosses } from "@/lib/pharmacy/losses/read";
import Link from "next/link";

import { EmptyState, KeyFigure, KeyFigureGrid, Panel } from "@/components/tide/work/kit";
import { RC, RULES } from "@/content/pharmacy-rework-records";
import { sumBy } from "@/lib/pharmacy/losses/derive";
import { Bars } from "./bars";
import { RiskAct } from "./risk-act";

const L = RC.losses;
const monthName = (ym: string, style: "long" | "short" = "long") =>
  new Intl.DateTimeFormat("en-GB", { month: style, timeZone: "UTC" }).format(
    new Date(`${ym}-01T00:00:00Z`),
  );
const dayMonth = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Kampala",
});
const SHOWN = 12;

/**
 * Records › Losses (PRD §6.6, prototype losses.js; Scenario 11): this month's loss in UGX — ledger write-offs plus the
 * immunisation clinic's opened-vial wastage, through one function — by cause, by place, by month, and the stock that will
 * expire before it is used, with three moves to act on it.
 */
export function LossesView({
  data,
  all,
}: {
  data: Awaited<ReturnType<typeof loadLosses>>;
  all: boolean;
}) {
  const { month, total, months, risk, riskValue, openValue, epiInUse } = data;
  const last = months.at(-2);
  const pct = last && last.v > 0 ? Math.round(((total - last.v) / last.v) * 100) : null;
  const expired = month.filter((l) => l.cause === "expired").reduce((a, l) => a + l.value, 0);
  const causes = sumBy(month, (l) => l.cause).map((x) => ({ label: L.causes[x.k], v: x.v }));
  const places = sumBy(month, (l) => l.place ?? (l.epi ? L.epiPlace : null)).map((x) => ({
    label: x.k,
    v: x.v,
  }));
  const lines = [...month].sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <KeyFigureGrid className="xl:grid-cols-4">
          <KeyFigure
            label={L.kpi.month}
            value={RC.ugxShort(total)}
            change={pct === null ? L.kpi.noChange : L.kpi.change(pct, monthName(last!.k))}
          />
          <KeyFigure label={L.kpi.expired} value={RC.ugxShort(expired)} />
          <KeyFigure label={L.kpi.risk(RULES.riskMonths)} value={RC.ugxShort(riskValue)} />
          <KeyFigure label={L.kpi.open} value={RC.ugxShort(openValue)} />
        </KeyFigureGrid>
        <p className="text-caption text-muted-foreground">{epiInUse ? L.epiNote : L.epiMissing}</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={L.byCause}>
          {causes.length ? (
            <Bars rows={causes} value={RC.ugxShort} />
          ) : (
            <EmptyState compact title={L.none} />
          )}
        </Panel>
        <Panel title={L.byPlace}>
          {places.length ? (
            <Bars rows={places} value={RC.ugxShort} />
          ) : (
            <EmptyState compact title={L.none} />
          )}
        </Panel>
        <Panel title={L.monthly}>
          <Bars
            rows={months.map((m) => ({ label: monthName(m.k, "short"), v: m.v }))}
            value={RC.ugxShort}
          />
        </Panel>
      </div>

      <Panel title={L.riskTitle} note={L.riskNote}>
        {risk.length === 0 ? (
          <EmptyState compact title={L.riskNone} />
        ) : (
          <ul className="divide-border flex flex-col divide-y">
            {risk.map((r) => (
              <li
                key={`${r.productId}:${r.batchNumber}`}
                className="grid gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_auto] sm:items-start"
              >
                <span className="min-w-0">
                  <span className="text-body-s block font-semibold">{r.product}</span>
                  <span className="text-caption text-ink-700 block">
                    {L.riskCols.batch} {r.batchNumber} · {L.riskCols.expires} {r.expires} (
                    {L.months(r.months)})
                  </span>
                  <span className="text-caption text-muted-foreground block">
                    {r.places.map((p) => `${p.place} ${p.n}`).join(" · ")}
                  </span>
                </span>
                <span className="text-caption text-ink-700">
                  {L.riskCols.have}: <span className="tabular-nums">{r.have}</span> {r.unit}
                  <span className="block">
                    {L.riskCols.waste}: <span className="tabular-nums">{r.waste}</span> {r.unit}
                  </span>
                </span>
                <span className="text-body-s font-semibold tabular-nums">{RC.ugx(r.value)}</span>
                <span className="flex flex-col gap-1">
                  <RiskAct productId={r.productId} batchNumber={r.batchNumber} value={r.value} />
                  {r.done.map((d) => (
                    <span key={`${d.action}:${d.at}`} className="text-caption text-ink-700">
                      {L.actionDone(
                        L.actions[d.action as keyof typeof L.actions] ?? d.action,
                        d.by ?? "",
                      )}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={L.allTitle} note={L.allNote(lines.length)}>
        {lines.length === 0 ? (
          <EmptyState compact title={L.none} />
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="text-body-s w-full">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    {(["date", "place", "medicine", "cause", "qty", "value", "by"] as const).map(
                      (c) => (
                        <th
                          key={c}
                          scope="col"
                          className={`py-1.5 pr-3 font-medium ${c === "qty" || c === "value" ? "text-right" : ""}`}
                        >
                          {L.cols[c]}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {(all ? lines : lines.slice(0, SHOWN)).map((l, i) => (
                    <tr key={l.movementId ?? `epi:${i}`}>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {dayMonth.format(new Date(l.at))}
                      </td>
                      <td className="py-1.5 pr-3">{l.place ?? (l.epi ? L.epiPlace : "")}</td>
                      <td className="py-1.5 pr-3">
                        {l.product}
                        {l.note ? (
                          <span className="text-caption text-muted-foreground block">{l.note}</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-3">{L.causes[l.cause]}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {l.qty} {l.unit}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{RC.ugx(l.value)}</td>
                      <td className="py-1.5">{l.who}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-border flex flex-col divide-y sm:hidden">
              {(all ? lines : lines.slice(0, SHOWN)).map((l, i) => (
                <li key={l.movementId ?? `epi:${i}`} className="flex flex-col gap-0.5 py-2">
                  <span className="text-body-s flex justify-between gap-2 font-semibold">
                    <span>{l.product}</span>
                    <span className="tabular-nums">{RC.ugx(l.value)}</span>
                  </span>
                  <span className="text-caption text-ink-700">
                    {dayMonth.format(new Date(l.at))} · {l.place ?? (l.epi ? L.epiPlace : "")} ·{" "}
                    {L.causes[l.cause]} · {l.qty} {l.unit}
                  </span>
                  {l.who ? (
                    <span className="text-caption text-muted-foreground">{l.who}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            {lines.length > SHOWN ? (
              <Link
                href={all ? "/pharmacy/records?tab=losses" : "/pharmacy/records?tab=losses&all=1"}
                scroll={false}
                className="text-body-s text-primary inline-flex min-h-11 items-center font-semibold hover:underline"
              >
                {all ? L.showFewer : L.showAll}
              </Link>
            ) : null}
          </>
        )}
      </Panel>
      <p className="text-caption text-muted-foreground max-w-prose">{L.hint}</p>
    </div>
  );
}
