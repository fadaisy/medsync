"use client";

import type { useCount } from "../use-count";
import type { TypeFilter } from "@/content/pharmacy-supplies";
import type { ReceiveDelivery, ReceiveLine } from "@/lib/pharmacy/derive/receive";
import { useState } from "react";

import { addLocalMedicineAction } from "@/app/pharmacy/stock/store/receive-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { TypeSwitch } from "@/components/pharmacy/medicines/type-switch";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { RC } from "@/content/pharmacy-receive";
import { RCT } from "@/content/pharmacy-receive-count";
import { RECEIVE_SUPPLY as RS, TYPE_WORD } from "@/content/pharmacy-supplies";
import { matchesType } from "@/lib/pharmacy/derive/medicines";
import { blankLine, plural } from "@/lib/pharmacy/derive/receive";
import { cn } from "@/lib/utils";
import { useReceive } from "../provider";
import { Field, inputCls, selectCls } from "../shared";

type Count = ReturnType<typeof useCount>;
const K = RCT.picker;

/**
 * Pick from the catalogue (RECEIVE §D1): search, tick several, add them as lines. "Not stocked yet? Add it" makes a local
 * medicine (generic name, strength, unit) that Set-up › Medicines reviews. It joins the list once the page re-reads.
 */
export function Picker({
  initialQ,
  d,
  c,
  onClose,
  onAdded,
}: {
  initialQ: string;
  d: ReceiveDelivery;
  c: Count;
  onClose: () => void;
  /** The line to open. */
  onAdded: (firstLineId: string | null) => void;
}) {
  const { world, online, run } = useReceive();
  const [q, setQ] = useState(initialQ);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [local, setLocal] = useState(false);
  const [lf, setLf] = useState({ generic: "", strength: "", unit: K.units[0] as string });
  const [err, setErr] = useState("");

  const needle = q.trim().toLowerCase();
  const [itemType, setItemType] = useState<TypeFilter>("all");
  const items = world.meds.filter(
    (m) => matchesType(m, itemType) && (!needle || m.name.toLowerCase().includes(needle)),
  );
  const chosen = world.meds.filter((m) => ticks[m.id]);

  const add = () => {
    const acc = { lines: [...d.lines] };
    const made: ReceiveLine[] = [];
    let first: string | null = null;
    const order = d.orderId ? world.orders.find((o) => o.id === d.orderId) : undefined;
    for (const m of chosen) {
      const pending = d.lines.find((l) => l.medId === m.id && !(Number(l.packs) > 0));
      if (pending) {
        first ??= pending.id;
        continue;
      }
      const ol = order?.lines.find((x) => x.medId === m.id);
      const line = blankLine(c.newLineId(), acc, m, "catalogue", { orderLineId: ol?.id ?? null });
      acc.lines.push(line);
      made.push(line);
      first ??= line.id;
    }
    if (made.length) c.addLines(made);
    onAdded(first);
    onClose();
  };

  const addLocal = () => {
    const generic = lf.generic.trim();
    const strength = lf.strength.trim();
    if (!generic || !strength) return setErr(RC.says.localBlank);
    if (!online || !navigator.onLine) return setErr(K.localOffline);
    const id = c.newLineId();
    run(
      () => addLocalMedicineAction({ id, generic, strength, unit: lf.unit }),
      () => {
        setTicks((t) => ({ ...t, [id]: true }));
        setQ(generic);
        setLocal(false);
        setErr("");
      },
    );
  };

  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width="medium">
      <div className="flex flex-col gap-1 px-6 pt-5">
        <DialogTitle>{K.title}</DialogTitle>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
        <TypeSwitch value={itemType} onChange={setItemType} className="self-start" />
        <Field label={RS.picker.find}>
          {(a) => (
            <input
              {...a}
              autoFocus
              className={inputCls()}
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}
        </Field>
        <ul className="m-0 flex max-h-72 list-none flex-col gap-1.5 overflow-y-auto p-0">
          {items.map((m) => {
            const on = !!ticks[m.id];
            return (
              <li key={m.id}>
                <label
                  className={cn(
                    "has-[:focus-visible]:ring-primary/30 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 has-[:focus-visible]:ring-2",
                    on
                      ? "border-primary bg-tide-lagoon-tint"
                      : "border-ink-300 bg-card hover:bg-ink-50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="accent-primary mt-0.5 size-5 shrink-0"
                    checked={on}
                    onChange={() => setTicks((t) => ({ ...t, [m.id]: !on }))}
                  />
                  <span className="flex min-w-0 flex-col">
                    <b className="text-foreground text-[14px] leading-5 font-semibold">{m.name}</b>
                    <span className="text-ink-600 text-[12.5px] leading-[18px]">
                      {[
                        m.itemType === "medicine" ? null : TYPE_WORD[m.itemType],
                        m.sterile ? RS.tag.sterile : null,
                        m.kit ? RS.picker.kitSub : null,
                        K.pack(m.per),
                        K.here(plural(m.hand, m.unit)),
                        m.controlled ? K.controlled : null,
                        m.cold ? `${world.rules.tempLow}–${world.rules.tempHigh} °C` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {items.length === 0 ? <p className="text-ink-600 m-0 text-[13px]">{RS.picker.none}</p> : null}
        {!local ? (
          <div>
            <button
              type="button"
              className="text-primary focus-visible:ring-primary/30 min-h-11 rounded-full px-2 text-[13px] font-semibold outline-none hover:underline focus-visible:ring-2 sm:min-h-9"
              onClick={() => {
                setLocal(true);
                setLf((f) => ({ ...f, generic: q }));
              }}
            >
              {K.notStocked}
            </button>
          </div>
        ) : (
          <div className="border-ink-200 flex flex-col gap-3 border-t pt-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={K.generic} error={err && !lf.generic.trim() ? err : null}>
                {(a) => (
                  <input
                    {...a}
                    className={inputCls(!!a["aria-invalid"])}
                    value={lf.generic}
                    onChange={(e) => {
                      setLf({ ...lf, generic: e.target.value });
                      setErr("");
                    }}
                  />
                )}
              </Field>
              <Field
                label={K.strength}
                error={err && lf.generic.trim() && !lf.strength.trim() ? err : null}
              >
                {(a) => (
                  <input
                    {...a}
                    className={inputCls(!!a["aria-invalid"])}
                    value={lf.strength}
                    onChange={(e) => {
                      setLf({ ...lf, strength: e.target.value });
                      setErr("");
                    }}
                  />
                )}
              </Field>
              <Field label={K.per}>
                {(a) => (
                  <select
                    {...a}
                    className={selectCls()}
                    value={lf.unit}
                    onChange={(e) => setLf({ ...lf, unit: e.target.value })}
                  >
                    {K.units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            {err && lf.generic.trim() && lf.strength.trim() ? (
              <p
                role="alert"
                className="text-status-critical-fg-aa m-0 text-[12.5px] leading-[18px]"
              >
                {err}
              </p>
            ) : null}
            <p className="text-ink-600 m-0 text-[12.5px] leading-[18px]">{K.note}</p>
            <div>
              <LabButton className="h-11 sm:h-9" onClick={addLocal}>
                {K.addLocal}
              </LabButton>
            </div>
          </div>
        )}
      </div>
      <div className="border-border flex flex-wrap items-center gap-2 border-t px-6 py-3">
        <span className="text-ink-600 text-[12.5px]">{K.keys}</span>
        <span className="grow" />
        <LabButton variant="quiet" onClick={onClose}>
          {K.cancel}
        </LabButton>
        <LabButton
          variant="primary"
          className="h-11 sm:h-9"
          onClick={add}
          disabledReason={chosen.length === 0 ? K.tickOne : null}
        >
          {K.add(chosen.length)}
        </LabButton>
      </div>
    </EditorDialog>
  );
}
