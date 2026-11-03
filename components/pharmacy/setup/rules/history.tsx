"use client";

import type { Tone } from "@/components/pharmacy/roster/swaps";
import type { RuleHistoryRow } from "@/lib/pharmacy/setup/types";

import { pillBtn } from "@/components/pharmacy/medicines/shared";
import { Chip } from "@/components/pharmacy/roster/swaps";
import { EmptyState, Panel } from "@/components/tide/work/kit";
import { day, RULES_TAB as R } from "@/content/pharmacy-setup-rules";

const KIND_TONE: Record<RuleHistoryRow["kind"], Tone> = {
  changed: "green",
  added: "green",
  rejected: "red",
  group_signed: "grey",
};

/** C4: the last ten changes, all groups or the chosen one, each with its kind as a word. */
export function History({
  rows,
  all,
  setAll,
}: {
  rows: RuleHistoryRow[];
  all: boolean;
  setAll: (all: boolean) => void;
}) {
  return (
    <Panel
      title={R.history}
      action={
        <div role="group" aria-label={R.historyAria} className="flex flex-wrap gap-1.5">
          {([true, false] as const).map((a) => (
            <button
              key={String(a)}
              type="button"
              aria-pressed={all === a}
              onClick={() => setAll(a)}
              className={pillBtn(all === a)}
            >
              {a ? R.allGroups : R.thisGroup}
            </button>
          ))}
        </div>
      }
    >
      {rows.length ? (
        <ul className="divide-border border-border flex flex-col divide-y border-t">
          {rows.slice(0, 10).map((h, i) => (
            <li
              key={`${h.at}-${i}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)_auto]"
            >
              <span className="text-caption text-ink-600 tabular-nums">{day(h.at)}</span>
              <span className="col-span-2 row-start-2 flex min-w-0 flex-col gap-0.5 sm:col-span-1 sm:row-start-auto">
                <b className="text-body-s text-foreground font-semibold">
                  {R.ruleLine(h.group, h.kind === "group_signed" ? R.groupWord : h.name)}
                </b>
                {h.from || h.to ? (
                  <span className="text-body-s text-ink-700">
                    <span className="text-ink-600 line-through">
                      {h.from ?? (h.kind === "added" ? R.newRule : R.none)}
                    </span>{" "}
                    {R.arrow} <span className="text-foreground font-semibold">{h.to}</span>
                  </span>
                ) : null}
                <span className="text-caption text-ink-600">{R.byLine(h)}</span>
              </span>
              <span className="col-start-2 row-start-1 sm:col-start-3">
                <Chip tone={KIND_TONE[h.kind]} small>
                  {R.kind[h.kind]}
                </Chip>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title={R.noHistory} />
      )}
    </Panel>
  );
}
