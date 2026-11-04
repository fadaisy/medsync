"use client";

import type { ChipTone } from "@/components/pharmacy/charts/chip";
import type { StoreSection } from "@/content/pharmacy-store";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import type { ReactNode } from "react";
import Link from "next/link";

import { sendUrgentAction } from "@/app/pharmacy/stock/store/store-actions";
import { Chip } from "@/components/pharmacy/charts/chip";
import { linkBtn } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { SO } from "@/content/pharmacy-store-sendout";
import { fill } from "@/content/pharmacy-workspace-v2";
import { shelvesDue } from "@/lib/pharmacy/derive/store/counts";
import { atRisk, expRows } from "@/lib/pharmacy/derive/store/expiry";
import { fmtAt, fmtExp, isoWeekday, num, ugx } from "@/lib/pharmacy/derive/store/format";
import { planFor, planTotal } from "@/lib/pharmacy/derive/store/orders";
import { lowList, runLines } from "@/lib/pharmacy/derive/store/places";
import { openReqs, sortedReqs } from "@/lib/pharmacy/derive/store/requisitions";
import { medOf, onHand, placeName } from "@/lib/pharmacy/derive/store/stock";
import { newKey, useStoreAct, useWitness } from "../shared";
import { CARD, scheduleDays, sectionHref } from "./parts";

const N = SO.needs;

interface Item {
  key: string;
  t: string;
  sub: string;
  act?: ReactNode;
}

const Go = ({ href, label, primary }: { href: string; label: string; primary?: boolean }) => (
  <LabButton
    size="sm"
    variant={primary ? "primary" : "secondary"}
    className="shrink-0"
    render={<Link href={href} scroll={false} />}
    nativeButton={false}
  >
    {label}
  </LabButton>
);

/** STORE.md §B4: eight cards, each with its count, its top three and the way into the section. */
export function NeedsYouNow({ world: w }: { world: StoreWorld }) {
  const { busy, toast, say, run } = useStoreAct();
  const { ask, dialog } = useWitness(w.storeId, say);

  const sendUrgent = async (medId: string, placeId: string, n: number) => {
    const med = medOf(w, medId);
    const place = placeName(w, placeId);
    const witnessAttestationId = med.controlled
      ? await ask(fill(N.low.witness, { place, med: med.short, n: num(n) }))
      : null;
    if (med.controlled && !witnessAttestationId) return;
    run(
      () =>
        sendUrgentAction({
          clientKey: newKey(),
          placeId,
          productId: medId,
          quantity: n,
          witnessAttestationId,
        }),
      (d) => fill(N.low.sent, { n: num(n), place, voucher: d.voucher }),
    );
  };

  const reqs = sortedReqs(openReqs(w));
  const reqItems: Item[] = reqs.map((r, i) => ({
    key: r.id,
    t: r.urgent ? fill(N.req.urgent, { place: placeName(w, r.placeId) }) : placeName(w, r.placeId),
    sub: fill(N.req.sub, { lines: SO.linesWord(r.lines.length), at: fmtAt(r.askedAt) }),
    act: <Go href={`${sectionHref("req")}&req=${r.id}`} label={N.req.act} primary={i === 0} />,
  }));

  const low = lowList(w);
  const firstSend = low.find((x) => Math.min(x.need, onHand(w, x.medId)) > 0);
  const lowItems: Item[] = low.map((x) => {
    const have = onHand(w, x.medId);
    const give = Math.min(x.need, have);
    const d = Math.floor(x.days);
    const left = x.days < 1 ? N.low.out : fill(d === 1 ? N.low.dayLeft : N.low.daysLeft, { n: d });
    return {
      key: `${x.medId}|${x.placeId}`,
      t: fill(N.low.item, { place: placeName(w, x.placeId), med: medOf(w, x.medId).short }),
      sub: left + (have ? "" : N.low.storeOutToo),
      act: give ? (
        <LabButton
          size="sm"
          variant={x === firstSend ? "primary" : "secondary"}
          className="shrink-0"
          busy={busy}
          onClick={() => void sendUrgent(x.medId, x.placeId, give)}
        >
          {fill(N.low.send, { n: num(give) })}
        </LabButton>
      ) : have ? null : (
        <Chip tone="bad" className="shrink-0">
          {N.low.storeOut}
        </Chip>
      ),
    };
  });

  const today = isoWeekday(w.today);
  const runItems: Item[] = w.runs
    .filter((r) => r.weekdays.includes(today) && !r.sentVoucher)
    .map((r) => {
      const ls = runLines(w, r.placeId).filter((l) => l.give > 0);
      return {
        key: r.id,
        t: placeName(w, r.placeId),
        sub: fill(N.runs.sub, { lines: SO.linesWord(ls.length), when: scheduleDays(r.weekdays) }),
        act: ls.length ? <Go href={sectionHref("runs")} label={N.runs.act} /> : null,
      };
    });

  const wayItems: Item[] = w.dispatches
    .filter((d) => d.status === "transit")
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .map((d) => ({
      key: d.id,
      t: fill(N.way.item, { voucher: d.voucher, place: placeName(w, d.toId) }),
      sub: fill(N.way.sub, { kind: SO.disp.kind[d.kind], at: fmtAt(d.sentAt) }),
    }));

  const expItems: Item[] = atRisk(expRows(w)).map((e) => ({
    key: e.batch.id,
    t: e.med.short,
    sub: fill(N.exp.sub, {
      n: num(e.risk),
      value: ugx(e.value),
      exp: fmtExp(e.batch.exp),
    }),
    act: <Go href={sectionHref("exp")} label={N.exp.act} />,
  }));

  const countItems: Item[] = shelvesDue(w).map((s) => ({
    key: s.id,
    t: fill(N.count.item, { code: s.code, name: s.name }),
    sub: s.controlled
      ? N.count.daily
      : s.days === null
        ? N.count.never
        : fill(N.count.days, { n: s.days }),
    act: <Go href={`${sectionHref("count")}&shelf=${s.id}`} label={N.count.act} />,
  }));

  const coldFirst = (cold: boolean) => (cold ? 0 : 1);
  const putItems: Item[] = w.batches
    .filter((b) => b.waiting)
    .sort((a, b) => coldFirst(medOf(w, a.medId).cold) - coldFirst(medOf(w, b.medId).cold))
    .map((b) => {
      const m = medOf(w, b.medId);
      return {
        key: b.id,
        t: m.cold ? fill(N.put.cold, { name: m.name }) : m.name,
        sub: b.grn ? fill(N.put.from, { grn: b.grn }) : "",
      };
    });

  const orderItems: Item[] = w.orders
    .filter((o) => o.state === "draft")
    .map((o) => {
      const total = o.supplierId ? planTotal(planFor(w, o.supplierId)) : 0;
      return {
        key: o.id,
        t: o.supplier,
        sub:
          total > o.budget && o.budget > 0
            ? fill(N.order.over, { value: ugx(total), over: ugx(total - o.budget) })
            : fill(N.order.within, { value: ugx(total) }),
        act: <Go href={sectionHref("order")} label={N.order.act} />,
      };
    });

  const cards: {
    copy: { title: string; open: string; empty: string };
    tone: ChipTone;
    items: Item[];
    to: StoreSection;
  }[] = [
    {
      copy: N.req,
      tone: reqs.some((r) => r.urgent) ? "bad" : "info",
      items: reqItems,
      to: "req",
    },
    { copy: N.low, tone: "bad", items: lowItems, to: "all" },
    { copy: N.runs, tone: "info", items: runItems, to: "runs" },
    { copy: N.way, tone: "neutral", items: wayItems, to: "disp" },
    { copy: N.exp, tone: "warn", items: expItems, to: "exp" },
    { copy: N.count, tone: "info", items: countItems, to: "count" },
    { copy: N.put, tone: "info", items: putItems, to: "put" },
    { copy: N.order, tone: "info", items: orderItems, to: "order" },
  ];

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="text-heading-m text-foreground m-0">{N.title}</h2>
      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ copy, tone, items, to }) => (
          <section key={to} className={`${CARD} gap-2`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-heading-s text-foreground m-0">{copy.title}</h3>
              <Chip tone={items.length ? tone : "neutral"}>{items.length}</Chip>
            </div>
            {items.slice(0, 3).map((it) => (
              <div
                key={it.key}
                className="border-border flex items-center justify-between gap-2 border-t pt-2"
              >
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="text-body-s text-foreground font-semibold">{it.t}</span>
                  <span className="text-caption text-muted-foreground">{it.sub}</span>
                </span>
                {it.act}
              </div>
            ))}
            {items.length ? null : (
              <p className="border-border text-body-s text-muted-foreground m-0 border-t pt-2">
                {copy.empty}
              </p>
            )}
            <Link href={sectionHref(to)} scroll={false} className={`${linkBtn} mt-auto`}>
              {fill(N.open, { label: copy.open })}
            </Link>
          </section>
        ))}
      </div>
      {toast}
      {dialog}
    </section>
  );
}
