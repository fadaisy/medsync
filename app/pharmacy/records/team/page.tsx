import { notFound } from "next/navigation";

import { EmptyState, KeyFigure, KeyFigureGrid, Panel } from "@/components/tide/work/kit";
import { FilterChips } from "@/components/tide/work/space";
import { RC, RULES } from "@/content/pharmacy-rework-records";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyTiersFor } from "@/lib/pharmacy/feature";
import { loadTeam } from "@/lib/pharmacy/team/read";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const T = RC.team;
const SHIFTS = ["all", "day", "night"] as const;
const night = (h: number) => h >= RULES.nightStartsHour || h < RULES.dayStartsHour;

/**
 * Team (rework PRD §6.6, prototype productivity.js `TeamView`): most people see their own numbers; the in-charge sees
 * everyone, per shift, to plan shifts and support. Per hour is per hour on the roster.
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actor = await requirePharmacyActor();
  if (!pharmacyTiersFor(actor.hospitalId).insights) notFound();
  const all = await managesPharmacy(actor.userId, actor.hospitalId);
  const { rows: everyRow, hourly } = await loadTeam(actor.hospitalId, actor.userId, all);
  const shift = SHIFTS.find((s) => s === sp.shift) ?? "all";
  const rows = everyRow.filter((r) => shift === "all" || r.shift === shift);
  const rx = everyRow.reduce((a, r) => a + r.rx, 0);
  const lines = everyRow.reduce((a, r) => a + r.countLines, 0);
  const matched = everyRow.reduce((a, r) => a + r.countsMatched, 0);
  const max = Math.max(1, ...hourly);

  return (
    <div className="flex flex-col gap-4">
      {!all ? <p className="text-body-s text-ink-700 max-w-prose">{T.selfNote}</p> : null}
      <Panel>
        <KeyFigureGrid className="xl:grid-cols-4">
          <KeyFigure label={all ? T.kpi.rxTeam : T.kpi.rxMe} value={rx} />
          <KeyFigure label={T.kpi.counts} value={lines ? `${Math.round((matched / lines) * 100)}%` : null} noData={T.notMeasured} />
          <KeyFigure label={T.kpi.late} value={everyRow.reduce((a, r) => a + r.late, 0)} />
          <KeyFigure label={T.kpi.noWitness} value={everyRow.reduce((a, r) => a + r.noWitness, 0)} />
        </KeyFigureGrid>
      </Panel>

      <Panel title={T.hourly} note={T.hourlyNote}>
        <div className="flex h-32 items-end gap-0.5" role="list">
          {hourly.map((n, h) => {
            const hh = String(h).padStart(2, "0");
            return (
              <div
                key={h}
                role="listitem"
                title={T.hourTip(hh, String(n))}
                aria-label={T.hourTip(hh, String(n))}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                <span
                  className={cn("bg-tide-cascade-2 block rounded-t-sm", night(h) && "opacity-45")}
                  style={{ height: `${(n / max) * 100}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="text-caption text-muted-foreground flex justify-between tabular-nums" aria-hidden>
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>
        <p className="text-caption text-muted-foreground">{T.hourlyHint}</p>
      </Panel>

      <Panel
        title={T.tableTitle}
        action={
          <FilterChips
            label={T.tableTitle}
            current={shift}
            chips={SHIFTS.map((s) => ({ key: s, label: T.shifts[s], href: `/pharmacy/records/team?shift=${s}` }))}
          />
        }
      >
        {rows.length === 0 ? (
          <EmptyState compact title={T.none} />
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="text-body-s w-full">
                <thead className="text-muted-foreground text-left">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-medium">{T.cols.person}</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">{T.cols.rx}</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">{T.cols.perHour}</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">{T.cols.wait}</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">{T.cols.owed}</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">{T.cols.counts}</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">{T.cols.handovers}</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">{T.cols.late}</th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-medium">{T.cols.noWitness}</th>
                    <th scope="col" className="py-1.5 text-right font-medium">{T.cols.cases}</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rows.map((r) => (
                    <tr key={`${r.userId}|${r.shift}`}>
                      <td className="py-1.5 pr-3">
                        <span className="font-semibold">{r.who}</span>
                        <span className="text-caption text-muted-foreground block">{T.shiftWord[r.shift]}</span>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.rx}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.perHour ?? "–"}</td>
                      <td className="text-muted-foreground py-1.5 pr-3 text-right">{T.notMeasured}</td>
                      <td className="text-muted-foreground py-1.5 pr-3 text-right">{T.notMeasured}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {r.countLines ? T.of(r.countsMatched, r.countLines) : "–"}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.handovers ?? "–"}</td>
                      <Talk n={r.late} />
                      <Talk n={r.noWitness} />
                      <td className="py-1.5 text-right tabular-nums">{r.cases ? T.of(r.cases.closed, r.cases.owned) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-border flex flex-col divide-y sm:hidden">
              {rows.map((r) => (
                <li key={`${r.userId}|${r.shift}`} className="flex flex-col gap-0.5 py-2">
                  <span className="text-body-s font-semibold">
                    {r.who} <span className="text-caption text-muted-foreground font-normal">· {T.shiftWord[r.shift]}</span>
                  </span>
                  <span className="text-caption text-ink-700">
                    {T.cols.rx} {r.rx} · {T.cols.perHour} {r.perHour ?? "–"} · {T.cols.counts}{" "}
                    {r.countLines ? T.of(r.countsMatched, r.countLines) : "–"}
                  </span>
                  <span className={cn("text-caption", r.late || r.noWitness ? "text-amber-800" : "text-ink-700")}>
                    {T.cols.late} {r.late} · {T.cols.noWitness} {r.noWitness}
                    {r.late || r.noWitness ? ` · ${T.talk}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-caption text-muted-foreground max-w-prose">{T.tableHint}</p>
      </Panel>
    </div>
  );
}

/** A figure worth a conversation: amber with words, never colour alone. */
function Talk({ n }: { n: number }) {
  return (
    <td className={cn("py-1.5 pr-3 text-right tabular-nums", n > 0 && "text-amber-800")}>
      {n}
      {n > 0 ? <span className="text-caption block">{T.talk}</span> : null}
    </td>
  );
}
