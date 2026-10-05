import type { DVisit } from "@/lib/ncdreg/indicators/dataset";

import { fmtShort, Num } from "../../../_components/kit";

/** A small trend line: ink, 2px, no colour meaning (the numbers carry it). */
function Spark({ values }: { values: (number | null)[] }) {
  const pts = values
    .map((v, i) => [i, v] as const)
    .filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return null;
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const w = 72;
  const h = 20;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => (hi === lo ? h / 2 : h - 2 - ((v - lo) / (hi - lo)) * (h - 4));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="text-ink-500">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.map(([i, v]) => `${x(i)},${y(v)}`).join(" ")}
      />
    </svg>
  );
}

/**
 * B2: the last six visits, one column each, the rows the person's conditions call for. Numbers are
 * always shown as text; the trend line is a garnish.
 */
export function Trajectory({
  visits,
  rows,
  kidney,
}: {
  visits: readonly DVisit[];
  rows: { glucose: boolean; hba1c: boolean };
  kidney: { date: string; egfr: number; g: string } | null;
}) {
  const lines: {
    label: string;
    unit: string;
    cell: (v: DVisit) => string | null;
    num: (v: DVisit) => number | null;
  }[] = [
    {
      label: "Blood pressure",
      unit: "mmHg",
      cell: (v) => (v.bp ? `${v.bp[0]}/${v.bp[1]}` : null),
      num: (v) => v.bp?.[0] ?? null,
    },
    ...(rows.glucose
      ? [
          {
            label: "Glucose",
            unit: "mmol/L",
            cell: (v: DVisit) =>
              v.glucose
                ? `${v.glucose.value.toFixed(1)}${v.glucose.type === "fasting" ? " F" : v.glucose.type === "random" ? " R" : " PM"}`
                : null,
            num: (v: DVisit) => v.glucose?.value ?? null,
          },
        ]
      : []),
    ...(rows.hba1c
      ? [
          {
            label: "HbA1c",
            unit: "%",
            cell: (v: DVisit) => (v.hba1c ? v.hba1c.percent.toFixed(1) : null),
            num: (v: DVisit) => v.hba1c?.percent ?? null,
          },
        ]
      : []),
    {
      label: "Weight",
      unit: "kg",
      cell: (v) => (v.weightKg != null ? v.weightKg.toFixed(1) : null),
      num: (v) => v.weightKg,
    },
  ];
  if (!visits.length)
    return <p className="text-body-s text-muted-foreground">No earlier visits recorded.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-[13px]">
        <caption className="sr-only">Last {visits.length} visits</caption>
        <thead>
          <tr className="text-ink-600 border-border border-b">
            <th scope="col" className="h-9 pr-3 text-left font-medium">
              Measure
            </th>
            {visits.map((v) => (
              <th key={v.id} scope="col" className="px-2 text-right font-medium">
                <Num>{fmtShort(v.date)}</Num>
              </th>
            ))}
            <th scope="col" className="pl-3 text-left font-medium">
              <span className="sr-only">Trend</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className="border-border border-b last:border-b-0">
              <th scope="row" className="h-10 pr-3 text-left font-normal">
                {l.label} <span className="text-muted-foreground">{l.unit}</span>
              </th>
              {visits.map((v) => (
                <td key={v.id} className="px-2 text-right">
                  {l.cell(v) ? (
                    <Num>{l.cell(v)}</Num>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </td>
              ))}
              <td className="pl-3">
                <Spark values={visits.map(l.num)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-caption text-ink-600 mt-2">
        {kidney ? (
          <>
            Latest eGFR <Num>{kidney.egfr}</Num> mL/min/1.73m² · {fmtShort(kidney.date)} · kidney
            category {kidney.g} (category from latest result)
          </>
        ) : (
          "No eGFR recorded."
        )}
      </p>
    </div>
  );
}
