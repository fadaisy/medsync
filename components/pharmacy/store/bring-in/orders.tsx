"use client";

import type { PlanLine } from "@/lib/pharmacy/derive/store/orders";
import type { StoreOrder, StoreWorld, SupplierStat } from "@/lib/pharmacy/derive/store/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  sendOrderAction,
  setBudgetAction,
  setOrderQtyAction,
  trimOrderAction,
} from "@/app/pharmacy/stock/store/store-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import { field, fieldSm, pillBtn } from "@/components/pharmacy/medicines/shared";
import { DOT } from "@/components/pharmacy/medicines/tones";
import { LabButton } from "@/components/tide/work/button";
import { STORE_SAYS } from "@/content/pharmacy-store";
import { STB } from "@/content/pharmacy-store-bringin";
import { fill } from "@/content/pharmacy-workspace-v2";
import { addDays, dayOf, daysBetween, fmtDow, num, ugx } from "@/lib/pharmacy/derive/store/format";
import {
  budgetPct,
  planFor,
  supplierFillRate,
  supplierLeadDays,
} from "@/lib/pharmacy/derive/store/orders";
import { balanceByDay } from "@/lib/pharmacy/derive/store/stats";
import { medOf, mosOf, onHand } from "@/lib/pharmacy/derive/store/stock";
import { cn } from "@/lib/utils";
import { Card, emptyCls, rowCls, rowSub, rowTitle, Scroll, tdCls, thCls } from "../places/parts";
import { useStoreAct } from "../shared";

const { orders: O, plan: P } = STB;

/** STORE.md §E1. */
export function Orders({ world: w }: { world: StoreWorld }) {
  // The same choice as the shell's charts: the supplier the URL names, else the first.
  const asked = useSearchParams().get("supplier");
  const sup = w.suppliers.find((s) => s.id === asked) ?? w.suppliers[0];
  return (
    <>
      <OrdersList w={w} chosen={sup?.id} />
      {sup ? (
        <NextOrder key={sup.id} w={w} sup={sup} />
      ) : (
        <Card title={O.title}>
          <p className={emptyCls}>{O.noSupplier}</p>
        </Card>
      )}
    </>
  );
}

const RANK: Record<StoreOrder["state"], number> = { draft: 0, open: 1, closed: 2 };

function orderWords(w: StoreWorld, o: StoreOrder) {
  const s = w.suppliers.find((x) => x.id === o.supplierId);
  const supplier = o.supplier;
  if (o.state === "draft")
    return { title: fill(O.draftTitle, { supplier }), meta: O.draftMeta, st: O.draft };
  const sentDay = dayOf(o.sentAt ?? o.createdAt);
  const day = fmtDow(sentDay);
  if (o.state === "closed") {
    const end = o.closedAt ? dayOf(o.closedAt) : sentDay;
    const rate = supplierFillRate(o);
    return {
      title: fill(O.closedTitle, { supplier, day }),
      meta: [
        fill(O.closedMeta, { day: fmtDow(end), n: daysBetween(sentDay, end) }),
        rate === null ? null : fill(O.filled, { n: rate }),
      ]
        .filter(Boolean)
        .join(" · "),
      st: O.closed,
    };
  }
  const promised = s?.promisedDays ?? 0;
  const expected = addDays(sentDay, promised);
  const late = daysBetween(expected, w.today);
  const lateWord = late > 1 ? fill(O.late, { n: late }) : late === 1 ? O.lateOne : null;
  if (o.received > 0)
    return {
      title: fill(O.sentTitle, { supplier, day }),
      meta: [
        fill(O.expected, { day: fmtDow(expected) }),
        lateWord,
        fill(O.delivered, { received: num(o.received), ordered: num(o.ordered) }),
      ]
        .filter(Boolean)
        .join(" · "),
      lines: o.lines
        .map((l) => fill(O.line, { med: medOf(w, l.medId)?.short ?? "", n: num(l.qty) }))
        .join(" · "),
      st: O.partly,
      rest: true,
    };
  return {
    title: fill(O.sentTitle, { supplier, day }),
    meta: [fill(O.sentMeta, { day, n: (s && supplierLeadDays(s)) ?? promised }), lateWord]
      .filter(Boolean)
      .join(" · "),
    st: O.sent,
  };
}

function supplierLine(s: SupplierStat) {
  const rate = supplierFillRate(s);
  const lead = supplierLeadDays(s);
  return [
    rate === null ? O.noFill : fill(s.openOrder ? O.fillsSoFar : O.fills, { n: rate }),
    lead === null ? fill(O.promised, { n: s.promisedDays }) : fill(O.average, { n: lead }),
    s.openClaims ? fill(s.openClaims === 1 ? O.claimOne : O.claims, { n: s.openClaims }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function OrdersList({ w, chosen }: { w: StoreWorld; chosen: string | undefined }) {
  const list = [...w.orders].sort(
    (a, b) =>
      RANK[a.state] - RANK[b.state] ||
      (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt),
  );
  return (
    <Card title={O.title}>
      {list.length ? (
        list.map((o) => {
          const x = orderWords(w, o);
          return (
            <div key={o.id} className={rowCls}>
              <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
                <span className={rowTitle}>{x.title}</span>
                <span className={rowSub}>{x.meta}</span>
                {x.lines ? <span className="text-ink-700 text-[12px]">{x.lines}</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Tag>{x.st}</Tag>
                {x.rest ? (
                  <LabButton size="sm" render={<Link href={`?tab=receive&start=1&order=${o.id}`} />} nativeButton={false}>
                    {O.recordRest}
                  </LabButton>
                ) : null}
              </span>
            </div>
          );
        })
      ) : (
        <p className={emptyCls}>{O.none}</p>
      )}
      <div
        role="group"
        aria-label={O.suppliers}
        className="border-ink-200 flex flex-wrap gap-2 border-t pt-2"
      >
        {w.suppliers.map((s) => (
          <Link
            key={s.id}
            scroll={false}
            href={`?tab=main&section=order&supplier=${s.id}`}
            aria-current={s.id === chosen ? "true" : undefined}
            className={cn(
              pillBtn(s.id === chosen),
              "h-auto min-h-8 max-w-full py-1 text-[12px] font-normal whitespace-normal",
            )}
          >
            <b className="font-semibold">{s.name}</b> · {supplierLine(s)}
          </Link>
        ))}
      </div>
    </Card>
  );
}

const digits = (s: string) => s.replace(/\D/g, "");
const COLS = [P.medicine, P.ven, P.use, P.here, P.onOrder, P.months, P.order, P.cost, P.why];

function NextOrder({ w, sup }: { w: StoreWorld; sup: SupplierStat }) {
  // Field saves have their own busy, so a save on blur never disables the button being clicked.
  const save = useStoreAct();
  const main = useStoreAct();
  const r = w.rules;
  const draft = w.orders.find((o) => o.state === "draft" && o.supplierId === sup.id);
  // Sent and nothing delivered yet: locked until the delivery is received.
  const sent = draft
    ? undefined
    : w.orders.find((o) => o.state === "open" && o.supplierId === sup.id && o.received === 0);
  const locked = !!sent;
  const lines: PlanLine[] = sent
    ? sent.lines.map((l) => {
        const m = medOf(w, l.medId);
        return { medId: l.medId, ven: m.ven, qty: l.qty, cost: m.cost, pack: m.pack, minQty: 0 };
      })
    : planFor(w, sup.id);
  const trimmed = new Set((sent ?? draft)?.lines.filter((l) => l.trimmed).map((l) => l.medId));
  const savedBudget = (sent ?? draft)?.budget ?? 0;

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [budgetEdit, setBudgetEdit] = useState<string | null>(null);
  const qtyOf = (l: PlanLine) => (edits[l.medId] !== undefined ? +edits[l.medId]! : l.qty);
  const budget = budgetEdit !== null ? +budgetEdit : savedBudget;
  const total = lines.reduce((a, l) => a + qtyOf(l) * l.cost, 0);
  const over = total - budget;
  const pct = budgetPct(total, budget);

  const outDays = useMemo(() => {
    const by = balanceByDay(w, 84);
    return (id: string) => {
      const s = by.get(id) ?? [];
      let n = 0;
      for (let i = s.length - 1; i >= 0 && s[i]! <= 0; i--) n++;
      return n;
    };
  }, [w]);

  const commitQty = (l: PlanLine) => {
    const typed = edits[l.medId];
    if (typed === undefined || +typed === l.qty) return;
    const clear = () => setEdits(({ [l.medId]: _, ...rest }) => rest);
    save.run<unknown>(() =>
      setOrderQtyAction({ supplierId: sup.id, productId: l.medId, quantity: +typed }).then((x) => {
        if (!x.ok) clear();
        return x;
      }),
    );
  };
  const commitBudget = () => {
    if (budgetEdit === null || +budgetEdit === savedBudget) return;
    save.run<unknown>(() =>
      setBudgetAction({ supplierId: sup.id, budget: +budgetEdit }).then((x) => {
        if (!x.ok) setBudgetEdit(null);
        return x;
      }),
    );
  };
  const trim = () =>
    main.run(
      () => trimOrderAction({ supplierId: sup.id }),
      (d) => {
        setEdits({});
        return d.stillOver ? fill(P.stillOver, { n: r.trimTo }) : P.trimmed;
      },
    );

  const whyOf = (l: PlanLine) => {
    const m = medOf(w, l.medId);
    if (trimmed.has(l.medId)) return P.whyTrimmed;
    if (!onHand(w, l.medId)) return fill(P.whyOut, { n: outDays(l.medId) });
    const mos = mosOf(w, m);
    if (qtyOf(l) === 0)
      return Number.isFinite(mos) ? fill(P.whyEnough, { n: mos.toFixed(1) }) : P.whyNoUse;
    return fill(P.whyBrings, { n: r.monthsTo });
  };

  const sendReason = !w.actor.inCharge
    ? STORE_SAYS.inChargeOnly
    : total <= 0
      ? STORE_SAYS.orderEmpty
      : budget <= 0
        ? STORE_SAYS.bud
        : over > 0
          ? fill(P.over, { v: ugx(over) })
          : null;

  return (
    <Card
      title={fill(P.title, {
        supplier: sup.name,
        state: locked ? P.stateSent : P.stateDraft,
      })}
      note={fill(P.note, { n: r.monthsTo })}
      aside={
        <label className="text-ink-700 flex flex-col gap-1 text-[12px] font-semibold">
          {P.budget}
          <input
            inputMode="numeric"
            value={budgetEdit ?? String(savedBudget)}
            disabled={locked}
            onChange={(e) => setBudgetEdit(digits(e.target.value))}
            onBlur={commitBudget}
            className={cn(field, "w-40 font-semibold tabular-nums disabled:opacity-70")}
          />
        </label>
      }
    >
      <Scroll label={P.scroll}>
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c} scope="col" className={thCls}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const m = medOf(w, l.medId);
              const mos = mosOf(w, m);
              return (
                <tr key={l.medId}>
                  <th scope="row" className={`${tdCls} text-left font-semibold`}>
                    {m.name}
                    <span className={`${rowSub} block font-normal`}>
                      {fill(P.packs, { n: m.pack })}
                    </span>
                  </th>
                  <td className={tdCls}>
                    <Chip>{m.ven ?? P.none}</Chip>
                  </td>
                  <td className={tdCls}>{num(m.use)}</td>
                  <td className={tdCls}>{num(onHand(w, m.id))}</td>
                  <td className={tdCls}>{m.onOrder ? num(m.onOrder) : P.none}</td>
                  <td className={tdCls}>
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="bg-ink-100 h-1.5 min-w-10 flex-1 overflow-hidden rounded-full"
                      >
                        <span
                          className={cn("block h-full rounded-full", barTone(mos, w))}
                          style={{
                            width: `${Math.round(Math.min(1, mos / r.tooMuch) * 100)}%`,
                          }}
                        />
                      </span>
                      <b className="font-semibold">{mosText(mos)}</b>
                    </span>
                  </td>
                  <td className={cn(tdCls, "w-28 py-1")}>
                    <input
                      aria-label={fill(P.aria, { med: m.name })}
                      inputMode="numeric"
                      value={edits[l.medId] ?? String(l.qty)}
                      disabled={locked}
                      onChange={(e) => {
                        const v = digits(e.target.value);
                        setEdits((x) => ({ ...x, [l.medId]: v }));
                      }}
                      onBlur={() => commitQty(l)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      className={cn(
                        fieldSm,
                        "w-full text-right font-semibold tabular-nums disabled:opacity-70",
                      )}
                    />
                  </td>
                  <td className={cn(tdCls, "whitespace-nowrap")}>{ugx(qtyOf(l) * l.cost)}</td>
                  <td className={cn(tdCls, "text-ink-700 pr-0 text-[12px]")}>{whyOf(l)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Scroll>
      <div className="border-ink-200 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
        <span className="flex flex-col gap-0.5">
          <b className="text-foreground text-[16px] font-semibold tabular-nums">
            {fill(P.total, { v: ugx(total) })}
          </b>
          <span
            className={cn(
              "text-[13px] font-semibold",
              over > 0 ? "text-foreground" : "text-ink-600",
            )}
          >
            {fill(over > 0 ? P.over : P.left, { v: ugx(Math.abs(over)) })}
            {pct === null ? "" : ` · ${pct}%`}
          </span>
        </span>
        {locked ? (
          <Tag>{fill(P.sentTag, { supplier: sup.name })}</Tag>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-2">
            {over > 0 && budget > 0 ? (
              <LabButton busy={main.busy} onClick={trim}>
                {P.trim}
              </LabButton>
            ) : null}
            <LabButton
              variant="primary"
              busy={main.busy}
              disabledReason={sendReason}
              onClick={() =>
                main.run(
                  () => sendOrderAction({ supplierId: sup.id }),
                  fill(P.sentToast, { supplier: sup.name }),
                )
              }
            >
              {fill(P.send, { supplier: sup.name })}
            </LabButton>
          </span>
        )}
      </div>
      {save.toast}
      {main.toast}
    </Card>
  );
}

const mosText = (mos: number) => (Number.isFinite(mos) ? mos.toFixed(1) : "–");
const barTone = (mos: number, w: StoreWorld) =>
  mos <= 0
    ? DOT.Out
    : mos < w.rules.shortUnder
      ? DOT.Low
      : mos > w.rules.tooMuch
        ? DOT.Over
        : DOT.OK;
