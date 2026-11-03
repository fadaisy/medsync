"use client";

import type { Hours, PlaceKind } from "@/content/pharmacy-setup";
import type { FridgeRow, PlaceRow, PlacesView } from "@/lib/pharmacy/setup/types";
import type { ReactNode } from "react";
import Link from "next/link";
import { useState } from "react";

import { PickField } from "@/app/lab/_components/v2/fields";
import { PointControls } from "@/app/pharmacy/setup/_components/point-controls";
import {
  closePlaceAction,
  reopenPlaceAction,
  updatePlaceAction,
} from "@/app/pharmacy/setup/setup-actions";
import { linkBtn, pillBtn } from "@/components/pharmacy/medicines/shared";
import { Avatar } from "@/components/pharmacy/roster/avatar";
import { inputCls, labelCls, useAct } from "@/components/pharmacy/roster/swaps";
import { LabButton } from "@/components/tide/work/button";
import {
  DEFAULT_DEVICE,
  DEVICES,
  HANDOVER_SLOTS,
  HOURS,
  PLACE_KINDS,
} from "@/content/pharmacy-setup";
import { PL } from "@/content/pharmacy-setup-places";
import { canClose, deviceStatus, typedDue } from "@/lib/pharmacy/derive/setup/places";
import { ReadingDialog } from "./cold-chain";
import { clock, dayOf, FRIDGE_TONE, fridgesAt, stateOf, Tag } from "./shared";

type Device = (typeof DEVICES)[number];
const DIRECT = "direct";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-ink-600 text-[11px] font-semibold tracking-[0.06em] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The "Supplied from" choice: an open store (never itself, never for a store) or direct from suppliers. */
export function SupplyField({
  view: v,
  selfId,
  kind,
  from,
  sups,
  onFrom,
  onSups,
}: {
  view: PlacesView;
  selfId: string | null;
  kind: PlaceKind;
  from: string;
  sups: string[];
  onFrom: (v: string) => void;
  onSups: (v: string[]) => void;
}) {
  const stores =
    kind === "store"
      ? []
      : v.places.filter((p) => p.kind === "store" && !p.closed && p.id !== selfId);
  return (
    <div className="flex flex-col gap-2">
      <PickField
        label={PL.suppliedFrom}
        options={[
          ...stores.map((s) => ({ value: s.id, label: s.name })),
          { value: DIRECT, label: PL.direct },
        ]}
        value={from}
        onChange={onFrom}
      />
      {from === DIRECT ? (
        v.suppliers.length ? (
          <div role="group" aria-label={PL.suppliers} className="flex flex-wrap gap-1.5">
            {v.suppliers.map((s) => {
              const on = sups.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSups(on ? sups.filter((x) => x !== s.id) : [...sups, s.id])}
                  className={pillBtn(on)}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="text-caption text-ink-600">{PL.noSuppliers}</span>
        )
      ) : null}
    </div>
  );
}

const devTag = (lastSeenAt: string | null, nowMs: number) => {
  const d = deviceStatus(lastSeenAt ? Date.parse(lastSeenAt) : null, nowMs);
  return d.k === "online" ? (
    <Tag tone="ok">{PL.device.online(d.min)}</Tag>
  ) : d.k === "offline" ? (
    <Tag tone="warn">{PL.device.offline(d.min)}</Tag>
  ) : (
    <Tag tone="grey">{PL.device.none}</Tag>
  );
};

export const fridgeSub = (v: PlacesView, f: FridgeRow) => {
  const range = PL.range(f.todayMin, f.todayMax);
  return f.sensorId
    ? PL.sensorSub(f.sensorId, clock(f.readAt), range)
    : PL.typedSub(Object.keys(f.typed).sort(), range);
};

/** §B3: the open row: About, Stock here, Handover, Cold chain, On duty today, and the footer. */
export function OpenRow({
  view: v,
  place: p,
  toast,
  onClose,
}: {
  view: PlacesView;
  place: PlaceRow;
  toast: (m: string) => void;
  onClose: () => void;
}) {
  const [pending, run] = useAct(toast);
  const [name, setName] = useState(p.name);
  const [kind, setKind] = useState<PlaceKind>(p.kind);
  const [hours, setHours] = useState<Hours>(p.hours ?? "24h");
  const [from, setFrom] = useState(p.suppliedFrom ?? DIRECT);
  const [sups, setSups] = useState(p.supplierIds);
  const [device, setDevice] = useState<string>(p.device ?? DEFAULT_DEVICE[p.kind]);
  const [slots, setSlots] = useState(p.slots);
  const [err, setErr] = useState("");
  const [reading, setReading] = useState<FridgeRow | null>(null);
  const fr = fridgesAt(v, p.id);
  const why = v.can.manage ? null : PL.inChargeOnly;
  const edit =
    <T,>(set: (x: T) => void) =>
    (x: T) => (set(x), setErr(""));

  const save = () => {
    const n = name.trim();
    if (!n) return setErr(PL.errName);
    if (v.places.some((q) => q.id !== p.id && q.name.toLowerCase() === n.toLowerCase()))
      return setErr(PL.errDup);
    if (kind === "store" && from !== DIRECT) return setErr(PL.errStoreSelf);
    void run(
      () =>
        updatePlaceAction({
          id: p.id,
          kind,
          name: n,
          hours,
          suppliedFrom: from === DIRECT ? null : from,
          supplierIds: from === DIRECT ? sups : [],
          device,
          slots,
        }),
      () => PL.saved(n),
    ).then((ok) => ok && onClose());
  };
  const toggleClosed = () => {
    if (p.closed)
      return void run(
        () => reopenPlaceAction({ id: p.id, note: null }),
        () => PL.reopened(p.name),
      ).then((ok) => ok && onClose());
    const g = canClose(p.stock.lines, p.handoverOpen);
    if (g) return setErr(g === "stock" ? PL.guardStock(p.stock.lines) : PL.guardHandover);
    void run(
      () => closePlaceAction({ id: p.id, note: null }),
      () => PL.closedFlash(p.name),
    ).then((ok) => ok && onClose());
  };

  return (
    <div className="bg-ink-50 mb-3 flex flex-col gap-5 rounded-2xl p-4 min-[760px]:ml-7">
      <div className="grid gap-5 min-[960px]:grid-cols-2">
        <Section title={PL.about}>
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>{PL.name}</span>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => edit(setName)(e.target.value)}
            />
          </label>
          {p.kindLocked ? (
            <div className="flex flex-col gap-0.5">
              <span className={labelCls}>{PL.kind}</span>
              <span className="text-body-s text-foreground">
                {PLACE_KINDS[p.kind]} <span className="text-ink-600">· {PL.kindHub}</span>
              </span>
            </div>
          ) : (
            <PickField
              label={PL.kind}
              options={(["clinic", "theatre"] as const).map((k) => ({
                value: k,
                label: PLACE_KINDS[k],
              }))}
              value={kind}
              onChange={edit((x: string) => setKind(x as PlaceKind))}
            />
          )}
          <PickField
            label={PL.open}
            options={(Object.keys(HOURS) as Hours[]).map((h) => ({ value: h, label: HOURS[h] }))}
            value={hours}
            onChange={edit((x: string) => setHours(x as Hours))}
          />
          <SupplyField
            view={v}
            selfId={p.id}
            kind={kind}
            from={from}
            sups={sups}
            onFrom={edit(setFrom)}
            onSups={edit(setSups)}
          />
          <PickField
            label={PL.workedFrom}
            options={DEVICES.map((d: Device) => ({ value: d, label: d }))}
            value={device}
            onChange={edit(setDevice)}
          />
          {devTag(p.lastSeenAt, v.nowMs)}
          {p.billing ? (
            <div className="bg-card flex flex-col gap-1.5 rounded-xl p-3">
              <span className={labelCls}>{PL.billing}</span>
              <span className="text-body-s text-foreground">
                {PL.billingNow(p.billing.free, p.billing.payFirst)}
              </span>
              <span className="text-caption text-ink-600">
                {PL.neverHeld} {PL.billingToday}
              </span>
              {v.can.manage ? (
                <PointControls
                  pointId={p.id}
                  mode={p.billing.free ? "free" : "charged"}
                  payFirst={p.billing.payFirst}
                  today={v.today}
                />
              ) : null}
            </div>
          ) : null}
        </Section>

        <div className="flex min-w-0 flex-col gap-5">
          <Section title={PL.stockHere}>
            <span className="text-body-s text-foreground">
              {PL.stockLine(
                p.stock.lines,
                p.stock.low,
                p.stock.out,
                p.stock.valueUgx,
                p.kind === "clinic",
              )}
            </span>
            {p.short.length ? (
              <ul className="flex flex-col gap-1">
                {p.short.map((x) => (
                  <li key={x.name} className="text-body-s flex items-center justify-between gap-2">
                    <span className="min-w-0">{x.name}</span>
                    <Tag tone={x.state === "out" ? "bad" : "warn"}>{PL.shortState[x.state]}</Tag>
                  </li>
                ))}
              </ul>
            ) : null}
            <Link href="/pharmacy/setup?tab=medicines" className={linkBtn}>
              {PL.openMedicines}
            </Link>
          </Section>

          <Section title={PL.handover}>
            <div role="group" aria-label={PL.slotsAria} className="flex flex-wrap gap-1.5">
              {HANDOVER_SLOTS.map((t) => {
                const on = slots.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      edit(setSlots)(on ? slots.filter((x) => x !== t) : [...slots, t].sort())
                    }
                    className={pillBtn(on)}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            {p.history.length ? (
              <ul className="flex flex-col gap-1.5">
                {p.history.map((h) => (
                  <li
                    key={`${h.date}${h.slot}`}
                    className="text-body-s flex flex-wrap items-center gap-x-2 gap-y-1"
                  >
                    <span className="text-foreground font-semibold">
                      {PL.histWhen(h.date, h.slot)}
                    </span>
                    {h.from ? (
                      <span className="text-ink-700">{PL.histWho(h.from, h.to)}</span>
                    ) : null}
                    <Tag tone={h.missed ? "bad" : h.differences ? "warn" : "ok"}>
                      {h.missed ? PL.histMissed : PL.histResult(h.at, h.differences)}
                    </Tag>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-body-s text-ink-600">{PL.noHandovers}</span>
            )}
          </Section>

          <Section title={PL.cold}>
            {fr.map((f) => {
              const st = stateOf(v, f);
              return (
                <div key={f.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-body-s text-foreground font-semibold">
                    {PL.fridgeName(f.code, f.name)}
                  </span>
                  {st ? (
                    <Tag tone={FRIDGE_TONE[st]}>{`${f.temp!.toFixed(1)} °C · ${PL.state[st]}`}</Tag>
                  ) : (
                    <Tag tone="grey">{PL.noReading}</Tag>
                  )}
                  <span className="text-caption text-ink-700 basis-full">{fridgeSub(v, f)}</span>
                  {!f.sensorId && v.can.readings ? (
                    <LabButton size="sm" onClick={() => setReading(f)}>
                      {PL.record}
                    </LabButton>
                  ) : null}
                  {!f.sensorId
                    ? typedDue(f.typed, v.nowMin, v.rules.missedMin)
                        .filter((c) => c.st === "late")
                        .map((c) => (
                          <Tag key={c.t} tone="bad">
                            {PL.typed.late(c.t)}
                          </Tag>
                        ))
                    : null}
                </div>
              );
            })}
            {!fr.length ? (
              p.coldLines.length ? (
                <p
                  role="note"
                  className="bg-status-caution-bg text-status-caution-fg-aa text-body-s rounded-xl px-3 py-2"
                >
                  {PL.coldWarn(p.coldLines)}
                </p>
              ) : (
                <span className="text-body-s text-ink-600">{PL.noColdNeed}</span>
              )
            ) : null}
          </Section>

          <Section title={PL.onDutyToday}>
            {p.onDuty.length ? (
              <div className="flex flex-wrap gap-1.5">
                {p.onDuty.map((d) => (
                  <span
                    key={`${d.userId}${d.shift}`}
                    className="bg-card text-body-s inline-flex h-8 items-center gap-1.5 rounded-full pr-3 pl-1"
                  >
                    <Avatar person={{ name: d.name }} size={24} />
                    {`${d.name} · ${PL.shift[d.shift]}`}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-body-s text-ink-600">{PL.nobodyRostered}</span>
            )}
            <Link href="/pharmacy/setup?tab=people" className={linkBtn}>
              {PL.openRoster}
            </Link>
          </Section>
        </div>
      </div>

      {err ? (
        <p role="alert" className="bg-card text-body-s rounded-xl px-3.5 py-2.5 font-semibold">
          {err}
        </p>
      ) : null}
      <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {v.can.manage ? (
            <LabButton busy={pending} onClick={toggleClosed}>
              {p.closed ? PL.reopen : PL.close}
            </LabButton>
          ) : null}
          {p.closed ? (
            <span className="text-caption text-ink-700">
              {PL.closedLine(dayOf(p.closed.at), p.closed.byName, p.closed.note)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LabButton variant="text" onClick={onClose}>
            {PL.cancel}
          </LabButton>
          {p.closed ? null : (
            <LabButton variant="primary" busy={pending} disabledReason={why} onClick={save}>
              {PL.save}
            </LabButton>
          )}
        </div>
      </div>
      <ReadingDialog view={v} fridge={reading} toast={toast} onClose={() => setReading(null)} />
    </div>
  );
}
