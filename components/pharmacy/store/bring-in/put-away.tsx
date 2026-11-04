"use client";

import type { StoreBatch, StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { useState } from "react";

import {
  putAwayAction,
  sendStraightAction,
  undoPutAwayAction,
} from "@/app/pharmacy/stock/store/store-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import { fieldSm } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { STORE_SAYS } from "@/content/pharmacy-store";
import { STB } from "@/content/pharmacy-store-bringin";
import { fill } from "@/content/pharmacy-workspace-v2";
import { fmtExp, num, units } from "@/lib/pharmacy/derive/store/format";
import { daysAt, needAt } from "@/lib/pharmacy/derive/store/places";
import { medOf } from "@/lib/pharmacy/derive/store/stock";
import { cn } from "@/lib/utils";
import { Card, emptyCls, rowCls, rowSub, rowTitle } from "../places/parts";
import { newKey, useStoreAct, useWitness } from "../shared";

const P = STB.put;

/** The place with the fewest days of cover, under the transfer rule and with a need. */
function shortPlace(w: StoreWorld, medId: string) {
  let best: { id: string; name: string; days: number; need: number } | null = null;
  for (const p of w.places) {
    const days = daysAt(w, medId, p.id);
    const need = needAt(w, medId, p.id);
    if (days !== null && days < w.rules.transferUnder && need > 0 && (!best || days < best.days))
      best = { id: p.id, name: p.name, days, need };
  }
  return best;
}

/** A line finished this session stays on the list, so it can be undone: `rowId` null when all of it was sent on. */
type Done = { batch: StoreBatch; rowId: string | null; shelf: string };

/** STORE.md §E2. */
export function PutAway({ world: w }: { world: StoreWorld }) {
  const { busy, toast, say, run } = useStoreAct();
  const { ask, dialog } = useWitness(w.storeId, say);
  const [done, setDone] = useState<Record<string, Done>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});

  const waiting = w.batches.filter((b) => b.waiting && b.qty > 0 && !done[b.id]);
  const rows = [...waiting, ...Object.values(done).map((d) => d.batch)].sort(
    (a, b) =>
      Number(medOf(w, b.medId).cold) - Number(medOf(w, a.medId).cold) || a.exp.localeCompare(b.exp),
  );
  const refs = [...new Set(rows.flatMap((b) => b.grn ?? []))].join(", ");
  const home = (b: StoreBatch) => {
    const m = medOf(w, b.medId);
    return m.bin ?? (m.cold ? (w.coldRoom?.code ?? "") : "");
  };
  const shelfOf = (b: StoreBatch) => typed[b.id] ?? home(b);

  const put = (b: StoreBatch) => {
    const m = medOf(w, b.medId);
    const cold = waiting.find((x) => medOf(w, x.medId).cold);
    if (cold && !m.cold) {
      const bin = shelfOf(cold);
      const med = medOf(w, cold.medId).short.toLowerCase();
      return say(bin ? fill(P.coldFirst, { med, bin }) : fill(P.coldFirstNoBin, { med }));
    }
    const shelf = shelfOf(b).trim();
    if (!shelf) return say(STORE_SAYS.shelfCode);
    const rowId = newKey();
    run(
      () => putAwayAction({ clientKey: rowId, batchId: b.id, shelf }),
      () => {
        setDone((x) => ({ ...x, [b.id]: { batch: b, rowId, shelf } }));
        return fill(P.toast, { med: m.short, bin: shelf.toUpperCase() });
      },
    );
  };

  const undo = (b: StoreBatch, rowId: string) => {
    const clientKey = newKey();
    run(
      () => undoPutAwayAction({ clientKey, shelfRowId: rowId }),
      () => {
        setDone(({ [b.id]: _, ...rest }) => rest);
        return fill(P.undone, { med: medOf(w, b.medId).short });
      },
    );
  };

  const straight = async (b: StoreBatch, placeId: string, place: string, n: number) => {
    const m = medOf(w, b.medId);
    const witness = m.controlled
      ? await ask(fill(P.straightWitness, { n: units(n, m.unit), med: m.short, place }))
      : undefined;
    if (witness === null) return;
    const clientKey = newKey();
    run(
      () =>
        sendStraightAction({
          clientKey,
          batchId: b.id,
          placeId,
          quantity: n,
          witnessAttestationId: witness,
        }),
      (d) => {
        if (n >= b.qty) setDone((x) => ({ ...x, [b.id]: { batch: b, rowId: null, shelf: "" } }));
        return fill(P.straightToast, {
          n: num(n),
          place,
          voucher: d.voucher,
          left: num(b.qty - n),
        });
      },
    );
  };

  return (
    <Card title={refs ? fill(P.titleRef, { ref: refs }) : P.title} note={P.note}>
      {rows.length ? (
        rows.map((b) => {
          const m = medOf(w, b.medId);
          const d = done[b.id];
          const to = d ? null : shortPlace(w, b.medId);
          const n = to ? Math.min(to.need, b.qty) : 0;
          return (
            <div key={b.id} className={rowCls}>
              <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-px">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={rowTitle}>{m.name}</span>
                  {m.cold ? <Chip tone="info">{P.cold}</Chip> : null}
                </span>
                <span className={rowSub}>{fill(P.sub, { no: b.no, exp: fmtExp(b.exp) })}</span>
              </span>
              <span className="text-foreground text-[14px] font-semibold tabular-nums">
                {units(b.qty, m.unit)}
              </span>
              <label className="text-ink-700 inline-flex items-center gap-1.5 text-[12px] font-semibold">
                {P.shelf}
                <input
                  aria-label={fill(P.aria, { med: m.name })}
                  value={d?.shelf.toUpperCase() ?? shelfOf(b)}
                  disabled={!!d}
                  onChange={(e) =>
                    setTyped((x) => ({ ...x, [b.id]: e.target.value.toUpperCase() }))
                  }
                  className={cn(fieldSm, "w-[5.5rem] font-bold uppercase disabled:opacity-70")}
                />
              </label>
              <span className={rowSub}>{m.bin ? fill(P.already, { bin: m.bin }) : P.newShelf}</span>
              <span className="flex flex-wrap items-center gap-2">
                {to && n > 0 ? (
                  <LabButton
                    variant="primary"
                    size="sm"
                    busy={busy}
                    onClick={() => straight(b, to.id, to.name, n)}
                  >
                    {fill(P.straight, { n: num(n), place: to.name })}
                  </LabButton>
                ) : null}
                {d ? (
                  <>
                    <Tag>{d.rowId ? P.done : P.allSent}</Tag>
                    {d.rowId ? (
                      <LabButton
                        size="sm"
                        variant="text"
                        busy={busy}
                        aria-label={fill(P.undoAria, { med: m.name })}
                        onClick={() => undo(b, d.rowId!)}
                      >
                        {P.undo}
                      </LabButton>
                    ) : null}
                  </>
                ) : (
                  <LabButton size="sm" busy={busy} onClick={() => put(b)}>
                    {P.mark}
                  </LabButton>
                )}
              </span>
            </div>
          );
        })
      ) : (
        <p className={emptyCls}>{P.none}</p>
      )}
      {toast}
      {dialog}
    </Card>
  );
}
