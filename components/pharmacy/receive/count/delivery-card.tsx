"use client";

import type { useCount } from "../use-count";
import type { deliveryProblems, ReceiveDelivery } from "@/lib/pharmacy/derive/receive";
import { useState } from "react";

import { LabButton } from "@/components/tide/work/button";
import { RC } from "@/content/pharmacy-receive";
import { RCT } from "@/content/pharmacy-receive-count";
import { atText, matchRows, plural } from "@/lib/pharmacy/derive/receive";
import { cn } from "@/lib/utils";
import { useReceive } from "../provider";
import { Field, inputCls, Panel } from "../shared";
import { labelCls, Said } from "./parts";
import { Photos } from "./photos";

type Count = ReturnType<typeof useCount>;
const K = RCT.card;

const Dl = ({ k, v }: { k: string; v: string }) => (
  <div className="flex flex-wrap justify-between gap-x-3">
    <dt className="text-ink-600 text-[13px] leading-5">{k}</dt>
    <dd className="text-foreground m-0 text-right text-[13.5px] leading-5 font-medium">{v}</dd>
  </div>
);

/** The right column (RECEIVE §D2): details, invoice and the three-way check, photos, what is left, and Add to stock. */
export function DeliveryCard({
  d,
  c,
  an,
  finishing,
  onFinish,
  onOpenLine,
  onAbandon,
}: {
  d: ReceiveDelivery;
  c: Count;
  an: ReturnType<typeof deliveryProblems>;
  finishing: boolean;
  onFinish: () => void;
  onOpenLine: (id: string) => void;
  onAbandon: () => void;
}) {
  const { world, online, open, go } = useReceive();
  const supplier = d.kind === "supplier";
  const order = d.orderId ? world.orders.find((o) => o.id === d.orderId) : undefined;
  const [inv, setInv] = useState(d.invoice);
  const [tot, setTot] = useState(d.invoiceTotal);
  const commit = () => {
    if (inv !== d.invoice || tot !== d.invoiceTotal) c.setInvoice(inv, tot);
  };
  const match = supplier
    ? matchRows({ ...d, invoice: inv, invoiceTotal: tot }, world, world.rules)
    : [];

  const units = an.counted.reduce((a, x) => a + x.i.accUnits, 0);
  const owed = order
    ? order.lines
        .map((ol) => {
          const now = an.counted
            .filter((x) => x.l.orderLineId === ol.id)
            .reduce((a, x) => a + x.i.acc, 0);
          return {
            name: world.meds.find((m) => m.id === ol.medId)?.name ?? "",
            left: ol.packs - ol.received - now,
          };
        })
        .filter((x) => x.left > 0)
    : [];
  const blockedWhy = !an.blocked
    ? null
    : an.counted.length === 0
      ? K.noCount
      : K.things(an.problems.length);

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)] lg:self-start lg:overflow-y-auto">
      <Panel
        title={K.title}
        aside={
          <button
            type="button"
            className="text-primary focus-visible:ring-primary/30 min-h-11 rounded-full px-2 text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 sm:min-h-9"
            onClick={() => open({ kind: "start", edit: d })}
          >
            {K.change}
          </button>
        }
        className="flex flex-col gap-4"
      >
        <dl className="m-0 flex flex-col gap-1.5">
          <Dl k={K.into} v={world.places.find((p) => p.id === d.place)?.name ?? RC.dash} />
          <Dl k={K.arrived} v={atText(d.arrived)} />
          {supplier ? <Dl k={K.order} v={order?.ref ?? K.noOrder} /> : null}
          <Dl k={K.kind} v={RC.kind[d.kind]} />
          <Dl k={K.people} v={[d.deliverer, d.vehicle].filter(Boolean).join(" · ") || K.notGiven} />
        </dl>

        {supplier ? (
          <div className="border-ink-200 flex flex-col gap-3 border-t pt-3">
            <span className={labelCls}>{K.invoice}</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field label={K.invoiceNo}>
                {(a) => (
                  <input
                    {...a}
                    className={cn(inputCls(), "font-mono")}
                    autoComplete="off"
                    value={inv}
                    onChange={(e) => setInv(e.target.value)}
                    onBlur={commit}
                  />
                )}
              </Field>
              <Field label={K.invoiceTotal}>
                {(a) => (
                  <input
                    {...a}
                    className={cn(inputCls(), "tabular-nums")}
                    inputMode="numeric"
                    value={tot}
                    onChange={(e) => setTot(e.target.value.replace(/[^0-9]/g, ""))}
                    onBlur={commit}
                  />
                )}
              </Field>
            </div>
            <div className="flex flex-col gap-1">
              {match.map((m) => (
                <Said key={m.text} tone={m.cls === "ok" ? "ok" : m.cls === "warn" ? "warn" : ""}>
                  {m.text}
                </Said>
              ))}
            </div>
          </div>
        ) : null}

        <div className="border-ink-200 border-t pt-3">
          <Photos d={d} newId={c.newLineId} />
        </div>

        <div className="border-ink-200 flex flex-col gap-3 border-t pt-3">
          <span className="text-foreground text-[14px] leading-5 font-semibold">
            {K.summary(an.counted.length, units, an.value)}
          </span>
          {an.problems.length ? (
            <div className="flex flex-col gap-1">
              <span className={labelCls}>{K.todo}</span>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label={K.todo}>
                {an.problems.map((p) => (
                  <li key={p.lineId + p.text}>
                    <button
                      type="button"
                      onClick={() => onOpenLine(p.lineId)}
                      className="text-primary focus-visible:ring-primary/30 min-h-11 w-full rounded-lg px-1 text-left text-[13.5px] leading-5 underline-offset-2 outline-none hover:underline focus-visible:ring-2 sm:min-h-8"
                    >
                      {p.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {an.counted.some((x) => x.i.m.controlled && x.i.acc > 0) ? (
            <p className="text-ink-600 m-0 text-[12.5px] leading-[18px]">{K.controlled}</p>
          ) : null}
          {an.counted.some((x) => x.i.rej > 0 && x.i.fate === "quarantine") ? (
            <p className="text-ink-600 m-0 text-[12.5px] leading-[18px]">{K.kept}</p>
          ) : null}
          <LabButton
            variant="primary"
            className="h-11 w-full"
            busy={finishing}
            disabledReason={blockedWhy}
            reasonPlacement="below"
            onClick={onFinish}
          >
            {online ? K.add(an.counted.length) : K.saveHere}
          </LabButton>
          <div className="flex flex-wrap gap-x-2">
            <button
              type="button"
              className="text-primary focus-visible:ring-primary/30 min-h-11 rounded-full px-2 text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 sm:min-h-9"
              onClick={() => void c.flush().then(() => go(null))}
            >
              {K.later}
            </button>
            <button
              type="button"
              className="text-primary focus-visible:ring-primary/30 min-h-11 rounded-full px-2 text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 sm:min-h-9"
              onClick={onAbandon}
            >
              {K.abandon}
            </button>
          </div>
        </div>
      </Panel>

      {order && !d.blind ? (
        <Panel title={K.owed}>
          {owed.length === 0 ? (
            <p className="text-ink-600 m-0 text-[14px]">{K.nothingOwed}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {owed.map((o) => (
                <li
                  key={o.name}
                  className="border-ink-200 flex justify-between gap-3 border-t py-2 text-[13.5px] leading-5 first:border-t-0"
                >
                  <span>{o.name}</span>
                  <span className="tabular-nums">{plural(o.left, "pack")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
