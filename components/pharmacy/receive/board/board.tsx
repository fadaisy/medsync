"use client";

import type { ChipTone } from "@/components/pharmacy/charts/chip";
import type { Stage, StageCard } from "@/lib/pharmacy/derive/receive";
import type { CSSProperties, ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { approveShortDatedAction } from "@/app/pharmacy/stock/store/receive-actions";
import { Chip } from "@/components/pharmacy/charts/chip";
import { LabButton } from "@/components/tide/work/button";
import { RB } from "@/content/pharmacy-receive-board";
import { expText, stages } from "@/lib/pharmacy/derive/receive";
import { cn } from "@/lib/utils";
import { ClaimsCard } from "../after/claims";
import { ReceivingFigures } from "../after/figures";
import { useReceive } from "../provider";
import { Field, Panel, selectCls } from "../shared";

interface Act {
  label: string;
  go: () => void;
  primary?: boolean;
}
interface CardView {
  key: string;
  ref: string;
  tag?: { text: string; tone: ChipTone };
  title: string;
  sub: string;
  link?: Act;
  acts: Act[];
}

const Block = ({ title, count, note, children }: { title: string; count: number; note?: string; children: ReactNode }) => (
  <Panel>
    <header className="mb-3 flex flex-wrap items-center gap-2">
      <h2 className="text-foreground m-0 text-[15px] leading-[22px] font-semibold">{title}</h2>
      <Chip tone="warn">{count}</Chip>
    </header>
    {note ? <p className="text-ink-600 m-0 mb-3 text-[13px] leading-5">{note}</p> : null}
    {children}
  </Panel>
);

/** Stock › Receive a delivery: everything arriving at the place, one stage per column (RECEIVE §A). */
export function Board() {
  const { world: w, open, go, run, online } = useReceive();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const place = w.places.find((p) => p.id === w.placeId);
  const direct = !!place?.direct;
  const { stages: cols, toDo, expected } = stages(w, w.placeId);
  const onWay = cols.find((c) => c.key === "way")?.cards.length ?? 0;

  const view = (c: StageCard): CardView => {
    switch (c.kind) {
      case "order": {
        const o = c.order;
        const acts: Act[] = [{ label: o.state === "part" ? RB.card.rest : RB.card.receive, go: () => open({ kind: "start", orderId: o.id }) }];
        if (c.due.late) acts.push({ label: RB.card.chase, go: () => open({ kind: "chase", orderId: o.id }) });
        return {
          key: o.id,
          ref: o.ref,
          tag: { text: c.due.text, tone: c.due.tone },
          title: o.supplier,
          sub: c.sub,
          link: { label: RB.card.detail, go: () => open({ kind: "order", orderId: o.id }) },
          acts,
        };
      }
      case "count": {
        const d = c.delivery;
        return {
          key: d.id,
          ref: d.note,
          tag: { text: c.tag, tone: c.queued ? "warn" : d.kind === "supplier" ? "warn" : "teal" },
          title: d.source,
          sub: c.sub,
          acts: c.queued ? [] : [{ label: RB.card.carry, go: () => go(d.id), primary: true }],
        };
      }
      case "put":
        return {
          key: c.delivery.id,
          ref: c.delivery.note,
          title: c.delivery.source,
          sub: c.sub,
          acts: [{ label: RB.card.put, go: () => go(c.delivery.id), primary: true }],
        };
      case "done": {
        const d = c.delivery;
        const ok = d.state === "received";
        return {
          key: d.id,
          ref: d.note,
          tag: ok ? { text: RB.card.received, tone: "ok" } : { text: RB.card.abandoned, tone: "neutral" },
          title: d.source,
          sub: c.sub,
          acts: ok ? [{ label: RB.card.open, go: () => go(d.id) }] : [],
        };
      }
      case "way":
        return {
          key: c.dispatch.id,
          ref: c.dispatch.voucher,
          tag: { text: RB.card.way, tone: "info" },
          title: RB.card.fromMain,
          sub: c.sub,
          acts: [{ label: RB.card.confirm, go: () => open({ kind: "confirm", dispatchId: c.dispatch.id }), primary: true }],
        };
      case "confirmed":
        return {
          key: c.dispatch.id,
          ref: c.dispatch.voucher,
          tag: c.dispatch.state === "diff" ? { text: RB.card.diff, tone: "bad" } : { text: RB.card.received, tone: "ok" },
          title: RB.card.main,
          sub: c.sub,
          acts: [],
        };
    }
  };

  const pickPlace = (id: string) => {
    const q = new URLSearchParams(sp.toString());
    q.set("place", id);
    q.delete("delivery");
    router.push(`${path}?${q.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-80">
            <h1 className="text-foreground m-0 text-[22px] leading-7 font-semibold">
              {RB.title}{" "}
              <span className="text-ink-600 font-normal">
                · {place?.name ?? ""} · {direct ? RB.line.direct(expected, toDo) : RB.line.place(onWay)}
              </span>
            </h1>
            <p className="text-ink-600 m-0 mt-1 text-[14px] leading-5">{direct ? RB.lead.direct : RB.lead.place(place?.name ?? "")}</p>
          </div>
          <div className="flex w-full flex-wrap items-end gap-3 min-[640px]:w-auto">
            {w.places.length > 1 ? (
              <Field label={RB.place} className="w-full min-[640px]:w-56">
                {(p) => (
                  <select {...p} disabled={!online} className={selectCls()} value={w.placeId} onChange={(e) => pickPlace(e.target.value)}>
                    {w.places.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : null}
            {direct ? (
              <LabButton variant="primary" className="h-11 w-full min-[640px]:w-auto" onClick={() => open({ kind: "start" })}>
                {RB.receive}
              </LabButton>
            ) : null}
          </div>
        </div>
      </Panel>

      {w.asks.length ? (
        <Block title={RB.asks.title} count={w.asks.length} note={RB.asks.note}>
          <ul className="m-0 flex list-none flex-col p-0">
            {w.asks.map((a) => (
              <li key={`${a.deliveryId}-${a.lineId}`} className="border-ink-200 flex flex-wrap items-center justify-between gap-3 border-t py-3 first:border-t-0 first:pt-0">
                <div className="min-w-0 flex-1 basis-64">
                  <b className="text-foreground block text-[14px] leading-5 font-semibold">{a.med}</b>
                  <span className="text-ink-600 block text-[12.5px] leading-[18px]">
                    {RB.asks.sub(a.batch, /^\d{4}-\d{2}(-\d{2})?$/.test(a.exp) ? expText(a.exp, a.exp) : a.exp || "—", a.note, a.askedBy)}
                  </span>
                </div>
                <LabButton
                  aria-label={`${RB.asks.approve}: ${a.med}`}
                  onClick={() => run(() => approveShortDatedAction({ deliveryId: a.deliveryId, lineId: a.lineId }), RB.asks.done)}
                >
                  {RB.asks.approve}
                </LabButton>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <div
        role="list"
        aria-label={RB.flow}
        style={{ "--cols": cols.length } as CSSProperties}
        className="grid grid-cols-1 items-stretch gap-3 min-[640px]:grid-cols-2 min-[1100px]:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
      >
        {cols.map((s, i) => (
          <Column key={s.key} s={s} no={i + 1} view={view} />
        ))}
      </div>

      {direct ? <ClaimsCard /> : null}
      {place?.kind === "store" ? <ReceivingFigures /> : null}

      {w.me.inCharge && w.registration.length ? (
        <Block title={RB.noReg.title} count={w.registration.length} note={RB.noReg.note}>
          <ul className="m-0 flex list-none flex-col p-0">
            {w.registration.map((r, i) => (
              <li key={`${r.note}-${r.med}-${i}`} className="border-ink-200 border-t py-2.5 first:border-t-0 first:pt-0">
                <b className="text-foreground block text-[14px] leading-5 font-semibold">{r.med}</b>
                <span className="text-ink-600 block text-[12.5px] leading-[18px]">
                  {RB.noReg.sub(r.note, r.batch, RB.noReg.reasons[r.reason] ?? r.reason)}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </div>
  );
}

function Column({ s, no, view }: { s: Stage; no: number; view: (c: StageCard) => CardView }) {
  return (
    <section role="listitem" aria-label={s.title} className="bg-tide-sunken flex min-w-0 flex-col gap-2 rounded-2xl p-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="bg-card text-ink-700 grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold">
          {no}
        </span>
        <h2 className="text-foreground m-0 min-w-0 flex-1 text-[15px] leading-[22px] font-semibold">{s.title}</h2>
        <Chip tone={s.cards.length && s.tone ? s.tone : "neutral"}>{s.cards.length}</Chip>
      </div>
      <p className="text-ink-600 m-0 text-[12.5px] leading-[18px]">{s.note}</p>
      {s.cards.map((c) => {
        const v = view(c);
        return (
          <article key={v.key} className="bg-card shadow-card flex min-w-0 flex-col items-start gap-1 rounded-xl px-3.5 py-3">
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <span className="text-ink-700 font-mono text-[12.5px] break-all">{v.ref}</span>
              {v.tag ? <Chip tone={v.tag.tone}>{v.tag.text}</Chip> : null}
            </div>
            <b className="text-foreground text-[14px] leading-5 font-semibold">{v.title}</b>
            <span className="text-ink-600 text-[12.5px] leading-[18px]">{v.sub}</span>
            {v.link ? (
              <LabButton variant="text" size="sm" className="-ml-2" onClick={v.link.go}>
                {v.link.label}
              </LabButton>
            ) : null}
            {v.acts.map((a) => (
              <LabButton
                key={a.label}
                variant={a.primary ? "primary" : "secondary"}
                size="sm"
                className={cn("mt-1.5 w-full")}
                onClick={a.go}
              >
                {a.label}
              </LabButton>
            ))}
          </article>
        );
      })}
      {s.cards.length ? null : (
        <p className="text-ink-600 border-ink-300 m-0 rounded-xl border border-dashed px-3 py-[18px] text-center text-[13px]">{s.empty}</p>
      )}
    </section>
  );
}
