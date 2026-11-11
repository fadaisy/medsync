import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState, Panel } from "@/components/tide/work/kit";
import { LABWS2 } from "@/content/lab-workspace-v2";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { repeatTasks } from "@/lib/lab/qc-store";
import { ScanReceive } from "../_components/bench-bar";
import { RepeatTasks } from "../_components/repeat-tasks";
import { one } from "../_lib/place-tabs";
import { labV2 } from "../_lib/places";
import { ncLiveFor } from "../quality/_lib/scope";
import { BenchFrame } from "./_components/frame";
import { loadBench } from "./_lib/bench";
import { RejectedView } from "./_views/rejected";
import { ReleasedView } from "./_views/released";

export const metadata: Metadata = { title: "Bench · Laboratory" };
export const dynamic = "force-dynamic";

const B = LABWS2.bench;

/** The bench (prompt 5.5; ADR 0343): the technologist's home. */
export default async function BenchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const v2 = await labV2();
  if (!v2.live || !v2.places.includes("bench")) notFound();
  const sp = await searchParams;
  const bench = await loadBench(v2, {
    stage: one(sp.stage),
    section: one(sp.section),
    patient: one(sp.patient),
  });
  const receiving = bench.stage === "to_receive" && v2.scope.access.permissions.has("lab.receive");
  const repeats =
    bench.stage === "to_result" && ncLiveFor(v2.scope.hospitalId)
      ? await db.transaction((t) => repeatTasks(t as never, v2.scope.hospitalId))
      : [];
  const repeatIds = repeats.length
    ? await identitiesFor(
        v2.scope,
        repeats.map((r) => r.patientUserId),
        "lab_worklist",
      )
    : null;
  return (
    <BenchFrame
      v2={v2}
      bench={bench}
      selected={null}
      top={
        receiving ? (
          <div className="flex flex-col gap-1">
            <h2 className="text-label text-foreground px-1">{B.scanTitle}</h2>
            <ScanReceive initial={one(sp.receive)} />
          </div>
        ) : undefined
      }
    >
      {bench.stage === "released" ? (
        <Panel>
          <ReleasedView v2 />
        </Panel>
      ) : bench.stage === "rejected" ? (
        <Panel>
          <RejectedView v2 />
        </Panel>
      ) : (
        <>
          {repeats.length && repeatIds ? (
            <RepeatTasks tasks={repeats} ids={repeatIds} base="/lab/bench" />
          ) : null}
          <EmptyState
            title={bench.queue.length ? B.pickTitle : B.emptyTitle}
            why={bench.queue.length ? B.pickWhy : B.emptyWhy}
            next={bench.queue.length ? B.pickNext : B.emptyNext}
          />
        </>
      )}
    </BenchFrame>
  );
}
