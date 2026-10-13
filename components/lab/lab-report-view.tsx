import type { IndicatorValue } from "@/lib/lab/indicators";
import type { DrillId, LabReport, TileId } from "@/lib/lab/report-store";
import Link from "next/link";

import { fill, LAB3, LAB3_REPORTS } from "@/content/lab-phase-3";
import { REJECTION_REASON_TEXT } from "@/lib/emr/orders";
import { TILES } from "@/lib/lab/report-store";
import { formatDuration } from "@/lib/lab/turnaround";

const R = LAB3_REPORTS;
const card =
  "border-border bg-card shadow-card text-body-s flex flex-col gap-3 rounded-lg border p-4";
const link = "font-medium text-teal-700 underline-offset-4 hover:underline";
const th = "text-caption text-muted-foreground px-2 py-2 text-left font-medium";
const td = "border-border border-t px-2 py-2 align-top";
const fig = "font-mono tabular-nums";

/** A rejection reason code in words, capitalised ("Clotted"). */
export const reasonWord = (c: string) => {
  const w = REJECTION_REASON_TEXT[c] ?? c.replaceAll("_", " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
};

export interface ReportNames {
  section: (id: string | null) => string;
  ward: (id: string | null) => string;
  reason: (code: string) => string;
}

const shown = (t: TileId, v: IndicatorValue & { kind: "value" }) =>
  t === "downtime_h"
    ? `${v.value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} h`
    : t === "workload" || t === "misid_caught"
      ? v.value.toLocaleString("en-GB")
      : `${v.value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} %`;

/** The words under a number: what it was divided by, and what else it carries. */
function basis(t: TileId, v: IndicatorValue & { kind: "value" }, bedside: number) {
  if (t === "workload")
    return bedside ? (
      <span className="bg-sky-tint text-sky-text text-caption w-fit rounded px-1.5 py-0.5">
        {fill(R.bedside, { n: bedside })}
      </span>
    ) : null;
  if (t === "downtime_h") return fill(R.hoursBasis, { n: Object.keys(v.by ?? {}).length });
  if (v.denominator === null) return null;
  const of = fill(R.ofBasis, { n: v.numerator, d: v.denominator });
  return t === "crit_ack_in_time" && v.medianMinutes !== undefined
    ? `${of} · ${fill(R.median, { time: formatDuration(v.medianMinutes) })}`
    : of;
}

/**
 * Lab reports and quality indicators (§5.13, artboard 13): the eight tiles, turnaround per section with the stated
 * turnaround as a mark (scale and units stated), and rejected specimens by reason with the ward most affected.
 * "No data" is a word, never 0 (Law 7). With `drill` every number opens its records (lab roles); without it the
 * same numbers are plain text (the hospital admin, Law 10). No colour carries meaning here: nothing is red or green.
 */
export function LabReportView({
  report,
  names,
  drill,
}: {
  report: LabReport;
  names: ReportNames;
  drill: ((id: DrillId, extra?: Record<string, string>) => string) | null;
}) {
  const number = (text: string, label: string, href: string | null) =>
    href ? (
      <Link href={href} className={link} aria-label={fill(R.open, { label, value: text })}>
        {text}
      </Link>
    ) : (
      text
    );
  const max = Math.max(1, ...report.tat.flatMap((t) => [t.p90, ...t.targets]));
  const hours = max >= 120;
  const scale = hours ? Math.ceil(max / 60) : Math.ceil(max / 10) * 10;
  const at = (m: number) => (m / (hours ? scale * 60 : scale)) * 100;

  return (
    <div className="flex flex-col gap-5">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicators">
        {TILES.map((t) => {
          const v = report.tiles[t];
          return (
            <li key={t} className={card}>
              <span className="text-muted-foreground">{R.tiles[t]}</span>
              {v.kind === "no_data" ? (
                <span className="text-heading-m text-muted-foreground font-medium">
                  {LAB3.noData}
                </span>
              ) : (
                <>
                  <span className={`text-heading-m font-medium ${fig}`}>
                    {number(shown(t, v), R.tiles[t], drill?.(t) ?? null)}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {basis(t, v, report.bedside)}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section aria-labelledby="tat" className={card}>
          <h2 id="tat" className="text-heading-s font-medium">
            {R.turnaround}
          </h2>
          {report.tat.length === 0 ? (
            <p className="text-muted-foreground">{LAB3.noData}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {report.tat.map((t) => {
                  const name = names.section(t.sectionId);
                  const text = formatDuration(t.p90);
                  return (
                    <li key={t.sectionId ?? "none"} className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span>{name}</span>
                        <span className={fig}>
                          {number(
                            text,
                            `${R.turnaround}, ${name}`,
                            drill?.("tat", { section: t.sectionId ?? "none" }) ?? null,
                          )}
                          <span className="text-caption text-muted-foreground">
                            {" · "}
                            {t.targets.length === 0
                              ? R.turnaroundNone
                              : t.targets.length === 1
                                ? `stated ${formatDuration(t.targets[0]!)}`
                                : fill(R.turnaroundMixed, {
                                    times: t.targets.map(formatDuration).join(", "),
                                  })}
                          </span>
                        </span>
                      </span>
                      <svg
                        viewBox="0 0 100 8"
                        preserveAspectRatio="none"
                        className="h-2.5 w-full"
                        aria-hidden
                      >
                        <rect x="0" y="0" width="100" height="8" className="fill-ink-100" />
                        <rect x="0" y="0" width={at(t.p90)} height="8" className="fill-ink-500" />
                        {t.targets.length === 1 ? (
                          <line
                            x1={at(t.targets[0]!)}
                            x2={at(t.targets[0]!)}
                            y1="0"
                            y2="8"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                            className="stroke-foreground"
                          />
                        ) : null}
                      </svg>
                    </li>
                  );
                })}
              </ul>
              <p className="text-caption text-muted-foreground">
                {R.turnaroundMark}{" "}
                {fill(R.turnaroundScale, { max: scale, unit: hours ? "h" : "min" })}
              </p>
            </>
          )}
        </section>

        <section aria-labelledby="rejections" className={card}>
          <h2 id="rejections" className="text-heading-s font-medium">
            {R.rejections}
          </h2>
          {report.rejections.length === 0 ? (
            <p className="text-muted-foreground">
              {report.tiles.reject_pct.kind === "no_data" ? LAB3.noData : "None."}
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    {R.rejectionColumns[0]}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {R.rejectionColumns[1]}
                  </th>
                  <th scope="col" className={th}>
                    {R.rejectionColumns[2]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.rejections.map((x) => (
                  <tr key={x.reason}>
                    <td className={td}>{names.reason(x.reason)}</td>
                    <td className={`${td} text-right ${fig}`}>
                      {number(
                        x.n.toLocaleString("en-GB"),
                        `${R.rejections}, ${names.reason(x.reason)}`,
                        drill?.("reject_pct", { reason: x.reason }) ?? null,
                      )}
                    </td>
                    <td className={td}>
                      {names.ward(x.wardId)} <span className={fig}>({x.wardN})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <p className="text-caption text-muted-foreground">{drill ? R.footnote : R.adminFootnote}</p>
    </div>
  );
}
