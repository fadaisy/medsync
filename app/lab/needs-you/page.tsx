import type { NeedsYouFilter } from "@/lib/lab/needs-you";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { fill, LABWS2 } from "@/content/lab-workspace-v2";
import { identitiesFor } from "@/lib/emr/read/results";
import { FILTER_OF, filterNeedsYou, groupNeedsYou } from "@/lib/lab/needs-you";
import { loadNeedsYouWeek } from "@/lib/lab/needs-you-read";
import { LAB_TIME_ZONE, requestNow } from "@/lib/lab/page-data";
import { InboxRow } from "../_components/v2/inbox";
import { EmptyState, FigureValue, Panel } from "@/components/tide/work/kit";
import { FilterChips } from "@/components/tide/work/space";
import { needsYouFor } from "../_lib/needs-you";
import { one } from "../_lib/place-tabs";
import { labV2 } from "../_lib/places";

export const metadata: Metadata = { title: "Needs you · Laboratory" };

const N = LABWS2.needsYou;
const FILTERS: NeedsYouFilter[] = ["all", "results", "quality", "send_outs", "setup"];
const FILTER_WORD: Record<NeedsYouFilter, string> = {
  all: N.filters.all,
  results: N.filters.results,
  quality: N.filters.quality,
  send_outs: N.filters.sendOuts,
  setup: N.filters.setup,
};

/** Needs you (prompt 5.3; ADR 0345): one inbox for what waits on a person in the lab. */
export default async function NeedsYouPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live) notFound();
  const sp = await searchParams;
  const now = requestNow();
  const all = await needsYouFor(v2);
  const lead = v2.scope.access.permissions.has("lab.manage");
  const filters = FILTERS.filter((f) => f !== "setup" || lead);
  const f = filters.find((x) => x === one(sp.filter)) ?? "all";
  const shown = filterNeedsYou(all, f);
  const [ids, week] = await Promise.all([
    identitiesFor(
      v2.scope,
      shown.flatMap((i) => (i.patientUserId ? [i.patientUserId] : [])),
      "lab_needs_you",
    ),
    loadNeedsYouWeek(v2.scope.hospitalId, now, LAB_TIME_ZONE),
  ]);
  const counts = Object.fromEntries(
    filters.map((x) => [
      x,
      x === "all" ? all.length : all.filter((i) => FILTER_OF[i.kind] === x).length,
    ]),
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterChips
            label={N.title}
            current={f}
            chips={filters.map((x) => ({
              key: x,
              label: FILTER_WORD[x],
              count: counts[x],
              href: x === "all" ? "/lab/needs-you" : `/lab/needs-you?filter=${x}`,
            }))}
          />
          <span className="text-caption text-muted-foreground">{N.order}</span>
        </div>
        {shown.length === 0 ? (
          <EmptyState title={N.emptyTitle} why={N.emptyWhy} next={N.emptyNext} />
        ) : (
          groupNeedsYou(shown).map(({ group, items }) => (
            <Panel key={group} title={N.groups[group]} labelledBy={`ny-${group}`}>
              <ul className="divide-border -mx-1 flex flex-col divide-y">
                {items.map((i) => (
                  <InboxRow
                    key={i.key}
                    item={i}
                    now={now}
                    identity={i.patientUserId ? ids.get(i.patientUserId) : undefined}
                  />
                ))}
              </ul>
            </Panel>
          ))
        )}
      </div>
      <aside className="flex flex-col gap-4">
        <Panel title={N.weekTitle} labelledBy="ny-week">
          <dl className="flex flex-col gap-3">
            {(
              [
                [N.weekAckInTime, week.ackInTime],
                [N.weekDeltaDecided, week.deltaDecided],
                [N.weekMatchesSameDay, week.matchesSameDay],
              ] as const
            ).map(([label, s]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <dt className="text-body-s text-ink-700">{label}</dt>
                <dd className="text-body-m">
                  <FigureValue value={s ? fill(N.weekShare, { n: s.n, d: s.d }) : null} />
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title={N.whatLandsTitle} labelledBy="ny-what">
          <p className="text-body-s text-muted-foreground">{N.whatLands}</p>
        </Panel>
      </aside>
    </div>
  );
}
