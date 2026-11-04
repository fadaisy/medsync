"use client";

import type { ReceiveOrder } from "@/lib/pharmacy/derive/receive";
import type { ReactNode } from "react";
import { useState } from "react";

import { editOrderAction, markChasedAction } from "@/app/pharmacy/stock/store/receive-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { newKey } from "@/components/pharmacy/store/shared";
import { LabButton } from "@/components/tide/work/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RB } from "@/content/pharmacy-receive-board";
import { atText, chaseText, money, num, orderDue, plural } from "@/lib/pharmacy/derive/receive";
import { cn } from "@/lib/utils";
import { useReceive } from "../provider";
import { Field, inputCls, selectCls } from "../shared";

const T = RB.order;
const digits = (v: string) => v.replace(/\D/g, "");
const GRID =
  "min-[640px]:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)_minmax(0,1fr)_2rem]";

interface Draft {
  key: string;
  /** `null` for a line added here. */
  id: string | null;
  medId: string;
  packs: string;
  price: string;
  received: number;
}

const draftOf = (o: ReceiveOrder): Draft[] =>
  o.lines.map((l) => ({
    key: l.id,
    id: l.id,
    medId: l.medId,
    packs: String(l.packs),
    price: String(l.price),
    received: l.received,
  }));
const foot = "border-border flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3.5";

/** RECEIVE §C1–C2: the order line by line, and the same lines as inputs to change it. */
export function OrderDialog({
  orderId,
  startEditing,
  onClose,
}: {
  orderId: string;
  startEditing?: boolean;
  onClose: () => void;
}) {
  const { world: w, run, open, busy } = useReceive();
  const order = w.orders.find((o) => o.id === orderId);
  const [edit, setEdit] = useState(!!startEditing && !!order && order.state !== "closed");
  const [draft, setDraft] = useState<Draft[]>(() => (order ? draftOf(order) : []));
  const [addMed, setAddMed] = useState("");
  const [addPacks, setAddPacks] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [err, setErr] = useState("");
  if (!order) return null;

  const med = (id: string) => w.meds.find((m) => m.id === id);
  const rows = edit ? draft : draftOf(order);
  const due = orderDue(order, w.today);
  const total = rows.reduce((a, l) => a + (Number(l.packs) || 0) * (Number(l.price) || 0), 0);
  const patch = (key: string, p: Partial<Draft>) => {
    setDraft((d) => d.map((x) => (x.key === key ? { ...x, ...p } : x)));
    setErr("");
  };

  const startEdit = () => {
    setDraft(draftOf(order));
    setErr("");
    setEdit(true);
  };
  const addLine = () => {
    if (!addMed) return setErr(T.pickMed);
    if (!(Number(addPacks) > 0)) return setErr(T.typePacks);
    setDraft((d) => [
      ...d,
      { key: newKey(), id: null, medId: addMed, packs: addPacks, price: addPrice, received: 0 },
    ]);
    setAddMed("");
    setAddPacks("");
    setAddPrice("");
    setErr("");
  };
  const save = () => {
    const bad = draft.find((l) => !(Number(l.packs) > 0) || Number(l.packs) < l.received);
    if (bad) {
      const name = med(bad.medId)?.name ?? "";
      return setErr(Number(bad.packs) > 0 ? T.below(name, bad.received) : T.empty(name));
    }
    if (!draft.length) return setErr(T.none);
    const kept = new Set(draft.map((l) => l.id));
    run(
      () =>
        editOrderAction({
          orderId: order.id,
          lines: draft.map((l) => ({
            id: l.id,
            productId: l.medId,
            name: med(l.medId)?.name ?? "",
            packs: Number(l.packs),
            price: Number(l.price) || 0,
            per: med(l.medId)?.per ?? 1,
          })),
          removed: order.lines.filter((l) => !kept.has(l.id)).map((l) => l.id),
        }),
      () => {
        setEdit(false);
        return T.changed(order.supplier);
      },
    );
  };

  const onOrder = new Set(rows.map((l) => l.medId));
  const num0 = (n: string) => num(Number(n) || 0);

  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width="wide">
      <div className="flex flex-col gap-1 px-6 pt-5">
        <DialogTitle>{order.ref}</DialogTitle>
        <DialogDescription>
          {T.lead(
            atText(order.sentOn),
            atText(due.dueIso),
            due.text.toLowerCase(),
            T.state[order.state],
            order.editedOn ? atText(order.editedOn) : "",
          )}
        </DialogDescription>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        <div className="flex flex-col">
          <div role="table" aria-label={order.ref} className="flex flex-col">
            <div
              role="row"
              className={cn(
                "text-ink-600 hidden gap-x-3 pb-2 text-[12.5px] font-semibold min-[640px]:grid",
                GRID,
              )}
            >
              <span role="columnheader">{T.cols.med}</span>
              {[T.cols.ordered, T.cols.arrived, T.cols.left, T.cols.price, T.cols.value].map(
                (h) => (
                  <span key={h} role="columnheader" className="text-right">
                    {h}
                  </span>
                ),
              )}
              <span />
            </div>
            {rows.map((l) => {
              const m = med(l.medId);
              const name = m?.name ?? "";
              const left = Math.max(0, (Number(l.packs) || 0) - l.received);
              const cell = (label: string, body: ReactNode) => (
                <span
                  role="cell"
                  className="flex items-center justify-between gap-2 min-[640px]:justify-end"
                >
                  <span className="text-ink-600 text-[12.5px] min-[640px]:hidden">{label}</span>
                  <span className="text-foreground text-right text-[14px] tabular-nums">
                    {body}
                  </span>
                </span>
              );
              return (
                <div
                  key={l.key}
                  role="row"
                  className={cn(
                    "border-ink-200 grid items-center gap-x-3 gap-y-1.5 border-t py-2.5",
                    GRID,
                  )}
                >
                  <span role="cell" className="flex min-w-0 flex-col gap-px">
                    <b className="text-foreground text-[14px] leading-5 font-semibold">{name}</b>
                    <small className="text-ink-600 text-[12.5px] leading-[18px]">
                      {m
                        ? T.sub(
                            m.per,
                            m.unit,
                            m.cold,
                            m.controlled,
                            w.rules.tempLow,
                            w.rules.tempHigh,
                          )
                        : ""}
                    </small>
                  </span>
                  {cell(
                    T.cols.ordered,
                    edit ? (
                      <input
                        inputMode="numeric"
                        aria-label={T.packsOf(name)}
                        className={cn(inputCls(), "w-24 text-right")}
                        value={l.packs}
                        onChange={(e) => patch(l.key, { packs: digits(e.target.value) })}
                      />
                    ) : (
                      num0(l.packs)
                    ),
                  )}
                  {cell(T.cols.arrived, num(l.received))}
                  {cell(
                    T.cols.left,
                    left ? (
                      plural(left, "pack")
                    ) : (
                      <span className="text-status-stable-fg font-semibold">{T.allIn}</span>
                    ),
                  )}
                  {cell(
                    T.cols.price,
                    edit ? (
                      <input
                        inputMode="numeric"
                        aria-label={T.priceOf(name)}
                        className={cn(inputCls(), "w-28 text-right")}
                        value={l.price}
                        onChange={(e) => patch(l.key, { price: digits(e.target.value) })}
                      />
                    ) : (
                      num0(l.price)
                    ),
                  )}
                  {cell(T.cols.value, num((Number(l.packs) || 0) * (Number(l.price) || 0)))}
                  <span role="cell" className="flex justify-end">
                    {edit && l.received === 0 ? (
                      <button
                        type="button"
                        aria-label={T.remove(name)}
                        onClick={() => {
                          setDraft((d) => d.filter((x) => x.key !== l.key));
                          setErr("");
                        }}
                        className="text-ink-600 hover:bg-ink-100 focus-visible:ring-primary/30 grid size-9 place-items-center rounded-full outline-none focus-visible:ring-2"
                      >
                        <span aria-hidden>✕</span>
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="border-ink-200 flex items-center justify-between gap-3 border-t pt-3 text-[14px] font-semibold">
            <span>{T.total}</span>
            <span className="tabular-nums">{money(total)}</span>
          </div>
        </div>

        {edit ? (
          <div className="bg-tide-sunken flex flex-col gap-3 rounded-xl p-4">
            <b className="text-foreground text-[13px] leading-[18px] font-semibold">{T.add}</b>
            <div className="grid gap-3 min-[640px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] min-[640px]:items-end">
              <Field label={T.addMed}>
                {(p) => (
                  <select
                    {...p}
                    className={selectCls()}
                    value={addMed}
                    onChange={(e) => {
                      const id = e.target.value;
                      setAddMed(id);
                      setAddPrice(id ? String(med(id)?.cost || "") : "");
                      setErr("");
                    }}
                  >
                    <option value="">{T.choose}</option>
                    {w.meds
                      .filter((m) => !onOrder.has(m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                )}
              </Field>
              <Field label={T.addPacks}>
                {(p) => (
                  <input
                    {...p}
                    inputMode="numeric"
                    className={cn(inputCls(), "text-right")}
                    value={addPacks}
                    onChange={(e) => setAddPacks(digits(e.target.value))}
                  />
                )}
              </Field>
              <Field label={T.addPrice}>
                {(p) => (
                  <input
                    {...p}
                    inputMode="numeric"
                    className={cn(inputCls(), "text-right")}
                    value={addPrice}
                    onChange={(e) => setAddPrice(digits(e.target.value))}
                  />
                )}
              </Field>
              <LabButton className="h-11" onClick={addLine}>
                {T.addGo}
              </LabButton>
            </div>
            <p className="text-ink-600 m-0 text-[12.5px] leading-[18px]">{T.reason}</p>
          </div>
        ) : null}
        {err ? (
          <p
            role="alert"
            className="text-status-critical-fg-aa m-0 text-[13px] leading-5 font-semibold"
          >
            {err}
          </p>
        ) : null}
      </div>
      <div className={foot}>
        {edit ? (
          <>
            <LabButton
              onClick={() => {
                setEdit(false);
                setErr("");
              }}
            >
              {T.cancel}
            </LabButton>
            <LabButton variant="primary" busy={busy} onClick={save}>
              {T.save}
            </LabButton>
          </>
        ) : (
          <>
            <LabButton onClick={onClose}>{T.close}</LabButton>
            {order.state !== "closed" ? (
              <>
                <LabButton onClick={startEdit}>{T.edit}</LabButton>
                <LabButton
                  variant="primary"
                  onClick={() => open({ kind: "start", orderId: order.id })}
                >
                  {T.against}
                </LabButton>
              </>
            ) : null}
          </>
        )}
      </div>
    </EditorDialog>
  );
}

/** RECEIVE §C3: the chase message, editable, copied by hand. Nothing is sent from here. */
export function ChaseDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { world: w, run, say, busy } = useReceive();
  const order = w.orders.find((o) => o.id === orderId);
  const [text, setText] = useState(() =>
    order
      ? chaseText(
          order,
          { meds: w.meds, placeName: w.places.find((p) => p.id === order.place)?.name ?? "" },
          w.today,
        )
      : "",
  );
  if (!order) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      say(RB.chase.copied(order.supplier));
    } catch {
      say(RB.chase.blocked);
    }
  };
  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width="medium">
      <div className="flex flex-col gap-1 px-6 pt-5">
        <DialogTitle>{RB.chase.title(order.ref)}</DialogTitle>
        <DialogDescription>{RB.chase.lead}</DialogDescription>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4">
        <Field label={RB.chase.message}>
          {(p) => (
            <textarea
              {...p}
              rows={9}
              className={cn(inputCls(), "h-auto min-h-44 py-2.5 leading-5")}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className={foot}>
        <LabButton onClick={onClose}>{RB.chase.cancel}</LabButton>
        <LabButton onClick={copy}>{RB.chase.copy}</LabButton>
        <LabButton
          variant="primary"
          busy={busy}
          onClick={() =>
            run(
              () => markChasedAction({ orderId: order.id }),
              () => {
                onClose();
                return RB.chase.marked;
              },
            )
          }
        >
          {RB.chase.mark}
        </LabButton>
      </div>
    </EditorDialog>
  );
}
