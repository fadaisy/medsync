import type { HmisFormFile } from "@/lib/lab/hmis-form";
import type { StoredCell } from "@/lib/lab/hmis-store";
import Link from "next/link";

import { fill, LAB3_HMIS } from "@/content/lab-phase-3";
import { cellKey, DONE, rowKey } from "@/lib/lab/hmis105";

const H = LAB3_HMIS;
const th = "text-caption text-muted-foreground px-2 py-2 text-left font-medium";
const td = "border-border border-t px-2 py-2 align-top";
const num = "text-right font-mono tabular-nums";

/**
 * One section of the HMIS 105 laboratory report (§5.11, artboard 11): grouped rows as on the form, a dash where
 * the verified form has no positive column, blank where nothing counts (HM-3 i), the bedside share inline in the
 * sky tint. Every number links to the records it counts, for lab roles only (`drill`); the HMIS desk and the
 * hospital admin get the numbers alone (Law 10).
 */
export function HmisTable({
  form,
  section,
  cells,
  drill,
  testNames,
}: {
  form: HmisFormFile;
  section: string;
  cells: Record<string, StoredCell>;
  drill: ((key: string) => string) | null;
  testNames: Record<string, string>;
}) {
  const meta = form.sections.find((s) => s.id === section);
  const formRows = form.rows.filter((r) => r.section === section);
  // 10.5's rows are free text on the form ("Routine Test Type, specify"): the tests counted there.
  const rows =
    section === "10.5"
      ? [
          ...new Set(
            Object.keys(cells)
              .map((k) => k.split("|"))
              .filter(([, c]) => meta?.columns.includes(c!))
              .map(([r]) => r!)
              .filter((r) => r.startsWith("test.")),
          ),
        ].map((r) => ({
          code: null,
          label: testNames[r] ?? r,
          key: r,
          group: null as string | null,
          hasPositive: null as boolean | null,
          columns: meta?.columns ?? [],
        }))
      : formRows.map((r) => ({
          code: r.code,
          label: r.label,
          key: rowKey(r),
          group: r.group,
          hasPositive: r.hasPositive,
          columns: r.cells.map((c) => c.column),
        }));
  if (!rows.length) return <p className="text-body-s text-muted-foreground">{H.noRows}</p>;

  const value = (row: (typeof rows)[number], column: string) => {
    const key = cellKey(row.key, column);
    const c = cells[key];
    if (!c || c.value === null)
      return (
        <span>
          <span className="sr-only">{H.blank}</span>
        </span>
      );
    const shown = c.value.toLocaleString("en-GB");
    const href = drill && !c.manual && c.value > 0 ? drill(key) : null;
    return (
      <span className="inline-flex flex-wrap items-baseline justify-end gap-2">
        {href ? (
          <Link
            href={href}
            className="font-medium text-teal-700 underline-offset-4 hover:underline"
            aria-label={fill(H.open, {
              code: row.code ?? "",
              label: row.label,
              column,
              value: shown,
            })}
          >
            {shown}
          </Link>
        ) : (
          shown
        )}
        {c.bedside ? (
          <span className="bg-sky-tint text-sky-text text-caption rounded px-1.5 py-0.5 font-sans">
            {fill(H.bedside, { n: c.bedside })}
          </span>
        ) : null}
      </span>
    );
  };

  if (section === "10.2") {
    return (
      <table className="text-body-s w-full border-collapse">
        <caption className="text-caption text-muted-foreground pb-2 text-left">{H.caption}</caption>
        <thead>
          <tr>
            {H.columns.map((c, i) => (
              <th key={c} scope="col" className={i > 1 ? `${th} text-right` : th}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((r, i) => {
            const out = [];
            if (i === 0 || rows[i - 1]!.group !== r.group) {
              out.push(
                <tr key={`g-${r.group}`}>
                  <th
                    colSpan={4}
                    scope="colgroup"
                    className="text-overline text-muted-foreground border-border border-t px-2 pt-4 pb-1 text-left uppercase"
                  >
                    {r.group}
                  </th>
                </tr>,
              );
            }
            const positives = r.columns.filter((c) => c !== DONE);
            const anyPositive = positives.some((c) => cells[cellKey(r.key, c)]);
            out.push(
              <tr key={r.key}>
                <td className={`${td} font-mono`}>{r.code}</td>
                <th scope="row" className={`${td} text-left font-normal`}>
                  {r.label}
                </th>
                <td className={`${td} ${num}`}>{value(r, DONE)}</td>
                <td className={`${td} ${num}`}>
                  {r.hasPositive === false ? (
                    <span aria-label="No positive column on the form">—</span>
                  ) : anyPositive ? (
                    <span className="flex flex-col items-end gap-1">
                      {positives.map((c) => (
                        <span key={c} className="inline-flex gap-1">
                          {positives.length > 1 ? (
                            <span className="text-caption text-muted-foreground font-sans">
                              {c}
                            </span>
                          ) : null}
                          {value(r, c)}
                        </span>
                      ))}
                      {r.hasPositive === null ? (
                        <span className="text-caption text-muted-foreground font-sans">
                          {H.positiveNotVerified}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </td>
              </tr>,
            );
            return out;
          })}
        </tbody>
      </table>
    );
  }

  const columns = [...new Set(rows.flatMap((r) => r.columns))];
  return (
    <div className="overflow-x-auto">
      <table className="text-body-s w-full border-collapse">
        <caption className="text-caption text-muted-foreground pb-2 text-left">{H.caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>
              {H.columns[0]}
            </th>
            <th scope="col" className={th}>
              {H.columns[1]}
            </th>
            {columns.map((c) => (
              <th key={c} scope="col" className={`${th} text-right`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className={`${td} font-mono`}>{r.code}</td>
              <th scope="row" className={`${td} text-left font-normal`}>
                {r.label}
              </th>
              {columns.map((c) => (
                <td key={c} className={`${td} ${num}`}>
                  {r.columns.includes(c) ? value(r, c) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
