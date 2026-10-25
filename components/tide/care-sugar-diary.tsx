import type { DiaryClass } from "@patient-core/care-trends";
import { DIARY_SLOTS, DIARY_WORDS, diaryClass } from "@patient-core/care-trends";

import { cn } from "@/lib/utils";

/**
 * "Your sugar diary" (the phone's trends.tsx `SugarDiary`): seven days × six times of day, each cell judged
 * against its own time-of-day target by `diaryClass` (the threshold data, L7). A table, so every cell is read
 * with its day, its time and its word; colour is never alone (L4). Too low and very high are danger readings
 * (L3), as on the phone.
 */
const CELL: Record<DiaryClass, string> = {
  in: "bg-pw-stable-tint text-pw-stable-text",
  high: "bg-pw-caution-tint text-pw-caution-text",
  low: "bg-pw-critical-tint text-pw-critical-text",
  veryHigh: "bg-pw-critical-tint text-pw-critical-text",
  none: "bg-pw-bg ring-1 ring-inset ring-pw-line",
};
/** A visible mark beside the number, so the tint is never the only sign (DESIGN-medsync: never colour alone). */
const MARK: Record<DiaryClass, string> = { in: "", high: "↑", low: "↓", veryHigh: "↑↑", none: "" };

export function SugarDiary({
  cells: values,
  days,
  title,
  line,
}: {
  cells: (number | null)[][];
  days: string[];
  title: string;
  line: string;
}) {
  const cells = values.map((row) =>
    row.map((v, j) => ({ v, c: diaryClass(v, DIARY_SLOTS[j]!.ctx) })),
  );
  const shown = new Set(cells.flat().map((x) => x.c));
  const legend = (["in", "high", "low", "veryHigh", "none"] as const).filter(
    (c) => c !== "veryHigh" || shown.has(c),
  );
  return (
    <section className="rounded-pw-card bg-pw-surface shadow-pw-card flex min-w-0 flex-col gap-3 p-4">
      <div>
        <h2 className="text-[17px] leading-[22px] font-semibold">{title}</h2>
        <p className="text-pw-ink-2 text-[13px] font-medium">{line}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-separate border-spacing-1 text-center">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <td className="w-10" />
              {DIARY_SLOTS.map((s) => (
                <th
                  key={s.head}
                  scope="col"
                  className="text-pw-ink-2 align-bottom text-[11px] leading-3 font-semibold"
                >
                  {s.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((row, i) => (
              <tr key={i}>
                <th
                  scope="row"
                  className={cn(
                    "text-left text-[13px] font-semibold",
                    i === cells.length - 1 ? "text-pw-ink" : "text-pw-ink-2",
                  )}
                >
                  {days[i]}
                </th>
                {row.map(({ v, c }, j) => (
                  <td
                    key={j}
                    className={cn(
                      "h-[30px] rounded-lg text-[13px] font-semibold tabular-nums",
                      CELL[c],
                    )}
                  >
                    {v ?? ""}
                    {v !== null && MARK[c] ? <span aria-hidden>{MARK[c]}</span> : null}
                    <span className="sr-only">{`${v === null ? "" : " "}${DIARY_WORDS[c]}`}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-hidden className="flex flex-wrap gap-x-3 gap-y-1.5">
        {legend.map((c) => (
          <li
            key={c}
            className="text-pw-ink-2 inline-flex items-center gap-1.5 text-xs font-medium"
          >
            <span className={cn("size-2.5 rounded-[3px]", CELL[c])} />
            {MARK[c] ? `${MARK[c]} ` : ""}
            {DIARY_WORDS[c]}
          </li>
        ))}
      </ul>
    </section>
  );
}
