"use client";

import type { SectionProps } from "./roster-tab";
import type { Slot } from "./slot-dialog";
import type { Place, Shift } from "@/lib/pharmacy/derive/roster";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FunnelIcon,
  GripVerticalIcon,
  LockIcon,
  PlusIcon,
  PrinterIcon,
  TriangleAlertIcon,
} from "lucide-react";

import {
  copyLastWeekAction,
  fillGapsAction,
  moveBetweenSlotsAction,
  publishWeekAction,
  takeBackAction,
  unlockWeekAction,
} from "@/app/pharmacy/setup/roster-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { field, linkBtn, newKey, Tip } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Panel, Pill } from "@/components/tide/work/kit";
import { DialogTitle } from "@/components/ui/dialog";
import { CADRE, monthName, restWhyText, ROSTER_REFUSAL, SHIFT } from "@/content/pharmacy-roster";
import { PICKED_TINT, RG, SHIFT_TINT, TODAY_TINT } from "@/content/pharmacy-roster-grid";
import {
  activeDelegation,
  addDays,
  attendanceOf,
  capacity,
  cellOf,
  coverage,
  isPharmacyPlace,
  leaveOn,
  licState,
  monthCells,
  needsWitness,
  restWhy,
  SHIFTS,
  weekDates,
  weekStart,
} from "@/lib/pharmacy/derive/roster";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { HandOverDialog } from "./hand-over";
import { pendingSlots, roWhyOf, SlotDialog, useAct } from "./slot-dialog";

const B = RG.bar;
const W = RG.week;
/** §14: the week grid only, landscape, no `+`. */
const PRINT_CSS =
  "@media print{body *{visibility:hidden!important}.rs-print,.rs-print *{visibility:visible!important}.rs-print{position:absolute;left:0;top:0;width:100%;overflow:visible!important}.rs-print .rs-add{display:none!important}.rs-print .rs-grid{min-width:0!important}@page{size:landscape;margin:10mm}}";
const ring = {
  red: "shadow-[inset_0_0_0_1.5px_var(--color-status-critical-fg)]",
  amber: "shadow-[inset_0_0_0_1.5px_var(--color-status-caution-fg)]",
};
const chipBase =
  "inline-flex h-5 items-center rounded-full px-[7px] text-[11px] font-semibold whitespace-nowrap";
const iconBtn =
  "bg-card hover:bg-ink-50 focus-visible:ring-primary grid size-9 shrink-0 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--color-ink-300)] outline-none focus-visible:ring-2";
const off = "bg-tide-sunken text-ink-600 hover:bg-tide-sunken";

function Seg<K extends string>({
  label,
  value,
  opts,
  onPick,
}: {
  label: string;
  value: K;
  opts: Record<K, string>;
  onPick: (k: K) => void;
}) {
  return (
    <div role="group" aria-label={label} className="bg-tide-sunken flex rounded-[12px] p-1">
      {(Object.keys(opts) as K[]).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onPick(k)}
          className={cn(
            "focus-visible:ring-primary h-[34px] rounded-[9px] px-3.5 text-[13px] font-semibold transition-colors duration-150 outline-none focus-visible:ring-2",
            value === k ? "bg-card text-foreground shadow-sm" : "text-ink-600",
          )}
        >
          {opts[k]}
        </button>
      ))}
    </div>
  );
}

/** §3: the roster card — toolbar, who makes it, rule badges, coverage, then the week, month or phone day view. */
export function RosterCard({ view, toast, badges }: SectionProps & { badges: ReactNode }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [dept, setDept] = useState<"pharmacy" | "wards">("pharmacy");
  const [filter, setFilter] = useState("all");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [drag, setDrag] = useState<{ dutyId: string; userId: string; key: string } | null>(null);
  const [pick, setPick] = useState(view.now.date);
  const [handOpen, setHandOpen] = useState(false);
  const [unlock, setUnlock] = useState<string | null>(null);
  const [unlockErr, setUnlockErr] = useState("");
  const [yearText, setYearText] = useState<string | null>(null);
  const [busy, run] = useAct(toast);

  if (!view.ready)
    return (
      <Panel>
        <EmptyState title={RG.notReady.title} why={RG.notReady.why} next={RG.notReady.next} />
      </Panel>
    );

  const { now, params: P, duties: R } = view;
  const go = (q: Record<string, string>) =>
    router.push(`/pharmacy/setup?${new URLSearchParams({ tab: "people", ...q })}`, {
      scroll: false,
    });
  const isMonth = sp.get("view") === "month";
  const pharm = dept === "pharmacy";
  const dates = weekDates(view.weekStart);
  const end = dates[6]!;
  const locked = view.weekPublished;
  const byId = new Map(view.people.map((p) => [p.userId, p]));
  const deptPlaces = view.places.filter((p) => isPharmacyPlace(p) === pharm);
  const shown = deptPlaces.filter((p) => filter === "all" || filter === p.id);
  const ro = (placeId: string) => roWhyOf(view, placeId) !== null;
  const pend = pendingSlots(view);
  const canAnyEdit = view.editable.length > 0;
  const copyWhy = locked ? ROSTER_REFUSAL.locked : !canAnyEdit ? ROSTER_REFUSAL.viewOnly : null;
  const wardsEmpty = !pharm && !R.some((d) => deptPlaces.some((p) => p.id === d.placeId));
  const [y, m] = [Number(view.month.slice(0, 4)), Number(view.month.slice(5, 7)) - 1];
  const dd = dates.includes(pick) ? pick : dates.includes(now.date) ? now.date : dates[0]!;
  const close = () => {
    setSlot(null);
    setDrag(null);
  };

  // §3.2 who makes the roster
  const live = view.delegations.filter((d) => !d.revokedAt && activeDelegation(d, now.date));
  const myDel = live.filter((d) => d.toUser === view.viewerId);
  const ownerId = view.inCharge ? view.viewerId : view.delegations[0]?.fromUser;
  const owner = ownerId ? byId.get(ownerId) : undefined;
  const placeName = (id: string) => view.places.find((p) => p.id === id)?.name ?? "";
  const roNote = !canAnyEdit
    ? RG.maker.viewOnly
    : !view.inCharge && myDel.length
      ? RG.maker.youCanChange(
          myDel.some((d) => d.places.length === 0) ? null : view.editable.map(placeName),
        )
      : null;

  // §3.4 coverage
  const cov = coverage(R, deptPlaces, dates, byId);
  const monthGrid = isMonth
    ? monthCells(y, m).map((c) => {
        let any = false;
        let dc = 0;
        let nc = 0;
        let gp = 0;
        const faces: string[] = [];
        const day = R.filter((d) => d.date === c.date);
        if (day.some((d) => shown.some((p) => p.id === d.placeId)))
          for (const p of shown)
            for (const s of SHIFTS) {
              if (!p.shifts.includes(s)) continue;
              any = true;
              const cell = cellOf(day, c.date, p.id, s);
              if (
                !cell.length ||
                needsWitness(
                  cell.map((u) => byId.get(u)),
                  s,
                  p,
                )
              )
                gp++;
              if (s === "day") dc += cell.length;
              if (s === "night") nc += cell.length;
              for (const u of cell) if (!faces.includes(u)) faces.push(u);
            }
        return {
          ...c,
          any,
          dc,
          nc,
          gp,
          faces,
          locked: any && view.publishedWeeks.includes(weekStart(c.date)),
        };
      })
    : [];
  const inMonth = monthGrid.filter((c) => c.inMonth);
  const coverLine = isMonth
    ? RG.monthCover(
        y,
        m,
        inMonth.filter((c) => c.any).length,
        inMonth.length,
        inMonth.reduce((a, c) => a + c.gp, 0),
        inMonth.filter((c) => !c.any).length,
      )
    : RG.cover(cov.filled, cov.slots, cov.empty, cov.unwitnessed);

  // §3.5 cards and cells
  const card = (u: string, date: string, place: Place, s: Shift, phone = false) => {
    const per = byId.get(u);
    const name = per?.name ?? W.removed;
    const rw = restWhy(R, u, date, s, false, P);
    const licX = licState(per, date, P) === "expired";
    const onLv = leaveOn(view.leaves, u, date);
    const min =
      view.attendance.find((a) => a.userId === u && a.date === date && a.shift === s)?.min ?? null;
    const att = attendanceOf(min, date, s, place, now, P);
    const duty = R.find(
      (d) => d.userId === u && d.date === date && d.placeId === place.id && d.shift === s,
    );
    const sub = licX
      ? W.sub.licExpired
      : onLv
        ? W.sub.onLeave
        : rw.length
          ? W.sub.rest(restWhyText(rw[0]!))
          : pend.has(`${u}@${place.id}|${date}|${s}`)
            ? W.sub.swap
            : att
              ? att.kind === "ok"
                ? W.sub.ok(att.at)
                : att.kind === "late"
                  ? W.sub.late(att.at)
                  : "today" in att && att.today
                    ? W.sub.notIn
                    : W.sub.didNot
              : W.sub.plain(per ? CADRE[per.cadre] : "", s);
    const red = rw.length || licX || onLv || att?.kind === "none";
    const canDrag = !phone && !ro(place.id) && !!duty;
    return (
      <button
        key={u}
        type="button"
        draggable={canDrag}
        onDragStart={(e) => {
          if (!canDrag) return;
          e.dataTransfer.setData("text/plain", u);
          e.dataTransfer.effectAllowed = "move";
          setDrag({ dutyId: duty.id, userId: u, key: `${date}|${place.id}|${s}` });
        }}
        onDragEnd={() => setDrag(null)}
        onClick={() => setSlot({ date, placeId: place.id, shift: s, mode: "card", userId: u })}
        aria-label={W.cardAria(name, s, place.name)}
        className={cn(
          "text-tide-navy-900 focus-visible:ring-primary flex w-full items-center justify-between gap-2 rounded-[10px] px-2 py-1.5 text-left outline-none focus-visible:ring-2",
          SHIFT_TINT[s],
          red ? ring.red : att?.kind === "late" ? ring.amber : "",
          canDrag ? "cursor-grab" : "cursor-pointer",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Avatar person={per ?? { name }} size={24} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[12.5px] leading-4 font-semibold">{name}</span>
            <span className="truncate text-[11px] leading-[14px] opacity-80">{sub}</span>
          </span>
        </span>
        {phone ? null : <GripVerticalIcon aria-hidden className="size-3.5 shrink-0 opacity-50" />}
      </button>
    );
  };
  const note = (cell: string[], s: Shift, p: Place, long = false) =>
    !cell.length ? (
      <span className="text-status-critical-fg-aa text-[10px] leading-[13px] font-bold">
        {W.nobody}
      </span>
    ) : needsWitness(
        cell.map((u) => byId.get(u)),
        s,
        p,
      ) ? (
      <span className="text-status-caution-fg-aa inline-flex items-center gap-1 text-[10px] leading-[13px] font-bold">
        <TriangleAlertIcon aria-hidden className="size-3" />
        {long ? W.noWitnessDay : W.noWitness}
      </span>
    ) : null;
  const drop = (date: string, p: Place, s: Shift, cell: string[]) => {
    const dg = drag;
    setDrag(null);
    if (!dg || ro(p.id) || dg.key === `${date}|${p.id}|${s}`) return;
    const per = byId.get(dg.userId);
    if (!per?.places.includes(p.id)) return toast(RG.flash.notHere(per?.name ?? W.removed, p.name));
    if (cell.includes(dg.userId)) return;
    void run(
      () =>
        moveBetweenSlotsAction({
          dutyId: dg.dutyId,
          clientKey: newKey(),
          placeId: p.id,
          date,
          shift: s,
        }),
      () => toast(RG.flash.moved(per.name, s, p.name)),
    );
  };
  const holiday = (iso: string) => {
    const h = view.holidays[iso];
    return h ? W.holiday(h.name, h.confirmed) : null;
  };

  const togglePublish = () => {
    if (!view.canPublish) return toast(RG.flash.publishOnly);
    if (locked) return setUnlock("");
    void run(
      () => publishWeekAction({ weekStart: view.weekStart }),
      () => toast(RG.flash.published),
    );
  };

  return (
    <section
      aria-label="Roster"
      className="bg-card shadow-tide-card rounded-tide-card flex min-w-0 flex-col gap-3 p-4"
    >
      <style>{PRINT_CSS}</style>
      {/* §3.1 Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Seg
            label={B.deptAria}
            value={dept}
            opts={B.dept}
            onPick={(k) => {
              setDept(k);
              setFilter("all");
              close();
            }}
          />
          <Seg
            label={B.viewAria}
            value={isMonth ? "month" : "week"}
            opts={B.view}
            onPick={(k) =>
              go(
                k === "month"
                  ? { view: "month", month: view.month, week: view.weekStart }
                  : { week: view.weekStart },
              )
            }
          />
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label={isMonth ? B.prev.month : B.prev.week}
              className={iconBtn}
              onClick={() => {
                close();
                if (!isMonth) return go({ week: addDays(view.weekStart, -7) });
                const d = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 7);
                go({ view: "month", month: d });
              }}
            >
              <ChevronLeftIcon aria-hidden className="size-4" />
            </button>
            <span className="min-w-[10.5rem] text-center text-[14px] font-semibold tabular-nums">
              {isMonth ? B.monthLabel(y, m) : B.weekLabel(view.weekStart, end)}
            </span>
            <button
              type="button"
              aria-label={isMonth ? B.next.month : B.next.week}
              className={iconBtn}
              onClick={() => {
                close();
                if (!isMonth) return go({ week: addDays(view.weekStart, 7) });
                const d = new Date(Date.UTC(y, m + 1, 1)).toISOString().slice(0, 7);
                go({ view: "month", month: d });
              }}
            >
              <ChevronRightIcon aria-hidden className="size-4" />
            </button>
          </span>
          <LabButton
            onClick={() => {
              setPick(now.date);
              go(isMonth ? { view: "month", month: now.date.slice(0, 7) } : {});
            }}
          >
            {B.today}
          </LabButton>
          {isMonth ? (
            <span className="flex items-center gap-1">
              <select
                aria-label={B.monthAria}
                value={m}
                onChange={(e) =>
                  go({
                    view: "month",
                    month: `${y}-${String(Number(e.target.value) + 1).padStart(2, "0")}`,
                  })
                }
                className={cn(field, "h-9")}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {monthName(i)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                aria-label={B.yearAria}
                min={1900}
                max={2200}
                step={1}
                value={yearText ?? String(y)}
                onChange={(e) => {
                  setYearText(e.target.value);
                  const v = Number.parseInt(e.target.value, 10);
                  if (v >= 1900 && v <= 2200) {
                    setYearText(null);
                    go({ view: "month", month: `${v}-${view.month.slice(5, 7)}` });
                  }
                }}
                onBlur={() => setYearText(null)}
                className={cn(field, "h-9 w-[5.5rem] tabular-nums")}
              />
            </span>
          ) : null}
          <label className="flex items-center gap-1.5">
            <FunnelIcon aria-hidden className="text-ink-600 size-4" />
            <select
              aria-label={B.placeAria}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={cn(field, "h-9 max-w-[14rem]")}
            >
              <option value="all">{B.allPlaces}</option>
              {deptPlaces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pharm && !isMonth ? (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex h-7 items-center rounded-full px-3 text-[12px] font-bold",
                locked ? "bg-ink-700 text-ink-0" : "bg-ink-150 text-ink-600",
              )}
            >
              {locked ? B.published : B.draft}
            </span>
            <LabButton
              aria-disabled={copyWhy ? true : undefined}
              busy={busy}
              className={cn(copyWhy && off)}
              onClick={() =>
                copyWhy
                  ? toast(copyWhy)
                  : void run(
                      () => copyLastWeekAction({ weekStart: view.weekStart }),
                      (d: { copied: number; left: number }) =>
                        toast(d.copied || d.left ? RG.flash.copied(d.left) : RG.flash.noCopy),
                    )
              }
            >
              {B.copy}
            </LabButton>
            <LabButton
              title={B.fillTitle}
              aria-disabled={copyWhy ? true : undefined}
              busy={busy}
              className={cn(copyWhy && off)}
              onClick={() =>
                copyWhy
                  ? toast(copyWhy)
                  : void run(
                      () => fillGapsAction({ weekStart: view.weekStart }),
                      (d: { over: boolean; added: number; left: number }) =>
                        toast(d.over ? RG.flash.over : RG.flash.filled(d.added, d.left)),
                    )
              }
            >
              {B.fill}
            </LabButton>
            <button
              type="button"
              aria-label={B.print}
              className={iconBtn}
              onClick={() => {
                try {
                  window.print();
                } catch {
                  toast(RG.flash.noPrint);
                }
              }}
            >
              <PrinterIcon aria-hidden className="size-4" />
            </button>
            <LabButton
              variant={locked ? "secondary" : "primary"}
              aria-disabled={view.canPublish ? undefined : true}
              busy={busy}
              className={cn(!view.canPublish && off)}
              onClick={togglePublish}
            >
              {locked ? B.unlock : B.publish}
            </LabButton>
          </div>
        ) : null}
        {pharm && isMonth ? <span className="text-body-s text-ink-600">{B.monthHint}</span> : null}
      </div>

      {/* §3.2 Who makes the roster */}
      {pharm ? (
        <div
          role="group"
          aria-label={RG.maker.aria}
          className="bg-tide-sunken rounded-tide-tile flex flex-wrap items-center justify-between gap-2 px-3 py-2"
        >
          <span className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ink-600 text-[12px] font-semibold">{RG.maker.madeBy}</span>
            <span className="bg-card inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full py-0.5 pr-3 pl-0.5">
              {owner ? <Avatar person={owner} size={24} /> : null}
              {owner ? <b className="font-semibold">{owner.name}</b> : null}
              <span className="text-ink-600">{owner ? RG.maker.role : RG.maker.role.slice(2)}</span>
            </span>
            {live.length ? (
              <span className="text-ink-600 text-[12px] font-semibold">{RG.maker.handedTo}</span>
            ) : null}
            {live.map((d) => {
              const per = byId.get(d.toUser);
              const name = per?.name ?? W.removed;
              return (
                <span
                  key={d.id}
                  className="bg-card inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-[14px] py-0.5 pr-2 pl-0.5"
                >
                  <Avatar person={per ?? { name }} size={24} />
                  <b className="font-semibold">{name}</b>
                  <span className="text-ink-600">
                    {RG.maker.scope(d.places.map(placeName), d.until, d.canPublish)}
                  </span>
                  {view.inCharge ? (
                    <button
                      type="button"
                      aria-label={RG.maker.takeBackAria(name)}
                      className={cn(linkBtn, "min-h-6 px-0.5")}
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => takeBackAction({ delegationId: d.id }),
                          () => toast(RG.maker.takenBack(name)),
                        )
                      }
                    >
                      {RG.maker.takeBack}
                    </button>
                  ) : null}
                </span>
              );
            })}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {roNote ? <Pill>{roNote}</Pill> : null}
            {view.inCharge ? (
              <LabButton size="sm" onClick={() => setHandOpen(true)}>
                {RG.maker.handOver}
              </LabButton>
            ) : null}
          </span>
        </div>
      ) : (
        <div
          role="note"
          className="bg-tide-sunken rounded-tide-tile flex flex-wrap items-center gap-2 px-3 py-2"
        >
          <Pill>{RG.maker.viewOnly}</Pill>
          <span className="text-body-s text-ink-700">{RG.maker.wardsNote}</span>
        </div>
      )}

      {/* §3.3 Rule badges */}
      {badges}

      {wardsEmpty ? (
        <EmptyState title={RG.wardsEmpty.title} next={RG.wardsEmpty.next} />
      ) : (
        <>
          {/* §3.4 Coverage and legend */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-body-s text-ink-700 m-0">
              {coverLine}
            </p>
            <span className="flex flex-wrap gap-3">
              {SHIFTS.map((s) => (
                <span key={s} className="text-ink-600 inline-flex items-center gap-1.5 text-[12px]">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 rounded-[3px] shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
                      SHIFT_TINT[s],
                    )}
                  />
                  {RG.legend(s)}
                </span>
              ))}
            </span>
          </div>

          {isMonth ? (
            /* §3.6 Month view */
            <div className="grid grid-cols-7 gap-1 min-[761px]:gap-2">
              {W.dow.map((d) => (
                <span
                  key={d}
                  className="text-ink-600 text-center text-[11px] font-bold tracking-[0.06em]"
                >
                  {d}
                </span>
              ))}
              {monthGrid.map((c) => {
                const today = c.date === now.date;
                const hol = c.inMonth ? holiday(c.date) : null;
                return (
                  <button
                    key={c.date}
                    type="button"
                    aria-label={RG.month.aria(c.date, c.dc, c.nc, c.gp, c.any)}
                    onClick={() => {
                      setPick(c.date);
                      go({ week: c.date });
                    }}
                    className={cn(
                      "focus-visible:ring-primary flex min-h-[112px] min-w-0 flex-col gap-1.5 rounded-[12px] border p-2 text-left outline-none focus-visible:ring-2 max-[760px]:min-h-14 max-[760px]:p-1",
                      today ? "border-teal-400" : "border-ink-200",
                      !c.inMonth ? "bg-tide-sunken opacity-55" : today ? TODAY_TINT : "bg-card",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <span
                        className={cn(
                          "text-[13px] tabular-nums",
                          today
                            ? "text-tide-on-band grid h-6 min-w-6 place-items-center rounded-full bg-teal-700 font-bold"
                            : cn("font-semibold", c.inMonth ? "text-foreground" : "text-ink-500"),
                        )}
                      >
                        {Number(c.date.slice(8))}
                      </span>
                      {hol ? (
                        <span
                          title={hol}
                          className="text-status-critical-fg-aa truncate text-[10px] font-semibold max-[760px]:hidden"
                        >
                          {hol}
                        </span>
                      ) : null}
                      {c.locked ? (
                        <LockIcon
                          aria-hidden
                          className="text-ink-500 size-3 shrink-0 max-[760px]:hidden"
                        />
                      ) : null}
                    </span>
                    {c.any ? (
                      <span className="flex flex-col gap-1 max-[760px]:hidden">
                        <span className="text-ink-700 flex gap-2 text-[11px] font-semibold">
                          <span>{RG.month.day(c.dc)}</span>
                          <span>{RG.month.night(c.nc)}</span>
                        </span>
                        <span className="flex items-center">
                          {c.faces.slice(0, 3).map((u, i) => (
                            <Avatar
                              key={u}
                              person={byId.get(u)}
                              size={22}
                              className={i ? "-ml-1.5" : ""}
                            />
                          ))}
                          {c.faces.length > 3 ? (
                            <span className="text-ink-600 ml-1 text-[11px] font-semibold">
                              {RG.month.more(c.faces.length - 3)}
                            </span>
                          ) : null}
                        </span>
                        {c.gp ? (
                          <span className="text-status-caution-fg-aa text-[11px] font-semibold">
                            {W.gaps(c.gp)}
                          </span>
                        ) : null}
                      </span>
                    ) : c.inMonth ? (
                      <span className="text-ink-500 text-[11px] max-[760px]:hidden">
                        {RG.month.notRostered}
                      </span>
                    ) : null}
                    <span
                      aria-hidden
                      className={cn(
                        "mx-auto mt-0.5 hidden size-1.5 rounded-full max-[760px]:block",
                        !c.any ? "bg-transparent" : c.gp ? "bg-status-caution-fg" : "bg-ink-400",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              {/* §3.5 Week view (≥ 761 px) and print */}
              <div className="rs-print hidden min-[761px]:block print:block">
                <p className="m-0 mb-2 hidden text-[16px] font-semibold print:block">
                  {W.printTitle(view.weekStart, end, locked)}
                </p>
                <div className="overflow-x-auto">
                  <div className="rs-grid grid min-w-[1080px] grid-cols-[10.5rem_repeat(7,minmax(120px,1fr))] gap-1">
                    <span />
                    {dates.map((d, i) => {
                      const today = d === now.date;
                      const st = cov.days[i]!;
                      const hol = holiday(d);
                      return (
                        <div
                          key={d}
                          className="flex min-w-0 flex-col items-start gap-0.5 px-1 pb-2"
                        >
                          <span
                            className={cn(
                              "text-[12px] font-bold tracking-[0.06em]",
                              today ? "text-teal-700" : "text-ink-600",
                            )}
                          >
                            {W.dow[i]}
                          </span>
                          <span
                            className={cn(
                              "text-[20px] leading-6 font-semibold tabular-nums",
                              today ? "text-teal-700" : "text-foreground",
                            )}
                          >
                            {Number(d.slice(8))}
                          </span>
                          <span
                            aria-hidden
                            className={cn(
                              "h-[3px] w-[18px] rounded-full",
                              today ? "bg-teal-700" : "bg-ink-300",
                            )}
                          />
                          <span className="text-ink-600 text-[11px]">
                            {W.counts(st.day, st.night)}
                          </span>
                          {st.gaps ? (
                            <span className="text-status-caution-fg-aa inline-flex items-center gap-1 text-[11px] font-semibold">
                              <TriangleAlertIcon aria-hidden className="size-3" />
                              {W.gaps(st.gaps)}
                            </span>
                          ) : null}
                          {hol ? (
                            <span
                              title={W.holidayTitle}
                              className={cn(
                                chipBase,
                                "bg-status-critical-bg text-status-critical-fg-aa max-w-full truncate",
                              )}
                            >
                              {hol}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}

                    {pharm ? (
                      <>
                        <div className="flex flex-col justify-center px-1">
                          <span className="text-[13px] font-semibold">{W.leaveRow}</span>
                          <span className="text-ink-600 text-[11px]">{W.leaveSub}</span>
                        </div>
                        {dates.map((d) => (
                          <div
                            key={d}
                            className="bg-tide-sunken flex min-h-8 flex-wrap content-start gap-1 rounded-[10px] p-1"
                          >
                            {view.leaves
                              .filter(
                                (l) =>
                                  (l.status === "approved" || l.status === "pending") &&
                                  l.from <= d &&
                                  d <= l.to &&
                                  byId.has(l.userId),
                              )
                              .map((l) => {
                                const name = byId.get(l.userId)!.name;
                                const ap = l.status === "approved";
                                return (
                                  <Tip key={l.id} label={W.leaveTip(name, l.kind, ap)}>
                                    <span
                                      className={cn(
                                        chipBase,
                                        ap
                                          ? "bg-ink-150 text-ink-600"
                                          : "bg-card text-status-caution-fg-aa shadow-[inset_0_0_0_1px_var(--color-status-caution-fg)]",
                                      )}
                                    >
                                      {W.leaveChip(name, ap)}
                                    </span>
                                  </Tip>
                                );
                              })}
                          </div>
                        ))}
                      </>
                    ) : null}

                    {shown.map((p) => (
                      <Fragment key={p.id}>
                        <div className="border-ink-200 col-span-8 mt-1 flex items-baseline gap-2 border-t px-1 pt-2">
                          <span className="text-[14px] font-semibold">{p.name}</span>
                          <span className="text-ink-600 text-[12px]">{RG.placeKind[p.kind]}</span>
                        </div>
                        {SHIFTS.filter((s) => p.shifts.includes(s)).map((s) => (
                          <Fragment key={s}>
                            <div className="flex flex-col justify-center px-1">
                              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                                <span
                                  aria-hidden
                                  className={cn(
                                    "size-2.5 rounded-[3px] shadow-[inset_0_0_0_1px_var(--color-ink-300)]",
                                    SHIFT_TINT[s],
                                  )}
                                />
                                {SHIFT[s].label}
                              </span>
                              <span className="text-ink-600 text-[11px]">{SHIFT[s].time}</span>
                            </div>
                            {dates.map((d) => {
                              const cell = cellOf(R, d, p.id, s);
                              const k = `${d}|${p.id}|${s}`;
                              const open = !ro(p.id) && cell.length < capacity(s, P);
                              const target = !!drag && open && drag.key !== k;
                              return (
                                <div
                                  key={d}
                                  onDragOver={(e) => {
                                    if (drag && open) e.preventDefault();
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    drop(d, p, s, cell);
                                  }}
                                  className={cn(
                                    "flex min-h-11 min-w-0 flex-col gap-1 rounded-[12px] p-1",
                                    d === now.date && TODAY_TINT,
                                    target && "shadow-[inset_0_0_0_1.5px_var(--color-tide-lagoon)]",
                                  )}
                                >
                                  {cell.map((u) => card(u, d, p, s))}
                                  {open ? (
                                    <button
                                      type="button"
                                      aria-label={W.addAria(s, p.name, d)}
                                      onClick={() =>
                                        setSlot({
                                          date: d,
                                          placeId: p.id,
                                          shift: s,
                                          mode: "assign",
                                        })
                                      }
                                      className={cn(
                                        "rs-add border-ink-300 text-ink-500 hover:bg-ink-50 focus-visible:ring-primary grid w-full place-items-center rounded-[10px] border-[1.5px] border-dashed outline-none focus-visible:ring-2",
                                        cell.length ? "min-h-[30px]" : "min-h-10",
                                      )}
                                    >
                                      <PlusIcon aria-hidden className="size-4" />
                                    </button>
                                  ) : null}
                                  {note(cell, s, p)}
                                </div>
                              );
                            })}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>

              {/* §3.7 Phone day view (≤ 760 px) */}
              <div className="flex flex-col gap-3 min-[761px]:hidden print:hidden">
                <div role="group" aria-label={W.dayAria} className="grid grid-cols-7 gap-1">
                  {dates.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={d === dd}
                      onClick={() => setPick(d)}
                      className={cn(
                        "focus-visible:ring-primary flex flex-col items-center rounded-[12px] py-1.5 outline-none focus-visible:ring-2",
                        d === dd ? PICKED_TINT : d === now.date ? TODAY_TINT : "",
                      )}
                    >
                      <span
                        className={cn(
                          "text-[11px] font-bold tracking-[0.06em]",
                          d === now.date ? "text-teal-700" : "text-ink-600",
                        )}
                      >
                        {W.dow[i]}
                      </span>
                      <span className="text-[16px] font-semibold tabular-nums">
                        {Number(d.slice(8))}
                      </span>
                    </button>
                  ))}
                </div>
                {shown.map((p) => (
                  <div key={p.id} className="flex flex-col gap-2">
                    <span className="text-[14px] font-semibold">{p.name}</span>
                    {SHIFTS.filter((s) => p.shifts.includes(s)).map((s) => {
                      const cell = cellOf(R, dd, p.id, s);
                      return (
                        <div key={s} className="flex flex-col gap-1.5">
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
                            {SHIFT[s].label}
                            <span className="text-ink-600 text-[12px] font-normal">
                              {SHIFT[s].time.replace(", by phone", "")}
                            </span>
                          </span>
                          <div className="flex flex-col gap-1">
                            {cell.map((u) => card(u, dd, p, s, true))}
                            {!ro(p.id) && cell.length < capacity(s, P) ? (
                              <LabButton
                                size="sm"
                                className="w-fit"
                                aria-label={W.dayAddAria(s, p.name)}
                                onClick={() =>
                                  setSlot({ date: dd, placeId: p.id, shift: s, mode: "assign" })
                                }
                              >
                                {W.assign}
                              </LabButton>
                            ) : null}
                            {note(cell, s, p, true)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <SlotDialog view={view} toast={toast} slot={slot} onSlot={setSlot} />
      {view.inCharge ? (
        <HandOverDialog
          view={view}
          toast={toast}
          open={handOpen}
          onClose={() => setHandOpen(false)}
        />
      ) : null}
      <EditorDialog
        open={unlock !== null}
        onOpenChange={(o) => !o && setUnlock(null)}
        width="medium"
      >
        <div className="flex flex-col gap-1 px-6 pt-5 pb-3">
          <DialogTitle>{RG.unlockDlg.title}</DialogTitle>
          <p className="text-body-s text-ink-600 m-0">{RG.unlockDlg.sub}</p>
        </div>
        <label className="flex flex-col gap-1.5 px-6 pb-4">
          <span className="text-body-s font-semibold">{RG.unlockDlg.label}</span>
          <textarea
            value={unlock ?? ""}
            onChange={(e) => {
              setUnlock(e.target.value);
              setUnlockErr("");
            }}
            placeholder={RG.unlockDlg.placeholder}
            rows={3}
            className="bg-card border-ink-300 focus-visible:ring-primary rounded-[12px] border px-3 py-2 text-[14px] outline-none focus-visible:ring-2"
          />
          {unlockErr ? (
            <span role="alert" className="text-status-critical-fg-aa text-[13px] font-semibold">
              {unlockErr}
            </span>
          ) : null}
        </label>
        <div className="border-border flex justify-end gap-2 border-t px-6 py-3">
          <LabButton variant="text" onClick={() => setUnlock(null)}>
            {RG.unlockDlg.cancel}
          </LabButton>
          <LabButton
            busy={busy}
            onClick={() => {
              if ((unlock ?? "").trim().length < 2) return setUnlockErr(RG.unlockDlg.error);
              void run(
                () =>
                  unlockWeekAction({ weekStart: view.weekStart, reason: (unlock ?? "").trim() }),
                () => {
                  setUnlock(null);
                  toast(RG.flash.unlocked);
                },
              );
            }}
          >
            {B.unlock}
          </LabButton>
        </div>
      </EditorDialog>
    </section>
  );
}
