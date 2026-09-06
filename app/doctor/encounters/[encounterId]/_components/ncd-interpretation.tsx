"use client";

import type { Interpretation } from "@/lib/ncd/engine/assess";

/**
 * What a glycaemic number MEANS, as a banded table.
 *
 * It lives with the FIELDS rather than in the profile panel, because the reading
 * belongs beside the entry: a clinician typing a fasting glucose wants to see
 * where it lands without moving their eye across the screen, and the panel is
 * for the verdict rather than for the scale the verdict was read on.
 *
 * ── The colours are the clinical lead's call ─────────────────────────────────
 * Red for the diabetes range, brand for normal, green for the intermediate
 * band. Two of those cut against convention — green usually means all-clear, and
 * this project otherwise reserves red for a genuine emergency — so it is worth
 * recording that the choice was made deliberately rather than drifted into.
 *
 * What makes it safe either way is that COLOUR IS NEVER THE MESSAGE: every band
 * carries its own name in the header, the occupied cell says "this patient" in
 * words, and the numeric range is printed in each cell. Someone reading this in
 * greyscale, or colour-blind, loses nothing.
 *
 * ── A band is not a verdict ──────────────────────────────────────────────────
 * The footer says so on every render. Confirmation on a second sample and the
 * HbA1c validity caveats bear on the diagnosis and not on where a number sits,
 * so a single unconfirmed fasting glucose shows here as Diabetes range while the
 * panel still reads "not yet established" — and both are true.
 */

const BAND_HEAD: Record<string, string> = {
  normal: "text-brand-700 dark:text-brand-300",
  intermediate: "text-emerald-700 dark:text-emerald-400",
  diagnostic: "text-red-700 dark:text-red-400",
};

const BAND_ON: Record<string, string> = {
  normal: "bg-brand-100 text-brand-900 dark:bg-brand-900/50 dark:text-brand-100",
  intermediate: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  diagnostic: "bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100",
};

const COLUMNS = ["normal", "intermediate", "diagnostic"] as const;
const COLUMN_LABEL: Record<(typeof COLUMNS)[number], string> = {
  normal: "Not diabetes",
  intermediate: "Intermediate",
  diagnostic: "Diabetes range",
};

/** "< 5.6", "5.6 – 7.0", "≥ 7.0" — an open end reads as open. */
function bandRange(from: number | undefined, to: number | undefined, unit?: string): string {
  const u = unit === "%" ? "%" : "";
  if (from === undefined && to !== undefined) return `< ${to}${u}`;
  if (from !== undefined && to === undefined) return `≥ ${from}${u}`;
  if (from !== undefined && to !== undefined) return `${from} – ${to}${u}`;
  return "—";
}

export function NcdInterpretation({ rows }: { rows: Interpretation[] }) {
  if (!rows.length) return null;
  const first = rows[0]!;

  return (
    <section className="border-border bg-card mt-3 overflow-hidden rounded-xl border shadow-xs">
      <header className="border-border/60 bg-muted/40 flex flex-wrap items-baseline gap-x-2 border-b px-3 py-2">
        <h4 className="text-foreground text-body-s font-medium">Interpretation</h4>
        {/* Which standard, always. The intermediate bands differ between them,
            and a table that did not say which it applied would be asserting one
            body's threshold under everyone's name. */}
        <span className="text-caption text-muted-foreground">
          bands per <span className="text-foreground font-medium">{first.standard}</span>{" "}
          {first.version}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-border/60 border-b">
              <th className="text-muted-foreground text-caption px-3 py-1.5 font-medium">Test</th>
              {COLUMNS.map((tone) => (
                <th
                  key={tone}
                  className={`text-caption px-2 py-1.5 font-medium ${BAND_HEAD[tone]}`}
                >
                  {COLUMN_LABEL[tone]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border/40 divide-y">
            {rows.map((row) => (
              <tr key={row.feature}>
                <th scope="row" className="text-foreground/85 px-3 py-2 text-[12px] font-medium">
                  {row.display}
                  {row.value !== undefined ? (
                    <span className="text-foreground block font-mono text-[11px] tabular-nums">
                      {row.value} {row.unit}
                      {row.altUnit
                        ? ` · ${Math.round(row.value * row.altUnit.factor)} ${row.altUnit.unit}`
                        : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/70 block text-[10.5px] italic">
                      {row.state === "unavailable" ? "not available here" : "not measured"}
                    </span>
                  )}
                </th>
                {COLUMNS.map((tone) => {
                  const band = row.bands.find((b) => b.tone === tone);
                  const here = Boolean(band && row.band && row.band.code === band.code);
                  return (
                    <td
                      key={tone}
                      className={`px-2 py-2 align-middle text-[11.5px] ${
                        here ? `${BAND_ON[tone]} font-medium` : "text-muted-foreground"
                      }`}
                    >
                      {band ? (
                        <>
                          <span className="font-mono tabular-nums">
                            {bandRange(band.from, band.to, row.unit)}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-tight">
                            {band.display}
                          </span>
                          {/* Never colour alone. */}
                          {here ? (
                            <span className="mt-0.5 block text-[10px] font-medium">
                              ◂ this patient
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground/50 italic">not defined</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.some((r) => r.note) ? (
        <ul className="border-border/60 space-y-1 border-t px-3 py-2">
          {rows
            .filter((r) => r.note)
            .map((r) => (
              <li key={r.feature} className="text-muted-foreground text-[11px] leading-snug">
                <span className="text-foreground/80 font-medium">{r.display}:</span> {r.note}
              </li>
            ))}
        </ul>
      ) : null}

      <p className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] leading-snug">
        A band is where the number sits on a published scale. It is not a diagnosis — the profile
        weighs confirmation and test validity before it says that.
      </p>
    </section>
  );
}
