import type { FluidBalanceBody, FluidHourRow } from "@/lib/emr/charts/payload";

import { formatHourSpan } from "@/lib/emr/charts/scale";
import { mlWords, plural, signedMl } from "./words";

/**
 * The hourly fluid balance table (MONITORING-CHARTS.md §3), the source of truth the graphs draw
 * from: IV in per fluid with its planned rate, oral in, urine out or "Not measured", other out,
 * and the running balance. A blank cell is an en dash read as "not recorded", never 0. The
 * 24-hour summary sums recorded entries only.
 */

function Blank({ words = "not recorded" }: { words?: string }) {
  return (
    <>
      <span aria-hidden className="text-muted-foreground">
        –
      </span>
      <span className="sr-only">{words}</span>
    </>
  );
}

function Ml({ value }: { value: number | null }) {
  return value === null ? <Blank /> : <>{mlWords(value)}</>;
}

const CELL =
  "border-ink-150 border-t px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap";
const HEAD_BASE = "text-caption text-ink-600 px-3 py-2 align-bottom font-medium";
const HEAD = `${HEAD_BASE} text-right`;
const ROW_HEAD = `${HEAD_BASE} text-left`;

export function FluidBalanceTable({ body }: { body: FluidBalanceBody }) {
  const { ivLines, hours, summary, stepHours, urineReference } = body;
  const urineCell = (h: FluidHourRow) =>
    h.urineOut !== null ? (
      mlWords(h.urineOut)
    ) : h.urineNotMeasured ? (
      <span className="text-foreground font-sans">Not measured</span>
    ) : (
      <Blank />
    );
  const inColumns = ivLines.length + 1;
  return (
    <div className="flex flex-col gap-2">
      <div className="border-border relative max-w-full overflow-x-auto rounded-lg border">
        <table className="text-body-s w-full border-collapse">
          <caption className="sr-only">
            Fluid balance, {stepHours === 1 ? "hourly" : "4-hourly"}, in mL. A dash means not
            recorded.
          </caption>
          <thead className="bg-muted">
            <tr>
              <th scope="col" className={ROW_HEAD}>
                {stepHours === 1 ? "Hour" : "4 hours"}
              </th>
              {ivLines.map((l) => (
                <th key={l.key} scope="col" className={HEAD}>
                  <span className="block">IV in: {l.label}</span>
                  {l.mlPerHour !== null ? (
                    <span className="text-muted-foreground block font-mono font-normal">
                      Plan {mlWords(l.mlPerHour)} mL/h
                      {l.dropsPerMinute !== null && l.dropsPerMl
                        ? ` · ${l.dropsPerMinute} drops/min`
                        : ""}
                    </span>
                  ) : null}
                </th>
              ))}
              <th scope="col" className={HEAD}>
                Oral in
              </th>
              <th scope="col" className={HEAD}>
                Urine out
              </th>
              <th scope="col" className={HEAD}>
                Other out
              </th>
              <th scope="col" className={HEAD}>
                Running balance
              </th>
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h.start} className="hover:bg-ink-25">
                <th
                  scope="row"
                  className="border-ink-150 text-ink-600 border-t px-3 py-2 text-left font-mono font-normal whitespace-nowrap tabular-nums"
                >
                  {formatHourSpan(h.start, stepHours)}
                  {h.inProgress ? (
                    <span className="text-muted-foreground font-sans"> (now)</span>
                  ) : null}
                </th>
                {ivLines.map((l) => (
                  <td key={l.key} className={CELL}>
                    <Ml value={h.ivIn[l.key] ?? null} />
                  </td>
                ))}
                <td className={CELL}>
                  <Ml value={h.oralIn} />
                </td>
                <td className={CELL}>{urineCell(h)}</td>
                <td className={CELL}>
                  <Ml value={h.otherOut} />
                </td>
                <td className={`${CELL} text-foreground`}>
                  {h.running !== null ? (
                    signedMl(h.running)
                  ) : (
                    <Blank words={h.inProgress ? "hour under way" : "no entry this hour"} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted">
            <tr>
              <th scope="row" className={ROW_HEAD}>
                24-hour summary
              </th>
              <td colSpan={inColumns} className={CELL}>
                Total in {mlWords(summary.totalIn)} mL
              </td>
              <td colSpan={2} className={CELL}>
                Total out {mlWords(summary.totalOut)} mL
              </td>
              <td className={`${CELL} text-foreground`}>Net {signedMl(summary.net)} mL</td>
            </tr>
            <tr>
              <th scope="row" className={ROW_HEAD}>
                Urine below the reference
              </th>
              <td colSpan={inColumns + 3} className={`${CELL} font-sans`}>
                {summary.hoursBelowReference === null || !urineReference
                  ? "Not worked out: no weight in the vitals."
                  : `${plural(summary.hoursBelowReference, "hour")} with measured urine below ${mlWords(urineReference.mlPerHour)} mL/h (a reference line, not flagged).`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-caption text-muted-foreground">
        {plural(summary.hoursRecorded, stepHours === 1 ? "hour" : "block")} with an entry. The
        running balance sums recorded entries only; it is never estimated.
      </p>
    </div>
  );
}
