import type { QueueGroupKey } from "../_lib/groups";
import type { PatientIdentity } from "@/components/emr/orders/model";
import type { ReviewRow } from "@/lib/pharmacy/review/read";
import Link from "next/link";

import { EmptyState, Pill, TwoIds } from "@/components/tide/work/kit";
import { REVIEW } from "@/content/pharmacy-review";
import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_WINDOW } from "@/content/pharmacy-workspace-v2-window";
import { formatDuration } from "@/lib/lab/turnaround";
import { cn } from "@/lib/utils";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { CloseNotCollectedDialog } from "../../_components/review-dialogs";

const W = PHWS2_WINDOW.queue;
const Q = REVIEW.queue;
const shortDay = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: DEFAULT_TIME_ZONE,
});

/**
 * Window › Queue, left pane (board Window): the review queue grouped by stage, oldest first. Each row is a link that
 * selects `rx`; the wait is in words on the server's clock, with no colour, because the queue has no "late" rule
 * (Law 4). "Close as not collected" stays on rows written before today, as on the old queue (B-10).
 */
export function QueueList({
  groups,
  total,
  identities,
  selected,
  hrefFor,
  serverNowMs,
  canDispense,
  pointName,
}: {
  groups: readonly { key: QueueGroupKey; rows: ReviewRow[] }[];
  total: number;
  identities: Record<string, PatientIdentity>;
  selected: string | null;
  hrefFor: (key: string) => string;
  serverNowMs: number;
  canDispense: boolean;
  pointName: string;
}) {
  const minutes = (iso: string) => formatDuration((serverNowMs - new Date(iso).getTime()) / 60_000);
  const who = (r: ReviewRow) =>
    identities[r.patientUserId] ?? { name: W.nameWithheld, mrn: "", ageSex: "" };
  return (
    <section
      aria-label={W.listLabel}
      className="bg-card shadow-tide-card rounded-tide-card overflow-hidden"
    >
      <header className="border-border flex items-baseline gap-2 border-b px-4 py-3">
        <h2 className="text-heading-s text-foreground">{W.title}</h2>
        <span className="text-tide-ink-3 tabular-nums">{total}</span>
        <span className="text-caption text-muted-foreground">· {W.oldestFirst}</span>
      </header>
      {groups.length === 0 ? (
        <EmptyState
          compact
          title={W.empty}
          why={fill(W.emptyWhy, { point: pointName })}
          className="m-3"
        />
      ) : (
        groups.map((g) => (
          <div key={g.key}>
            <h3 className="bg-tide-sunken text-label text-ink-700 flex items-center justify-between px-4 py-1.5">
              {W.groups[g.key]}
              <span className="tabular-nums">{g.rows.length}</span>
            </h3>
            <ul className="divide-border divide-y">
              {g.rows.map((r) => {
                const p = who(r);
                const on = r.key === selected;
                const wait = r.earlier
                  ? fill(W.written, { age: Q.age(r.ageDays) })
                  : r.stage === "queried" && r.queriedSince
                    ? REVIEW.queriedFor(minutes(r.queriedSince))
                    : fill(W.waiting, { wait: minutes(r.writtenAt) });
                const stock = r.notOnShelf
                  ? Q.stock.some(r.notOnShelf)
                  : r.notCounted
                    ? Q.stock.notCounted
                    : Q.stock.all;
                const shown = r.medicines.length > 3 ? r.medicines.slice(0, 2) : r.medicines;
                const more = r.medicines.length - shown.length;
                return (
                  <li key={r.key} className={cn(on && "bg-tide-sunken")}>
                    <Link
                      href={hrefFor(r.key)}
                      aria-current={on ? "true" : undefined}
                      prefetch={false}
                      className="hover:bg-muted focus-visible:shadow-focus flex flex-col gap-1 px-4 py-2.5 outline-none"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <TwoIds name={p.name} mrn={p.mrn} className="text-body-s" />
                        <span className="text-caption text-muted-foreground shrink-0 tabular-nums">
                          {wait}
                        </span>
                      </span>
                      <span className="text-caption text-ink-700">
                        {shown.join(", ")}
                        {more ? ` ${Q.more(more)}` : ""} · {Q.lines(r.lineCount)} · {stock}
                      </span>
                      {(g.key === "first" && r.reasons.length) || r.changedSincePrint ? (
                        <span className="flex flex-wrap gap-1">
                          {g.key === "first"
                            ? r.reasons.slice(0, 2).map((c) => (
                                <Pill
                                  key={c}
                                  tone={c === "overridden_stop" ? "caution" : "neutral"}
                                >
                                  {REVIEW.reason[c]}
                                </Pill>
                              ))
                            : null}
                          {r.changedSincePrint ? <Pill tone="caution">{Q.changedChip}</Pill> : null}
                        </span>
                      ) : null}
                    </Link>
                    {r.earlier && canDispense ? (
                      <div className="px-4 pb-2.5">
                        <CloseNotCollectedDialog
                          lineId={r.firstLineId}
                          lede={`${p.name} · ${REVIEW.close.lede(shortDay.format(new Date(r.writtenAt)), r.lineCount)}`}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
