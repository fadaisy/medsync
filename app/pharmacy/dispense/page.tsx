import type { ReviewLane, ReviewStage } from "@/lib/pharmacy/queue";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/tide/work/kit";
import { FilterChips, PrimaryLink, SpaceHeader } from "@/components/tide/work/space";
import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_WINDOW } from "@/content/pharmacy-workspace-v2-window";
import { identitiesFor } from "@/lib/emr/read/results";
import { can } from "@/lib/pharmacy/access";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { countSheetsToEnter } from "@/lib/pharmacy/downtime-store";
import { dispensingNavCountsFor } from "@/lib/pharmacy/page-data";
import { computeReviewQueue, servesRow } from "@/lib/pharmacy/queue";
import { getReviewQueue } from "@/lib/pharmacy/review/read";
import { isLive } from "@/lib/pharmacy/write";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { tabOf } from "@/lib/pharmacy/ia";
import { LimitsLine } from "../_components/v2/limits-line";
import { PageTabs } from "../_components/page-tabs";
import { pharmacyFlagsFor, pharmacyScope } from "../_lib/v2";
import { OpenLinesBody } from "../open-lines/body";
import { QueueBody } from "../body";
import { PrescriptionBody } from "../prescriptions/[key]/body";
import { SuppliedBody } from "../supplied/body";
import { OpenView, ReadyView } from "../window/_components/views";
import { QueueList } from "../window/_components/queue-list";
import { pick, queueGroups } from "../window/_lib/groups";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const W = PHWS2_WINDOW;
const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DEFAULT_TIME_ZONE,
});
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Dispense (rework PRD §6.2): Waiting, Ready to collect, Owed and Handed over. A prescription is one screen: the
 * review body with the checks panel, then the hand-over. Refills moved to Patients › Outpatients.
 */
export default async function DispensePage({ searchParams }: { searchParams: Promise<SP> }) {
  const scope = await pharmacyScope();
  const flags = pharmacyFlagsFor(scope.hospitalId);
  const sp = await searchParams;
  const view = tabOf("dispense", sp.tab);

  // The review queue exists where dispensing is on and the acting point is live (5.2).
  const actor = flags.dispensing ? await requirePharmacyActor() : null;
  const point = actor?.points.find((p) => p.id === actor.pointId) ?? null;
  const reviewMode = !!point && isLive(point);
  const [review, nav, sheets] = await Promise.all([
    reviewMode ? getReviewQueue(scope.hospitalId, point.id) : null,
    flags.dispensing ? dispensingNavCountsFor(scope.hospitalId, actor?.pointId ?? null) : null,
    flags.downtime ? countSheetsToEnter(scope.hospitalId) : 0,
  ]);
  const actingServes = review?.points.find((p) => p.id === point?.id)?.serves ?? null;
  const atPoint = review
    ? computeReviewQueue(review.rows, { lane: "all", stage: "all", serves: actingServes })
    : null;

  const counts = {
    waiting: atPoint?.total ?? null,
    ready: atPoint?.stageCounts.ready ?? null,
    owed: nav?.open ?? null,
    done: nav?.supplied ?? null,
  };
  const hrefWith = (over: SP) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) {
      const s = one(v);
      if (s) q.set(k, s);
    }
    return `/pharmacy/dispense?${q}`;
  };

  const header = (chips?: ReactNode) => (
    <SpaceHeader
      tabs={<PageTabs page="dispense" current={view} counts={counts} />}
      action={
        sheets > 0 ? <PrimaryLink href="/pharmacy/records?tab=sheets">{fill(W.downtime, { n: sheets })}</PrimaryLink> : null
      }
      chips={chips}
      note={
        <>
          {fill(W.asOf, { time: time.format(new Date()) })} ·{" "}
          <Link href={hrefWith({})} className="text-primary underline-offset-2 hover:underline">
            {W.refresh}
          </Link>
        </>
      }
    />
  );

  // Queue, Phase 0: a point that is not live keeps the old queue, unchanged.
  if (view === "waiting" && !review)
    return (
      <div className="flex flex-col gap-3">
        {header()}
        <QueueBody searchParams={Promise.resolve({ period: one(sp.period), lane: one(sp.lane), state: one(sp.state), from: one(sp.from), sort: one(sp.sort) })} />
      </div>
    );

  if (view === "waiting" && review) {
    const Q = W.queue;
    const signed = review.rule.signed;
    const lane = pick<ReviewLane | "all">(sp.lane, signed ? ["pharmacist_first", "standard", "all"] : ["all"], signed ? "pharmacist_first" : "all");
    const stage = pick<ReviewStage | "all">(sp.stage, ["all", "to_review", "queried", "awaiting_cosign", "ready"], "all");
    const pointKey = one(sp.point) ?? point!.id;
    const chosen = review.points.find((p) => p.id === pointKey) ?? null;
    const g = queueGroups(review.rows, { lane, stage, serves: chosen?.serves ?? null, signed });
    const rx = one(sp.rx) ?? null;
    const shownRows = g.groups.flatMap((x) => x.rows);
    const ids = await identitiesFor(scope, shownRows.map((r) => r.patientUserId), "pharmacy_queue");
    const chips = (
      <div className="flex flex-col gap-2">
        {signed ? (
          <FilterChips
            label={Q.laneLabel}
            current={lane}
            chips={(["pharmacist_first", "standard", "all"] as const).map((l) => ({
              key: l,
              label: Q.lanes[l],
              href: hrefWith({ lane: l }),
              count: g.laneCounts[l],
            }))}
          />
        ) : null}
        <FilterChips
          label={Q.stageLabel}
          current={stage}
          chips={(["all", "to_review", "queried", "awaiting_cosign", "ready"] as const).map((s) => ({
            key: s,
            label: Q.stages[s],
            href: hrefWith({ stage: s }),
            count: g.stageCounts[s],
          }))}
        />
        {review.points.length > 1 ? (
          <FilterChips
            label={Q.pointLabel}
            current={chosen?.id ?? "all"}
            chips={[
              ...review.points.map((p) => ({ key: p.id, label: p.name, href: hrefWith({ point: p.id }) })),
              { key: "all", label: Q.allPoints, href: hrefWith({ point: "all" }) },
            ]}
          />
        ) : null}
      </div>
    );
    return (
      <div className="flex flex-col gap-3">
        {header(chips)}
        <LimitsLine hospitalId={scope.hospitalId} />
        <div className="grid items-start gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <QueueList
            groups={g.groups}
            total={g.shown}
            identities={Object.fromEntries(ids)}
            selected={rx}
            hrefFor={(key) => hrefWith({ rx: key })}
            serverNowMs={new Date(review.serverNow).getTime()}
            canDispense={can(actor!.access, "pharmacy.dispense")}
            pointName={chosen?.name ?? Q.allPoints}
          />
          <div className="min-w-0">
            {rx ? (
              <PrescriptionBody rxKey={rx} embedded />
            ) : (
              <EmptyState title={Q.pick} why={Q.pickWhy} />
            )}
          </div>
        </div>
      </div>
    );
  }

  let chips: ReactNode;
  let content: ReactNode;
  if (view === "done") content = <SuppliedBody searchParams={Promise.resolve({ day: one(sp.day) })} />;
  else if (view === "owed") {
    if (!actor) notFound();
    const all = one(sp.list) === "all";
    chips = (
      <FilterChips
        label={W.open.viewLabel}
        current={all ? "all" : "grouped"}
        chips={[
          { key: "grouped", label: W.open.grouped, href: hrefWith({ list: "" }) },
          { key: "all", label: W.open.all, href: hrefWith({ list: "all" }) },
        ]}
      />
    );
    content = all ? <OpenLinesBody /> : <OpenView scope={scope} actor={actor} hrefAll={hrefWith({ list: "all" })} />;
  } else
    content = review ? (
      <ReadyView
        scope={scope}
        rows={review.rows.filter((r) => r.stage === "ready" && servesRow(actingServes, r.origin))}
        canDispense={can(actor!.access, "pharmacy.dispense")}
        serverNow={review.serverNow}
      />
    ) : (
      <EmptyState title={W.ready.notLive} why={W.ready.notLiveWhy} />
    );
  return (
    <div className="flex flex-col gap-3">
      {header(chips)}
      {content}
    </div>
  );
}
