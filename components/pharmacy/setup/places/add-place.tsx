"use client";

import type { Hours, PlaceKind } from "@/content/pharmacy-setup";
import type { PlacesView } from "@/lib/pharmacy/setup/types";
import { useState } from "react";

import { PickField } from "@/app/lab/_components/v2/fields";
import { addPlaceAction } from "@/app/pharmacy/setup/setup-actions";
import { newKey } from "@/components/pharmacy/medicines/shared";
import { FormDialog, inputCls, labelCls, useAct } from "@/components/pharmacy/roster/swaps";
import { DEFAULT_DEVICE, DEVICES, HOURS, PLACE_KINDS } from "@/content/pharmacy-setup";
import { PL } from "@/content/pharmacy-setup-places";
import { SupplyField } from "./open-row";

const DIRECT = "direct";
const A = PL.add;

/** §B4 Add a place. Kind sets the device; a store is supplied direct; a store is a hub unit and a ward a hub ward. */
export function AddPlaceDialog({
  view: v,
  open,
  toast,
  onClose,
  onAdded,
}: {
  view: PlacesView;
  open: boolean;
  toast: (m: string) => void;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const [pending, run] = useAct(toast);
  const firstStore = v.places.find((p) => p.kind === "store" && !p.closed)?.id ?? DIRECT;
  const storeSups = [
    ...new Set(v.places.filter((p) => p.kind === "store").flatMap((p) => p.supplierIds)),
  ];
  const blank = () => ({
    name: "",
    kind: (v.hub.wards.length ? "ward" : "clinic") as PlaceKind,
    hours: "24h" as Hours,
    from: firstStore,
    sups: [] as string[],
    device: DEFAULT_DEVICE[v.hub.wards.length ? "ward" : "clinic"] as string,
    unit: "",
    ward: "",
  });
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const set = (patch: Partial<ReturnType<typeof blank>>) => (
    setF((x) => ({ ...x, ...patch })),
    setErr("")
  );
  const close = () => (setF(blank()), setErr(""), onClose());

  const setKind = (k: PlaceKind) =>
    set({
      kind: k,
      device: DEFAULT_DEVICE[k],
      ...(k === "store"
        ? { from: DIRECT, sups: storeSups }
        : f.kind === "store"
          ? { from: firstStore, sups: [] }
          : {}),
    });

  const submit = () => {
    const n = f.name.trim();
    if (!n) return setErr(PL.errName);
    if (v.places.some((p) => p.name.toLowerCase() === n.toLowerCase())) return setErr(PL.errDup);
    if (f.kind === "store" && f.from !== DIRECT) return setErr(PL.errStoreSelf);
    if (f.kind === "store" && !f.unit) return setErr(A.pickUnit);
    if (f.kind === "ward" && !f.ward) return setErr(A.pickWard);
    const id = newKey();
    void run(
      () =>
        addPlaceAction({
          clientKey: id,
          kind: f.kind,
          name: n,
          hours: f.hours,
          suppliedFrom: f.from === DIRECT ? null : f.from,
          supplierIds: f.from === DIRECT ? f.sups : [],
          device: f.device,
          departmentId: f.kind === "store" ? f.unit : null,
          wardId: f.kind === "ward" ? f.ward : null,
        }),
      () => A.added(n),
    ).then((ok) => {
      if (!ok) return;
      close();
      onAdded(id);
    });
  };

  return (
    <FormDialog
      open={open}
      onClose={close}
      title={A.title}
      sub={A.hint}
      error={err}
      submit={A.submit}
      onSubmit={submit}
      pending={pending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <PickField
            label={PL.kind}
            forceList
            options={(Object.keys(PLACE_KINDS) as PlaceKind[]).map((k) => ({
              value: k,
              label: PLACE_KINDS[k],
              ...(k === "dispensing_point"
                ? { unavailable: true, detail: A.dispHub }
                : k === "store" && !v.hub.units.length
                  ? { unavailable: true, detail: A.noUnit }
                  : k === "ward" && !v.hub.wards.length
                    ? { unavailable: true, detail: A.noWard }
                    : {}),
            }))}
            value={f.kind}
            onChange={(k) => setKind(k as PlaceKind)}
          />
          {f.kind === "store" ? (
            <PickField
              label={A.unit}
              forceList
              options={v.hub.units.map((u) => ({ value: u.id, label: u.name }))}
              value={f.unit}
              onChange={(unit) => set({ unit })}
            />
          ) : null}
          {f.kind === "ward" ? (
            <PickField
              label={A.ward}
              forceList
              options={v.hub.wards.map((w) => ({ value: w.id, label: w.name }))}
              value={f.ward}
              onChange={(ward) =>
                set({
                  ward,
                  name: f.name || (v.hub.wards.find((w) => w.id === ward)?.name ?? ""),
                })
              }
            />
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>{PL.name}</span>
            <input
              className={inputCls}
              placeholder={A.namePh}
              value={f.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
        </div>
        <div className="flex flex-col gap-4">
          <PickField
            label={PL.open}
            options={(Object.keys(HOURS) as Hours[]).map((h) => ({ value: h, label: HOURS[h] }))}
            value={f.hours}
            onChange={(h) => set({ hours: h as Hours })}
          />
          <SupplyField
            view={v}
            selfId={null}
            kind={f.kind}
            from={f.from}
            sups={f.sups}
            onFrom={(from) => set({ from })}
            onSups={(sups) => set({ sups })}
          />
          <PickField
            label={PL.workedFrom}
            options={DEVICES.map((d) => ({ value: d, label: d }))}
            value={f.device}
            onChange={(device) => set({ device })}
          />
        </div>
      </div>
    </FormDialog>
  );
}
