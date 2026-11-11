"use client";

import type { PlaceBalance } from "@/lib/pharmacy/derive/store/places";
import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";

import { openBalanceCaseAction } from "@/app/pharmacy/stock/store/store-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import { LabButton } from "@/components/tide/work/button";
import { STORE_SAYS } from "@/content/pharmacy-store";
import { STP } from "@/content/pharmacy-store-places";
import { fill } from "@/content/pharmacy-workspace-v2";
import { ugx } from "@/lib/pharmacy/derive/store/format";
import { placeBalance } from "@/lib/pharmacy/derive/store/places";
import { useStoreAct } from "../shared";
import { Card, emptyCls, rowSub, Scroll, tdCls, thCls } from "./parts";

const B = STP.books;
const TONE: Record<PlaceBalance["state"], "bad" | "warn" | "ok"> = {
  bad: "bad",
  warn: "warn",
  ok: "ok",
};
const monthName = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleString("en-GB", {
    month: "long",
    timeZone: "UTC",
  });

/** STORE.md §D2: for each place, this month. */
export function PlaceBalances({ world: w }: { world: StoreWorld }) {
  const { busy, toast, run } = useStoreAct();
  return (
    <Card
      title={fill(B.title, { month: monthName(w.today) })}
      note={fill(B.note, { limit: ugx(w.rules.balanceCase) })}
    >
      {w.places.length ? (
        <Scroll label={B.scroll}>
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th scope="col" className={thCls}>
                  {B.place}
                </th>
                <th scope="col" className={thCls}>
                  {B.start}
                </th>
                <th scope="col" className={thCls}>
                  {B.received}
                </th>
                <th scope="col" className={thCls}>
                  {B.used}
                </th>
                <th scope="col" className={thCls}>
                  {B.shelf}
                </th>
                <th scope="col" className={thCls}>
                  {B.gap}
                </th>
                <th scope="col" className={thCls}>
                  <span className="sr-only">{B.action}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {w.places.map((p) => {
                const b = placeBalance(w, p.id);
                const hasCase = w.balanceCases.includes(p.id);
                return (
                  <tr key={p.id}>
                    <th scope="row" className={`${tdCls} text-left font-semibold`}>
                      {p.name}
                      <span className={`${rowSub} block font-normal`}>
                        {b.gap > 0 && b.why ? fill(B.why, { med: b.why }) : B.balances}
                      </span>
                      {b.sent > 0 ? (
                        <span className={`${rowSub} block font-normal`}>
                          {fill(B.sentOn, { v: ugx(b.sent) })}
                        </span>
                      ) : null}
                    </th>
                    <td className={`${tdCls} whitespace-nowrap`}>{ugx(b.start)}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      {fill(B.plus, { v: ugx(b.received) })}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      {fill(B.minus, { v: ugx(b.used) })}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>{ugx(b.shelf)}</td>
                    <td className={tdCls}>
                      <Chip tone={TONE[b.state]}>{b.gap > 0 ? ugx(b.gap) : B.balances}</Chip>
                    </td>
                    <td className={`${tdCls} w-40 pr-0 text-right`}>
                      {hasCase ? (
                        <Tag className="ml-auto">{B.hasCase}</Tag>
                      ) : b.state === "bad" ? (
                        <LabButton
                          size="sm"
                          variant="primary"
                          busy={busy}
                          reasonPlacement="below"
                          disabledReason={w.actor.inCharge ? null : STORE_SAYS.inChargeOnly}
                          onClick={() =>
                            run(
                              () => openBalanceCaseAction({ placeId: p.id }),
                              fill(B.opened, { place: p.name }),
                            )
                          }
                        >
                          {B.open}
                        </LabButton>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Scroll>
      ) : (
        <p className={emptyCls}>{B.none}</p>
      )}
      {toast}
    </Card>
  );
}
