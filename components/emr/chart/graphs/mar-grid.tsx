import type { Hue } from "@/lib/design/domains";
import type { MarBody, MarCellState } from "@/lib/emr/charts/payload";

import { StatusWord } from "@/components/emr/status-word";
import { Tag } from "@/components/medsync/tag";
import { formatClock } from "@/lib/emr/charts/scale";
import { wardChipWords } from "@/lib/pharmacy/ward-chip";

/**
 * The medicine administration record (MONITORING-CHARTS.md §2): one row per prescription and a
 * cell per due time, each a square tag with its words (Due, Given hh:mm, Delayed, Omitted (reason),
 * Awaiting co-sign; a fluid shows Running). Workflow states wear cool tags, never red, amber or
 * green, and never colour alone.
 */

const HUE: Record<MarCellState, Hue> = {
  due: "slate",
  given: "teal",
  delayed: "iris",
  omitted: "slate",
  awaiting_cosign: "iris",
  running: "sky",
};

export function MarGrid({ body }: { body: MarBody }) {
  if (body.rows.length === 0)
    return <p className="text-body-s text-muted-foreground">No prescriptions from the plan yet.</p>;
  return (
    <div className="border-border relative max-w-full overflow-x-auto rounded-lg border">
      <table className="text-body-s w-full border-collapse">
        <caption className="sr-only">
          Medicine administration record: each prescription with its due times and what was done.
        </caption>
        <thead className="bg-muted">
          <tr>
            <th scope="col" className="text-caption text-ink-600 px-3 py-2 text-left font-medium">
              Prescription
            </th>
            <th scope="col" className="text-caption text-ink-600 px-3 py-2 text-left font-medium">
              Due times
            </th>
          </tr>
        </thead>
        <tbody>
          {body.rows.map((r) => (
            <tr key={r.prescriptionId} className="align-top">
              <th
                scope="row"
                className="border-ink-150 min-w-[200px] border-t px-3 py-2.5 text-left font-normal"
              >
                <span className="text-foreground block">{r.label}</span>
                <span className="text-caption text-muted-foreground block">{r.detail}</span>
                {r.pharmacy ? (
                  // D-PH1-33: read-only; it holds no dose. A query is amber with its icon and words.
                  <StatusWord
                    tone={r.pharmacy.kind === "queried" ? "caution" : "neutral"}
                    className="mt-1"
                  >
                    {wardChipWords(r.pharmacy)}
                  </StatusWord>
                ) : null}
              </th>
              <td className="border-ink-150 border-t px-3 py-2.5">
                {r.cells.length === 0 && !r.note ? (
                  <span className="text-muted-foreground">Nothing due in this chart day</span>
                ) : (
                  <ul className="flex flex-wrap gap-x-3 gap-y-2">
                    {r.cells.map((c) => (
                      <li key={`${c.at}:${c.state}`} className="flex flex-col gap-0.5">
                        <span className="text-mono-s text-muted-foreground font-mono tabular-nums">
                          {formatClock(c.at)}
                        </span>
                        <Tag hue={HUE[c.state]}>{c.word}</Tag>
                        {c.detail ? (
                          <span className="text-caption text-muted-foreground">{c.detail}</span>
                        ) : null}
                      </li>
                    ))}
                    {r.note ? (
                      <li className="text-caption text-muted-foreground self-end">{r.note}</li>
                    ) : null}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
