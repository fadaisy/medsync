"use client";

import type { KindFilter, TileId } from "./header";
import type { PlacesView, RulesView } from "@/lib/pharmacy/setup/types";
import { useState } from "react";

import { useToast } from "@/components/pharmacy/medicines/shared";
import { LabButton } from "@/components/tide/work/button";
import { EmptyState, Panel } from "@/components/tide/work/kit";
import { PL } from "@/content/pharmacy-setup-places";
import { AddPlaceDialog } from "./add-place";
import { ColdChain } from "./cold-chain";
import { PlacesGrid } from "./grid";
import { Flow, KindBar, Tiles } from "./header";
import { PlaceRuleBadges } from "./rule-badges";
import { fridgesAt, slotsOf } from "./shared";
import { Suppliers } from "./suppliers";

/** Set-up › Places (SETUP-TABS.md §B). `view` null: the 0274 database update is not applied here yet. */
export function PlacesTab({
  view,
  rules,
  addStore = false,
}: {
  view: PlacesView | null;
  rules: RulesView | null;
  /** Arrived from Main store's empty state: open Add a place on a store, while the hospital has none. */
  addStore?: boolean;
}) {
  if (!view)
    return (
      <Panel title={PL.title}>
        <EmptyState compact title={PL.needsDb} />
      </Panel>
    );
  return <Places view={view} rules={rules} addStore={addStore} />;
}

function Places({
  view: v,
  rules,
  addStore,
}: {
  view: PlacesView;
  rules: RulesView | null;
  addStore: boolean;
}) {
  const [toastNode, toast] = useToast();
  const [tile, setTile] = useState<TileId>("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const startStore =
    addStore && v.can.manage && v.hub.units.length > 0 && !v.places.some((p) => p.kind === "store");
  const [adding, setAdding] = useState(startStore);
  const open = v.places.filter((p) => !p.closed);
  const closed = v.places.length - open.length;
  const needle = q.trim().toLowerCase();
  const rows = v.places.filter((p) => {
    if (kind === "closed" ? !p.closed : p.closed || (kind !== "all" && p.kind !== kind))
      return false;
    if (tile === "fridge" && !fridgesAt(v, p.id).length && !p.coldLines.length) return false;
    if (tile === "missed" && !slotsOf(v, p).some((h) => h.st === "missed")) return false;
    if (tile === "out" && !p.stock.out) return false;
    return !needle || `${p.name} ${p.kind}`.toLowerCase().includes(needle);
  });
  const clear = () => (setKind("all"), setTile(""), setQ(""));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel
        title={`${PL.title} · ${PL.count(open.length, closed)}`}
        note={PL.lead}
        action={
          v.can.manage ? (
            <LabButton variant="primary" onClick={() => setAdding(true)}>
              {PL.addPlace}
            </LabButton>
          ) : null
        }
      >
        <PlaceRuleBadges view={v} rules={rules} toast={toast} />
        <Tiles view={v} tile={tile} onTile={(t) => (setTile(t), setOpenId(null))} />
        <Flow view={v} />
        <KindBar
          view={v}
          kind={kind}
          onKind={(k) => (setKind(k), setOpenId(null))}
          q={q}
          onQ={setQ}
        />
        <PlacesGrid
          view={v}
          rows={rows}
          openId={openId}
          onOpen={setOpenId}
          toast={toast}
          onClear={clear}
        />
      </Panel>
      <ColdChain view={v} toast={toast} />
      <Suppliers view={v} toast={toast} />
      <AddPlaceDialog
        view={v}
        open={adding}
        startStore={startStore}
        toast={toast}
        onClose={() => setAdding(false)}
        onAdded={(id) => (clear(), setOpenId(id))}
      />
      {toastNode}
    </div>
  );
}
