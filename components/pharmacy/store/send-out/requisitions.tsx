"use client";

import type { ReqLine, Requisition, StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import {
  confirmDispatchAction,
  issueRequisitionAction,
} from "@/app/pharmacy/stock/store/store-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import { field, sectionTitle } from "@/components/pharmacy/medicines/shared";
import { near } from "@/components/pharmacy/medicines/tones";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState } from "@/components/tide/work/kit";
import { SO } from "@/content/pharmacy-store-sendout";
import { fill } from "@/content/pharmacy-workspace-v2";
import { fmtAt, fmtExp, num, units } from "@/lib/pharmacy/derive/store/format";
import { daysAt, needAt, psOf, transitTo } from "@/lib/pharmacy/derive/store/places";
import {
  askedOpen,
  canIssue,
  isOpen,
  lineNote,
  lineQtyAsked,
  needNote,
  shareMed,
  shortMeds,
  sortedReqs,
} from "@/lib/pharmacy/derive/store/requisitions";
import { batchesOf, fefo, medOf, onHand } from "@/lib/pharmacy/derive/store/stock";
import { cn } from "@/lib/utils";
import { newKey, useStoreAct, useWitness } from "../shared";
import { CARD, printOnly } from "./parts";

const Q = SO.req;
const qtyOf = (v: string) => parseInt(v, 10) || 0;
const FLEX_CHIP = "h-auto w-fit py-0.5 whitespace-normal";

/** STORE.md §C1: the list on the left, the pick list on the right. */
export function Requisitions({ world: w }: { world: StoreWorld }) {
  const { busy, toast, say, run } = useStoreAct();
  const { ask, dialog } = useWitness(w.storeId, say);
  const asked = useSearchParams().get("req");
  const [pick, setPick] = useState<string | null>(null);
  /** What was typed or shared; a line not here defaults to min(asked, on hand). */
  const [typed, setTyped] = useState<Record<string, Record<string, string>>>({});
  const [diff, setDiff] = useState<Record<string, string>>({});
  const sheet = useRef<HTMLElement>(null);
  const list = sortedReqs(w.requisitions);
  const sel = list.find((r) => r.id === (pick ?? asked)) ?? list[0];

  if (!sel)
    return (
      <section className={CARD}>
        <h2 className="text-heading-m text-foreground m-0">{Q.title}</h2>
        <EmptyState compact title={Q.none} />
      </section>
    );

  const R: Requisition = sel;
  const open = isOpen(R);
  const place = w.places.find((p) => p.id === R.placeId)?.name ?? "";
  const valueOf = (l: ReqLine) =>
    typed[R.id]?.[l.medId] ??
    String(open ? Math.min(lineQtyAsked(l), onHand(w, l.medId)) : l.issued);
  const lines = R.lines.map((l) => {
    const owed = lineQtyAsked(l);
    return {
      l,
      med: medOf(w, l.medId),
      owed,
      have: onHand(w, l.medId),
      value: valueOf(l),
      q: qtyOf(valueOf(l)),
    };
  });

  const short = shortMeds(w, R);
  const share = () => {
    const next = { ...typed };
    const said: string[] = [];
    for (const id of short) {
      const med = medOf(w, id);
      const { give, days } = shareMed(w, id, med.use);
      for (const [rid, n] of Object.entries(give)) next[rid] = { ...next[rid], [id]: String(n) };
      said.push(fill(Q.sharedOne, { med: med.short, n: Math.round(days) }));
    }
    setTyped(next);
    say(fill(Q.shared, { list: said.join(Q.sharedJoin) }));
  };

  const set = (medId: string, v: string) =>
    setTyped((t) => ({ ...t, [R.id]: { ...t[R.id], [medId]: v.replace(/\D/g, "") } }));

  const cdLines = lines.filter((x) => x.med.controlled && x.q > 0);
  const needsWitness = open && cdLines.length > 0;
  const overHave = lines.some((x) => x.q > x.have);
  const total = lines.reduce((a, x) => a + Math.min(x.q, x.have), 0);
  const owedAfter = lines.filter((x) => x.q < x.owed).length;
  const issuable =
    open &&
    canIssue(
      lines.map((x) => ({ qty: x.q, have: x.have, controlled: x.med.controlled })),
      true, // The witness is asked when the button is pressed.
    );
  const footer = !open
    ? fill(Q.footerDone, { voucher: R.voucher ?? "" })
    : overHave
      ? Q.footerOver
      : owedAfter
        ? fill(Q.footerOwed, { n: num(total), owed: owedAfter })
        : fill(Q.footer, { n: num(total) });

  const issue = async () => {
    const witnessAttestationId = needsWitness
      ? await ask(
          fill(Q.witnessWhat, {
            place,
            lines: cdLines
              .map((x) => fill(Q.witnessLine, { med: x.med.short, n: num(x.q) }))
              .join(Q.witnessJoin),
          }),
        )
      : null;
    if (needsWitness && !witnessAttestationId) return;
    run(
      () =>
        issueRequisitionAction({
          clientKey: newKey(),
          requisitionId: R.id,
          lines: lines.filter((x) => x.q > 0).map((x) => ({ productId: x.med.id, quantity: x.q })),
          witnessAttestationId,
        }),
      (d) => {
        setTyped((t) => {
          const rest = { ...t };
          delete rest[R.id];
          return rest;
        });
        return (
          fill(Q.done, { voucher: d.voucher, place }) +
          (owedAfter ? fill(Q.doneOwed, { n: owedAfter }) : "")
        );
      },
    );
  };

  const transit = w.dispatches.filter((d) => d.requisitionId === R.id && d.status === "transit");
  const note = (diff[R.id] ?? "").trim();
  const confirm = () =>
    run(
      async () => {
        for (const d of transit) {
          const r = await confirmDispatchAction({ issueId: d.id, note: note || null });
          if (!r.ok) return r;
        }
        return { ok: true as const };
      },
      note ? Q.confirmedDiff : fill(Q.confirmed, { place }),
    );
  const receipt =
    R.state === "received"
      ? R.receivedAt
        ? fill(Q.received, { place, at: fmtAt(R.receivedAt) })
        : fill(Q.receivedNoTime, { place })
      : R.state === "diff"
        ? fill(Q.receivedDiff, { note: R.diffNote ?? "" })
        : transit[0]
          ? fill(Q.onWay, { voucher: transit[0].voucher, place })
          : "";

  return (
    <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <nav aria-label={Q.title} className={`${CARD} gap-0.5 p-2.5`}>
        {list.map((r) => {
          const on = r.id === R.id;
          const from = w.places.find((p) => p.id === r.placeId)?.name ?? "";
          const meta = { at: fmtAt(r.askedAt), lines: SO.linesWord(r.lines.length) };
          return (
            <button
              key={r.id}
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => setPick(r.id)}
              className={cn(
                "focus-visible:ring-primary flex w-full flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2",
                on ? "bg-tide-lagoon-tint" : "hover:bg-ink-50",
              )}
            >
              <span className="flex w-full items-center justify-between gap-1.5">
                <span className="text-body-s text-foreground font-semibold">{from}</span>
                {r.urgent && isOpen(r) ? <Chip tone="bad">{Q.urgent}</Chip> : null}
              </span>
              <span className="text-caption text-muted-foreground">
                {r.voucher
                  ? fill(Q.metaVoucher, { ...meta, voucher: r.voucher })
                  : fill(Q.meta, meta)}
              </span>
              <Tag>{SO.state[r.state]}</Tag>
            </button>
          );
        })}
        <p className="text-caption text-muted-foreground mx-2 mt-1.5 mb-1">{Q.listNote}</p>
      </nav>

      <article ref={sheet} className={`${CARD} print:shadow-none`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-heading-m text-foreground m-0">{fill(Q.pick, { place })}</h2>
            <p className="text-caption text-muted-foreground m-0">
              {R.voucher && R.firstIssuedAt
                ? fill(Q.subIssued, {
                    at: fmtAt(R.askedAt),
                    voucher: R.voucher,
                    when: fmtAt(R.firstIssuedAt),
                  })
                : fill(Q.sub, { at: fmtAt(R.askedAt) })}
            </p>
          </div>
          <Tag>{SO.state[R.state]}</Tag>
        </div>

        {R.reason && open ? (
          <p
            className={cn(
              "text-body-s m-0 rounded-xl px-3 py-2 font-semibold",
              R.urgent
                ? "bg-status-critical-bg text-status-critical-fg-aa"
                : "bg-ink-100 text-ink-700",
            )}
          >
            {R.reason}
          </p>
        ) : null}

        {short.length ? (
          <div className="bg-status-caution-bg text-status-caution-fg-aa flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5">
            <p className="text-body-s m-0 min-w-0 flex-[1_1_16rem] font-semibold">
              {short
                .map((id) =>
                  fill(Q.short, {
                    med: medOf(w, id).short,
                    asked: num(askedOpen(w, id)),
                    have: num(onHand(w, id)),
                  }),
                )
                .join(Q.shortJoin)}
              {Q.shortRule}
            </p>
            <LabButton size="sm" className="print:hidden" onClick={share}>
              {Q.share}
            </LabButton>
          </div>
        ) : null}

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[760px] border-collapse print:min-w-0">
            <thead>
              <tr>
                {Q.cols.map((c) => (
                  <th key={c} scope="col" className={cn(sectionTitle, "py-1.5 pr-3 text-left")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-body-s text-foreground align-top">
              {lines.map(({ l, med, owed, have, value, q }) => {
                const ps = psOf(w, l.medId, R.placeId);
                const way = transitTo(w, l.medId, R.placeId);
                const days = daysAt(w, l.medId, R.placeId);
                const shown = days === null ? null : Math.round(days);
                const cell = "border-border border-t py-2.5 pr-3";
                const need = open && ps && owed > 0 ? needAt(w, l.medId, R.placeId) : null;
                const nn = need === null ? null : needNote(owed, need, med.pack, w.rules);
                const ln = open && owed > 0 ? lineNote(owed, q, have) : null;
                const qty = (n: number) => units(n, med.unit);
                return (
                  <tr key={l.medId}>
                    <td className={cell}>
                      <span className="flex flex-wrap items-center gap-1">
                        <span className="font-semibold">{med.name}</span>
                        {med.controlled ? <Chip className="rounded-sm">{Q.cd}</Chip> : null}
                        {med.cold ? (
                          <Chip tone="info" className="rounded-sm">
                            {Q.cold}
                          </Chip>
                        ) : null}
                      </span>
                      <span className="text-caption text-muted-foreground block">
                        {fill(med.controlled ? Q.unitCd : Q.unit, { unit: med.unit })}
                      </span>
                    </td>
                    <td className={cn(cell, "tabular-nums")}>{num(open ? owed : l.asked)}</td>
                    <td className={cell}>
                      <span className="block tabular-nums">
                        {!ps
                          ? Q.nowhere
                          : way
                            ? fill(Q.thereWay, { qty: qty(ps.here), way: num(way) })
                            : fill(Q.there, { qty: qty(ps.here) })}
                      </span>
                      {shown === null ? null : (
                        <span
                          className={cn(
                            "text-caption text-muted-foreground block",
                            near(shown, w.rules.coverAmber, w.rules.runningOut),
                          )}
                        >
                          {fill(Q.cover, { n: shown })}
                        </span>
                      )}
                      {nn ? (
                        <Chip
                          tone={
                            nn.kind === "less" ? "warn" : nn.kind === "needs" ? "neutral" : "info"
                          }
                          className={cn(FLEX_CHIP, "mt-0.5")}
                        >
                          {nn.kind === "at_level" ? Q.atLevel : fill(Q[nn.kind], { n: num(nn.n) })}
                        </Chip>
                      ) : null}
                    </td>
                    <td className={cn(cell, "tabular-nums")}>{num(have)}</td>
                    <td className={cell}>
                      <input
                        aria-label={fill(Q.issueAria, { name: med.name })}
                        inputMode="numeric"
                        disabled={!open}
                        value={value}
                        onChange={(e) => set(l.medId, e.target.value)}
                        className={cn(
                          field,
                          "disabled:bg-ink-50 disabled:text-ink-600 w-24 text-right font-semibold tabular-nums",
                        )}
                      />
                    </td>
                    <td className={cell}>
                      <span className="flex flex-col gap-1">
                        {open
                          ? fefo(batchesOf(w, l.medId), Math.min(q, have)).map((t) => (
                              <span key={t.batchId} className="text-caption">
                                <b className="font-semibold">{t.bin ?? Q.noBin}</b>{" "}
                                {fill(Q.take, { no: t.no, exp: fmtExp(t.exp), n: num(t.n) })}
                              </span>
                            ))
                          : null}
                        {!open ? (
                          <Chip className={FLEX_CHIP}>
                            {fill(Q.noteIssued, { qty: qty(l.issued) })}
                          </Chip>
                        ) : ln ? (
                          <Chip tone={ln.kind === "owed" ? "warn" : "bad"} className={FLEX_CHIP}>
                            {ln.kind === "out"
                              ? fill(Q.noteOut, { qty: qty(ln.owed) })
                              : ln.kind === "only"
                                ? fill(Q.noteOnly, { qty: qty(ln.have) })
                                : fill(Q.noteOwed, { qty: qty(ln.owed) })}
                          </Chip>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {needsWitness ? (
          <p className="bg-ink-50 text-body-s text-ink-700 m-0 rounded-xl px-3 py-2.5 print:hidden">
            <span className="font-semibold">{Q.witnessLabel}</span> {fill(Q.witnessNote, { place })}
          </p>
        ) : null}

        {receipt ? (
          <div className="bg-ink-50 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5 print:hidden">
            <p className="text-body-s text-foreground m-0">{receipt}</p>
            {transit.length ? (
              <span className="flex max-w-full flex-wrap items-center gap-1.5">
                <input
                  aria-label={Q.diffAria}
                  placeholder={Q.diffHolder}
                  maxLength={300}
                  value={diff[R.id] ?? ""}
                  onChange={(e) => setDiff((d) => ({ ...d, [R.id]: e.target.value }))}
                  className={cn(field, "w-60 max-w-full")}
                />
                <LabButton size="sm" busy={busy} onClick={confirm}>
                  {fill(Q.confirm, { place })}
                </LabButton>
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 print:hidden">
          {issuable ? <span className="text-body-s text-ink-700">{footer}</span> : <span />}
          <span className="flex flex-wrap items-center gap-2">
            <LabButton onClick={() => sheet.current && printOnly(sheet.current)}>
              {Q.print}
            </LabButton>
            <LabButton
              variant="primary"
              busy={busy}
              disabledReason={issuable ? null : footer}
              onClick={() => void issue()}
            >
              {R.state === "partial" ? Q.issueOwed : open ? Q.issue : Q.issued}
            </LabButton>
          </span>
        </div>
      </article>
      {toast}
      {dialog}
    </div>
  );
}
