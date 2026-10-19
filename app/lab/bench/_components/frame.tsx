import type { loadBench } from "../_lib/bench";
import type { labV2 } from "../../_lib/places";
import type { ReactNode } from "react";

import { LABWS2 } from "@/content/lab-workspace-v2";
import { BENCH_STAGES } from "../_lib/bench";
import { FilterChips, PillTabs, SecondaryLink, SpaceHeader } from "../../_components/v2/space";
import { Queue } from "./queue";

const B = LABWS2.bench;

/**
 * The bench (prompt 5.5): stage pills with counts, section chips (the viewer's section preselected, Phase 0),
 * Downtime entry; then three panes — the queue, the work pane, and Before release with the last results. From
 * 1024 to 1279 the right pane folds under the middle; below 1024 everything stacks (5.1).
 */
export function BenchFrame({
  v2,
  bench,
  selected,
  top,
  right,
  children,
}: {
  v2: Awaited<ReturnType<typeof labV2>>;
  bench: Awaited<ReturnType<typeof loadBench>>;
  selected: string | null;
  /** Above the queue: the scan field on To receive. */
  top?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  const q = (stage: string, section: string) => {
    const p = new URLSearchParams();
    if (stage !== "to_result") p.set("stage", stage);
    if (section) p.set("section", section);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const section =
    bench.section === (v2.scope.sectionIds.length === 1 ? v2.scope.sectionIds[0] : "all")
      ? ""
      : String(bench.section);
  const counts: Record<string, number> = bench.stageCounts as Record<string, number>;
  const visibleStages = BENCH_STAGES.filter((s) => v2.tabs.bench.some((t) => t.key === s));
  const sectionWord = (t: { key: string; name: string | null }) =>
    t.key === "all"
      ? B.allSections
      : t.key === "mine"
        ? B.mySections
        : t.key === "none"
          ? B.noSection
          : (t.name ?? B.noSection);
  const workQueue = bench.stage !== "released" && bench.stage !== "rejected";
  return (
    <>
      <SpaceHeader
        tabs={
          <PillTabs
            label={B.stagesLabel}
            current={bench.stage}
            tabs={visibleStages.map((s) => ({
              key: s,
              label: B.stages[s],
              count: counts[s] ?? 0,
              href: `/lab/bench${q(s, section)}`,
            }))}
          />
        }
        chips={
          workQueue ? (
            <FilterChips
              label={B.sectionsLabel}
              current={String(bench.section)}
              chips={bench.sectionTabs.map((t) => ({
                key: String(t.key),
                label: sectionWord(t),
                count: t.count,
                href: `/lab/bench${q(bench.stage, String(t.key))}`,
              }))}
            />
          ) : undefined
        }
        note={workQueue && bench.noSectionAssigned ? B.notSectionAssigned : undefined}
        action={
          v2.tabs.bench.some((t) => t.key === "downtime") ? (
            <SecondaryLink href="/lab/bench/downtime">{B.downtime}</SecondaryLink>
          ) : undefined
        }
      />
      {workQueue ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(280px,320px)]">
          <section
            aria-label={B.queueLabel}
            className="bg-card shadow-tide-card rounded-tide-card flex min-w-0 flex-col gap-3 p-3 lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto"
          >
            {top}
            <p className="text-caption text-muted-foreground px-1">{B.queueOrder}</p>
            {bench.queue.length ? (
              <Queue
                rows={bench.queue}
                selected={selected}
                query={q(bench.stage, section)}
                procedure={bench.procedure}
                label={B.queueLabel}
              />
            ) : (
              <p className="text-body-s text-muted-foreground px-1">{B.emptyWhy}</p>
            )}
          </section>
          <div className="flex min-w-0 flex-col gap-4">{children}</div>
          {right ? (
            <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 xl:col-start-3">
              {right}
            </aside>
          ) : null}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      )}
    </>
  );
}
