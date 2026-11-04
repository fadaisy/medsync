"use client";

import type { StoreMed, StoreWorld } from "@/lib/pharmacy/derive/store/types";

import {
  acceptReturnAction,
  arrangeTransferAction,
  sendUrgentAction,
} from "@/app/pharmacy/stock/store/store-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import { Dot } from "@/components/pharmacy/medicines/shared";
import { CHIP, DOT } from "@/components/pharmacy/medicines/tones";
import { LabButton } from "@/components/tide/work/button";
import { STP } from "@/content/pharmacy-store-places";
import { fill } from "@/content/pharmacy-workspace-v2";
import { fmtExp, num, units } from "@/lib/pharmacy/derive/store/format";
import {
  daysAt,
  lowList,
  needAt,
  psOf,
  spareAt,
  transfers,
  transitTo,
} from "@/lib/pharmacy/derive/store/places";
import { medOf, mosOf, onHand, placeName } from "@/lib/pharmacy/derive/store/stock";
import { cn } from "@/lib/utils";
import { newKey, useStoreAct, useWitness } from "../shared";
import { Card, emptyCls, rowCls, rowSub, rowTitle, Scroll, thCls, wrapTag } from "./parts";

const { runOut: R, grid: G, move: M, back: K } = STP;
/** STORE.md §D1 fixes these two; the registry has no rule for them yet. */

type SendTo = (m: StoreMed, placeId: string, qty: number, toast: "row" | "cell") => void;

const daysWord = (d: number) =>
  d < 1 ? R.out : Math.floor(d) === 1 ? R.day : fill(R.days, { n: Math.floor(d) });

/** STORE.md §D1. `filter` is the pressed tile: "runout" keeps the matrix to the medicines running out. */
export function StockEverywhere({
  world: w,
  filter,
}: {
  world: StoreWorld;
  filter: string | null;
}) {
  const { busy, toast, say, run } = useStoreAct();
  const { ask, dialog } = useWitness(w.storeId, say);
  const low = lowList(w);

  const sendNow: SendTo = async (m, placeId, qty, kind) => {
    const place = placeName(w, placeId);
    const witness = m.controlled
      ? await ask(fill(R.witness, { qty: units(qty, m.unit), med: m.short, place }))
      : undefined;
    if (witness === null) return;
    const clientKey = newKey();
    run(
      () =>
        sendUrgentAction({
          clientKey,
          placeId,
          productId: m.id,
          quantity: qty,
          witnessAttestationId: witness,
        }),
      (d) =>
        kind === "row"
          ? fill(R.sent, { qty: units(qty, m.unit), place, voucher: d.voucher })
          : fill(G.sent, { n: num(qty), place, voucher: d.voucher }),
    );
  };

  const lowMeds = new Set(low.map((l) => l.medId));
  return (
    <>
      <Card
        title={
          <>
            {R.title}{" "}
            <span className="text-ink-600 font-normal">
              · {fill(low.length === 1 ? R.one : R.many, { n: low.length })}
            </span>
          </>
        }
        note={fill(R.note, { n: w.rules.runningOut })}
      >
        {low.length ? (
          low.map((l) => {
            const m = medOf(w, l.medId);
            const p = psOf(w, l.medId, l.placeId)!;
            const have = onHand(w, l.medId);
            const give = Math.min(l.need, have);
            const onWay = transitTo(w, l.medId, l.placeId);
            const spare = spareAt(w, l.medId, l.placeId)[0];
            const sub = [
              fill(R.there, { qty: units(p.here, m.unit) }) +
                (onWay ? fill(R.onWay, { n: num(onWay) }) : ""),
              fill(R.uses, { n: num(p.use) }),
              fill(R.level, { n: num(p.level) }),
              have ? null : R.storeOut + (m.onOrder ? fill(R.onOrder, { n: num(m.onOrder) }) : ""),
              spare ? fill(R.spare, { place: placeName(w, spare.placeId) }) : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div key={`${l.medId}|${l.placeId}`} className={rowCls}>
                <Chip
                  tone={l.days < w.rules.runningOutBad ? "bad" : "warn"}
                  className="h-[26px] min-w-[4.5rem] justify-center"
                >
                  {daysWord(l.days)}
                </Chip>
                <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-px">
                  <span className={rowTitle}>
                    {placeName(w, l.placeId)} · {m.short}
                  </span>
                  <span className={rowSub}>{sub}</span>
                </span>
                {l.need > 0 ? (
                  <LabButton
                    variant={give ? "primary" : "secondary"}
                    size="sm"
                    busy={busy}
                    disabledReason={give ? null : R.storeOutBtn}
                    onClick={() => sendNow(m, l.placeId, give, "row")}
                  >
                    {fill(R.send, { n: num(give || l.need) })}
                  </LabButton>
                ) : (
                  <Tag>{R.toppedUp}</Tag>
                )}
              </div>
            );
          })
        ) : (
          <p className={emptyCls}>{R.none}</p>
        )}
      </Card>

      <Card
        title={G.title}
        aside={
          <span className="text-ink-700 flex flex-wrap gap-2.5 text-[12px]">
            <Key tone={DOT.Out} label={fill(G.legendBad, { n: w.rules.runningOut })} />
            <Key tone={DOT.Low} label={fill(G.legendWarn, { n: w.rules.coverAmber })} />
            <Key tone={DOT.OK} label={G.legendOk} />
            <Key tone={DOT.Over} label={G.legendOver} />
          </span>
        }
      >
        <Scroll label={G.scroll}>
          <table className="w-full min-w-[900px] border-separate border-spacing-x-2 border-spacing-y-1 text-[13px]">
            <thead>
              <tr>
                <th scope="col" className={thCls}>
                  {G.medicine}
                </th>
                <th scope="col" className={thCls}>
                  {w.storeName}
                </th>
                {w.places.map((p) => (
                  <th key={p.id} scope="col" className={thCls}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {w.meds
                .filter((m) => filter !== "runout" || lowMeds.has(m.id))
                .map((m) => (
                  <tr key={m.id}>
                    <th scope="row" className="min-w-[10rem] text-left font-semibold">
                      {m.short}
                      <span className={`${rowSub} block font-normal`}>
                        {fill(G.per, { unit: m.unit })}
                      </span>
                    </th>
                    <td className="align-top">
                      <StoreCell w={w} m={m} />
                    </td>
                    {w.places.map((p) => (
                      <td key={p.id} className="align-top">
                        <PlaceCell
                          w={w}
                          m={m}
                          placeId={p.id}
                          busy={busy}
                          onSend={(q) => sendNow(m, p.id, q, "cell")}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </Scroll>
        <span className={rowSub}>{G.foot}</span>
      </Card>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <Moves w={w} />
        <ComingBack w={w} />
      </div>
      {toast}
      {dialog}
    </>
  );
}

function Key({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Dot className={tone} />
      {label}
    </span>
  );
}

const cellCls =
  "flex w-full min-w-[6.5rem] flex-col items-start gap-px rounded-[10px] px-2 py-1.5 text-left";
const cellQty = "text-[13px] font-semibold tabular-nums";
const cellSub = "text-[11px] tabular-nums";

function StoreCell({ w, m }: { w: StoreWorld; m: StoreMed }) {
  const have = onHand(w, m.id);
  const mos = mosOf(w, m);
  return (
    <div
      className={cn(
        cellCls,
        !have ? CHIP.Out : mos < w.rules.shortUnder ? CHIP.Low : "bg-ink-50 text-foreground",
      )}
    >
      <span className={cellQty}>{num(have)}</span>
      <span className={cellSub}>
        {fill(G.months, { n: Number.isFinite(mos) ? mos.toFixed(1) : "–" })}
      </span>
    </div>
  );
}

function PlaceCell({
  w,
  m,
  placeId,
  busy,
  onSend,
}: {
  w: StoreWorld;
  m: StoreMed;
  placeId: string;
  busy: boolean;
  onSend: (qty: number) => void;
}) {
  const p = psOf(w, m.id, placeId);
  if (!p)
    return (
      <div className={cn(cellCls, "text-ink-500")}>
        <span className={cellQty}>–</span>
        <span className={cellSub}>{G.notKept}</span>
      </div>
    );
  const days = daysAt(w, m.id, placeId) ?? 0;
  const onWay = transitTo(w, m.id, placeId);
  const give = Math.min(needAt(w, m.id, placeId), onHand(w, m.id));
  const tone =
    days <= w.rules.runningOut
      ? CHIP.Out
      : days < w.rules.coverAmber
        ? CHIP.Low
        : p.here > p.level * w.rules.overLevel
          ? CHIP.Over
          : CHIP.OK;
  const body = (
    <>
      <span className={cellQty}>
        {num(p.here)}
        {onWay ? ` +${num(onWay)}` : ""}
      </span>
      <span className={cellSub}>
        {!p.use ? G.noUse : Math.floor(days) === 1 ? R.day : fill(R.days, { n: Math.floor(days) })}
        {onWay ? G.onWay : ""}
      </span>
    </>
  );
  if (!give) return <div className={cn(cellCls, tone)}>{body}</div>;
  const tip =
    fill(G.tip, {
      place: placeName(w, placeId),
      qty: units(p.here, m.unit),
      days: Math.floor(days),
    }) + fill(G.tipSend, { n: num(give) });
  return (
    <button
      type="button"
      title={tip}
      aria-label={`${m.short}. ${tip}`}
      disabled={busy}
      onClick={() => onSend(give)}
      className={cn(
        cellCls,
        tone,
        "hover:ring-ink-400 focus-visible:ring-primary cursor-pointer outline-none hover:ring-1 focus-visible:ring-2",
      )}
    >
      {body}
    </button>
  );
}

function Moves({ w }: { w: StoreWorld }) {
  const { busy, toast, say, run } = useStoreAct();
  const { ask, dialog } = useWitness(w.storeId, say);
  const list = transfers(w);
  const arrange = async (t: (typeof list)[number]) => {
    const m = medOf(w, t.medId);
    const a = placeName(w, t.fromId);
    const b = placeName(w, t.toId);
    const witness = m.controlled
      ? await ask(fill(M.witness, { n: units(t.qty, m.unit), med: m.short, a, b }))
      : undefined;
    if (witness === null) return;
    const clientKey = newKey();
    run(
      () =>
        arrangeTransferAction({
          clientKey,
          fromId: t.fromId,
          toId: t.toId,
          productId: t.medId,
          quantity: t.qty,
          witnessAttestationId: witness,
        }),
      (d) => fill(M.sent, { voucher: d.voucher, a, b }),
    );
  };
  return (
    <Card title={M.title} note={M.note}>
      {list.length ? (
        list.map((t) => {
          const m = medOf(w, t.medId);
          const a = placeName(w, t.fromId);
          const b = placeName(w, t.toId);
          return (
            <div key={t.key} className={rowCls}>
              <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-px">
                <span className={rowTitle}>
                  {fill(M.line, { n: num(t.qty), med: m.short, a, b })}
                </span>
                <span className={rowSub}>
                  {fill(M.sub, {
                    a,
                    b,
                    x: Math.floor(t.fromDays),
                    y: Math.floor(t.toDays),
                  })}
                </span>
              </span>
              {t.voucher ? (
                <Tag className={wrapTag}>{fill(M.done, { voucher: t.voucher, b })}</Tag>
              ) : (
                <LabButton variant="primary" size="sm" busy={busy} onClick={() => arrange(t)}>
                  {M.go}
                </LabButton>
              )}
            </div>
          );
        })
      ) : (
        <p className={emptyCls}>{M.none}</p>
      )}
      {toast}
      {dialog}
    </Card>
  );
}

function ComingBack({ w }: { w: StoreWorld }) {
  const { busy, toast, run } = useStoreAct();
  return (
    <Card title={K.title} note={K.note}>
      {w.returns.length ? (
        w.returns.map((r) => {
          const m = medOf(w, r.medId);
          return (
            <div key={r.id} className={rowCls}>
              <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-px">
                <span className={rowTitle}>
                  {fill(K.line, {
                    place: placeName(w, r.placeId),
                    n: num(r.qty),
                    med: m.short,
                  })}
                </span>
                <span className={rowSub}>
                  {fill(K.sub, { reason: r.reason, exp: fmtExp(r.exp) })}
                </span>
              </span>
              {r.acceptedVoucher ? (
                <Tag className={wrapTag}>{m.bin ? fill(K.done, { bin: m.bin }) : K.doneNoBin}</Tag>
              ) : (
                <LabButton
                  variant="primary"
                  size="sm"
                  busy={busy}
                  onClick={() =>
                    run(
                      () => acceptReturnAction({ returnId: r.id }),
                      m.bin ? fill(K.sent, { bin: m.bin }) : K.sentNoBin,
                    )
                  }
                >
                  {K.go}
                </LabButton>
              )}
            </div>
          );
        })
      ) : (
        <p className={emptyCls}>{K.none}</p>
      )}
      {toast}
    </Card>
  );
}
