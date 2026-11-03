"use client";

import type { PlaceRow, PlacesView } from "@/lib/pharmacy/setup/types";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";

import { Tip } from "@/components/pharmacy/medicines/shared";
import { Avatar } from "@/components/pharmacy/roster/avatar";
import { HOURS, PLACE_KINDS } from "@/content/pharmacy-setup";
import { PL } from "@/content/pharmacy-setup-places";
import { cn } from "@/lib/utils";
import { OpenRow } from "./open-row";
import { dayOf, FRIDGE_TONE, fridgesAt, slotsOf, stateOf, Tag } from "./shared";

const COLS =
  "min-[760px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,0.9fr)]";

/** `Ward · 24 hours`, a dispensing point with its billing. */
export const kindLine = (p: PlaceRow) =>
  [
    PLACE_KINDS[p.kind] +
      (p.billing
        ? ` · ${p.billing.free ? PL.free : PL.charged}${p.billing.payFirst ? PL.payFirst : ""}`
        : ""),
    p.hours ? HOURS[p.hours].replace(", 08:00–17:00", "") : null,
  ]
    .filter(Boolean)
    .join(" · ");

export const fromLabel = (v: PlacesView, p: PlaceRow) => {
  if (p.suppliedFrom) return v.places.find((x) => x.id === p.suppliedFrom)?.name ?? PL.notSet;
  const names = p.supplierIds.flatMap((id) => v.suppliers.find((s) => s.id === id)?.name ?? []);
  return names.length ? names.join(", ") : PL.notSet;
};

/** On duty now: day shift 08:00–17:00, otherwise night and on call. */
const nowDuty = (v: PlacesView, p: PlaceRow) =>
  p.onDuty.filter((d) =>
    v.nowMin >= 480 && v.nowMin < 1020 ? d.shift === "day" : d.shift !== "day",
  );

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-caption text-ink-600 min-[760px]:sr-only">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

/** §B2: the grid; below 760 px the header hides and the cells wrap 2-up. */
export function PlacesGrid({
  view: v,
  rows,
  openId,
  onOpen,
  toast,
  onClear,
}: {
  view: PlacesView;
  rows: PlaceRow[];
  openId: string | null;
  onOpen: (id: string | null) => void;
  toast: (m: string) => void;
  onClear: () => void;
}) {
  const C = PL.cols;
  if (!rows.length)
    return (
      <p className="text-body-s text-ink-700 bg-ink-50 rounded-xl px-4 py-3">
        {PL.noMatch}{" "}
        <button
          type="button"
          onClick={onClear}
          className="text-primary font-semibold underline-offset-4 hover:underline"
        >
          {PL.showAll}
        </button>
      </p>
    );
  return (
    <div className="flex flex-col">
      <div
        aria-hidden
        className={cn(
          "text-ink-600 border-border hidden gap-3 border-b px-3 pb-2 text-[11px] font-semibold tracking-[0.06em] uppercase min-[760px]:grid",
          COLS,
        )}
      >
        {C.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <ul className="divide-border flex flex-col divide-y">
        {rows.map((p) => {
          const isOpen = openId === p.id;
          const fr = fridgesAt(v, p.id);
          const duty = p.closed ? [] : nowDuty(v, p);
          return (
            <li key={p.id} className="flex flex-col">
              <div className={cn("grid grid-cols-2 gap-3 px-3 py-3", COLS)}>
                <div className="col-span-2 flex min-w-0 items-start gap-1.5 min-[760px]:col-span-1">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={PL.openAria(isOpen, p.name)}
                    onClick={() => onOpen(isOpen ? null : p.id)}
                    className="focus-visible:shadow-focus -m-1 flex min-w-0 items-start gap-1.5 rounded-lg p-1 text-left outline-none"
                  >
                    <ChevronRightIcon
                      aria-hidden
                      className={cn(
                        "text-ink-600 mt-0.5 size-3.5 shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        isOpen && "rotate-90",
                      )}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-foreground text-[14px] font-semibold">{p.name}</span>
                      <span className="text-caption text-ink-600">{kindLine(p)}</span>
                    </span>
                  </button>
                  {p.closed ? <Tag tone="grey">{PL.closedTag}</Tag> : null}
                </div>
                <Cell label={C[1]}>
                  <span className="text-body-s text-ink-700">
                    {p.closed
                      ? PL.closedLine(dayOf(p.closed.at), p.closed.byName, p.closed.note)
                      : fromLabel(v, p)}
                  </span>
                </Cell>
                <Cell label={C[2]}>
                  <span className="text-body-s text-foreground tabular-nums">
                    {PL.lines(p.stock.lines)}
                  </span>
                  {p.stock.out ? <Tag tone="bad">{PL.out(p.stock.out)}</Tag> : null}
                  {p.stock.low ? <Tag tone="warn">{PL.low(p.stock.low)}</Tag> : null}
                  {!p.stock.out && !p.stock.low && p.stock.lines ? (
                    <Tag tone="ok">{PL.allOk}</Tag>
                  ) : null}
                </Cell>
                <Cell label={C[3]}>
                  {fr.length ? (
                    fr.map((f) => {
                      const st = stateOf(v, f);
                      return (
                        <span key={f.id} className="inline-flex items-center gap-1">
                          <span className="text-body-s text-foreground">{f.code}</span>
                          {st ? (
                            <Tag tone={FRIDGE_TONE[st]}>
                              {`${f.temp!.toFixed(1)} °C`}
                              <span className="sr-only">{`, ${PL.state[st]}`}</span>
                            </Tag>
                          ) : (
                            <Tag tone="grey">{PL.noReading}</Tag>
                          )}
                        </span>
                      );
                    })
                  ) : p.coldLines.length ? (
                    <Tag tone="warn">{PL.noFridgeCold}</Tag>
                  ) : (
                    <span className="text-body-s text-ink-600">{PL.none}</span>
                  )}
                </Cell>
                <Cell label={C[4]}>
                  {p.closed || !p.slots.length ? (
                    <span className="text-body-s text-ink-600">{PL.noHandover}</span>
                  ) : (
                    slotsOf(v, p).map((h) => (
                      <Tip
                        key={h.t}
                        label={
                          h.handover
                            ? PL.slotTip.done(
                                h.handover.from,
                                h.handover.to,
                                h.handover.at,
                                h.differences,
                              )
                            : h.st === "missed"
                              ? PL.slotTip.missed(h.t, v.rules.missedMin)
                              : PL.slotTip.due(h.t)
                        }
                      >
                        <Tag
                          tone={
                            h.st === "done"
                              ? h.differences
                                ? "warn"
                                : "ok"
                              : h.st === "missed"
                                ? "bad"
                                : h.st === "now"
                                  ? "info"
                                  : "grey"
                          }
                        >
                          {h.st === "done" ? PL.slot.done(h.t, h.differences) : PL.slot[h.st](h.t)}
                        </Tag>
                      </Tip>
                    ))
                  )}
                </Cell>
                <Cell label={C[5]}>
                  {duty.length ? (
                    <span className="flex items-center">
                      {duty.slice(0, 4).map((d, i) => (
                        <Tip key={d.userId} label={`${d.name} · ${PL.shift[d.shift]}`}>
                          <Avatar
                            person={{ name: d.name }}
                            size={28}
                            className={i ? "-ml-1.5" : undefined}
                          />
                          <span className="sr-only">{`${d.name} · ${PL.shift[d.shift]}`}</span>
                        </Tip>
                      ))}
                    </span>
                  ) : (
                    <span className="text-body-s text-ink-600">{PL.nobodyNow}</span>
                  )}
                </Cell>
              </div>
              {isOpen ? (
                <OpenRow key={p.id} view={v} place={p} toast={toast} onClose={() => onOpen(null)} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
