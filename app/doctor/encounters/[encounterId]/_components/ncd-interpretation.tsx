"use client";

import type { Interpretation } from "@/lib/ncd/engine/assess";
import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";

/**
 * The glycaemic tests, captured INSIDE the scale that reads them.
 *
 * The input used to sit in a card above this table, which asked the clinician to
 * type a number in one place and find out what it meant in another. Now each row
 * IS the test: name, input, and the three bands it could fall in, on one line of
 * sight. Entering 7.4 and watching the right-hand cell light up is the whole
 * interaction.
 *
 * ── The colours are the clinical lead's call ─────────────────────────────────
 * Red for the diabetes range, brand for normal, green for the intermediate band.
 * Two of those cut against convention — green usually means all-clear, and this
 * project otherwise reserves red for a genuine emergency — so it is recorded
 * here as a deliberate choice rather than left to be "corrected" later.
 *
 * What makes it safe either way is that COLOUR IS NEVER THE MESSAGE. Every
 * column carries its band name in the header, every cell prints its own numeric
 * range and label, and the occupied cell is marked with a tick and the words
 * "this patient". Read in greyscale, nothing is lost.
 *
 * ── A band is not a verdict ──────────────────────────────────────────────────
 * Stated in the footer on every render. Confirmation on a second sample and the
 * HbA1c validity caveats bear on the diagnosis and not on where a number sits,
 * so a single unconfirmed fasting glucose reads Diabetes range here while the
 * profile still reads "not yet established" — and both are true at once.
 */

const COLUMNS = ["normal", "intermediate", "diagnostic"] as const;
type Tone = (typeof COLUMNS)[number];

const HEAD: Record<Tone, string> = {
  normal: "text-brand-700 dark:text-brand-300",
  intermediate: "text-emerald-700 dark:text-emerald-400",
  diagnostic: "text-red-700 dark:text-red-400",
};

/** The occupied cell: fill, ring and a tick. Never fill alone. */
const ON: Record<Tone, string> = {
  normal:
    "bg-brand-50 text-brand-900 ring-brand-400/50 dark:bg-brand-950/50 dark:text-brand-100 dark:ring-brand-500/40",
  intermediate:
    "bg-emerald-50 text-emerald-900 ring-emerald-400/50 dark:bg-emerald-950/50 dark:text-emerald-100 dark:ring-emerald-500/40",
  diagnostic:
    "bg-red-50 text-red-900 ring-red-400/60 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-500/40",
};

const LABEL: Record<Tone, string> = {
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

export function NcdInterpretation({
  rows,
  renderInput,
}: {
  rows: Interpretation[];
  /** The capture control for one test, supplied by the form that owns the values. */
  renderInput: (featureCode: string) => ReactNode;
}) {
  if (!rows.length) return null;
  const first = rows[0]!;

  return (
    <section className="border-border bg-card overflow-hidden rounded-xl border shadow-xs">
      <header className="border-border/60 bg-muted/40 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b px-3.5 py-2.5">
        <h4 className="text-foreground text-body-s font-medium">Interpretation</h4>
        {/* Which standard, always: the intermediate bands differ between them,
            and a table that did not say which it applied would be printing one
            body's threshold under everyone's name. */}
        <span className="text-caption text-muted-foreground">
          bands per <span className="text-foreground font-medium">{first.standard}</span>{" "}
          {first.version}
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[38%] min-w-[11rem]" />
            <col span={3} />
          </colgroup>
          <thead>
            <tr className="border-border/60 border-b">
              <th className="text-muted-foreground text-overline px-3.5 py-2 text-left uppercase">
                Test
              </th>
              {COLUMNS.map((tone) => (
                <th
                  key={tone}
                  className={`text-overline px-2 py-2 text-center uppercase ${HEAD[tone]}`}
                >
                  {LABEL[tone]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-border/50 divide-y">
            {rows.map((row) => (
              <tr key={row.feature} className="align-top">
                {/* The capture lives with its own scale, not in a card above it. */}
                <th scope="row" className="px-3.5 py-2.5 text-left font-normal">
                  <span className="text-body-s text-foreground block font-medium">
                    {row.display}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {renderInput(row.feature)}
                    {row.unit ? (
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {row.unit}
                      </span>
                    ) : null}
                  </span>
                  {/* The other scale, for the clinician who reads in it. */}
                  {row.value !== undefined && row.altUnit ? (
                    <span className="text-muted-foreground mt-1 block font-mono text-[10px] tabular-nums">
                      = {Math.round(row.value * row.altUnit.factor)} {row.altUnit.unit}
                    </span>
                  ) : null}
                  {row.state === "unavailable" ? (
                    <span className="text-muted-foreground/70 mt-1 block text-[10.5px] italic">
                      not available at this site
                    </span>
                  ) : null}
                </th>

                {COLUMNS.map((tone) => {
                  const band = row.bands.find((b) => b.tone === tone);
                  const here = Boolean(band && row.band && row.band.code === band.code);
                  return (
                    <td key={tone} className="p-1 align-middle">
                      {band ? (
                        <span
                          className={`ease-expo-out flex h-full flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2.5 text-center transition-colors duration-150 ${
                            here
                              ? `${ON[tone]} ring-1 ring-inset`
                              : "text-muted-foreground/80 bg-transparent"
                          }`}
                        >
                          <span className="font-mono text-[12px] font-medium tabular-nums">
                            {bandRange(band.from, band.to, row.unit)}
                          </span>
                          <span className="text-[10px] leading-tight">{band.display}</span>
                          {here ? (
                            <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium">
                              <CheckIcon className="size-3" aria-hidden />
                              this patient
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 flex items-center justify-center px-2 py-2.5 text-center text-[10.5px] italic">
                          not defined
                        </span>
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
        <ul className="border-border/60 space-y-1 border-t px-3.5 py-2">
          {rows
            .filter((r) => r.note)
            .map((r) => (
              <li key={r.feature} className="text-muted-foreground text-[11px] leading-snug">
                <span className="text-foreground/80 font-medium">{r.display}:</span> {r.note}
              </li>
            ))}
        </ul>
      ) : null}

      <p className="border-border/60 text-muted-foreground border-t px-3.5 py-2 text-[11px] leading-snug">
        A band is where the number sits on a published scale. It is not a diagnosis — the profile
        weighs confirmation and test validity before it says that.
      </p>
    </section>
  );
}
