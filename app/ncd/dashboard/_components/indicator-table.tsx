import type { Cell, TableSection } from "@/lib/ncdreg/read/dashboard";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** A count: a link to its patient list for drill-down roles (F2), "1–4" when suppressed (F6). */
export function CountCell({ c }: { c: Cell }) {
  if (c.href)
    return (
      <Link
        href={c.href}
        className="text-teal-text focus-visible:shadow-focus rounded-xs underline-offset-2 outline-none hover:underline"
      >
        {c.text}
      </Link>
    );
  return <span title={c.suppressed ? "Count from 1 to 4, suppressed" : undefined}>{c.text}</span>;
}

/** Every indicator with numerator, denominator, percentage and definition version (§11.4 "always a table"). */
export function IndicatorTable({
  sections,
  className,
}: {
  sections: TableSection[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {sections.map((s) => (
        <table
          key={s.title}
          className="text-body-s w-full border-collapse print:break-inside-avoid"
        >
          <caption className="text-heading-s text-foreground pb-2 text-left font-medium">
            {s.title}
          </caption>
          <thead>
            <tr className="text-overline text-muted-foreground border-ink-150 border-b text-left uppercase">
              <th scope="col" className="w-16 py-1.5 pr-2 font-medium">
                Code
              </th>
              <th scope="col" className="py-1.5 pr-2 font-medium">
                Indicator
              </th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                Count
              </th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                Of
              </th>
              <th scope="col" className="w-14 py-1.5 pr-2 text-right font-medium">
                %
              </th>
              <th scope="col" className="hidden py-1.5 text-right font-medium sm:table-cell">
                Version
              </th>
            </tr>
          </thead>
          <tbody>
            {s.rows.flatMap((r) =>
              r.lines.map((l, i) => (
                <tr
                  key={`${r.key}:${l.label}:${i}`}
                  className={cn("border-ink-100 align-top", i === r.lines.length - 1 && "border-b")}
                >
                  <td className="text-muted-foreground py-1 pr-2 font-mono text-[12px]">
                    {i === 0 ? r.code : ""}
                  </td>
                  <td className="py-1 pr-2">
                    {i === 0 ? (
                      <span className="text-foreground font-medium">{r.label}</span>
                    ) : null}
                    {r.lines.length > 1 || l.label !== "Patients" ? (
                      <span
                        className={cn(
                          "text-ink-700 block",
                          i === 0 && r.lines.length > 1 && "mt-0.5",
                        )}
                      >
                        {l.label}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">
                    <CountCell c={l.num} />
                    {l.note ? (
                      <span className="text-muted-foreground block text-[11px]">{l.note}</span>
                    ) : null}
                  </td>
                  <td className="text-ink-700 py-1 pr-2 text-right font-mono tabular-nums">
                    {l.den ? <CountCell c={l.den} /> : ""}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">
                    {l.pct == null ? "" : `${l.pct}%`}
                  </td>
                  <td className="text-muted-foreground hidden py-1 text-right font-mono text-[11px] sm:table-cell">
                    {i === 0 ? r.version : ""}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      ))}
    </div>
  );
}
