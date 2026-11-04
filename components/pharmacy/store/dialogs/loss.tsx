"use client";

import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { useState } from "react";

import { recordLossAction } from "@/app/pharmacy/stock/store/store-actions";
import { FormDialog, inputCls, labelCls } from "@/components/pharmacy/roster/swaps";
import { newKey, useStoreAct, useWitness } from "@/components/pharmacy/store/shared";
import { STORE_SAYS } from "@/content/pharmacy-store";
import { LA } from "@/content/pharmacy-store-lookafter";
import { fill } from "@/content/pharmacy-workspace-v2";
import { num, units } from "@/lib/pharmacy/derive/store/format";
import { batchesOf, medOf } from "@/lib/pharmacy/derive/store/stock";
import { useSave } from "./shared";

const T = LA.dlg.loss;
const WHY_CODES = ["damaged", "broken", "spoilt", "missing", "other"] as const;

function LossForm({
  world: w,
  onClose,
  say,
}: {
  world: StoreWorld;
  onClose: () => void;
  say: (m: string) => void;
}) {
  const [medId, setMedId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [qty, setQty] = useState("");
  const [why, setWhy] = useState<(typeof WHY_CODES)[number]>("damaged");
  const [note, setNote] = useState("");
  const [clientKey] = useState(newKey);
  const { pending, error, setError, go } = useSave();
  const { ask, dialog } = useWitness(w.storeId, setError);
  const m = medId ? medOf(w, medId) : null;
  const batches = m ? batchesOf(w, m.id) : [];
  const b = batches.find((x) => x.id === batchId);
  const save = async () => {
    if (!m || !b) return setError(STORE_SAYS.chooseMedBatch);
    const n = parseInt(qty, 10) || 0;
    if (!n) return setError(T.errQty);
    if (n > b.qty) return setError(fill(STORE_SAYS.onlyNBatch, { n: num(b.qty) }));
    if (!note.trim()) return setError(STORE_SAYS.sayWhat);
    let witness: string | null = null;
    if (m.controlled) {
      witness = await ask(fill(T.witness, { name: m.name, no: b.no, qty: units(n, m.unit) }));
      if (!witness) return;
    }
    go(
      () =>
        recordLossAction({
          clientKey,
          batchId: b.id,
          quantity: n,
          reason: why,
          note,
          witnessAttestationId: witness,
        }),
      (d) => {
        say(d?.caseId ? T.saved + T.cased : T.saved);
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
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelCls}>{LA.dlg.medicine}</span>
          <select
            value={medId}
            onChange={(e) => {
              setMedId(e.target.value);
              setBatchId("");
              setError("");
            }}
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
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{T.batch}</span>
          <select
            value={batchId}
            onChange={(e) => (setBatchId(e.target.value), setError(""))}
            className={inputCls}
          >
            <option value="">{T.chooseBatch}</option>
            {batches.map((x) => (
              <option key={x.id} value={x.id}>
                {[x.bin, x.no, num(x.qty)].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{m ? fill(T.howUnit, { unit: m.unit }) : LA.dlg.how}</span>
          <input
            inputMode="numeric"
            value={qty}
            onChange={(e) => (setQty(e.target.value.replace(/\D/g, "")), setError(""))}
            className={`${inputCls} font-semibold`}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{T.why}</span>
          <select
            value={why}
            onChange={(e) => setWhy(e.target.value as typeof why)}
            className={inputCls}
          >
            {WHY_CODES.map((r) => (
              <option key={r} value={r}>
                {LA.quar.reason[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{T.note}</span>
          <input
            value={note}
            placeholder={T.noteHolder}
            onChange={(e) => (setNote(e.target.value), setError(""))}
            className={inputCls}
          />
        </label>
      </div>
      {dialog}
    </FormDialog>
  );
}

/** §F13. The server posts the ADJ; theft or a controlled medicine opens a case. */
export function LossDialog({
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
      {open ? <LossForm world={world} onClose={() => onOpenChange(false)} say={say} /> : null}
    </>
  );
}
