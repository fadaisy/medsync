"use client";

import type { LogFilter, SectionProps } from "./index";
import type { Tone } from "@/components/pharmacy/roster/swaps";
import type { OutboxRow } from "@/lib/pharmacy/setup/types";

import { retryMessageAction } from "@/app/pharmacy/setup/setup-actions";
import { pillBtn } from "@/components/pharmacy/medicines/shared";
import { Chip } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Panel } from "@/components/tide/work/kit";
import { stamp } from "@/content/pharmacy-roster-sections";
import { SMS_TEMPLATES } from "@/content/pharmacy-setup";
import { MSG } from "@/content/pharmacy-setup-messages";

const M = MSG.outbox;
const ST: Record<OutboxRow["status"], Tone> = {
  delivered: "green",
  sent: "blue",
  failed: "amber",
  queued: "amber",
};

/** §D4: the latest messages, filtered by status, with Retry on the failed ones. */
export function Outbox({
  view,
  run,
  pending,
  filter,
  setFilter,
}: SectionProps & { filter: LogFilter; setFilter: (f: LogFilter) => void }) {
  const count = (f: LogFilter) =>
    f === "all" ? view.outbox.length : view.outbox.filter((m) => m.status === f).length;
  const shown = view.outbox.filter((m) => filter === "all" || m.status === filter);
  return (
    <Panel
      title={M.title}
      action={
        <div role="group" aria-label={M.status} className="flex flex-wrap gap-1.5">
          {(Object.keys(M.filter) as LogFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={pillBtn(filter === f)}
            >
              {M.filterLabel(M.filter[f], count(f))}
            </button>
          ))}
        </div>
      }
    >
      {shown.length ? (
        <ul className="divide-border flex flex-col divide-y">
          {shown.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="text-caption text-muted-foreground w-24 shrink-0 tabular-nums">
                {stamp(m.at)}
              </span>
              <span className="flex min-w-0 flex-1 basis-40 flex-col">
                <span className="text-body-s font-semibold">
                  {m.rule === "test"
                    ? M.test
                    : (SMS_TEMPLATES.find((t) => t.key === m.rule)?.name ?? m.rule)}{" "}
                  · <span className="font-normal tabular-nums">{m.phoneMasked}</span>
                </span>
                <span className="text-caption text-muted-foreground">
                  {M.lang[m.lang]}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Chip tone={ST[m.status]} small>
                  {M.state[m.status]}
                </Chip>
                {m.status === "failed" && view.can.manage ? (
                  <LabButton
                    type="button"
                    size="sm"
                    busy={pending}
                    onClick={() =>
                      void run(
                        () => retryMessageAction({ id: m.id }),
                        (d: { sent: boolean }) => (d.sent ? M.retried : M.retryFailed),
                      )
                    }
                  >
                    {M.retry}
                  </LabButton>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title={M.nothing} />
      )}
    </Panel>
  );
}
