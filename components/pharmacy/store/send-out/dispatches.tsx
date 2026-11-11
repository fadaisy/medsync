"use client";

import type { Dispatch, StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { useState } from "react";

import { confirmDispatchAction } from "@/app/pharmacy/stock/store/store-actions";
import { Tag } from "@/components/medsync/tag";
import { field } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState } from "@/components/tide/work/kit";
import { SO } from "@/content/pharmacy-store-sendout";
import { fill } from "@/content/pharmacy-workspace-v2";
import { fmtAt, num } from "@/lib/pharmacy/derive/store/format";
import { medOf, placeName } from "@/lib/pharmacy/derive/store/stock";
import { useStoreAct } from "../shared";
import { CARD } from "./parts";

const D = SO.disp;

/** A dispatch's lines by medicine: the batches of one medicine read as one. */
function linesOf(w: StoreWorld, d: Dispatch) {
  const by = new Map<string, number>();
  for (const l of d.lines) by.set(l.medId, (by.get(l.medId) ?? 0) + l.qty);
  return [...by]
    .map(([id, n]) => fill(D.line, { med: medOf(w, id)?.short ?? "", n: num(n) }))
    .join(D.join);
}

/**
 * STORE.md §C3. Stock counts at the place only once it is confirmed; `filter` is the "On the way" tile ("transit").
 */
export function Dispatches({
  world: w,
  filter = null,
}: {
  world: StoreWorld;
  filter?: string | null;
}) {
  const { busy, toast, run } = useStoreAct();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const list = w.dispatches
    .filter((d) => filter !== "transit" || d.status === "transit")
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

  const confirm = (d: Dispatch) => {
    const note = (notes[d.id] ?? "").trim();
    const place = placeName(w, d.toId);
    run(
      () => confirmDispatchAction({ issueId: d.id, note: note || null }),
      note ? D.confirmedDiff : fill(D.confirmed, { place }),
    );
  };

  return (
    <section className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 className="text-heading-m text-foreground m-0">{D.title}</h2>
        <p className="text-body-s text-muted-foreground m-0">{D.note}</p>
      </div>
      {list.length ? null : <EmptyState compact title={filter ? D.noneWay : D.none} />}
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((d) => {
          const place = placeName(w, d.toId);
          return (
            <li
              key={d.id}
              className="border-border flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t py-2.5"
            >
              <span className="flex min-w-0 flex-[1_1_18rem] flex-col gap-0.5">
                <span className="text-body-s text-foreground font-semibold">
                  {fill(D.item, { voucher: d.voucher, place })}
                </span>
                <span className="text-caption text-muted-foreground">
                  {fill(D.sub, {
                    kind: D.kind[d.kind],
                    from: placeName(w, d.fromId),
                    at: fmtAt(d.sentAt),
                  })}
                  {d.receivedAt ? fill(D.subConfirmed, { at: fmtAt(d.receivedAt) }) : ""}
                  {d.note ? fill(D.subNote, { note: d.note }) : ""}
                </span>
                <span className="text-caption text-ink-700">{linesOf(w, d)}</span>
              </span>
              <Tag>{D.state[d.status]}</Tag>
              {d.status === "transit" ? (
                <span className="flex max-w-full flex-wrap items-center gap-1.5">
                  <input
                    aria-label={D.diffAria}
                    placeholder={D.diffHolder}
                    maxLength={300}
                    value={notes[d.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                    className={`${field} w-44 max-w-full`}
                  />
                  <LabButton size="sm" busy={busy} onClick={() => confirm(d)}>
                    {fill(D.confirm, { place })}
                  </LabButton>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {toast}
    </section>
  );
}
