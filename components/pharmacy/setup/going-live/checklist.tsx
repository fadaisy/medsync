"use client";

import type { Ctx } from "./index";
import type { ChecklistItem } from "@/content/pharmacy-setup";
import type { ItemStatus } from "@/lib/pharmacy/derive/setup/golive";
import Link from "next/link";
import { useState } from "react";
import { CheckIcon } from "lucide-react";

import { DateField, PickField } from "@/app/lab/_components/v2/fields";
import {
  markItemAction,
  recordAnswerAction,
  setItemOwnerAction,
  unmarkItemAction,
} from "@/app/pharmacy/setup/setup-actions";
import { linkBtn, pillBtn } from "@/components/pharmacy/medicines/shared";
import { FormDialog, inputCls, labelCls } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import { Panel, Pill } from "@/components/tide/work/kit";
import { CHECKLIST, GOLIVE_GROUPS, OWNERS } from "@/content/pharmacy-setup";
import { GL } from "@/content/pharmacy-setup-going-live";
import { daysBetween, frac, isOverdue, itemStatus } from "@/lib/pharmacy/derive/setup/golive";
import { SETUP_HREF } from "@/lib/pharmacy/ia";
import { cn } from "@/lib/utils";

const C = GL.checklist;
type View = "all" | "blocking" | "overdue" | "auto" | "done";

/** A thin bar: lagoon while filling, ink when complete. Width is the fraction; the words sit beside it. */
export function Bar({ value, className }: { value: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("bg-ink-150 block h-1.5 overflow-hidden rounded-full", className)}
    >
      <span
        className={cn("block h-full rounded-full", value >= 1 ? "bg-ink-700" : "bg-tide-lagoon")}
        style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }}
      />
    </span>
  );
}

/** §A3: the 20 items in four groups, the filters, and per item its action and Owner and date. */
export function Checklist({ ctx }: { ctx: Ctx }) {
  const { view, st, live, blockers, overdueItems, doneN } = ctx;
  const [show, setShow] = useState<View>("all");
  const [answering, setAnswering] = useState<ChecklistItem | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const views: [View, string][] = [
    ["all", C.views.all(CHECKLIST.length)],
    ["blocking", C.views.blocking(blockers.length)],
    ["overdue", C.views.overdue(overdueItems.length)],
    ["auto", C.views.auto],
    ["done", C.views.done(doneN)],
  ];
  const visible = (it: ChecklistItem) => {
    const s = itemStatus(it, st(it.key));
    if (show === "blocking") return it.blocks && s !== "done";
    if (show === "overdue") return isOverdue(it, st(it.key), view.today);
    if (show === "auto") return it.kind === "auto";
    if (show === "done") return s === "done";
    return true;
  };
  const groups = GOLIVE_GROUPS.map((title, gi) => {
    const list = CHECKLIST.filter((it) => it.group === gi);
    const gd = list.filter((it) => itemStatus(it, st(it.key)) === "done").length;
    return { title, list, gd, vis: list.filter(visible) };
  }).filter((g) => g.vis.length);

  return (
    <Panel
      title={
        <>
          {C.title}{" "}
          <span className="text-ink-600 font-normal">{C.doneLine(doneN, CHECKLIST.length)}</span>
        </>
      }
      action={
        <div role="group" aria-label={C.show} className="flex flex-wrap gap-1.5">
          {views.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={show === k}
              onClick={() => setShow(show === k && k !== "all" ? "all" : k)}
              className={pillBtn(show === k)}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {!view.can.manage && !live ? (
        <p className="text-body-s text-muted-foreground m-0">{C.viewOnly}</p>
      ) : null}
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-heading-s text-foreground m-0">{g.title}</h3>
            <span className="text-caption text-ink-600 inline-flex items-center gap-2 tabular-nums">
              <Bar value={g.gd / g.list.length} className="w-16" />
              {C.groupCount(g.gd, g.list.length)}
            </span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {g.vis.map((it) => (
              <Row
                key={it.key}
                it={it}
                ctx={ctx}
                editing={editing === it.key}
                onEdit={() => setEditing(editing === it.key ? null : it.key)}
                onAnswer={() => setAnswering(it)}
              />
            ))}
          </ul>
        </div>
      ))}
      {groups.length === 0 ? (
        <p className="text-body-s text-muted-foreground m-0">
          {show === "blocking"
            ? C.empty.blocking
            : show === "overdue"
              ? C.empty.overdue
              : C.empty.other}
        </p>
      ) : null}
      {answering ? (
        <AnswerDialog
          key={answering.key}
          it={answering}
          ctx={ctx}
          onClose={() => setAnswering(null)}
        />
      ) : null}
    </Panel>
  );
}

const TICK: Record<ItemStatus, string> = {
  done: "bg-ink-700 text-ink-0",
  doing: "bg-tide-lagoon-tint text-teal-900",
  todo: "bg-card shadow-[inset_0_0_0_2px_var(--color-ink-300)]",
};

function Row({
  it,
  ctx,
  editing,
  onEdit,
  onAnswer,
}: {
  it: ChecklistItem;
  ctx: Ctx;
  editing: boolean;
  onEdit: () => void;
  onAnswer: () => void;
}) {
  const { view, st, live, run, pending } = ctx;
  const x = view.items.find((i) => i.key === it.key)!;
  const s = itemStatus(it, st(it.key));
  const late = isOverdue(it, st(it.key), view.today);
  const dueIn = x.dueOn ? daysBetween(view.today, x.dueOn) : 0;
  const status = s === "done" ? "done" : s === "doing" ? "doing" : late ? "overdue" : "todo";

  const meta =
    (s === "done" && x.doneByName ? C.meta.doneBy(x.doneByName, x.doneAt) : "") +
    C.meta.owner(x.owner) +
    (!x.dueOn
      ? C.meta.noDue
      : s === "done"
        ? C.meta.wasDue(x.dueOn)
        : late
          ? C.meta.late(x.dueOn, -dueIn)
          : C.meta.dueIn(x.dueOn, dueIn)) +
    (it.blocks && s !== "done" && view.target && x.dueOn && x.dueOn > view.target
      ? C.meta.afterTarget
      : "");

  // Record answers: the in-charge or the medical superintendent. Marks and owners: the in-charge.
  let act: { label: string; primary: boolean; go: () => void } | null = null;
  if (it.kind === "record" && view.can.answer)
    act = {
      label: s === "done" ? C.changeAnswer : C.recordAnswer,
      primary: s !== "done",
      go: onAnswer,
    };
  else if (it.kind === "mark" && view.can.manage)
    act =
      s === "done"
        ? {
            label: C.undo,
            primary: false,
            go: () =>
              void run(
                () => unmarkItemAction({ key: it.key }),
                () => GL.toast.reopened,
              ),
          }
        : {
            label: C.markDone,
            primary: true,
            go: () =>
              void run(
                () => markItemAction({ key: it.key }),
                () => GL.toast.marked,
              ),
          };
  else if (it.kind === "auto" && s !== "done")
    act = {
      label: C.checkAgain,
      primary: false,
      // The loader re-runs the live query on refresh: that is the check.
      go: () =>
        void run(
          async () => ({ ok: true as const }),
          () => GL.toast.checked,
        ),
    };

  const link = it.link ? C.open[it.link] : null;
  return (
    <li className="bg-tide-sunken/60 rounded-tide-tile flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 gap-3">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums",
              TICK[s],
            )}
          >
            {s === "done" ? (
              <CheckIcon className="size-3.5" />
            ) : s === "doing" ? (
              Math.round(frac(it, st(it.key)) * 100)
            ) : null}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <b className="text-body-s text-foreground font-semibold">{it.name}</b>
              {it.blocks ? (
                <span className="bg-tide-navy-900 text-tide-on-band inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold tracking-[0.04em]">
                  {C.blocks}
                </span>
              ) : null}
            </span>
            <span className="text-body-s text-ink-600">{it.why}</span>
            {it.kind === "auto" ? (
              <span className="text-caption text-ink-700 flex flex-wrap items-center gap-2 tabular-nums">
                <Bar value={frac(it, st(it.key))} className="w-28" />
                {C.prog(x.prog?.[0] ?? 0, x.prog?.[1] ?? 0, it.unit ?? "")}
                <span className="text-muted-foreground">{C.auto}</span>
              </span>
            ) : null}
            {it.kind === "record" && x.answer ? (
              <span className="text-body-s text-foreground">“{x.answer}”</span>
            ) : null}
            <span className="text-caption text-muted-foreground">{meta}</span>
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <Pill
            tone={
              status === "done"
                ? "passed"
                : status === "doing"
                  ? "lagoon"
                  : status === "overdue"
                    ? "caution"
                    : "neutral"
            }
          >
            {C.status[status]}
          </Pill>
          <span className="flex flex-wrap items-center gap-2">
            {link ? (
              <Link href={`${SETUP_HREF}?tab=${link[1]}`} className={linkBtn}>
                {link[0]}
              </Link>
            ) : null}
            {act && !live ? (
              <LabButton
                size="sm"
                variant={act.primary ? "primary" : "secondary"}
                busy={pending}
                onClick={act.go}
              >
                {act.label}
              </LabButton>
            ) : null}
            {view.can.manage && !live ? (
              <LabButton
                size="sm"
                variant="text"
                aria-label={C.ownerAria(it.name)}
                aria-expanded={editing}
                onClick={onEdit}
              >
                {C.ownerAndDate}
              </LabButton>
            ) : null}
          </span>
        </div>
      </div>
      {editing ? (
        <OwnerEditor key={`${x.owner}|${x.dueOn}`} it={it} ctx={ctx} onDone={onEdit} />
      ) : null}
    </li>
  );
}

function OwnerEditor({ it, ctx, onDone }: { it: ChecklistItem; ctx: Ctx; onDone: () => void }) {
  const x = ctx.view.items.find((i) => i.key === it.key)!;
  const [owner, setOwner] = useState(x.owner);
  const [due, setDue] = useState(x.dueOn ?? "");
  return (
    <div className="bg-card rounded-tide-tile flex flex-wrap items-end gap-3 p-3">
      <PickField
        label={C.owner}
        options={OWNERS.map((o) => ({ value: o, label: o }))}
        value={owner}
        onChange={setOwner}
        className="min-w-[14rem]"
      />
      <DateField label={C.due} value={due} onChange={setDue} allowFuture />
      <LabButton
        variant="primary"
        busy={ctx.pending}
        onClick={async () => {
          const ok = await ctx.run(
            () =>
              setItemOwnerAction({
                key: it.key,
                owner: owner as (typeof OWNERS)[number],
                dueOn: due || null,
              }),
            () => GL.toast.owner,
          );
          if (ok) onDone();
        }}
      >
        {C.doneEdit}
      </LabButton>
    </div>
  );
}

/** Record answer (§A3): optional choices, details or the answer, and who decided; the errors in words. */
function AnswerDialog({ it, ctx, onClose }: { it: ChecklistItem; ctx: Ctx; onClose: () => void }) {
  const x = ctx.view.items.find((i) => i.key === it.key)!;
  const A = GL.answer;
  // The stored answer is `choice. details`: take the details back out for editing.
  const prevText =
    x.answer && x.choice ? x.answer.slice(x.choice.length).replace(/^\. /, "") : (x.answer ?? "");
  const [choice, setChoice] = useState(x.choice ?? "");
  const [text, setText] = useState(prevText);
  const [by, setBy] = useState(x.decidedBy ?? "");
  const [error, setError] = useState("");
  const save = async () => {
    if (it.choices && !choice) return setError(A.pick);
    if (!it.choices && !text.trim()) return setError(A.type);
    if (!by.trim()) return setError(A.who);
    const ok = await ctx.run(
      () =>
        recordAnswerAction({
          key: it.key,
          choice: it.choices ? choice : null,
          text: text.trim(),
          decidedBy: by.trim(),
        }),
      () => GL.toast.answer,
    );
    if (ok) onClose();
  };
  return (
    <FormDialog
      open
      onClose={onClose}
      title={it.name}
      sub={A.lead(it.why)}
      error={error}
      submit={A.save}
      onSubmit={() => void save()}
      pending={ctx.pending}
    >
      {it.choices ? (
        <PickField
          label={A.choices}
          options={it.choices.map((c) => ({ value: c, label: c }))}
          value={choice}
          onChange={(v) => {
            setChoice(v);
            setError("");
          }}
        />
      ) : null}
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>{it.choices ? A.details : A.theAnswer}</span>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
          placeholder={it.choices ? A.detailsPh : A.answerPh}
          className={cn(inputCls, "h-auto py-2")}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>{A.decidedBy}</span>
        <input
          value={by}
          onChange={(e) => {
            setBy(e.target.value);
            setError("");
          }}
          placeholder={A.decidedByPh}
          className={inputCls}
        />
      </label>
    </FormDialog>
  );
}
