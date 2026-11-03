"use client";

import type { SectionProps } from "./roster-tab";
import type { Tone } from "./swaps";
import type { RosterLeave } from "@/lib/pharmacy/roster/read";
import { useState } from "react";

import { DateField, PickField } from "@/app/lab/_components/v2/fields";
import { askLeaveAction, decideLeaveAction } from "@/app/pharmacy/setup/roster-actions";
import { newKey } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { Panel } from "@/components/tide/work/kit";
import { RS, stamp } from "@/content/pharmacy-roster-sections";
import { daysBetween, SHIFTS } from "@/lib/pharmacy/derive/roster";
import { Avatar } from "./avatar";
import {
  Chip,
  FormDialog,
  inputCls,
  labelCls,
  nameOf,
  NeedsDb,
  personOf,
  slotOf,
  useAct,
} from "./swaps";

type Kind = RosterLeave["kind"];
const KINDS: readonly Kind[] = ["annual", "day_off", "study", "sick"];
const TONE: Record<RosterLeave["status"], Tone> = {
  pending: "blue",
  approved: "green",
  declined: "red",
  withdrawn: "grey",
};

/** §7 Leave and days off. */
export function LeaveSection({ view, toast }: SectionProps) {
  const L = RS.leave;
  const [formOpen, setFormOpen] = useState(false);
  const [pending, run] = useAct(toast);
  if (!view.ready) return <NeedsDb title={L.title} />;

  const me = view.viewerId;
  const canAp = view.canPublish;
  const today = view.now.date;
  // A pending request whose dates have passed shows as withdrawn.
  const shown = (l: RosterLeave) =>
    l.status === "pending" && l.to < today ? "withdrawn" : l.status;
  const clashes = (userId: string, from: string, to: string) =>
    view.duties
      .filter((d) => d.userId === userId && d.date >= from && d.date <= to)
      .sort(
        (a, b) => a.date.localeCompare(b.date) || SHIFTS.indexOf(a.shift) - SHIFTS.indexOf(b.shift),
      )
      .map((d) => slotOf(view, d));
  const waiting = view.leaves.filter((l) => shown(l) === "pending").length;
  const canAsk = view.people.some((p) => p.userId === me);

  const decide = (l: RosterLeave, status: "approved" | "declined" | "withdrawn") =>
    void run(
      () => decideLeaveAction({ leaveId: l.id, status, note: null }),
      (d: { freed?: { placeId: string; date: string; shift: "day" | "night" | "call" }[] }) =>
        status === "approved"
          ? L.flash.approved((d.freed ?? []).map((s) => slotOf(view, s)))
          : status === "declined"
            ? L.flash.declined(nameOf(view, l.userId))
            : null,
    );

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          {L.title}
          {canAp && waiting > 0 ? <Chip tone="amber">{L.toApprove(waiting)}</Chip> : null}
        </span>
      }
      note={L.sub}
      action={
        canAsk ? (
          <LabButton variant="primary" onClick={() => setFormOpen(true)}>
            {L.ask}
          </LabButton>
        ) : null
      }
    >
      <ul className="divide-border flex flex-col divide-y">
        {view.leaves.length === 0 ? (
          <li className="text-body-s text-muted-foreground py-3">{L.empty}</li>
        ) : null}
        {view.leaves.map((l) => {
          const st = shown(l);
          const per = personOf(view, l.userId);
          const days = daysBetween(l.from, l.to) + 1;
          const clash = l.status === "pending" ? clashes(l.userId, l.from, l.to) : [];
          const trail = [
            L.event("asked", per.name, stamp(l.createdAt)),
            ...(l.decidedAt && l.status !== "pending"
              ? [
                  L.event(
                    l.status,
                    l.status === "withdrawn" ? per.name : nameOf(view, l.decidedBy ?? ""),
                    stamp(l.decidedAt),
                  ),
                ]
              : []),
            ...(l.note ? [RS.quoted(l.note)] : []),
          ].join(" · ");
          return (
            <li
              key={l.id}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3"
            >
              <div className="flex min-w-0 flex-[1_1_20rem] gap-3">
                <Avatar person={per} size={36} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body-s">
                    <b className="font-semibold">{per.name}</b> · {L.kind[l.kind]}
                  </span>
                  <span className="text-ink-700 text-[13px] leading-[18px]">
                    {L.when(l.from, l.to, days, l.late, view.params.leaveAheadDays)}
                  </span>
                  {l.reason ? (
                    <span className="text-muted-foreground text-[12px]">{RS.quoted(l.reason)}</span>
                  ) : null}
                  {clash.length ? (
                    <span className="text-status-caution-fg-aa text-[12px] font-bold">
                      {L.rowClash(clash)}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground text-[11px] leading-[15px]">{trail}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Chip tone={TONE[st]}>{L.state[st]}</Chip>
                {st === "pending" ? (
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {canAp ? (
                      <>
                        <LabButton
                          size="sm"
                          variant="primary"
                          busy={pending}
                          onClick={() => decide(l, "approved")}
                        >
                          {L.act.approve}
                        </LabButton>
                        <LabButton size="sm" busy={pending} onClick={() => decide(l, "declined")}>
                          {L.act.decline}
                        </LabButton>
                      </>
                    ) : null}
                    {me === l.userId ? (
                      <LabButton size="sm" busy={pending} onClick={() => decide(l, "withdrawn")}>
                        {L.act.withdraw}
                      </LabButton>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {formOpen ? (
        <LeaveForm view={view} toast={toast} clashes={clashes} onClose={() => setFormOpen(false)} />
      ) : null}
    </Panel>
  );
}

function LeaveForm({
  view,
  toast,
  clashes,
  onClose,
}: SectionProps & {
  clashes: (u: string, from: string, to: string) => string[];
  onClose: () => void;
}) {
  const F = RS.leave.form;
  const [clientKey] = useState(newKey);
  const [f, setF] = useState({ kind: "annual" as Kind, from: "", to: "", reason: "", error: "" });
  const [pending, run] = useAct(toast);
  const upd = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch, error: "" }));
  const me = view.people.find((p) => p.userId === view.viewerId);
  const today = view.now.date;
  const to = f.to || f.from;
  const clash = f.from ? clashes(view.viewerId, f.from, to) : [];

  const send = () => {
    const err = (error: string) => setF((x) => ({ ...x, error }));
    if (!f.from) return err(F.err.from);
    if (f.from < today) return err(F.err.passed);
    if (to < f.from) return err(F.err.order);
    void run(
      () =>
        askLeaveAction({
          clientKey,
          kind: f.kind,
          from: f.from,
          to: f.to || null,
          reason: f.reason.trim() || null,
        }),
      (d: { late?: boolean }) => {
        onClose();
        return RS.leave.flash.sent(!!d.late, view.params.leaveAheadDays);
      },
    );
  };

  return (
    <FormDialog
      open
      onClose={onClose}
      title={RS.leave.ask}
      sub={me ? F.who(me.name) : undefined}
      error={f.error}
      submit={RS.send}
      onSubmit={send}
      pending={pending}
    >
      <PickField
        label={F.kindAria}
        hideLabel
        options={KINDS.map((k) => ({ value: k, label: RS.leave.kind[k] }))}
        value={f.kind}
        onChange={(v) => upd({ kind: v as Kind })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField
          label={F.from}
          value={f.from}
          min={today}
          allowFuture
          onChange={(v) => upd({ from: v })}
        />
        <DateField
          label={F.to}
          value={f.to}
          min={today}
          allowFuture
          onChange={(v) => upd({ to: v })}
        />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>{RS.reasonLabel}</span>
        <input
          value={f.reason}
          maxLength={300}
          onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))}
          className={inputCls}
        />
      </label>
      {clash.length ? (
        <p className="bg-status-caution-bg text-status-caution-fg-aa rounded-tide-tile px-3.5 py-2.5 text-[13px] leading-[18px] font-semibold">
          {F.clash(clash)}
        </p>
      ) : null}
    </FormDialog>
  );
}
