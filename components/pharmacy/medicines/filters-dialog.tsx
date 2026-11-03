"use client";

import type { ColKey, Cond } from "@/lib/pharmacy/derive/medicines";
import { useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";

import { saveViewAction } from "@/app/pharmacy/medicines-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { MEDICINES } from "@/content/pharmacy-medicines";
import {
  colOpts,
  FCOLS,
  needsVal,
  newCond,
  OPS,
  validConds,
} from "@/lib/pharmacy/derive/medicines";
import { cn } from "@/lib/utils";
import { field, newKey } from "./shared";

const F = MEDICINES.filtersDlg;
const COLS = Object.keys(FCOLS) as ColKey[];

/**
 * The condition builder (§7): Where, then AND / OR rows read top to bottom; empty values are dropped on Apply. The
 * grid remounts it (a new key) each time it opens, so it starts from the conditions in force.
 */
export function FiltersDialog({
  open,
  initial,
  onClose,
  onApply,
  onSaved,
  toast,
}: {
  open: boolean;
  initial: Cond[];
  onClose: () => void;
  onApply: (c: Cond[]) => void;
  onSaved: (c: Cond[]) => void;
  toast: (m: string) => void;
}) {
  const [conds, setConds] = useState<Cond[]>(initial);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<Cond>) =>
    setConds((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setCol = (i: number, col: ColKey) =>
    setConds((cs) => cs.map((c, j) => (j === i ? { ...newCond(col), join: c.join } : c)));

  const save = () => {
    if (!name.trim()) return setErr(F.nameFirst);
    const v = validConds(conds);
    if (!v.length) return setErr(F.oneCond);
    start(async () => {
      const r = await saveViewAction({ clientKey: newKey(), name: name.trim(), conds: v });
      if (!r.ok) return setErr(r.error);
      toast(F.saved(name.trim()));
      onSaved(v);
    });
  };

  return (
    <EditorDialog open={open} onOpenChange={(o) => !o && onClose()} width="wide">
      <div className="flex items-start justify-between gap-3 px-6 pt-5">
        <DialogTitle>{F.title}</DialogTitle>
        <LabButton variant="text" onClick={onClose}>
          {F.close}
        </LabButton>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
        {conds.length === 0 ? <p className="text-body-s text-ink-600">{F.none}</p> : null}
        <ol className="flex flex-col gap-2">
          {conds.map((c, i) => {
            const fc = FCOLS[c.col];
            const opts = colOpts(c.col);
            const n = i + 1;
            return (
              <li
                key={i}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.75rem] items-center gap-2 sm:grid-cols-[4.5rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_2.75rem]"
              >
                {i === 0 ? (
                  <span className="text-body-s text-ink-700 font-semibold">{F.where}</span>
                ) : (
                  <select
                    aria-label={F.joinAria(n)}
                    value={c.join}
                    onChange={(e) => set(i, { join: e.target.value as Cond["join"] })}
                    className={cn(field, "h-11 sm:h-9")}
                  >
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                )}
                <select
                  aria-label={F.colAria(n)}
                  value={c.col}
                  onChange={(e) => setCol(i, e.target.value as ColKey)}
                  className={cn(field, "h-11 sm:h-9")}
                >
                  {COLS.map((k) => (
                    <option key={k} value={k}>
                      {FCOLS[k].label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={F.delAria(n)}
                  onClick={() => setConds((cs) => cs.filter((_, j) => j !== i))}
                  className="text-ink-600 hover:bg-ink-100 grid size-11 place-items-center rounded-full sm:order-last sm:size-9"
                >
                  <Trash2Icon aria-hidden className="size-4" />
                </button>
                <select
                  aria-label={F.opAria(n)}
                  value={c.op}
                  onChange={(e) => set(i, { op: e.target.value })}
                  className={cn(field, "col-start-2 h-11 sm:col-start-auto sm:h-9")}
                >
                  {OPS[fc.type].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                {!needsVal(c) ? (
                  <span className="text-body-s text-ink-600 col-start-2 sm:col-start-auto">
                    {F.noValue}
                  </span>
                ) : opts.length ? (
                  <select
                    aria-label={F.valAria(n)}
                    value={c.val}
                    onChange={(e) => set(i, { val: e.target.value })}
                    className={cn(field, "col-start-2 h-11 sm:col-start-auto sm:h-9")}
                  >
                    {opts.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label={F.valAria(n)}
                    inputMode={fc.type === "num" ? "decimal" : undefined}
                    placeholder={fc.type === "num" ? F.numPh : F.textPh}
                    value={c.val}
                    onChange={(e) => set(i, { val: e.target.value })}
                    className={cn(field, "col-start-2 h-11 sm:col-start-auto sm:h-9")}
                  />
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-1">
          <LabButton
            size="sm"
            className="w-fit"
            onClick={() => setConds((cs) => [...cs, { ...newCond("name"), join: "AND" as const }])}
          >
            + {F.add}
          </LabButton>
          <p className="text-caption text-ink-600">{F.note}</p>
        </div>
        {err ? (
          <p role="alert" className="text-body-s text-status-critical-fg-aa font-semibold">
            {err}
          </p>
        ) : null}
      </div>
      <div className="border-border flex flex-wrap items-center justify-between gap-2 border-t px-6 py-3">
        <span className="flex flex-wrap items-center gap-2">
          <input
            aria-label={F.nameAria}
            placeholder={F.namePh}
            value={name}
            onChange={(e) => (setName(e.target.value), setErr(null))}
            className={cn(field, "h-9 w-64 max-w-full")}
          />
          <LabButton busy={pending} onClick={save}>
            {F.saveView}
          </LabButton>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <LabButton variant="text" onClick={() => setConds([])}>
            {F.clearAll}
          </LabButton>
          <LabButton variant="text" onClick={onClose}>
            {F.cancel}
          </LabButton>
          <LabButton variant="primary" onClick={() => onApply(validConds(conds))}>
            {F.apply}
          </LabButton>
        </span>
      </div>
    </EditorDialog>
  );
}
