"use client";

import type { SectionProps } from "./roster-tab";
import type { Shift } from "@/lib/pharmacy/derive/roster";
import type { RosterRequest } from "@/lib/pharmacy/roster/read";
import type { RosterView } from "@/lib/pharmacy/roster/view";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { PickField } from "@/app/lab/_components/v2/fields";
import { actOnSwapAction, askSwapAction } from "@/app/pharmacy/setup/roster-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { newKey, pillBtn } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Panel } from "@/components/tide/work/kit";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { breakText, CADRE, slotText } from "@/content/pharmacy-roster";
import { RS, stamp } from "@/content/pharmacy-roster-sections";
import {
  addDays,
  canApprove,
  effStatus,
  leaveOn,
  licState,
  newBreaks,
  onShift,
  SHIFT_START,
  SHIFTS,
  weekStart,
} from "@/lib/pharmacy/derive/roster";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { ASK_SWAP_EVENT } from "./slot-dialog";

// ─── Shared by the sections (leave, load, people, reminders) ───────────────
export type Tone = "amber" | "blue" | "green" | "red" | "grey";
/** §6/§7/§10 chip colours, always with their word. Red only for declined, rejected, Expired, Not recorded. */
export const TONE: Record<Tone, string> = {
  amber: "bg-status-caution-bg text-status-caution-fg-aa",
  // Waiting on someone: neutral ink (DESIGN-medsync has no blue status; place hues never mark state).
  blue: "bg-ink-150 text-ink-800",
  // Done: ink, not green (green is the patient's clinical state only).
  green: "bg-ink-700 text-ink-0",
  red: "bg-status-critical-bg text-status-critical-fg-aa",
  grey: "bg-tide-sunken text-ink-600",
};
export function Chip({
  tone,
  small,
  children,
}: {
  tone: Tone;
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full font-semibold whitespace-nowrap",
        small ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-[12px]",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}
export const inputCls =
  "bg-card text-foreground h-9 w-full rounded-tide-field border border-input px-3 text-body-s outline-none focus-visible:border-ring focus-visible:shadow-focus";
export const labelCls = "text-label text-foreground";

type Res<T> = { ok: true; data?: T } | { ok: false; error: string };
/** Run an action: its refusal is toasted in words; on success the flash, then a refresh. */
export function useAct(toast: (m: string) => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(call: () => Promise<Res<T>>, done: (d: T) => string | null) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const r = await call();
        if (!r.ok) {
          toast(r.error);
          return resolve(false);
        }
        const m = done(r.data as T);
        if (m) toast(m);
        router.refresh();
        resolve(true);
      }),
    );
  return [pending, run] as const;
}

export const nameOf = (view: RosterView, id: string) =>
  view.people.find((p) => p.userId === id)?.name ?? RS.inChargeName;
export const personOf = (view: RosterView, id: string) => {
  const p = view.people.find((q) => q.userId === id);
  return { name: p?.name ?? RS.inChargeName, photo: p?.photo ?? null };
};
export const slotOf = (view: RosterView, s: { placeId: string; date: string; shift: Shift }) =>
  slotText({ ...s, place: view.places.find((p) => p.id === s.placeId)?.name ?? "" });

/** Before 0273: the section's card with the one line saying so. */
export function NeedsDb({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <EmptyState compact title={RS.needsDb} />
    </Panel>
  );
}

/** A centred form dialog: title, sub line, body, the error, Cancel + the one primary. */
export function FormDialog({
  open,
  onClose,
  title,
  sub,
  error,
  submit,
  onSubmit,
  pending,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  error: string;
  submit: string;
  onSubmit: () => void;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <EditorDialog open={open} onOpenChange={(o) => !o && onClose()} width="medium">
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex flex-col gap-1 px-6 pt-5">
          <DialogTitle>{title}</DialogTitle>
          {sub ? <DialogDescription>{sub}</DialogDescription> : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          {children}
          {error ? (
            <p
              role="alert"
              className="bg-tide-sunken text-body-s rounded-tide-tile px-3.5 py-2.5 font-semibold"
            >
              {error}
            </p>
          ) : null}
        </div>
        <div className="border-border flex justify-end gap-2 border-t px-6 py-3.5">
          <LabButton type="button" onClick={onClose}>
            {RS.cancel}
          </LabButton>
          <LabButton type="submit" variant="primary" busy={pending}>
            {submit}
          </LabButton>
        </div>
      </form>
    </EditorDialog>
  );
}

// ─── §6 Swap requests ──────────────────────────────────────────────────────
type Slot = RosterRequest["give"];
const keyOf = (s: Slot) => `${s.placeId}|${s.date}|${s.shift}`;
const parse = (k: string): Slot | null => {
  if (!k) return null;
  const [placeId, date, shift] = k.split("|");
  return { placeId: placeId!, date: date!, shift: shift as Shift };
};
const started = (s: Slot, now: RosterView["now"]) =>
  s.date < now.date || (s.date === now.date && now.min >= SHIFT_START[s.shift]);
const byWhen = (a: Slot, b: Slot) =>
  a.date.localeCompare(b.date) || SHIFTS.indexOf(a.shift) - SHIFTS.indexOf(b.shift);
const isOpen = (st: string) => st === "colleague" || st === "incharge";
type Step = "done" | "no" | "now" | "wait";
const STEP: Record<Step, string> = {
  done: TONE.green,
  now: TONE.amber,
  no: TONE.red,
  wait: "bg-tide-sunken text-ink-500",
};
const STATE_TONE: Record<string, Tone> = {
  colleague: "amber",
  incharge: "blue",
  approved: "green",
  declined: "red",
  rejected: "red",
  withdrawn: "grey",
  expired: "grey",
  stale: "grey",
};

type Filter = "mine" | "open" | "all";

export function SwapRequests({ view, toast }: SectionProps) {
  const W = RS.swaps;
  const [filter, setFilter] = useState<Filter>("open");
  const [asking, setAsking] = useState<{
    id: string;
    kind: "declined" | "rejected";
    text: string;
  } | null>(null);
  const [formOpen, setFormOpen] = useState<string | false>(false);
  const [pending, run] = useAct(toast);
  // The slot dialog's "Ask a colleague to swap or cover" opens this form on that shift.
  useEffect(() => {
    const open = (e: Event) => setFormOpen(keyOf((e as CustomEvent<Slot>).detail));
    window.addEventListener(ASK_SWAP_EVENT, open);
    return () => window.removeEventListener(ASK_SWAP_EVENT, open);
  }, []);
  if (!view.ready) return <NeedsDb title={W.title} />;

  const me = view.viewerId;
  const R = view.duties;
  const editable = new Set(view.editable);
  const canAp = (rq: RosterRequest) => canApprove(rq, (id) => editable.has(id));
  const eff = (rq: RosterRequest) => effStatus(rq, R, view.now);
  const needsMe = (rq: RosterRequest) => {
    const st = eff(rq);
    return (st === "colleague" && rq.toUser === me) || (st === "incharge" && canAp(rq));
  };
  const visible = (rq: RosterRequest, f: Filter) => {
    const st = eff(rq);
    if (f === "open") return isOpen(st);
    if (f === "mine") return needsMe(rq) || (isOpen(st) && rq.fromUser === me);
    return true;
  };
  const need = view.requests.filter(needsMe).length;
  const count = (f: Filter) => view.requests.filter((rq) => visible(rq, f)).length;
  const list = view.requests.filter((rq) => visible(rq, filter));
  const canAsk = view.people.some((p) => p.userId === me);
  const published = (rq: RosterRequest) =>
    [rq.give, ...(rq.take ? [rq.take] : [])].some((s) =>
      view.publishedWeeks.includes(weekStart(s.date)),
    );

  const act = (
    rq: RosterRequest,
    action: "accepted" | "approved" | "withdrawn" | "declined" | "rejected",
    note: string | null,
  ) =>
    void run(
      () => actOnSwapAction({ requestId: rq.id, action, note }),
      () => {
        setAsking(null);
        const fr = nameOf(view, rq.fromUser);
        const to = nameOf(view, rq.toUser);
        return action === "accepted"
          ? W.flash.accepted
          : action === "approved"
            ? W.flash.approved(to, slotOf(view, rq.give))
            : action === "withdrawn"
              ? W.flash.withdrawn
              : action === "declined"
                ? W.flash.declined(fr)
                : W.flash.rejected;
      },
    );

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          {W.title}
          {need > 0 ? <Chip tone="amber">{W.needs(need)}</Chip> : null}
        </span>
      }
      note={W.sub}
      action={
        canAsk ? (
          <LabButton variant="primary" onClick={() => setFormOpen("")}>
            {W.ask}
          </LabButton>
        ) : null
      }
    >
      <div role="group" aria-label={W.filtersAria} className="flex flex-wrap gap-1.5">
        {(["mine", "open", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(pillBtn(filter === f), "focus-visible:shadow-focus outline-none")}
          >
            {W.filter[f](count(f))}
          </button>
        ))}
      </div>
      <ul className="divide-border flex flex-col divide-y">
        {list.length === 0 ? (
          <li className="text-body-s text-muted-foreground py-3">{W.empty[filter]}</li>
        ) : null}
        {list.map((rq) => {
          const st = eff(rq);
          const fr = personOf(view, rq.fromUser);
          const to = personOf(view, rq.toUser);
          const mine = asking?.id === rq.id ? asking : null;
          const breaks = isOpen(st)
            ? newBreaks(R, rq, view.params).map((x) =>
                W.breakItem(nameOf(view, x.userId), breakText(x.b)),
              )
            : [];
          const accepted =
            st === "incharge" ||
            st === "approved" ||
            st === "rejected" ||
            ((st === "stale" || st === "expired") && rq.status === "incharge");
          const s2: Step =
            st === "declined" ? "no" : accepted ? "done" : st === "colleague" ? "now" : "wait";
          const s3: Step =
            st === "approved"
              ? "done"
              : st === "rejected"
                ? "no"
                : st === "incharge"
                  ? "now"
                  : "wait";
          const steps: [Step, string][] = [
            ["done", W.step.asked],
            [s2, W.step.colleague(to.name, s2)],
            ...(st === "declined" ? [] : ([[s3, W.step.incharge(s3)]] as [Step, string][])),
          ];
          const trail = [
            ...rq.events.flatMap((e) => [
              W.event(e.action, nameOf(view, e.actor), stamp(e.at)) +
                (e.action === "approved" && published(rq) ? ` · ${W.published}` : ""),
              ...(e.note ? [RS.quoted(e.note)] : []),
            ]),
            ...(st === "expired" ? [W.expired] : st === "stale" ? [W.stale] : []),
          ].join(" · ");
          const waitApprove =
            st === "colleague" && canAp(rq) && me !== rq.toUser && me !== rq.fromUser;
          return (
            <li
              key={rq.id}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3"
            >
              <div className="flex min-w-0 flex-[1_1_22rem] gap-3">
                <span aria-hidden className="flex shrink-0 items-center">
                  <Avatar person={fr} size={36} />
                  <Avatar person={to} size={36} className="-ml-2" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body-s font-semibold">
                    {W.headline(rq.kind, fr.name, to.name)}
                  </span>
                  <span className="text-ink-700 text-[13px] leading-[18px]">
                    {rq.take
                      ? W.detailSwap(slotOf(view, rq.give), slotOf(view, rq.take))
                      : slotOf(view, rq.give)}
                  </span>
                  {rq.reason ? (
                    <span className="text-muted-foreground text-[12px]">
                      {RS.quoted(rq.reason)}
                    </span>
                  ) : null}
                  {breaks.length ? (
                    <span className="text-status-critical-fg-aa text-[12px] font-bold">
                      {W.breaksRow(breaks.join("; "))}
                    </span>
                  ) : null}
                  <span
                    aria-label={W.progressAria}
                    className="mt-0.5 flex flex-wrap items-center gap-1"
                  >
                    {steps.map(([k, label]) => (
                      <span
                        key={label}
                        className={cn(
                          "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold",
                          STEP[k],
                        )}
                      >
                        {label}
                      </span>
                    ))}
                  </span>
                  <span className="text-muted-foreground text-[11px] leading-[15px]">{trail}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Chip tone={STATE_TONE[st] ?? "grey"}>
                  {st === "colleague"
                    ? W.state.colleague(to.name)
                    : W.state[st as Exclude<typeof st, "colleague">]}
                </Chip>
                {mine ? (
                  <span className="flex flex-wrap justify-end gap-1.5">
                    <input
                      aria-label={W.act.why}
                      placeholder={W.act.why}
                      value={mine.text}
                      autoFocus
                      onChange={(e) => setAsking({ ...mine, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setAsking(null);
                        if (e.key === "Enter") act(rq, mine.kind, mine.text.trim() || null);
                      }}
                      className={cn(inputCls, "h-8 w-48")}
                    />
                    <LabButton
                      size="sm"
                      variant="primary"
                      busy={pending}
                      onClick={() => act(rq, mine.kind, mine.text.trim() || null)}
                    >
                      {mine.kind === "rejected" ? W.act.reject : W.act.decline}
                    </LabButton>
                    <LabButton size="sm" onClick={() => setAsking(null)}>
                      {RS.cancel}
                    </LabButton>
                  </span>
                ) : (
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {st === "colleague" && me === rq.toUser ? (
                      <>
                        <LabButton
                          size="sm"
                          variant="primary"
                          busy={pending}
                          onClick={() => act(rq, "accepted", null)}
                        >
                          {W.act.accept}
                        </LabButton>
                        <LabButton
                          size="sm"
                          onClick={() => setAsking({ id: rq.id, kind: "declined", text: "" })}
                        >
                          {W.act.decline}
                        </LabButton>
                      </>
                    ) : null}
                    {waitApprove ? (
                      <span title={W.approveWait(to.name)} className="cursor-not-allowed">
                        <LabButton
                          size="sm"
                          disabledReason={W.approveHint(to.name)}
                          reasonPlacement="below"
                        >
                          {W.act.approve}
                        </LabButton>
                      </span>
                    ) : null}
                    {st === "incharge" && canAp(rq) ? (
                      <>
                        <LabButton
                          size="sm"
                          variant="primary"
                          busy={pending}
                          onClick={() =>
                            rq.status !== "incharge"
                              ? toast(W.flash.notYet(to.name))
                              : act(rq, "approved", null)
                          }
                        >
                          {W.act.approve}
                        </LabButton>
                        <LabButton
                          size="sm"
                          onClick={() => setAsking({ id: rq.id, kind: "rejected", text: "" })}
                        >
                          {W.act.reject}
                        </LabButton>
                      </>
                    ) : null}
                    {isOpen(st) && me === rq.fromUser ? (
                      <LabButton
                        size="sm"
                        busy={pending}
                        onClick={() => act(rq, "withdrawn", null)}
                      >
                        {W.act.withdraw}
                      </LabButton>
                    ) : null}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {formOpen !== false ? (
        <SwapForm
          give={formOpen}
          view={view}
          toast={toast}
          onClose={() => setFormOpen(false)}
          onSent={() => {
            setFormOpen(false);
            setFilter("open");
          }}
        />
      ) : null}
    </Panel>
  );
}

function SwapForm({
  view,
  toast,
  onClose,
  onSent,
  give,
}: SectionProps & { onClose: () => void; onSent: () => void; give: string }) {
  const F = RS.swaps.form;
  const [clientKey] = useState(newKey);
  const [f, setF] = useState({
    give,
    kind: "cover" as "cover" | "swap",
    to: "",
    take: "",
    reason: "",
    error: "",
  });
  const [pending, run] = useAct(toast);
  const upd = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch, error: "" }));
  const me = view.viewerId;
  const R = view.duties;
  const meP = view.people.find((p) => p.userId === me);
  const end = addDays(view.weekStart, 13);
  const upcoming = (u: string) =>
    R.filter(
      (d) => d.userId === u && d.date >= view.weekStart && d.date <= end && !started(d, view.now),
    )
      .map(({ placeId, date, shift }) => ({ placeId, date, shift }))
      .sort(byWhen);
  const gives = upcoming(me);
  const g = parse(f.give);
  const placeName = g ? (view.places.find((p) => p.id === g.placeId)?.name ?? "") : null;
  const tos = g
    ? view.people.filter(
        (q) =>
          q.userId !== me &&
          q.places.includes(g.placeId) &&
          !onShift(R, q.userId, g.date, g.shift) &&
          !leaveOn(view.leaves, q.userId, g.date) &&
          licState(q, g.date, view.params) !== "expired",
      )
    : [];
  const theirs =
    g && f.to && f.kind === "swap"
      ? upcoming(f.to).filter(
          (c) => (meP?.places ?? []).includes(c.placeId) && !onShift(R, me, c.date, c.shift),
        )
      : [];
  const t = parse(f.take);
  const to = view.people.find((p) => p.userId === f.to);
  const ready = g && to && (f.kind === "cover" || t);
  const rq = ready
    ? {
        id: "",
        fromUser: me,
        toUser: f.to,
        kind: f.kind,
        give: g,
        take: f.kind === "swap" ? t : null,
        status: "colleague" as const,
      }
    : null;
  const warn = rq
    ? newBreaks(R, rq, view.params).map((x) =>
        RS.swaps.breakItem(nameOf(view, x.userId), breakText(x.b)),
      )
    : [];

  const send = () => {
    if (!g) return setF((x) => ({ ...x, error: F.err.give }));
    if (!to) return setF((x) => ({ ...x, error: F.err.to }));
    if (f.kind === "swap" && !t) return setF((x) => ({ ...x, error: F.err.take }));
    void run(
      () =>
        askSwapAction({
          clientKey,
          toUser: to.userId,
          kind: f.kind,
          give: g,
          take: f.kind === "swap" ? t : null,
          reason: f.reason.trim() || null,
        }),
      () => {
        onSent();
        return RS.swaps.flash.sent(to.name);
      },
    );
  };

  return (
    <FormDialog
      open
      onClose={onClose}
      title={RS.swaps.ask}
      sub={meP ? F.who(meP.name) : undefined}
      error={f.error}
      submit={RS.send}
      onSubmit={send}
      pending={pending}
    >
      {gives.length ? (
        <PickField
          label={F.give}
          placeholder={F.giveHint}
          options={gives.map((c) => ({ value: keyOf(c), label: slotOf(view, c) }))}
          value={f.give}
          onChange={(v) => upd({ give: v, to: "", take: "" })}
        />
      ) : (
        <Hint label={F.give} text={F.noGive} />
      )}
      <PickField
        label={F.kindAria}
        hideLabel
        options={(["cover", "swap"] as const).map((k) => ({ value: k, label: F.kind[k] }))}
        value={f.kind}
        onChange={(v) => upd({ kind: v as "cover" | "swap", take: "" })}
      />
      {tos.length ? (
        <PickField
          label={F.to}
          placeholder={F.toHint(placeName, true)}
          options={tos.map((q) => ({
            value: q.userId,
            label: F.colleague(q.name, CADRE[q.cadre]),
          }))}
          value={f.to}
          onChange={(v) => upd({ to: v, take: "" })}
        />
      ) : (
        <Hint label={F.to} text={F.toHint(placeName, false)} />
      )}
      {f.kind === "swap" ? (
        theirs.length ? (
          <PickField
            label={F.take}
            placeholder={F.takeHint(true, true)}
            options={theirs.map((c) => ({ value: keyOf(c), label: slotOf(view, c) }))}
            value={f.take}
            onChange={(v) => upd({ take: v })}
          />
        ) : (
          <Hint label={F.take} text={F.takeHint(!!f.to, false)} />
        )
      ) : null}
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>{RS.reasonLabel}</span>
        <input
          value={f.reason}
          maxLength={300}
          placeholder={F.reasonEg}
          onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))}
          className={inputCls}
        />
      </label>
      {ready && to && g ? (
        <p className="bg-tide-sunken text-body-s rounded-tide-tile px-3.5 py-2.5">
          {F.preview(to.name, slotOf(view, g), f.kind === "swap" && t ? slotOf(view, t) : null)}
        </p>
      ) : null}
      {warn.length ? (
        <p className="bg-status-critical-bg text-status-critical-fg-aa rounded-tide-tile px-3.5 py-2.5 text-[13px] font-semibold">
          {F.warn(warn.join("; "))}
        </p>
      ) : null}
    </FormDialog>
  );
}

/** A field with nothing to pick yet: its label and the reason, in words. */
export function Hint({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <p className="text-body-s text-muted-foreground">{text}</p>
    </div>
  );
}
