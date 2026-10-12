"use client";

import type { BatchChoice } from "./supply-dialogs";
import type { ReviewData, ReviewLineView, ReviewQueryView } from "@/lib/pharmacy/review/read";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ClockIcon, TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COSIGN_CAUTION, OVERRIDE_CAUTION, PHARMACY } from "@/content/pharmacy";
import {
  NOT_SUPPLIED_REASONS,
  PAYMENT_WORDS,
  QUERY_CODES,
  REVIEW,
} from "@/content/pharmacy-review";
import { expiryText, STOCK } from "@/content/pharmacy-stock";
import { SUPPLY } from "@/content/pharmacy-supply";
import { WAITING_FOR_PHARMACIST } from "@/lib/pharmacy/review/review";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import * as actions from "../review-actions";
import { FoundDialog } from "../stock/_components/stock-dialogs";
import {
  ActionButton,
  DeclineDialog,
  PaymentDialog,
  PhoneDialog,
  Refusal,
  SELECT,
  TARGET,
  TEXTAREA,
  WithdrawDialog,
  WithoutPharmacistDialog,
} from "./review-dialogs";
import { ChangeDialog } from "./supply-dialogs";

/**
 * One prescription at a live dispensing point (5.3, artboard 1.2; wireframes §3, §4.1, §5.1). Left:
 * the lines, each with its own stage, shelf, acceptance and one decision (a radio group with the
 * medicine in its legend). Right: the checks that came with it, then the query form (a region with a
 * heading; focus moves into it). A technician sees a pharmacist-first line read-only, "Waiting for a
 * pharmacist" (S13). The quantity is never pre-filled (SU-6). Nothing here moves stock: decisions are
 * staged, and the hand-over (Step 6) records the supply.
 */

export interface ReviewScreenProps {
  data: ReviewData;
  canReview: boolean;
  canDispense: boolean;
  /** `pharmacy.stock`: "Add a batch found on the shelf" (5.3.1). */
  canStock?: boolean;
  prescribers: { userId: string; label: string }[];
  patientListOn: boolean;
  timeZone: string;
}

type Choice = "full" | "part" | "not_on_shelf" | "ask";
interface Draft {
  choice: Choice | null;
  quantity: string;
  now: string;
  notSupplied: string;
  rest: "owed" | "buying_outside";
  /** SU-7: why the rest is not supplied now. */
  reason: string;
  days: string;
  /** 5.3.1: a product or batch chosen in the Change dialog. */
  batch: BatchChoice | null;
}
const EMPTY: Draft = {
  choice: null,
  quantity: "",
  now: "",
  notSupplied: "",
  rest: "owed",
  reason: "",
  days: "",
  batch: null,
};
const R = REVIEW.review;
const newKey = () => crypto.randomUUID();
const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : undefined);

export function ReviewScreen(props: ReviewScreenProps) {
  const { data, canReview, canDispense, timeZone } = props;
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [panel, setPanel] = useState<string | null>(null);
  const [about, setAbout] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone });
  const draft = (id: string) => drafts[id] ?? EMPTY;
  const patch = (id: string, p: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? EMPTY), ...p } }));

  const live = data.lines.filter(
    (l) => !(l.status?.kind === "closed" && l.status.outcome === "replaced"),
  );
  const withOutcome = live.filter((l) => l.status && l.status.kind !== "stage").length;
  const pf = data.lane === "pharmacist_first";
  const reviewOnly = data.scope === "review_only";
  const remaining = live.filter(
    (l) =>
      l.status?.kind === "stage" &&
      l.status.stage === "to_review" &&
      l.need === "accept_remaining" &&
      !l.basis,
  );
  const lineNo = new Map(data.lines.map((l, i) => [l.id, i + 1]));
  // 5.3: Continue once at least one line is to be supplied and every other line has a decision, an
  // outcome or an open query. A controlled line goes to the controlled supply with the rest (CD-2).
  const staged = (l: ReviewLineView) =>
    l.status?.kind === "stage" && l.status.stage === "ready" && !!l.staged;
  const toSupply = live.filter(staged);
  const waiting = live.filter(
    (l) => l.status?.kind === "stage" && l.status.stage !== "queried" && !staged(l),
  );
  const canContinue = canDispense && data.pointLive && toSupply.length > 0 && !waiting.length;

  const choose = (line: ReviewLineView, c: Choice) => {
    patch(line.id, { choice: c });
    if (c === "not_on_shelf") setPanel(line.id);
    if (c === "ask") setAbout(line.id);
  };

  const save = () => {
    const decisions = live.flatMap((l) => {
      const d = draft(l.id);
      const q = d.choice === "full" ? int(d.quantity) : int(d.now);
      // A batch choice stands only for the quantity it was made for.
      const chosen =
        d.batch && d.batch.batches.reduce((s, r) => s + r.quantity, 0) === q
          ? {
              productId: d.batch.productId,
              batches: d.batch.batches,
              batchChoiceReason: d.batch.reason,
            }
          : {};
      if (d.choice === "full" && q)
        return [{ lineId: l.id, kind: "full", quantity: q, daysCovered: int(d.days), ...chosen }];
      if (d.choice === "part" && q)
        return [
          {
            lineId: l.id,
            kind: "part",
            quantity: q,
            notSupplied: int(d.notSupplied),
            rest: d.rest,
            reasonCode: d.reason || undefined,
            daysCovered: int(d.days),
            ...chosen,
          },
        ];
      return [];
    });
    if (!decisions.length) return setError(R.nothingToSave);
    start(async () => {
      const r = await actions.saveLineDecisions({ clientKey: newKey(), decisions });
      if (r.ok) {
        setError(null);
        setSaved(R.saved);
        setDrafts({});
        router.refresh();
      } else setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-body-s inline-flex flex-wrap items-center gap-2">
          <StatusWord tone="neutral">{REVIEW.lane[data.lane]}</StatusWord>
          {data.laneReasons.map((c) => (
            <StatusWord key={c} tone={c === "overridden_stop" ? "caution" : "neutral"}>
              {REVIEW.reason[c]}
            </StatusWord>
          ))}
        </span>
        <span className="flex-1" />
        <span className="text-body-s inline-flex items-center gap-2">
          <span className="text-muted-foreground">{R.payment}:</span>
          {PAYMENT_WORDS[data.payment?.status ?? "not_recorded"]}
          {data.payment?.detail ? (
            <span className="text-muted-foreground">({data.payment.detail})</span>
          ) : null}
          {canDispense && data.pointLive ? <PaymentDialog lineId={data.firstLineId} /> : null}
        </span>
      </div>
      {data.changedSincePrint ? <CautionNotice lead={REVIEW.queue.changedSincePrinting} /> : null}
      {data.cosignAwaiting ? (
        <CautionNotice lead={R.cosignLead}>{COSIGN_CAUTION.text}</CautionNotice>
      ) : null}
      {reviewOnly ? <CautionNotice tone="neutral" lead={R.ward} /> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col gap-4">
          <ol className="border-border bg-card divide-border flex flex-col divide-y rounded-lg border">
            {data.lines.map((l) => (
              <li key={l.id} className="flex flex-col gap-3 px-4 py-4">
                <LineHead line={l} n={lineNo.get(l.id)!} time={time} data={data} />
                <LineBody line={l} day={day} time={time} pointName={data.pointName} />
                <LineQueries
                  queries={data.queries.filter(
                    (q) => q.scope === "line" && q.lineIds.includes(l.id),
                  )}
                  can={canDispense || canReview}
                  prescribers={props.prescribers}
                  timeZone={timeZone}
                />
                <LineActions
                  line={l}
                  data={data}
                  canReview={canReview}
                  canDispense={canDispense}
                  draft={draft(l.id)}
                  patch={(p) => patch(l.id, p)}
                  choose={(c) => choose(l, c)}
                  time={time}
                  canStock={!!props.canStock}
                />
                {panel === l.id ? (
                  <NotOnShelf
                    line={l}
                    data={data}
                    patientListOn={props.patientListOn}
                    day={day}
                    onClose={() => {
                      setPanel(null);
                      patch(l.id, { choice: null });
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ol>
          {data.queries.some((q) => q.scope === "prescription") ? (
            <LineQueries
              title={REVIEW.query.whole}
              queries={data.queries.filter((q) => q.scope === "prescription")}
              can={canDispense || canReview}
              prescribers={props.prescribers}
              timeZone={timeZone}
            />
          ) : null}
          {pf && canReview && remaining.length ? (
            <span className="inline-flex flex-wrap items-center gap-3">
              <ActionButton
                label={R.acceptRemaining}
                run={(clientKey) =>
                  actions.acceptRemainingLines({ clientKey, lineId: remaining[0]!.id })
                }
              />
              <span className="text-caption text-muted-foreground">
                {R.acceptRemainingHint(remaining.length)}
              </span>
            </span>
          ) : null}
          <p className="text-body-s text-muted-foreground">{R.substitutionUnsigned}</p>
          <p className="text-body-s">{R.footer(withOutcome, live.length)}</p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Refusal error={error} />
            {saved && !error ? (
              <span role="status" className="text-body-s text-muted-foreground">
                {saved}
              </span>
            ) : null}
            {canDispense && !reviewOnly ? (
              <Button
                type="button"
                variant="secondary"
                className={TARGET}
                disabled={pending}
                onClick={save}
              >
                {R.saveDecisions}
              </Button>
            ) : null}
            {!reviewOnly && canContinue ? (
              <Link
                href={`/pharmacy/prescriptions/${encodeURIComponent(data.key)}/handover`}
                prefetch={false}
                className={buttonVariants({
                  variant: "primary",
                  size: "md",
                  className: "min-h-11",
                })}
              >
                {R.handover}
              </Link>
            ) : !reviewOnly ? (
              <span className="inline-flex flex-col items-end">
                <Button type="button" className={TARGET} disabled aria-describedby="handover-next">
                  {R.handover}
                </Button>
                <span id="handover-next" className="text-caption text-muted-foreground">
                  {R.handoverNext}
                </span>
              </span>
            ) : null}
          </div>
          <Link
            href="/pharmacy"
            className="text-body-s self-start font-medium text-teal-700 underline-offset-4 hover:underline"
          >
            {R.back}
          </Link>
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card title={R.checksTitle}>
            {data.lines.some((l) => l.checks.length) ? (
              <ul className="text-body-s flex flex-col gap-2">
                {data.lines.flatMap((l) =>
                  l.checks.map((c) => (
                    <li key={`${l.id}-${c.code}`} className="flex items-start gap-2">
                      <StatusWord tone={c.level === "stop" ? "caution" : "neutral"}>
                        {PHARMACY.view.level[c.level]}
                      </StatusWord>
                      <span>
                        {c.title}, {l.input.drugName}.
                        {c.answer ? (
                          <span className="text-muted-foreground block">“{c.answer}”</span>
                        ) : null}
                      </span>
                    </li>
                  )),
                )}
              </ul>
            ) : (
              <p className="text-body-s text-muted-foreground">{R.noChecks}</p>
            )}
            <p className="text-body-s">
              <span className="text-muted-foreground">{R.notCheckedTitle}: </span>
              {R.notChecked}
            </p>
          </Card>
          {(canDispense || canReview) && data.pointLive ? (
            <QueryForm data={data} about={about} setAbout={setAbout} lineNo={lineNo} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-border bg-card rounded-lg border">
      <h2 className="border-border text-heading-s border-b px-4 py-3 font-medium">{title}</h2>
      <div className="flex flex-col gap-2 px-4 py-3">{children}</div>
    </div>
  );
}

type Fmt = Intl.DateTimeFormat;

function stageWord(l: ReviewLineView) {
  const s = l.status;
  if (!s) return null;
  if (s.kind === "stage")
    return s.stage === "awaiting_cosign" ? (
      <StatusWord tone="caution" glyph={ClockIcon}>
        {REVIEW.stage.awaiting_cosign}
      </StatusWord>
    ) : (
      <StatusWord tone="neutral">{REVIEW.stage[s.stage]}</StatusWord>
    );
  return <StatusWord tone="neutral">{R.outcomeLine(REVIEW.outcome[s.outcome])}</StatusWord>;
}

function LineHead({
  line,
  n,
  time,
  data,
}: {
  line: ReviewLineView;
  n: number;
  time: Fmt;
  data: ReviewData;
}) {
  const r = line.input;
  const replaced = line.status?.kind === "closed" && line.status.outcome === "replaced";
  const prior = line.replaces ? data.lines.find((x) => x.id === line.replaces) : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-muted-foreground font-mono tabular-nums">{prior ? `${n}` : n}</span>
        {replaced ? <span className="sr-only">{R.replacedSr}</span> : null}
        <span className={replaced ? "line-through" : undefined}>
          <span className="text-foreground font-medium">{r.drugName}</span>
          {r.concentration ? (
            <span className="text-muted-foreground"> · {r.concentration}</span>
          ) : null}
        </span>
        {r.controlled ? <StatusWord tone="neutral">{PHARMACY.view.controlled}</StatusWord> : null}
        <span className="flex-1" />
        {r.indication ? (
          <span className="text-body-s text-muted-foreground">
            {R.forProblem}: {r.indication}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span className="sr-only">{R.stage}:</span>
          {stageWord(line)}
        </span>
      </div>
      {replaced && line.replacedAt ? (
        <p className="text-body-s">
          <StatusWord tone="caution" glyph={TriangleAlertIcon}>
            {R.changed(r.drugName, time.format(new Date(line.replacedAt)))}
          </StatusWord>
        </p>
      ) : null}
    </div>
  );
}

/** Law 7: each stored field as stored, never joined into new words. */
function LineBody({
  line,
  day,
  time,
  pointName,
}: {
  line: ReviewLineView;
  day: Fmt;
  time: Fmt;
  pointName: string | null;
}) {
  const r = line.input;
  const replaced = line.status?.kind === "closed" && line.status.outcome === "replaced";
  const fields: [string, string | null][] = [
    [R.directions, [r.dose, r.route, r.frequency].filter(Boolean).join(" · ")],
    [PHARMACY.view.duration, r.duration],
    [PHARMACY.view.quantity, r.quantity],
    [PHARMACY.view.instructions, r.instructions],
  ];
  const s = line.shelf;
  const unit = s?.issueUnit ?? "";
  return (
    <div className={`flex flex-col gap-2 ${replaced ? "line-through" : ""}`}>
      <dl className="text-body-s grid gap-x-6 gap-y-1 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        {fields
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <dt className="text-muted-foreground text-caption">{k}</dt>
              <dd className="whitespace-pre-wrap">{v}</dd>
            </div>
          ))}
      </dl>
      {line.overriddenStops.length ? (
        <CautionNotice
          lead={OVERRIDE_CAUTION.lead.replace("{check}", line.overriddenStops.join(", "))}
        >
          {OVERRIDE_CAUTION.body.replace("{reasons}", r.reasons ?? PHARMACY.view.notRecorded)}
        </CautionNotice>
      ) : null}
      {line.suppliedEarlier ? (
        <p className="text-body-s">
          {R.alreadySupplied(
            `${line.suppliedEarlier.quantity} ${unit}`.trim(),
            day.format(new Date(line.suppliedEarlier.at)),
          )}
        </p>
      ) : null}
      {s && !replaced && line.status?.kind !== "closed" ? (
        <dl className="text-body-s grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div className="flex flex-col">
            <dt className="text-muted-foreground text-caption">{R.onShelf}</dt>
            <dd className="font-mono tabular-nums">
              {s.state === "no_product"
                ? R.noProduct(pointName ?? "")
                : s.state === "not_counted"
                  ? R.notCounted
                  : s.state === "out"
                    ? s.outSince
                      ? R.outSince(day.format(new Date(s.outSince)))
                      : R.out
                    : s.lastCounted
                      ? R.onShelfCounted(
                          s.quantity,
                          unit,
                          `${day.format(new Date(s.lastCounted))} ${time.format(new Date(s.lastCounted))}`,
                        )
                      : R.onShelfNoCount(s.quantity, unit)}
            </dd>
          </div>
          {s.firstBatch ? (
            <div className="flex flex-col">
              <dt className="text-muted-foreground text-caption">{R.batchFirst}</dt>
              <dd className="font-mono tabular-nums">
                {R.batchLine(s.firstBatch.batchNumber, expiryText(s.firstBatch))}
              </dd>
            </div>
          ) : null}
          {line.elsewhere.length ? (
            <div className="flex flex-col">
              <dt className="text-muted-foreground text-caption">{R.elsewhere}</dt>
              <dd>{line.elsewhere.join(", ")}</dd>
            </div>
          ) : null}
          {s.expired.map((b) => (
            <div key={b.batchNumber} className="sm:col-span-2">
              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                {b.batchNumber}:{" "}
                {STOCK.expiredRemove(expiryText({ expiry: b.expiry, expiryMonthOnly: false }))}
              </StatusWord>
            </div>
          ))}
        </dl>
      ) : null}
      {line.status?.kind === "open" && line.outcomeReason ? (
        <p className="text-body-s text-muted-foreground">
          {NOT_SUPPLIED_REASONS[line.outcomeReason as keyof typeof NOT_SUPPLIED_REASONS] ??
            line.outcomeReason}
        </p>
      ) : null}
      {line.stockAnswer ? (
        <p className="text-body-s text-muted-foreground">{line.stockAnswer}</p>
      ) : null}
    </div>
  );
}

function LineQueries({
  title,
  queries,
  can,
  prescribers,
  timeZone,
}: {
  title?: string;
  queries: ReviewQueryView[];
  can: boolean;
  prescribers: { userId: string; label: string }[];
  timeZone: string;
}) {
  if (!queries.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {title ? <h3 className="text-label font-medium">{title}</h3> : null}
      {queries.map((q) => (
        <div key={q.id} className="bg-muted flex flex-col gap-1.5 rounded-md px-3 py-2">
          <p className="text-body-s">
            {q.caution ? (
              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                {q.words}
              </StatusWord>
            ) : (
              q.words
            )}
          </p>
          <p className="text-caption text-muted-foreground">
            {REVIEW.query.sentToType(QUERY_CODES[q.type as keyof typeof QUERY_CODES] ?? q.type)}
            {q.patientWaiting ? ` · ${REVIEW.query.patientWaitingWord}` : ""} · “{q.proposal}”
          </p>
          {can && (q.state === "open" || q.state === "not_sent") ? (
            <span className="flex flex-wrap gap-2">
              <PhoneDialog queryId={q.id} prescribers={prescribers} timeZone={timeZone} />
              <WithdrawDialog queryId={q.id} />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LineActions({
  line,
  data,
  canReview,
  canDispense,
  draft,
  patch,
  choose,
  time,
  canStock,
}: {
  time: Fmt;
  canStock: boolean;
  line: ReviewLineView;
  data: ReviewData;
  canReview: boolean;
  canDispense: boolean;
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  choose: (c: Choice) => void;
}) {
  const legend = useId();
  const s = line.status;
  if (s?.kind !== "stage" || !data.pointLive) return null;
  const pf = data.lane === "pharmacist_first";
  const reviewOnly = data.scope === "review_only";
  const accepted = !!line.basis;
  const toReview = s.stage === "to_review";
  const queried = data.queries.some((q) => q.lineIds.includes(line.id));
  const decidable = canDispense && !reviewOnly && (s.stage === "ready" || (toReview && !pf));
  const unit = line.shelf?.issueUnit ?? "units";
  const name = line.input.drugName;
  return (
    <div className="flex flex-col gap-3">
      {line.basis ? (
        <p className="text-caption text-muted-foreground">
          {line.basis.kind === "accepted"
            ? R.accepted(line.basis.byCadre ?? "", time.format(new Date(line.basis.at)))
            : REVIEW.without.title}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {pf && toReview && !accepted && canReview && line.need === "own_tap" ? (
          <ActionButton
            variant="primary"
            label={line.reasons.includes("overridden_stop") ? R.acceptOverridden : R.accept}
            run={(clientKey) => actions.acceptLine({ clientKey, lineId: line.id })}
          />
        ) : null}
        {pf && !accepted && !canReview ? (
          <span className="text-body-s text-muted-foreground">{WAITING_FOR_PHARMACIST}</span>
        ) : null}
        {canReview && queried && (toReview || s.stage === "queried") ? (
          <DeclineDialog lineId={line.id} medicine={name} />
        ) : null}
        {data.settings.supplyWithoutPharmacist &&
        canDispense &&
        pf &&
        toReview &&
        !accepted &&
        !line.input.controlled &&
        !reviewOnly ? (
          <WithoutPharmacistDialog lineId={line.id} />
        ) : null}
      </div>
      {decidable ? (
        <fieldset aria-labelledby={legend} className="flex flex-col gap-2">
          <legend id={legend} className="text-label">
            {R.decision}: {name}
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(
              [
                ["full", R.full],
                ["part", R.part],
                ["not_on_shelf", R.notOnShelf],
                ["ask", R.askChoice],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={`decision-${line.id}`}
                  value={v}
                  checked={draft.choice === v}
                  onChange={() => choose(v)}
                />
                {l}
              </label>
            ))}
          </div>
          {draft.choice === "full" ? (
            <Qty
              label={R.quantityName(name, unit)}
              value={draft.quantity}
              onChange={(v) => patch({ quantity: v })}
              required
            />
          ) : null}
          {draft.choice === "part" ? (
            <div className="flex flex-wrap items-end gap-4">
              <Qty
                label={`${R.now}: ${R.quantityName(name, unit)}`}
                value={draft.now}
                onChange={(v) => patch({ now: v })}
                required
              />
              <Qty
                label={`${R.notSupplied}: ${R.quantityName(name, unit)}`}
                value={draft.notSupplied}
                onChange={(v) => patch({ notSupplied: v })}
              />
              <fieldset className="flex flex-col">
                <legend className="text-caption text-muted-foreground">{R.rest}</legend>
                <span className="flex gap-3">
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      checked={draft.rest === "owed"}
                      onChange={() => patch({ rest: "owed" })}
                    />
                    {R.restOwed}
                  </label>
                  {line.input.controlled ? null : (
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="radio"
                        checked={draft.rest === "buying_outside"}
                        onChange={() => patch({ rest: "buying_outside" })}
                      />
                      {R.restOutside}
                    </label>
                  )}
                </span>
              </fieldset>
            </div>
          ) : null}
          {draft.choice === "part" ? (
            <RestReason value={draft.reason} onChange={(v) => patch({ reason: v })} />
          ) : null}
          {draft.choice === "full" || draft.choice === "part" ? (
            <span className="flex flex-wrap items-center gap-2">
              {line.stock.products.length ? (
                <ChangeDialog
                  medicine={name}
                  quantity={int(draft.choice === "full" ? draft.quantity : draft.now)}
                  stock={line.stock}
                  value={draft.batch}
                  today={localDate(new Date(data.serverNow))}
                  onUse={(batch) => patch({ batch })}
                />
              ) : null}
              {canStock ? (
                <FoundDialog
                  what={name}
                  medicineId={line.drugId}
                  products={line.stock.products.map((p) => ({
                    id: p.id,
                    medicineName: name,
                    name: p.name,
                    issueUnit: p.issueUnit,
                  }))}
                />
              ) : null}
              {draft.batch ? (
                <span className="text-caption text-muted-foreground">
                  {SUPPLY.change.chosen(
                    draft.batch.batches
                      .map(
                        (r) =>
                          `${line.stock.batches.find((b) => b.id === r.batchId)?.batchNumber ?? ""} × ${r.quantity}`,
                      )
                      .join(", "),
                  )}
                </span>
              ) : null}
            </span>
          ) : null}
          {draft.choice === "full" || draft.choice === "part" ? (
            <Qty label={R.daysCovered} value={draft.days} onChange={(v) => patch({ days: v })} />
          ) : null}
          {line.staged ? (
            <p className="text-caption text-muted-foreground">
              {line.staged.kind === "full"
                ? R.staged(line.staged.quantity, unit)
                : R.stagedPart(line.staged.quantity, line.staged.notSupplied, unit)}
            </p>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}

function RestReason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex max-w-sm flex-col gap-1">
      <Label htmlFor={id} className="text-caption">
        {SUPPLY.handover.restReason}
      </Label>
      <select
        id={id}
        required
        className={SELECT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          {REVIEW.query.choose}
        </option>
        {Object.entries(NOT_SUPPLIED_REASONS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function Qty({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-caption">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-32 font-mono tabular-nums"
      />
    </div>
  );
}

/** 5.5, artboard 1.3: a region under the line, with a heading; focus moves into it. */
function NotOnShelf({
  line,
  data,
  patientListOn,
  day,
  onClose,
}: {
  line: ReviewLineView;
  data: ReviewData;
  patientListOn: boolean;
  day: Fmt;
  onClose: () => void;
}) {
  const N = REVIEW.notOnShelf;
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [what, setWhat] = useState<"owed" | "buying_outside" | "send" | "return">("owed");
  const [error, setError] = useState<string | null>(null);
  /** MS-5: what happened to the patient's message, in words, before the pharmacy moves on. */
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const qty = useId();
  const reason = useId();
  const noteId = useId();
  useEffect(() => heading.current?.focus(), []);
  const s = line.shelf;
  const name = line.input.drugName;
  const outDays = s?.outSince
    ? Math.max(0, Math.round((Date.parse(data.serverNow) - Date.parse(s.outSince)) / 86_400_000))
    : null;
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = f.get(k);
      return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    start(async () => {
      if (what === "return") {
        const r = await actions.sendQuery({
          clientKey: newKey(),
          lineId: line.id,
          typeCode: "not_available",
          proposal: get("note") ?? QUERY_CODES.not_available,
          patientWaiting: false,
        });
        if (!r.ok) return setError(r.error);
        onClose();
        return router.refresh();
      }
      const outcome = what === "buying_outside" ? "buying_outside" : "owed";
      const r = await actions.recordNotSupplied({
        clientKey: newKey(),
        lineId: line.id,
        outcome,
        reasonCode: get("reasonCode"),
        note: get("note"),
        quantityNotSupplied: get("quantity") ? Number(get("quantity")) : undefined,
      });
      if (!r.ok) return setError(r.error);
      if (r.message) {
        setNotice(r.message);
        return router.refresh();
      }
      if (outcome === "buying_outside") {
        const slip = await actions.printSlip({ clientKey: newKey(), lineId: line.id });
        if (slip.ok) return router.push(`/pharmacy/slip/${slip.id}`);
        setError(slip.error);
        return router.refresh();
      }
      onClose();
      router.refresh();
    });
  };
  return (
    <section
      role="region"
      aria-labelledby={`nos-${line.id}`}
      className="border-border flex flex-col gap-3 rounded-lg border px-4 py-3"
    >
      <h3
        id={`nos-${line.id}`}
        ref={heading}
        tabIndex={-1}
        className="text-heading-s font-medium outline-none"
      >
        {N.title(name)}
      </h3>
      <p className="text-body-s">
        {s?.outSince && outDays !== null
          ? `${N.outSince(day.format(new Date(s.outSince)), outDays)} `
          : ""}
        {data.pointName && s
          ? N.count(
              data.pointName,
              s.quantity,
              s.lastCounted ? day.format(new Date(s.lastCounted)) : null,
            )
          : ""}
      </p>
      {line.elsewhere.length ? (
        <p className="text-body-s">{N.inStockAt(line.elsewhere.join(", "))}</p>
      ) : null}
      <p className="text-body-s text-muted-foreground">{N.otherStrengths}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1">
          <legend className="text-label mb-1">{N.what}</legend>
          <Radio checked={what === "owed"} onChange={() => setWhat("owed")}>
            {N.owed}
          </Radio>
          {line.input.controlled ? (
            <p className="text-body-s">
              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                {N.controlled}
              </StatusWord>
            </p>
          ) : (
            <Radio checked={what === "buying_outside"} onChange={() => setWhat("buying_outside")}>
              {N.outside}
            </Radio>
          )}
          {line.elsewhere[0] ? (
            <Radio checked={what === "send"} onChange={() => setWhat("send")}>
              {N.sendFor(line.elsewhere[0])}{" "}
              <Link
                href="/pharmacy/stock"
                className="text-teal-700 underline-offset-4 hover:underline"
              >
                {N.sendForLink}
              </Link>
            </Radio>
          ) : null}
          <Radio checked={what === "return"} onChange={() => setWhat("return")}>
            {N.returnTo}
          </Radio>
        </fieldset>
        {what !== "return" ? (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor={qty}>{N.quantity}</Label>
              <Input
                id={qty}
                name="quantity"
                inputMode="numeric"
                pattern="[0-9]*"
                className="min-h-11 w-32"
              />
            </div>
            <div className="flex min-w-56 flex-col gap-1">
              <Label htmlFor={reason}>{N.reason}</Label>
              <select id={reason} name="reasonCode" required className={SELECT} defaultValue="">
                <option value="" disabled>
                  {REVIEW.query.choose}
                </option>
                {Object.entries(NOT_SUPPLIED_REASONS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label htmlFor={noteId}>{what === "return" ? REVIEW.query.propose : N.note}</Label>
          <textarea id={noteId} name="note" maxLength={500} className={TEXTAREA} />
        </div>
        <div className="flex flex-col gap-1">
          <h4 className="text-label font-medium">{N.whoTold}</h4>
          <ul className="text-body-s flex list-disc flex-col gap-0.5 pl-5">
            <li>{N.prescriber}</li>
            <li>
              {N.patient}{" "}
              {patientListOn
                ? what === "buying_outside"
                  ? N.listOutside
                  : N.listOwed(data.pointPhone ?? "")
                : null}
            </li>
            {!patientListOn && !data.settings.liveSms ? (
              <li>{N.noMessage}</li>
            ) : !data.settings.liveSms ? (
              <li>{N.smsOff}</li>
            ) : null}
          </ul>
        </div>
        <p className="text-body-s text-muted-foreground">{N.footer}</p>
        <Refusal error={error} />
        {notice ? (
          <p role="status" className="text-body-s">
            {notice}
          </p>
        ) : null}
        <span className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" className={TARGET} onClick={onClose}>
            {N.cancel}
          </Button>
          {notice && what === "buying_outside" ? (
            <Button
              type="button"
              className={TARGET}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const slip = await actions.printSlip({ clientKey: newKey(), lineId: line.id });
                  if (slip.ok) return router.push(`/pharmacy/slip/${slip.id}`);
                  setError(slip.error);
                })
              }
            >
              {REVIEW.open.printSlip}
            </Button>
          ) : notice ? null : (
            <Button type="submit" className={TARGET} disabled={pending}>
              {what === "buying_outside"
                ? N.recordPrint
                : what === "return"
                  ? REVIEW.query.send
                  : N.record}
            </Button>
          )}
        </span>
      </form>
    </section>
  );
}

function Radio({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-11 items-start gap-2 py-1">
      <input type="radio" checked={checked} onChange={onChange} className="mt-1" />
      <span className="text-body-s">{children}</span>
    </label>
  );
}

/** 5.4, wireframe §4.1: a region with a heading; focus moves into it when a line asks for it. */
function QueryForm({
  data,
  about,
  setAbout,
  lineNo,
}: {
  data: ReviewData;
  about: string | null;
  setAbout: (v: string | null) => void;
  lineNo: Map<string, number>;
}) {
  const Q = REVIEW.query;
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [proposal, setProposal] = useState("");
  const [result, setResult] = useState<{ words: string; caution: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const type = useId();
  const text = useId();
  const waiting = useId();
  useEffect(() => {
    if (about) heading.current?.focus();
  }, [about]);
  const askable = data.lines.filter(
    (l) => l.status?.kind === "stage" && l.status.stage !== "queried",
  );
  const target = about ?? askable[0]?.id ?? null;
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const whole = f.get("about") === "whole";
    const line = whole ? (askable[0]?.id ?? data.firstLineId) : String(f.get("about") ?? target);
    start(async () => {
      const r = await actions.sendQuery({
        clientKey: newKey(),
        lineId: line,
        whole,
        typeCode: f.get("typeCode"),
        proposal,
        patientWaiting: f.get("waiting") === "on",
      });
      if (!r.ok) return setError(r.error);
      setError(null);
      setProposal("");
      setAbout(null);
      setResult(r.delivery ?? null);
      router.refresh();
    });
  };
  return (
    <section
      role="region"
      aria-labelledby="query-form"
      className="border-border bg-card rounded-lg border"
    >
      <h2
        id="query-form"
        ref={heading}
        tabIndex={-1}
        className="border-border text-heading-s border-b px-4 py-3 font-medium outline-none"
      >
        {Q.title}
      </h2>
      {result ? (
        <p role="status" className="text-body-s px-4 pt-3">
          {result.caution ? (
            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
              {result.words}
            </StatusWord>
          ) : (
            result.words
          )}
        </p>
      ) : null}
      {askable.length ? (
        <form key={target ?? "none"} onSubmit={submit} className="flex flex-col gap-3 px-4 py-3">
          <fieldset className="flex flex-col gap-1">
            <legend className="text-label mb-1">{Q.about}</legend>
            {askable.map((l) => (
              <label key={l.id} className="flex min-h-11 items-center gap-2">
                <input type="radio" name="about" value={l.id} defaultChecked={l.id === target} />
                {Q.line(lineNo.get(l.id) ?? 0, l.input.drugName)}
              </label>
            ))}
            <label className="flex min-h-11 items-center gap-2">
              <input type="radio" name="about" value="whole" />
              {Q.whole}
            </label>
          </fieldset>
          <div className="flex flex-col gap-1">
            <Label htmlFor={type}>{Q.type}</Label>
            <select id={type} name="typeCode" required className={SELECT} defaultValue="">
              <option value="" disabled>
                {Q.choose}
              </option>
              {Object.entries(QUERY_CODES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={text}>{Q.propose}</Label>
            <textarea
              id={text}
              required
              maxLength={500}
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              className={TEXTAREA}
              aria-describedby={`${text}-count`}
            />
            <span
              id={`${text}-count`}
              className="text-caption text-muted-foreground self-end font-mono tabular-nums"
            >
              {Q.count(proposal.length)}
            </span>
          </div>
          <label htmlFor={waiting} className="flex min-h-11 items-center gap-2">
            <input id={waiting} type="checkbox" name="waiting" />
            {Q.waiting}
          </label>
          <div className="flex flex-col gap-1">
            <h3 className="text-label font-medium">{Q.whoTold}</h3>
            {data.recipients.length ? (
              <ul className="text-body-s flex flex-col gap-0.5">
                {data.recipients.map((r) => (
                  <li key={`${r.role}-${r.cadre}`}>{Q.recipient(r.cadre, r.place, r.role)}</li>
                ))}
                {data.skipped.map((r) => (
                  <li key={`s-${r.cadre}`} className="text-muted-foreground">
                    {Q.skipped(r.cadre)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-s">
                <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                  {Q.nobody}
                </StatusWord>
              </p>
            )}
          </div>
          <Refusal error={error} />
          <span className="flex flex-wrap justify-end gap-2">
            {about ? (
              <Button
                type="button"
                variant="secondary"
                className={TARGET}
                onClick={() => setAbout(null)}
              >
                {Q.cancel}
              </Button>
            ) : null}
            <Button type="submit" className={TARGET} disabled={pending}>
              {Q.send}
            </Button>
          </span>
        </form>
      ) : null}
    </section>
  );
}
