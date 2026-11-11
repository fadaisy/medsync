"use client";

import type { ChecklistItem } from "@/content/pharmacy-setup";
import type { ItemState } from "@/lib/pharmacy/derive/setup/golive";
import type { GoLiveItem, GoLiveView } from "@/lib/pharmacy/setup/types";
import { useState } from "react";
import { CheckIcon } from "lucide-react";

import { DateField } from "@/app/lab/_components/v2/fields";
import {
  endPracticeAction,
  practiceDispenseAction,
  retirePaperAction,
  setGoLiveDateAction,
  startPracticeAction,
} from "@/app/pharmacy/setup/setup-actions";
import { useToast } from "@/components/pharmacy/medicines/shared";
import { inputCls, labelCls, useAct } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Panel, Pill } from "@/components/tide/work/kit";
import { CHECKLIST, PHASES } from "@/content/pharmacy-setup";
import { eventText, GL, whenShort } from "@/content/pharmacy-setup-going-live";
import {
  blockersLate,
  blockersLeft,
  canGoLive,
  countdownUrgent,
  daysBetween,
  itemStatus,
  overdue,
  phaseIndex,
  readiness,
} from "@/lib/pharmacy/derive/setup/golive";
import { cn } from "@/lib/utils";
import { Checklist } from "./checklist";
import { GoDialog } from "./go-dialog";

/** What the sections share: the view, the derived counts and the action runner. */
export interface Ctx {
  view: GoLiveView;
  st: (k: string) => ItemState;
  live: boolean;
  blockers: ChecklistItem[];
  overdueItems: ChecklistItem[];
  doneN: number;
  run: ReturnType<typeof useAct>[1];
  pending: boolean;
  toast: (m: string) => void;
}

const EMPTY: GoLiveItem["prog"] = null;
const tomorrow = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Set-up › Going live (SETUP-TABS.md §A): readiness, the phases, the checklist and the activity. */
export function GoLiveTab({ view }: { view: GoLiveView | null }) {
  const [toastNode, toast] = useToast();
  const [pending, run] = useAct(toast);
  if (!view)
    return (
      <Panel title={GL.hero.label}>
        <EmptyState compact title={GL.needsDb} />
      </Panel>
    );
  const byKey = new Map(view.items.map((i) => [i.key as string, i]));
  const st = (k: string): ItemState => byKey.get(k) ?? { status: "todo", prog: EMPTY, dueOn: null };
  const ctx: Ctx = {
    view,
    st,
    live: view.phase === "parallel" || view.phase === "retired",
    blockers: blockersLeft(CHECKLIST, st),
    overdueItems: overdue(CHECKLIST, st, view.today),
    doneN: CHECKLIST.filter((it) => itemStatus(it, st(it.key)) === "done").length,
    run,
    pending,
    toast,
  };
  return (
    <div className="flex flex-col gap-4">
      <Hero ctx={ctx} />
      <Phases ctx={ctx} />
      {view.practice.open ? <Practice ctx={ctx} /> : null}
      <Checklist ctx={ctx} />
      <Activity view={view} />
      {toastNode}
    </div>
  );
}

const R = 56;
const CIRC = 2 * Math.PI * R;

function Hero({ ctx }: { ctx: Ctx }) {
  const { view, st, live, blockers, overdueItems, doneN, run } = ctx;
  const H = GL.hero;
  const [goOpen, setGoOpen] = useState(false);
  const pct = live ? 100 : readiness(CHECKLIST, st);
  const late = blockersLate(CHECKLIST, st, view.target).length;
  const daysLeft = view.target ? daysBetween(view.today, view.target) : null;
  const canGo = canGoLive(blockers.length, view.phase);
  const goWhy = live
    ? H.goHintLive
    : canGo
      ? null
      : blockers.length
        ? H.goHintBlocked(
            blockers.slice(0, 3).map((b) => b.name),
            blockers.length - 3,
          )
        : H.goHintPhase;

  return (
    <section
      aria-label={H.label}
      className="bg-card shadow-tide-card rounded-tide-card flex flex-col gap-5 p-5 md:flex-row md:items-center"
    >
      <span className="relative grid size-[132px] shrink-0 place-items-center self-center">
        <svg
          aria-hidden
          width="132"
          height="132"
          viewBox="0 0 132 132"
          className="absolute inset-0 -rotate-90"
        >
          <circle cx="66" cy="66" r={R} fill="none" strokeWidth="12" className="stroke-ink-150" />
          <circle
            cx="66"
            cy="66"
            r={R}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${((CIRC * pct) / 100).toFixed(1)} ${CIRC.toFixed(1)}`}
            className={live || !blockers.length ? "stroke-ink-700" : "stroke-tide-lagoon"}
          />
        </svg>
        <span className="relative flex flex-col items-center">
          <span className="text-display-s text-foreground tabular-nums">{pct}%</span>
          <span className="text-ink-600 text-[11px] font-semibold tracking-[0.08em]">
            {H.ready}
          </span>
        </span>
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Pill tone={live ? "passed" : view.phase === "practice" ? "lagoon" : "neutral"}>
          {H.status[view.phase]}
        </Pill>
        <p className="text-heading-l text-foreground m-0">
          {H.headline(blockers.length, view.liveAt)}
        </p>
        <p className="text-body-s text-ink-600 m-0">
          {live ? H.liveSub : H.sub(doneN, CHECKLIST.length, overdueItems.length, late)}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {view.can.manage && !live ? (
            <DateField
              label={H.date}
              value={view.target ?? ""}
              min={tomorrow(view.today)}
              allowFuture
              onChange={(d) =>
                void run(
                  () => setGoLiveDateAction({ date: d }),
                  () => GL.toast.date(d),
                )
              }
            />
          ) : (
            <span className="flex flex-col gap-1">
              <span className={labelCls}>{H.date}</span>
              <span className="text-body-s text-foreground">
                {view.target ? H.targetLabel(view.target) : H.noDate}
              </span>
            </span>
          )}
          {live ? (
            <Pill tone="passed">{H.live}</Pill>
          ) : daysLeft !== null ? (
            <Pill tone={countdownUrgent(daysLeft, blockers.length) ? "caution" : "neutral"}>
              {H.countdown(daysLeft)}
            </Pill>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-2 md:max-w-[18rem] md:items-end">
        <LabButton
          variant="primary"
          disabledReason={goWhy}
          reasonPlacement="below"
          onClick={() => setGoOpen(true)}
          className="h-12 px-6 text-[15px]"
        >
          {live ? H.live : H.goLive}
        </LabButton>
        {canGo ? <span className="text-caption text-muted-foreground">{H.goHintReady}</span> : null}
        {!live
          ? view.signatures.map((s) => (
              <span key={s.role} className="text-caption text-ink-700">
                {H.signedLine(s.role, s.byName, s.at)}
              </span>
            ))
          : null}
      </div>
      {canGo ? <GoDialog ctx={ctx} open={goOpen} onClose={() => setGoOpen(false)} /> : null}
    </section>
  );
}

function Phases({ ctx }: { ctx: Ctx }) {
  const { view, live, run, pending } = ctx;
  const P = GL.phases;
  const idx = phaseIndex(view.phase);
  return (
    <Panel title={P.title}>
      <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {PHASES.map(([title, body], i) => {
          const done = i < idx || (i === 3 && view.phase === "retired");
          const cur = i === idx;
          let act: [string, () => void] | null = null;
          if (view.can.manage && i === 1 && !live)
            act =
              view.phase === "practice"
                ? [
                    P.endPractice,
                    () =>
                      void run(
                        () => endPracticeAction({}),
                        () => GL.toast.practiceOff,
                      ),
                  ]
                : [
                    P.startPractice,
                    () =>
                      void run(
                        () => startPracticeAction({}),
                        () => GL.toast.practiceOn,
                      ),
                  ];
          if (view.can.manage && i === 3 && view.phase === "parallel")
            act = [
              P.retire,
              () =>
                void run(
                  () => retirePaperAction({}),
                  () => GL.toast.retired,
                ),
            ];
          return (
            <li
              key={title}
              aria-current={cur ? "step" : undefined}
              className={cn(
                "rounded-tide-tile flex flex-col gap-1.5 px-3.5 py-3",
                cur
                  ? "bg-tide-lagoon-tint shadow-[inset_0_0_0_1.5px_var(--color-tide-lagoon)]"
                  : "bg-tide-sunken",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold",
                    done
                      ? "bg-ink-700 text-ink-0"
                      : cur
                        ? "text-ink-0 bg-teal-700"
                        : "bg-card text-ink-600 shadow-[inset_0_0_0_1.5px_var(--color-ink-300)]",
                  )}
                >
                  {done ? <CheckIcon className="size-3.5" /> : i + 1}
                </span>
                <b className="text-body-s text-foreground font-semibold">{title}</b>
              </span>
              <span className="text-caption text-ink-600">{body}</span>
              <Pill tone={done ? "passed" : cur ? "lagoon" : "neutral"}>
                {done ? P.done : cur ? P.now : P.next}
              </Pill>
              {act ? (
                <LabButton size="sm" busy={pending} onClick={act[1]} className="w-fit">
                  {act[0]}
                </LabButton>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/** While a practice day runs: dispense a sample prescription (practice data only; it marks you trained). */
function Practice({ ctx }: { ctx: Ctx }) {
  const { view, run, pending } = ctx;
  const P = GL.practice;
  const [sample, setSample] = useState("");
  const [err, setErr] = useState("");
  return (
    <Panel title={P.title} note={P.note}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (sample.trim().length < 2) return setErr(P.tooShort);
          if (
            await run(
              () => practiceDispenseAction({ sample: sample.trim() }),
              () => P.done,
            )
          )
            setSample("");
        }}
      >
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
          <span className={labelCls}>{P.sample}</span>
          <span className="text-caption text-muted-foreground">{P.sampleHint}</span>
          <input
            value={sample}
            onChange={(e) => {
              setSample(e.target.value);
              setErr("");
            }}
            placeholder={P.samplePh}
            className={inputCls}
          />
        </label>
        <LabButton type="submit" variant="primary" busy={pending}>
          {P.dispense}
        </LabButton>
      </form>
      {err ? (
        <p role="alert" className="text-body-s m-0 font-semibold">
          {err}
        </p>
      ) : null}
      <p className="text-caption text-ink-700 m-0">
        {view.practice.trainedMe ? P.trainedMe : P.notTrainedMe}
      </p>
    </Panel>
  );
}

function Activity({ view }: { view: GoLiveView }) {
  return (
    <Panel title={GL.activity.title}>
      {view.events.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {view.events.slice(0, 8).map((e, i) => (
            <li key={`${e.at}-${i}`} className="text-body-s flex flex-col gap-x-3 sm:flex-row">
              <span className="text-muted-foreground w-28 shrink-0 tabular-nums">
                {whenShort(e.at)}
              </span>
              <span className="text-foreground">{eventText(e)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title={GL.activity.empty} />
      )}
    </Panel>
  );
}
