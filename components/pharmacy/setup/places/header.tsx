"use client";

import type { PlaceKind } from "@/content/pharmacy-setup";
import type { PlacesView } from "@/lib/pharmacy/setup/types";
import { Fragment } from "react";
import { ArrowRightIcon, SearchIcon } from "lucide-react";

import { pillBtn } from "@/components/pharmacy/medicines/shared";
import { PLACE_KINDS } from "@/content/pharmacy-setup";
import { PL } from "@/content/pharmacy-setup-places";
import { stockFlow } from "@/lib/pharmacy/derive/setup/places";
import { cn } from "@/lib/utils";
import { fridgesAt, slotsOf, stateOf } from "./shared";

export type TileId = "" | "fridge" | "missed" | "out";
export type KindFilter = "all" | PlaceKind | "closed";

/** §B1 tiles: each toggles its filter on the grid (teal border on the lagoon tint when on). */
export function Tiles({
  view: v,
  tile,
  onTile,
}: {
  view: PlacesView;
  tile: TileId;
  onTile: (t: TileId) => void;
}) {
  const open = v.places.filter((p) => !p.closed);
  const wards = open.filter((p) => p.kind === "ward").length;
  const ok = v.fridges.filter((f) => stateOf(v, f) === "ok").length;
  const need = open.filter((p) => p.coldLines.length && !fridgesAt(v, p.id).length).length;
  const missed = open.filter((p) => slotsOf(v, p).some((h) => h.st === "missed"));
  const out = open.filter((p) => p.stock.out > 0);
  const T = PL.tiles;
  const tiles: [TileId, string, string, string][] = [
    ["", T.places, String(open.length), T.placesSub(wards, open.length - wards)],
    ["fridge", T.fridges, T.fridgesValue(ok, v.fridges.length), T.fridgesSub(need)],
    [
      "missed",
      T.missed,
      String(missed.length),
      missed.length ? missed.map((p) => p.name).join(", ") : T.none,
    ],
    ["out", T.out, String(out.length), T.outSub(out.reduce((a, p) => a + p.stock.out, 0))],
  ];
  return (
    <div
      role="group"
      aria-label={PL.glanceAria}
      className="grid grid-cols-2 gap-2 min-[760px]:grid-cols-4"
    >
      {tiles.map(([id, label, value, sub]) => {
        const on = tile === id;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => onTile(on ? "" : id)}
            className={cn(
              "focus-visible:shadow-focus flex min-w-0 flex-col items-start gap-0.5 rounded-[14px] border px-3 py-2.5 text-left transition-colors duration-150 outline-none",
              on ? "border-primary bg-tide-lagoon-tint" : "border-border bg-card hover:bg-ink-50",
            )}
          >
            <span className="text-caption text-ink-600 font-medium">{label}</span>
            <span className="text-foreground text-[22px] leading-7 font-semibold tabular-nums">
              {value}
            </span>
            <span className="text-caption text-ink-700 w-full truncate">{sub}</span>
          </button>
        );
      })}
    </div>
  );
}

/** §B1 stock flow: suppliers grey, the store teal, places white; built from each place's "Supplied from". */
export function Flow({ view: v }: { view: PlacesView }) {
  const name = new Map(v.suppliers.map((s) => [s.id, s.name]));
  const nodes = stockFlow(
    v.places
      .filter((p) => !p.closed)
      .map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        suppliedFrom: p.suppliedFrom,
        suppliers: p.supplierIds.flatMap((id) => name.get(id) ?? []),
      })),
  );
  if (!nodes.length) return null;
  return (
    <section aria-label={PL.flowAria} className="flex flex-col gap-1.5">
      <h3 className="text-ink-600 text-[11px] font-semibold tracking-[0.06em] uppercase">
        {PL.flowTitle}
      </h3>
      <p className="flex flex-wrap items-center gap-1.5">
        {nodes.map((n, i) => (
          <Fragment key={i}>
            <span
              className={cn(
                "inline-flex h-[26px] items-center rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap",
                n.kind === "sup"
                  ? "bg-ink-150 text-foreground"
                  : n.kind === "store"
                    ? "bg-tide-lagoon-tint text-teal-900"
                    : "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--color-ink-200)]",
              )}
            >
              {n.label}
            </span>
            {n.arrow ? <ArrowRightIcon aria-hidden className="text-ink-500 size-3.5" /> : null}
            {n.sep ? (
              <span aria-hidden className="text-ink-400 px-1">
                |
              </span>
            ) : null}
          </Fragment>
        ))}
      </p>
    </section>
  );
}

/** §B1 kind chips and the search. */
export function KindBar({
  view: v,
  kind,
  onKind,
  q,
  onQ,
}: {
  view: PlacesView;
  kind: KindFilter;
  onKind: (k: KindFilter) => void;
  q: string;
  onQ: (q: string) => void;
}) {
  const open = v.places.filter((p) => !p.closed);
  const closed = v.places.length - open.length;
  const kinds = (Object.keys(PLACE_KINDS) as PlaceKind[]).filter((k) =>
    open.some((p) => p.kind === k),
  );
  const chips: [KindFilter, string, number][] = [
    ["all", PL.all, open.length],
    ...kinds.map((k): [KindFilter, string, number] => [
      k,
      PLACE_KINDS[k],
      open.filter((p) => p.kind === k).length,
    ]),
    ...(closed ? [["closed", PL.closedKind, closed] as [KindFilter, string, number]] : []),
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label={PL.kindAria} className="flex flex-wrap gap-1.5">
        {chips.map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => onKind(k)}
            className={pillBtn(kind === k)}
          >
            {PL.chip(label, n)}
          </button>
        ))}
      </div>
      <label className="bg-card border-ink-300 focus-within:shadow-focus flex h-8 w-full items-center gap-2 rounded-full border px-3 min-[760px]:w-56">
        <SearchIcon aria-hidden className="text-ink-500 size-3.5 shrink-0" />
        <input
          type="search"
          aria-label={PL.search}
          placeholder={PL.search}
          value={q}
          onChange={(e) => onQ(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
      </label>
    </div>
  );
}
