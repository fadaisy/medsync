"use client";

import type { ChipTone } from "@/components/pharmacy/charts/chip";
import type { TypeFilter } from "@/content/pharmacy-supplies";
import type { StockState } from "@/lib/pharmacy/derive/store/stock";
import type { StoreMed, StoreWorld } from "@/lib/pharmacy/derive/store/types";
import Link from "next/link";

import { Chip } from "@/components/pharmacy/charts/chip";
import { linkBtn } from "@/components/pharmacy/medicines/shared";
import { TypeSwitch } from "@/components/pharmacy/medicines/type-switch";
import { DOT } from "@/components/pharmacy/medicines/tones";
import { LA } from "@/content/pharmacy-store-lookafter";
import { TYPE_SUB, typeTag } from "@/content/pharmacy-supplies";
import { fill } from "@/content/pharmacy-workspace-v2";
import { num, units } from "@/lib/pharmacy/derive/store/format";
import { matchesType, typeCounts } from "@/lib/pharmacy/derive/medicines";
import { mosOf, onHand, stateOf } from "@/lib/pharmacy/derive/store/stock";
import { cn } from "@/lib/utils";
import { card, Empty, Head, rowLine, Table } from "./shared";

const H = LA.health;
const TONE: Record<StockState, ChipTone> = {
  out: "bad",
  still: "neutral",
  short: "warn",
  over: "info",
  ok: "ok",
};
const moved = (m: StoreMed) =>
  m.moved === null ? H.never : m.moved <= 1 ? H.today : fill(H.daysAgo, { n: m.moved });

/** §F1. The tiles filter it: out, under the short line, too much or not moving. Lowest months of stock first. */
export function StoreStock({
  world: w,
  filter,
  itemType,
  onItemType,
}: {
  world: StoreWorld;
  filter: string | null;
  itemType: TypeFilter;
  onItemType: (t: TypeFilter) => void;
}) {
  const r = w.rules;
  const counts = typeCounts(w.meds);
  const rows = w.meds
    .filter((m) => matchesType(m, itemType))
    .map((m) => ({ m, mo: mosOf(w, m), st: stateOf(w, m) }))
    .filter(({ st }) =>
      filter === "out"
        ? st === "out"
        : filter === "low"
          ? st === "short"
          : filter === "over"
            ? st === "over" || st === "still"
            : true,
    )
    .sort((a, b) => (a.mo === b.mo ? 0 : a.mo - b.mo));
  const tileSub =
    filter === "out"
      ? H.sub.out
      : filter === "low"
        ? fill(H.sub.low, { n: r.shortUnder })
        : filter === "over"
          ? H.sub.over
          : "";
  const sub =
    [tileSub, itemType === "all" && tileSub ? "" : TYPE_SUB[itemType]].filter(Boolean).join(" · ");
  const state: Record<StockState, string> = {
    ...H.state,
    short: fill(H.state.short, { n: r.shortUnder }),
    over: fill(H.state.over, { n: r.tooMuch }),
  };
  return (
    <section className={card}>
      <Head
        action={<TypeSwitch value={itemType} counts={counts} onChange={onItemType} />}
        title={
          <>
            {H.title} <span className="text-ink-600 font-normal">· {sub}</span>
          </>
        }
        note={fill(H.note, { short: r.shortUnder, over: r.tooMuch })}
      />
      {rows.length ? (
        <Table cols={H.cols} min="min-w-[760px]">
          {rows.map(({ m, mo, st }) => (
            <tr key={m.id} className={rowLine}>
              <td className="py-1 pr-3">
                <Link
                  href={`?tab=main&section=card&med=${m.id}`}
                  scroll={false}
                  className={cn(linkBtn, "text-left")}
                >
                  {m.name}
                </Link>
                {m.itemType !== "medicine" ? (
                  <Chip tone={m.itemType === "lab_supply" ? "info" : "teal"} className="mt-0.5 flex w-fit">
                    {typeTag(m.itemType, m)}
                  </Chip>
                ) : null}
              </td>
              <td className="pr-3">{m.ven ? <Chip>{m.ven}</Chip> : null}</td>
              <td className="pr-3 whitespace-nowrap tabular-nums">
                {units(onHand(w, m.id), m.unit)}
              </td>
              <td className="pr-3 tabular-nums">{num(m.use)}</td>
              <td className="pr-3">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="bg-ink-100 h-1.5 min-w-16 flex-1 overflow-hidden rounded-full"
                  >
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        mo < r.shortUnder
                          ? mo === 0
                            ? DOT.Out
                            : DOT.Low
                          : mo > r.tooMuch
                            ? DOT.Over
                            : DOT.OK,
                      )}
                      style={{ width: `${Math.round(Math.min(1, mo / r.tooMuch) * 100)}%` }}
                    />
                  </span>
                  <b className="min-w-10 text-right font-semibold whitespace-nowrap tabular-nums">
                    {Number.isFinite(mo) ? mo.toFixed(1) : H.noUse}
                  </b>
                </span>
              </td>
              <td className="text-ink-700 pr-3 whitespace-nowrap">{moved(m)}</td>
              <td className="py-2">
                <Chip tone={TONE[st]}>{state[st]}</Chip>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>{H.none}</Empty>
      )}
    </section>
  );
}
