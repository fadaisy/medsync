import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { fill } from "@/content/lab-workspace-v2";
import { LABWS2_DOWNTIME } from "@/content/lab-workspace-v2-downtime";
import { db } from "@/db";
import { clinicianOptions } from "@/lib/emr/read/results";
import { loadDowntime } from "@/lib/lab/downtime-store";
import { tableDate } from "@/lib/lab/field-kit";
import { labTests } from "@/lib/lab/measures-setup";
import { LAB_TIME_ZONE, requestNow } from "@/lib/lab/page-data";
import { startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { EmptyState, Panel } from "@/components/tide/work/kit";
import { PillTabs, SpaceHeader } from "@/components/tide/work/space";
import { one } from "../../_lib/place-tabs";
import { labV2 } from "../../_lib/places";
import { PrintBlankForms, RecordDowntime, RecordDrill } from "./_components/downtime-tasks";
import { EnterPaper } from "./_components/enter-paper";

export const metadata: Metadata = { title: "Downtime entry · Laboratory" };
export const dynamic = "force-dynamic";

const D = LABWS2_DOWNTIME;
const TABS = ["enter", "record", "print", "drills"] as const;
type Tab = (typeof TABS)[number];

/**
 * Downtime (prompt 5.10; Lab Phase 1 §5.9, DT-1 to DT-8 unchanged): four tasks, one per view. Enter the paper
 * forms written while MedSync was down, record the downtime, print blank numbered forms, record a drill.
 */
export default async function BenchDowntimePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live || !v2.flags.downtime) notFound();
  const scope = v2.scope;
  if (!scope.access.permissions.has("lab.result.release")) notFound();
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t === one(sp.tab)) ?? "enter";
  const now = requestNow();
  const [data, tests, clinicians] = await Promise.all([
    db.transaction((tx) =>
      loadDowntime(tx as never, scope.hospitalId, startOfLocalDay(now, LAB_TIME_ZONE)),
    ),
    tab === "enter"
      ? db.transaction((tx) => labTests(tx as never, scope.hospitalId))
      : Promise.resolve([]),
    tab === "enter" ? clinicianOptions(scope.hospitalId) : Promise.resolve([]),
  ]);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: LAB_TIME_ZONE,
  });
  const last = data.periods[0];
  const period = (p: (typeof data.periods)[number]) => ({
    from: fmt.format(p.startsAt),
    to: fmt.format(p.endsAt),
    cause: D.causes[p.reason] ?? p.reason,
  });
  const nowIso = now.toISOString();

  return (
    <div className="flex flex-col">
      <SpaceHeader
        tabs={
          <PillTabs
            label={D.tabsLabel}
            current={tab}
            tabs={TABS.map((t) => ({
              key: t,
              label: D.tabs[t],
              href: t === "enter" ? "/lab/bench/downtime" : `/lab/bench/downtime?tab=${t}`,
              count: t === "enter" ? data.unused.length : null,
              countLabel: t === "enter" ? fill(D.enterCount, { n: data.unused.length }) : undefined,
            }))}
          />
        }
        note={last ? fill(D.lastDowntime, period(last)) : D.noDowntime}
      />

      {tab === "enter" ? (
        <EnterPaper
          unused={data.unused.map((u) => u.number)}
          entered={data.entries.map((e) => ({
            key: e.reportId,
            number: e.formNumber,
            detail: fill(D.enter.enteredDetail, {
              resulted: time.format(e.resultedAt),
              entered: time.format(e.enteredAt),
              by: e.releasedOnPaperBy,
            }),
          }))}
          tests={tests.map((t) => ({ id: t.id, display: t.display }))}
          clinicians={clinicians}
          timeZone={LAB_TIME_ZONE}
          now={nowIso}
        />
      ) : null}

      {tab === "record" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title={D.record.title}>
            <RecordDowntime now={nowIso} />
          </Panel>
          <Panel title={D.record.recentTitle}>
            {data.periods.length ? (
              <ul className="text-body-s flex flex-col gap-1.5">
                {data.periods.slice(0, 5).map((p) => (
                  <li key={p.id}>{fill(D.record.recentRow, period(p))}</li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title={D.record.recentEmpty} why={D.record.recentEmptyWhy} />
            )}
          </Panel>
        </div>
      ) : null}

      {tab === "print" ? (
        <Panel
          title={D.print.title}
          note={`${D.print.why} ${fill(D.print.inStock, { n: data.unused.length })}.`}
          className="max-w-2xl"
        >
          <PrintBlankForms />
        </Panel>
      ) : null}

      {tab === "drills" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title={D.drills.title}>
            <RecordDrill now={nowIso} />
          </Panel>
          <Panel title={D.drills.pastTitle}>
            {data.drills.length ? (
              <ul className="text-body-s flex flex-col gap-2">
                {data.drills.map((d) => (
                  <li key={d.id} className="flex flex-col">
                    <span className="font-medium">{tableDate(d.heldOn)}</span>
                    <span className="text-muted-foreground">{d.participants}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title={D.drills.pastEmpty} why={D.drills.pastEmptyWhy} />
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
