"use client";

import type { StoreBatch, StoreWorld } from "@/lib/pharmacy/derive/store/types";
import { useState } from "react";

import { saveCountAction } from "@/app/pharmacy/stock/store/store-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Chip } from "@/components/pharmacy/charts/chip";
import { pillBtn } from "@/components/pharmacy/medicines/shared";
import { inputCls } from "@/components/pharmacy/roster/swaps";
import { newKey, useWitness } from "@/components/pharmacy/store/shared";
import { LabButton } from "@/components/tide/work/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { STORE_SAYS } from "@/content/pharmacy-store";
import { LA } from "@/content/pharmacy-store-lookafter";
import { fill } from "@/content/pharmacy-workspace-v2";
import { shelfBatches, shelfDue } from "@/lib/pharmacy/derive/store/counts";
import { fmtExp, num, ugx } from "@/lib/pharmacy/derive/store/format";
import { medOf } from "@/lib/pharmacy/derive/store/stock";
import { cn } from "@/lib/utils";
import { useSave } from "./shared";

const T = LA.dlg.count;

interface Saved {
  batches: StoreBatch[];
  value: number;
  needsSign: boolean;
  lines: { batchId: string; expected: number; counted: number; cost: number }[];
}

/**
 * Blind: nothing here reads a batch's quantity. What was expected comes back from the server with the save, and only
 * then shows. The batches are held at the save, since a line counted to nothing leaves the shelf on the re-read.
 */
function CountForm({
  world: w,
  shelfId,
  onClose,
}: {
  world: StoreWorld;
  shelfId: string | null;
  onClose: () => void;
}) {
  const [pick, setPick] = useState(shelfId);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Saved | null>(null);
  const [clientKey] = useState(newKey);
  const { pending, error, setError, go } = useSave();
  const { ask, dialog } = useWitness(w.storeId, setError);
  const shelf = w.shelves.find((s) => s.id === pick) ?? null;
  const batches = saved?.batches ?? (shelf ? shelfBatches(w, shelf.code) : []);

  const save = async () => {
    if (!shelf) return;
    if (batches.some((b) => !vals[b.id])) return setError(STORE_SAYS.countAll);
    let witness: string | null = null;
    if (shelf.controlled || batches.some((b) => medOf(w, b.medId).controlled)) {
      witness = await ask(fill(T.witness, { code: shelf.code }));
      if (!witness) return;
    }
    go(
      () =>
        saveCountAction({
          clientKey,
          shelfId: shelf.id,
          lines: batches.map((b) => ({ batchId: b.id, counted: Number(vals[b.id]) })),
          witnessAttestationId: witness,
        }),
      (d) =>
        setSaved(d ? { batches, value: d.value, needsSign: d.needsSign, lines: d.lines } : null),
    );
  };

  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width="medium">
      <div className="flex flex-col gap-1 px-6 pt-5">
        <DialogTitle>
          {shelf ? fill(T.title, { code: shelf.code, name: shelf.name }) : T.pick}
        </DialogTitle>
        <DialogDescription>{shelf ? (saved ? T.leadSaved : T.lead) : T.pickLead}</DialogDescription>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-6 py-4">
        {!shelf ? (
          <div className="flex flex-wrap gap-2">
            {w.shelves.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPick(s.id)}
                className={cn(pillBtn(false), "h-auto min-h-10 whitespace-normal")}
              >
                {fill(shelfDue(s, w.rules) ? T.pickDue : T.pickItem, {
                  code: s.code,
                  name: s.name,
                })}
              </button>
            ))}
            {w.shelves.length ? null : (
              <p className="text-ink-600 m-0 text-[13px]">{T.noShelves}</p>
            )}
          </div>
        ) : batches.length ? (
          batches.map((b) => {
            const m = medOf(w, b.medId);
            const res = saved?.lines.find((l) => l.batchId === b.id);
            const diff = res ? res.counted - res.expected : 0;
            return (
              <div
                key={b.id}
                className="border-ink-200 grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-x-3 gap-y-1.5 border-t py-2"
              >
                <span className="flex min-w-0 flex-col gap-px">
                  <b className="text-[14px] font-semibold">{m.name}</b>
                  <span className="text-ink-600 text-[12px]">
                    {[b.bin, b.no, fill(T.batch, { exp: fmtExp(b.exp) })]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <input
                  aria-label={fill(T.aria, { name: m.name, no: b.no })}
                  inputMode="numeric"
                  autoComplete="off"
                  value={vals[b.id] ?? ""}
                  disabled={!!saved}
                  placeholder={`${m.unit}s`}
                  onChange={(e) => {
                    setVals((v) => ({ ...v, [b.id]: e.target.value.replace(/\D/g, "") }));
                    setError("");
                  }}
                  className={cn(inputCls, "text-right font-semibold")}
                />
                {res ? (
                  <span className="col-span-2">
                    <Chip tone={diff ? "bad" : "ok"}>
                      {diff
                        ? fill(T.line, {
                            diff: `${diff > 0 ? "+" : ""}${num(diff)}`,
                            value: ugx(Math.abs(diff) * res.cost),
                          })
                        : T.matches}
                    </Chip>
                  </span>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="text-ink-600 m-0 text-[13px]">{T.empty}</p>
        )}
        {saved ? (
          <Chip
            tone={saved.value === 0 ? "ok" : saved.needsSign ? "bad" : "warn"}
            className="mt-1 h-auto rounded-xl px-3 py-2 text-[13px] whitespace-normal"
          >
            {saved.value === 0
              ? T.sumMatch
              : fill(saved.needsSign ? T.sumSign : T.sumPost, { value: ugx(saved.value) })}
          </Chip>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="bg-tide-sunken text-body-s rounded-tide-tile mt-1 px-3.5 py-2.5 font-semibold"
          >
            {error}
          </p>
        ) : null}
        {dialog}
      </div>
      <div className="border-border flex justify-end gap-2 border-t px-6 py-3.5">
        <LabButton onClick={onClose}>{saved ? LA.dlg.done : LA.dlg.cancel}</LabButton>
        {shelf && !saved ? (
          <LabButton variant="primary" busy={pending} onClick={save}>
            {T.save}
          </LabButton>
        ) : null}
      </div>
    </EditorDialog>
  );
}

/** §F11. Open when `shelfId` is set or `open`; each opening starts clean. */
export function CountShelfDialog({
  world,
  open,
  onOpenChange,
  shelfId = null,
}: {
  world: StoreWorld;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shelfId?: string | null;
}) {
  return open || shelfId ? (
    <CountForm world={world} shelfId={shelfId} onClose={() => onOpenChange(false)} />
  ) : null;
}
