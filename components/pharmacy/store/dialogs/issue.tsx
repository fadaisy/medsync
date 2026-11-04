"use client";

import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { useState } from "react";

import { issueWithoutRequisitionAction } from "@/app/pharmacy/stock/store/store-actions";
import { FormDialog, inputCls, labelCls } from "@/components/pharmacy/roster/swaps";
import { newKey, useStoreAct, useWitness } from "@/components/pharmacy/store/shared";
import { STORE_SAYS } from "@/content/pharmacy-store";
import { LA } from "@/content/pharmacy-store-lookafter";
import { fill } from "@/content/pharmacy-workspace-v2";
import { fmtExp, num, units } from "@/lib/pharmacy/derive/store/format";
import { batchesOf, fefo, medOf, onHand, placeName } from "@/lib/pharmacy/derive/store/stock";
import { useSave } from "./shared";

const T = LA.dlg.issue;

function IssueForm({
  world: w,
  onClose,
  say,
}: {
  world: StoreWorld;
  onClose: () => void;
  say: (m: string) => void;
}) {
  const [to, setTo] = useState(w.places[0]?.id ?? "");
  const [why, setWhy] = useState(T.whys[0]!);
  const [medId, setMedId] = useState("");
  const [qty, setQty] = useState("");
  const [clientKey] = useState(newKey);
  const { pending, error, setError, go } = useSave();
  const { ask, dialog } = useWitness(w.storeId, setError);
  const m = medId ? medOf(w, medId) : null;
  const here = m ? onHand(w, m.id) : 0;
  const n = parseInt(qty, 10) || 0;
  const takes =
    m && n > 0
      ? fefo(batchesOf(w, m.id), Math.min(n, here))
          .map((t) =>
            [t.bin, t.no, fill(T.take, { exp: fmtExp(t.exp) }), num(t.n)]
              .filter(Boolean)
              .join(" · "),
          )
          .join("; ")
      : "";
  const save = async () => {
    if (!m) return setError(T.errMed);
    if (!n) return setError(T.errQty);
    if (n > here) return setError(fill(STORE_SAYS.onlyN, { n: num(here) }));
    const place = placeName(w, to);
    let witness: string | null = null;
    if (m.controlled) {
      witness = await ask(fill(T.witness, { name: m.name, qty: units(n, m.unit), place }));
      if (!witness) return;
    }
    go(
      () =>
        issueWithoutRequisitionAction({
          clientKey,
          placeId: to,
          why,
          productId: m.id,
          quantity: n,
          witnessAttestationId: witness,
        }),
      (d) => {
        say(fill(T.saved, { voucher: d?.voucher ?? "", place }));
        onClose();
      },
    );
  };
  return (
    <FormDialog
      open
      onClose={onClose}
      title={T.title}
      sub={T.lead}
      error={error}
      submit={T.save}
      onSubmit={save}
      pending={pending}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{T.to}</span>
          <select
            value={to}
            onChange={(e) => (setTo(e.target.value), setError(""))}
            className={inputCls}
          >
            {w.places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{T.why}</span>
          <select
            value={why}
            onChange={(e) => (setWhy(e.target.value), setError(""))}
            className={inputCls}
          >
            {T.whys.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelCls}>{LA.dlg.medicine}</span>
          <select
            value={medId}
            onChange={(e) => (setMedId(e.target.value), setError(""))}
            className={inputCls}
          >
            <option value="">{LA.dlg.chooseMed}</option>
            {w.meds.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelCls}>
            {m ? fill(T.howHere, { unit: m.unit, n: num(here) }) : LA.dlg.how}
          </span>
          <input
            inputMode="numeric"
            value={qty}
            onChange={(e) => (setQty(e.target.value.replace(/\D/g, "")), setError(""))}
            className={`${inputCls} font-semibold`}
          />
        </label>
      </div>
      {takes ? (
        <p className="text-ink-700 m-0 text-[13px]">{fill(T.takes, { list: takes })}</p>
      ) : null}
      {m?.controlled ? <p className="text-ink-700 m-0 text-[13px]">{T.witnessNote}</p> : null}
      {dialog}
    </FormDialog>
  );
}

/** §F12. The server writes the voucher, the dispatch in transit and the issued requisition under one id. */
export function IssueNoReqDialog({
  world,
  open,
  onOpenChange,
}: {
  world: StoreWorld;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast, say } = useStoreAct();
  return (
    <>
      {toast}
      {open ? <IssueForm world={world} onClose={() => onOpenChange(false)} say={say} /> : null}
    </>
  );
}
