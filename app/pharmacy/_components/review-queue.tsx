"use client";

import type { PatientIdentity } from "@/components/emr/orders/model";
import type { LaneReasonCode } from "@/lib/pharmacy/lanes";
import type { ReviewLane, ReviewStage } from "@/lib/pharmacy/queue";
import type { ReviewQueueData, ReviewRow } from "@/lib/pharmacy/review/read";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { ClockIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { TabList } from "@/components/medsync/tab-list";
import { Button, buttonVariants } from "@/components/ui/button";
import { PAYMENT_WORDS, reasonList, REVIEW } from "@/content/pharmacy-review";
import { formatDuration, serverNowAt } from "@/lib/lab/turnaround";
import { LANE_REASON_ORDER } from "@/lib/pharmacy/lanes";
import { computeReviewQueue } from "@/lib/pharmacy/queue";
import { cn } from "@/lib/utils";
import { CloseNotCollectedDialog, SELECT } from "./review-dialogs";

/**
 * The review queue (5.2, artboard 1.1; wireframe §2), for a viewer at a live dispensing point with
 * `pharmacyDispensing` on. The server sends every prescription in scope with a line at a stage, its
 * lane (`lanes.ts`, the signed rule or LN-4), its least advanced stage (`lines.ts`), payment and the
 * stock summary at the acting point; this screen filters by lane, stage and point in the browser.
 * Lane counts ignore the lane filter and add up to All; stage counts are within lane and point.
 * Waiting runs on the server's clock (Law 13), in words, with no colour and no threshold.
 */

export interface ReviewQueuePayload extends ReviewQueueData {
  hospitalName: string;
  identities: Record<string, PatientIdentity>;
  actingPointId: string;
  canReview: boolean;
  canDispense: boolean;
  timeZone: string;
}

const Q = REVIEW.queue;
const TICK_MS = 30_000;
const STAGES: readonly ReviewStage[] = ["to_review", "queried", "ready", "awaiting_cosign"];

export function ReviewQueue({
  payload,
  notice,
}: {
  payload: ReviewQueuePayload;
  notice: ReactNode;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [lane, setLane] = useState<ReviewLane | "all">(
    payload.rule.signed ? "pharmacist_first" : "all",
  );
  const [stage, setStage] = useState<ReviewStage | "all">("all");
  const [pointId, setPointId] = useState<string>(payload.actingPointId);
  const serverMs = useMemo(() => new Date(payload.serverNow).getTime(), [payload.serverNow]);
  const [tick, setTick] = useState({ serverMs, now: serverMs });
  const now = tick.serverMs === serverMs ? tick.now : serverMs;

  useEffect(() => {
    const loadedAt = performance.now();
    const step = () => {
      if (document.visibilityState === "visible")
        setTick({ serverMs, now: serverNowAt(serverMs, loadedAt, performance.now()).getTime() });
    };
    const id = window.setInterval(step, TICK_MS);
    document.addEventListener("visibilitychange", step);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", step);
    };
  }, [serverMs]);

  const point = payload.points.find((p) => p.id === pointId) ?? null;
  const q = useMemo(
    () => computeReviewQueue(payload.rows, { lane, stage, serves: point?.serves ?? null }),
    [payload.rows, lane, stage, point?.serves],
  );
  const pointName = point?.name ?? Q.allPoints;
  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: payload.timeZone,
      }),
    [payload.timeZone],
  );
  const tableId = useId();
  const identity = (r: ReviewRow) =>
    payload.identities[r.patientUserId] ?? { name: "Name withheld", mrn: "", ageSex: "" };
  const minutes = (iso: string) => formatDuration((now - new Date(iso).getTime()) / 60_000);
  const mayReview = (r: ReviewRow) =>
    r.stage !== "awaiting_cosign" &&
    (payload.canReview || (payload.canDispense && r.lane === "standard"));

  const lanes = payload.rule.signed
    ? (["pharmacist_first", "standard", "all"] as const)
    : (["all"] as const);
  const footer = REVIEW.fill(Q.footer, {
    n: q.shown,
    N: q.total,
    point: pointName,
    lane: REVIEW.laneInFooter[lane],
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader
        place={`${payload.hospitalName} · ${REVIEW.queue.title}`}
        placeInTopBar
        title={Q.title}
        right={
          <>
            <span className="text-body-s text-muted-foreground">
              {Q.updated} <span className="font-mono tabular-nums">{fmt.format(serverMs)}</span>
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={refreshing}
              onClick={() => startRefresh(() => router.refresh())}
            >
              {Q.refresh}
            </Button>
          </>
        }
      />
      {notice}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <TabList
          label={Q.laneLabel}
          controls={tableId}
          value={lane}
          options={lanes.map((l) => ({ value: l, label: REVIEW.lane[l], count: q.laneCounts[l] }))}
          onChange={setLane}
        />
        <span className="flex-1" />
        <label className="flex items-center">
          <span className="sr-only">{Q.pointLabel}</span>
          <select
            value={pointId}
            onChange={(e) => setPointId(e.target.value)}
            className={cn(SELECT, "w-auto sm:min-h-9")}
          >
            {[
              ...payload.points.filter((p) => p.id === payload.actingPointId),
              ...payload.points.filter((p) => p.id !== payload.actingPointId),
            ].map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="">{Q.allPoints}</option>
          </select>
        </label>
      </div>
      <TabList
        label={Q.stageLabel}
        controls={tableId}
        value={stage}
        options={[
          { value: "all" as const, label: REVIEW.stage.all, count: q.stageCounts.all },
          ...STAGES.map((s) => ({ value: s, label: REVIEW.stage[s], count: q.stageCounts[s] })),
        ]}
        onChange={setStage}
      />

      <div id={tableId} className="border-border bg-card overflow-x-auto rounded-lg border">
        <table className="text-body-s w-full">
          <caption className="sr-only">{`${Q.title}: ${REVIEW.lane[lane]}, ${pointName}`}</caption>
          <thead className="text-caption text-muted-foreground border-border border-b text-left">
            <tr>
              <th className="px-3 py-2 font-medium">{Q.columns.patient}</th>
              <th className="px-3 py-2 font-medium">{Q.columns.medicines}</th>
              <th className="px-3 py-2 font-medium">{Q.columns.why}</th>
              <th className="px-3 py-2 font-medium">{Q.columns.stage}</th>
              <th className="px-3 py-2 font-medium">{Q.columns.waiting}</th>
              <th className="px-3 py-2 font-medium">{Q.columns.payment}</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">{Q.columns.action}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {q.today.length === 0 && q.earlier.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground px-3 py-8 text-center">
                  {REVIEW.fill(Q.empty, { point: pointName })}
                </td>
              </tr>
            ) : null}
            {q.today.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="px-3 py-3">
                  <PatientCell id={`p-${r.key}`} who={identity(r)} row={r} />
                </td>
                <td className="px-3 py-3">
                  <MedicinesCell id={`m-${r.key}`} row={r} />
                </td>
                <td className="px-3 py-3">
                  {r.lane === "pharmacist_first" ? <Reasons reasons={r.reasons} /> : null}
                </td>
                <td className="px-3 py-3">
                  <StageCell row={r} minutes={minutes} />
                </td>
                <td className="px-3 py-3 font-mono whitespace-nowrap tabular-nums">
                  {minutes(r.writtenAt)}
                </td>
                <td className="px-3 py-3">
                  {r.payment ? PAYMENT_WORDS[r.payment] : PAYMENT_WORDS.not_recorded}
                </td>
                <td className="px-3 py-3 text-right">
                  <Control row={r} review={mayReview(r)} />
                </td>
              </tr>
            ))}
            {q.earlier.length ? (
              <tr>
                <th
                  colSpan={7}
                  scope="rowgroup"
                  className="bg-muted text-label px-3 py-2 text-left font-medium"
                >
                  {Q.earlier}
                </th>
              </tr>
            ) : null}
            {q.earlier.map((r) => (
              <tr key={r.key} className="align-top">
                <td className="px-3 py-3">
                  <PatientCell id={`p-${r.key}`} who={identity(r)} row={r} />
                </td>
                <td className="px-3 py-3">
                  <MedicinesCell id={`m-${r.key}`} row={r} />
                </td>
                <td className="px-3 py-3">
                  {r.lane === "pharmacist_first" ? <Reasons reasons={r.reasons} /> : null}
                </td>
                <td className="px-3 py-3">
                  <StageCell row={r} minutes={minutes} />
                </td>
                <td className="px-3 py-3 font-mono whitespace-nowrap tabular-nums">
                  {Q.age(r.ageDays)}
                </td>
                <td className="px-3 py-3">
                  {r.payment ? PAYMENT_WORDS[r.payment] : PAYMENT_WORDS.not_recorded}
                </td>
                <td className="px-3 py-3">
                  <span className="flex flex-wrap justify-end gap-2">
                    <Control row={r} review={mayReview(r)} />
                    {payload.canDispense ? (
                      <CloseNotCollectedDialog
                        lineId={r.firstLineId}
                        lede={`${identity(r).name} · ${REVIEW.close.lede(
                          new Intl.DateTimeFormat("en-GB", {
                            day: "2-digit",
                            month: "short",
                            timeZone: payload.timeZone,
                          }).format(new Date(r.writtenAt)),
                          r.lineCount,
                        )}`}
                      />
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-body-s text-muted-foreground">{footer}</p>
      <LaneExplainer rule={payload.rule} />
    </div>
  );
}

function PatientCell({ id, who, row }: { id: string; who: PatientIdentity; row: ReviewRow }) {
  return (
    <span className="inline-flex min-w-36 flex-col">
      <span id={id} className="text-foreground font-medium">
        {who.name}
      </span>
      <span className="text-muted-foreground font-mono text-[12px] tabular-nums">{who.mrn}</span>
      <span className="text-muted-foreground text-caption">
        {[row.from, row.prescriberCadre].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

function MedicinesCell({ id, row }: { id: string; row: ReviewRow }) {
  const shown = row.medicines.length > 3 ? row.medicines.slice(0, 2) : row.medicines;
  const more = row.medicines.length - shown.length;
  const stock = row.notOnShelf
    ? Q.stock.some(row.notOnShelf)
    : row.notCounted
      ? Q.stock.notCounted
      : Q.stock.all;
  return (
    <span className="inline-flex flex-col">
      <span id={id}>
        {shown.join(", ")}
        {more ? <span className="text-muted-foreground"> {Q.more(more)}</span> : null}
      </span>
      <span className="text-muted-foreground text-caption">
        {Q.lines(row.lineCount)} · {stock}
      </span>
    </span>
  );
}

/** Up to two reasons, most serious first, then "+n"; an overridden stop is amber with an icon. */
function Reasons({ reasons }: { reasons: readonly LaneReasonCode[] }) {
  const shown = reasons.slice(0, 2);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {shown.map((c) => (
        <StatusWord key={c} tone={c === "overridden_stop" ? "caution" : "neutral"}>
          {REVIEW.reason[c]}
        </StatusWord>
      ))}
      {reasons.length > 2 ? (
        <span className="text-muted-foreground text-caption">{Q.more(reasons.length - 2)}</span>
      ) : null}
    </span>
  );
}

function StageCell({ row, minutes }: { row: ReviewRow; minutes: (iso: string) => string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {row.stage === "awaiting_cosign" ? (
        <StatusWord tone="caution" glyph={ClockIcon}>
          {REVIEW.stage.awaiting_cosign}
        </StatusWord>
      ) : (
        <StatusWord tone="neutral">
          {row.stage === "queried" && row.queriedSince
            ? REVIEW.queriedFor(minutes(row.queriedSince))
            : REVIEW.stage[row.stage]}
        </StatusWord>
      )}
      {row.changedSincePrint ? <StatusWord tone="caution">{Q.changedChip}</StatusWord> : null}
    </span>
  );
}

/** The row's one control: Review for a viewer who may review this lane, Open otherwise (5.2). */
function Control({ row, review }: { row: ReviewRow; review: boolean }) {
  const id = `o-${row.key}`;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Link
        id={id}
        href={`/pharmacy/prescriptions/${encodeURIComponent(row.key)}`}
        prefetch={false}
        aria-labelledby={`${id} p-${row.key} m-${row.key}`}
        className={buttonVariants({
          variant: review ? "primary" : "secondary",
          size: "md",
          className: "min-h-11 sm:min-h-0",
        })}
      >
        {review ? Q.review : Q.open}
      </Link>
      {row.stage === "awaiting_cosign" ? (
        <span className="text-caption text-muted-foreground">{Q.cannotSupplyYet}</span>
      ) : null}
    </span>
  );
}

function LaneExplainer({ rule }: { rule: ReviewQueueData["rule"] }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-heading-s font-medium">{Q.explainerTitle}</h2>
      {rule.signed ? (
        <>
          <p className="text-body-s">
            {REVIEW.fill(Q.explainer, {
              reasons: reasonList(
                LANE_REASON_ORDER.filter((c) => rule.reasonsOn.includes(c)).map(
                  (c) => REVIEW.reasonPhrase[c],
                ),
              ),
            })}
          </p>
          {rule.highRiskSigned ? null : <p className="text-body-s">{Q.noHighRisk}</p>}
        </>
      ) : (
        <p className="text-body-s">{Q.noRule}</p>
      )}
    </section>
  );
}
