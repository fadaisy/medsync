"use client";

import type { PutRow, ReceiveDelivery } from "@/lib/pharmacy/derive/receive";
import { useState } from "react";

import {
  putAwayLineAction,
  sendStraightLineAction,
  undoPutAwayLineAction,
} from "@/app/pharmacy/stock/store/receive-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import {
  Card,
  emptyCls,
  rowCls,
  rowSub,
  rowTitle,
  Scroll,
  tdCls,
  thCls,
} from "@/components/pharmacy/store/places/parts";
import { newKey } from "@/components/pharmacy/store/shared";
import { LabButton } from "@/components/tide/work/button";
import { RC } from "@/content/pharmacy-receive";
import { RA } from "@/content/pharmacy-receive-after";
import {
  atText,
  expText,
  lineInfo,
  normExp,
  owedLines,
  plural,
} from "@/lib/pharmacy/derive/receive";
import { cn } from "@/lib/utils";
import { useReceive } from "../provider";
import { inputCls } from "../shared";
import { PaperDialog } from "./papers";

const phone = "max-sm:h-11";

/** RECEIVE §E: a closed delivery: put each batch on its shelf, the papers and claim, what moved, what is still owed. */
export function AfterView({ delivery: d }: { delivery: ReceiveDelivery }) {
  const { world, go, open, run, say, busy } = useReceive();
  const [typed, setTyped] = useState<Record<string, string>>({});
  /** Put away in this session: only these can be undone. */
  const [mine, setMine] = useState<ReadonlySet<string>>(new Set());
  const [paper, setPaper] = useState<"grn" | "report" | null>(null);

  const place = world.places.find((p) => p.id === d.place)?.name ?? RC.dash;
  const infos = d.lines.map((l) => ({ l, i: lineInfo(l, d, world) }));
  const infoOf = (lineId: string) => infos.find((x) => x.l.id === lineId)!;
  const rows = d.put
    .filter((p) => infos.some((x) => x.l.id === p.lineId))
    .sort((a, b) => Number(infoOf(b.lineId).i.m.cold) - Number(infoOf(a.lineId).i.m.cold));
  const left = rows.filter((p) => !p.done).length;
  const differs = infos.some((x) => x.i.words.some((w) => w.caution));
  const claim = world.claims.find((c) => c.ref === d.claimRef);
  const order = d.orderId ? world.orders.find((o) => o.id === d.orderId) : undefined;
  const owed = order ? owedLines(order) : [];
  const medName = (id: string) => world.meds.find((m) => m.id === id)?.name ?? "";
  const shelfOf = (p: PutRow) => typed[p.lineId] ?? p.shelf;

  const put = (p: PutRow) => {
    const { i } = infoOf(p.lineId);
    const shelf = shelfOf(p).trim().toUpperCase();
    // The server refuses a non-cold line while a cold one waits, and says so.
    if (!shelf) return say(RC.says.shelf);
    run(
      () => putAwayLineAction({ clientKey: newKey(), lineId: p.lineId, shelf }),
      () => {
        setMine((s) => new Set(s).add(p.lineId));
        return RA.put.toast(i.m.name, shelf);
      },
    );
  };
  const undo = (p: PutRow) =>
    run(
      () => undoPutAwayLineAction({ clientKey: newKey(), lineId: p.lineId }),
      () => {
        setMine((s) => {
          const n = new Set(s);
          n.delete(p.lineId);
          return n;
        });
        return RA.put.undone(infoOf(p.lineId).i.m.name);
      },
    );
  const straight = (p: PutRow, placeId: string, placeName: string, n: number) =>
    run(
      () => sendStraightLineAction({ clientKey: newKey(), lineId: p.lineId, placeId, quantity: n }),
      (r) => RA.put.straightToast(n, placeName, r.voucher),
    );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col items-start gap-1">
        <LabButton variant="text" className="-ml-2" onClick={() => go(null)}>
          {RA.back}
        </LabButton>
        <h1 className="font-display text-heading-l text-foreground m-0">{RA.title(place)}</h1>
        <p className="text-ink-600 m-0 text-[14px] leading-5">
          {RA.sub([d.grn, `note ${d.note}`, d.source, atText(d.finished)])}
        </p>
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {rows.length ? (
            <Card
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {RA.put.title}
                  <Chip>{left ? RA.put.left(left) : RA.put.allDone}</Chip>
                </span>
              }
              note={RA.put.note}
              aside={
                <LabButton size="sm" onClick={() => open({ kind: "labels", deliveryId: d.id })}>
                  {RA.put.labels}
                </LabButton>
              }
            >
              <ul className="m-0 list-none p-0">
                {rows.map((p) => {
                  const { i } = infoOf(p.lineId);
                  const l = infoOf(p.lineId).l;
                  const shelf = shelfOf(p);
                  const sh = i.m.short;
                  const canSend = !!sh && !i.m.controlled && p.sent === 0 && p.qty >= 1 && !p.done;
                  const known =
                    !!p.alreadyOn && shelf.trim().toUpperCase() === p.alreadyOn.toUpperCase();
                  return (
                    <li key={p.lineId} className={rowCls}>
                      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
                        <span className={cn(rowTitle, "flex flex-wrap items-center gap-1.5")}>
                          {i.m.name}
                          {i.m.cold ? <Tag>{RA.put.cold}</Tag> : null}
                          {i.m.controlled ? <Tag>{RA.put.controlled}</Tag> : null}
                        </span>
                        <span className={rowSub}>
                          <span className="font-mono">{l.batch}</span>
                          {` · exp ${expText(normExp(l.exp), l.exp)} · ${plural(p.qty, i.m.unit)}${p.sent > 0 ? RA.put.sentOn(p.sent) : ""}`}
                        </span>
                        {!p.done ? (
                          <span className={rowSub}>
                            {known ? RA.put.already(p.alreadyOn!) : RA.put.newShelf}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {!p.done ? (
                          <>
                            <input
                              aria-label={RA.put.aria(i.m.name)}
                              value={shelf}
                              autoComplete="off"
                              autoCapitalize="characters"
                              onChange={(e) =>
                                setTyped((t) => ({
                                  ...t,
                                  [p.lineId]: e.target.value.toUpperCase(),
                                }))
                              }
                              className={cn(inputCls(), "w-28 font-mono uppercase")}
                            />
                            <LabButton
                              size="sm"
                              busy={busy}
                              className={phone}
                              onClick={() => put(p)}
                            >
                              {RA.put.mark}
                            </LabButton>
                            {canSend ? (
                              <LabButton
                                size="sm"
                                variant="text"
                                busy={busy}
                                className={phone}
                                onClick={() =>
                                  straight(p, sh.place, sh.placeName, Math.min(sh.n, p.qty))
                                }
                              >
                                {RA.put.straight(Math.min(sh.n, p.qty), sh.placeName)}
                              </LabButton>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <Tag>{p.qty === 0 ? RA.put.allSent : RA.put.on(p.shelf)}</Tag>
                            {p.qty > 0 && mine.has(p.lineId) ? (
                              <LabButton
                                size="sm"
                                variant="text"
                                busy={busy}
                                className={phone}
                                aria-label={RA.put.undoAria(i.m.name)}
                                onClick={() => undo(p)}
                              >
                                {RA.put.undo}
                              </LabButton>
                            ) : null}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card title={RA.moved.title}>
            <Scroll label={RA.moved.title}>
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    {RA.moved.cols.map((c) => (
                      <th key={c} scope="col" className={thCls}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {infos.map(({ l, i }) => (
                    <tr key={l.id}>
                      <td className={cn(tdCls, "font-semibold")}>{i.m.name}</td>
                      <td className={cn(tdCls, "font-mono")}>{l.batch || RC.dash}</td>
                      <td className={tdCls}>{plural(i.accUnits, i.m.unit)}</td>
                      <td className={tdCls}>
                        {i.rej
                          ? RA.moved.rejected(
                              plural(i.rej, "pack"),
                              i.fate === "quarantine" ? RA.moved.quarantine : RA.moved.driver,
                            )
                          : RC.dash}
                      </td>
                      <td className={tdCls}>{i.words.map((w) => w.word).join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title={RA.papers.title}>
            <div className="border-ink-200 flex flex-col items-start gap-2 border-t pt-3">
              <LabButton onClick={() => setPaper("grn")}>{RA.papers.grn}</LabButton>
              {differs ? (
                <LabButton onClick={() => setPaper("report")}>{RA.papers.report}</LabButton>
              ) : (
                <p className="text-ink-600 m-0 text-[13px] leading-5">{RA.papers.noReport}</p>
              )}
              {claim ? (
                <LabButton
                  onClick={() =>
                    open({
                      kind: "claim",
                      claimId: claim.id,
                      step: claim.state === "draft" ? "send" : "credit",
                    })
                  }
                >
                  {RA.papers.claim(claim.ref)}
                </LabButton>
              ) : null}
              {d.secondCheck ? (
                <p className="text-ink-600 m-0 text-[13px] leading-5">
                  {RA.papers.second(d.secondCheck)}
                </p>
              ) : null}
              {d.photos.length ? (
                <div className="flex flex-wrap gap-2">
                  {d.photos.map((ph, k) => (
                    <figure key={ph.id} className="m-0 flex w-24 flex-col gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a signed, expiring storage URL */}
                      <img
                        src={ph.url}
                        alt={RA.papers.photoAlt(ph.kind, k + 1)}
                        className="border-ink-200 h-24 w-24 rounded-lg border object-cover"
                      />
                      <figcaption className="text-ink-600 text-[12px] leading-4">
                        {ph.kind}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
            </div>
          </Card>

          {order ? (
            <Card
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{order.ref}</span>
                  <Tag>{order.state === "closed" ? RA.order.closed : RA.order.part}</Tag>
                </span>
              }
            >
              {owed.length ? (
                <ul className="m-0 list-none p-0">
                  {owed.map((o) => (
                    <li key={o.id} className={cn(rowCls, "min-h-10 py-2")}>
                      <span className={rowTitle}>{medName(o.medId)}</span>
                      <span className="text-foreground text-[14px] font-semibold tabular-nums">
                        {plural(o.packs - o.received, "pack")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={emptyCls}>{RA.order.nothing}</p>
              )}
              {owed.length ? (
                <div className="border-ink-200 border-t pt-3">
                  <LabButton onClick={() => open({ kind: "start", orderId: order.id })}>
                    {RA.order.rest}
                  </LabButton>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>

      {paper ? <PaperDialog delivery={d} which={paper} onClose={() => setPaper(null)} /> : null}
    </div>
  );
}
