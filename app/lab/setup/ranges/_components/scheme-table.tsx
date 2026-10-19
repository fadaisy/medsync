import type { SchemePayload } from "@/lib/lab/signed-config";

import { LABWS2_SETUP } from "@/content/lab-workspace-v2-setup";
import {
  ageWords,
  boundWords,
  contextWords,
  methodsWords,
  schemeGaps,
  SEX_WORDS,
  sortedBounds,
} from "../_lib/schemes-copy";

/**
 * One scheme, read only (§5.12, artboard 12): who each row applies to, its categories with their boundaries
 * in words, the elevation adjustment, and the gaps (amber), which flag on the reference interval.
 */
export function SchemeTable({
  scheme,
  elevationWords,
}: {
  scheme: SchemePayload;
  /** The hospital's signed elevation, in words (or that there is none). */
  elevationWords: string;
}) {
  const label = (code: string) => scheme.categories.find((c) => c.code === code);
  const gaps = schemeGaps(scheme);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-s">
        <span className="font-medium">{scheme.label}</span>, in{" "}
        <span className="font-mono">{scheme.unit}</span>
        <span className="text-muted-foreground"> · Source: {scheme.source}</span>
      </p>
      <ol className="flex flex-col gap-2">
        {scheme.rows.map((r, i) => (
          <li key={i} className="border-border rounded-md border p-3">
            <dl className="text-body-s grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
              <dt className="text-muted-foreground">Applies to</dt>
              <dd>
                {SEX_WORDS[r.sex]} · {ageWords(r.ageFromDays, r.ageToDays)} · {contextWords(r)}
              </dd>
              <dt className="text-muted-foreground">Results from</dt>
              <dd>{methodsWords(r.methods)}</dd>
              <dt className="text-muted-foreground">Categories</dt>
              <dd>
                <ul className="flex flex-col gap-0.5">
                  {sortedBounds(r.bounds).map((b, j) => {
                    const c = label(b.category);
                    return (
                      <li key={j}>
                        <span className="font-medium">
                          {c?.label ?? LABWS2_SETUP.sweep.unknownCategory}
                        </span>
                        : <span className="tabular-nums">{boundWords(b)}</span>
                        {c?.abnormal ? " · abnormal" : ""}
                      </li>
                    );
                  })}
                </ul>
              </dd>
              <dt className="text-muted-foreground">Source</dt>
              <dd>{r.source}</dd>
            </dl>
          </li>
        ))}
      </ol>
      {scheme.elevation ? (
        <div className="flex flex-col gap-1">
          <table className="text-body-s w-full max-w-md border-collapse text-left">
            <caption className="text-body-s mb-1 text-left font-medium">
              Elevation adjustment, in {scheme.elevation.unit}
            </caption>
            <thead>
              <tr className="text-caption text-muted-foreground">
                <th scope="col" className="py-1 pr-3 font-medium">
                  Hospital elevation (metres)
                </th>
                <th scope="col" className="py-1 font-medium">
                  Added to every cut-off
                </th>
              </tr>
            </thead>
            <tbody>
              {scheme.elevation.table.map((t, i) => (
                <tr key={i} className="border-ink-150 border-t">
                  <td className="py-1 pr-3 tabular-nums">
                    {t.fromM} to {t.toM}
                  </td>
                  <td className="py-1 tabular-nums">
                    {t.amount} {scheme.elevation!.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-caption text-muted-foreground">
            Source: {scheme.elevation.source}. Adjustments use the hospital&apos;s signed elevation
            (Lab settings). {elevationWords}
          </p>
        </div>
      ) : null}
      {gaps.length ? (
        <div className="bg-status-caution-bg dark:text-status-caution-fg ring-status-caution-fg/25 text-body-s flex flex-col gap-1 rounded-md p-3 text-amber-800 ring-1">
          <p className="font-medium">Not covered by this scheme</p>
          <ul className="flex list-disc flex-col gap-0.5 pl-5">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
