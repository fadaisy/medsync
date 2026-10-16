"use client";

import type { LogFact } from "@/lib/pharmacy/print/dispensing-log";
import { useId, useState } from "react";

import { FormDialog, SELECT_CLASS } from "@/components/medsync/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOWNTIME_ENTRY, LOG_PAGE as L } from "@/content/pharmacy-golive";
import * as actions from "../../../downtime/entry-actions";

/**
 * The log's controls (5.12, DL-1): Print (logged, then the browser's print) and, for the pharmacy in
 * charge, Confirm the columns against the hospital's HMIS 016 book in a centred dialog.
 */
export function PrintLog({ day }: { day: string }) {
  return (
    <Button
      type="button"
      className="min-h-11"
      onClick={async () => {
        // The print is logged; a failure to log never stops the print (Law 11).
        await actions.printDispensingLog({ clientKey: crypto.randomUUID(), day }).catch(() => null);
        window.print();
      }}
    >
      {L.print}
    </Button>
  );
}

type Column = { heading: string; fact: LogFact | null };

export function ConfirmColumnsDialog({ initial }: { initial: readonly Column[] }) {
  const id = useId();
  const [columns, setColumns] = useState<Column[]>([...initial]);
  const set = (i: number, patch: Partial<Column>) =>
    setColumns(columns.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <FormDialog
      label={L.confirm}
      title={L.confirmTitle}
      description={L.confirmHint}
      submit={L.save}
      cancel={L.cancel}
      width="wide"
      onSave={async () => {
        const r = await actions.confirmLogColumns({ clientKey: crypto.randomUUID(), columns });
        return r.ok ? { ok: true } : { ok: false, error: r.error ?? DOWNTIME_ENTRY.failed };
      }}
    >
      <ol className="flex flex-col gap-2">
        {columns.map((c, i) => (
          <li key={i} className="grid items-end gap-2 sm:grid-cols-[2rem_1fr_1fr_auto]">
            <span className="text-body-s font-mono tabular-nums">{i + 1}</span>
            <label className="flex flex-col gap-1" htmlFor={`${id}-h${i}`}>
              <span className="text-caption font-medium">{L.columnHeading}</span>
              <Input
                id={`${id}-h${i}`}
                value={c.heading}
                maxLength={60}
                onChange={(e) => set(i, { heading: e.target.value })}
                className="min-h-11"
              />
            </label>
            <label className="flex flex-col gap-1" htmlFor={`${id}-f${i}`}>
              <span className="text-caption font-medium">{L.fact}</span>
              <select
                id={`${id}-f${i}`}
                className={SELECT_CLASS}
                value={c.fact ?? ""}
                onChange={(e) => set(i, { fact: (e.target.value || null) as LogFact | null })}
              >
                <option value="">{L.blank}</option>
                {Object.entries(L.facts).map(([k, w]) => (
                  <option key={k} value={k}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={columns.length <= 1}
              onClick={() => setColumns(columns.filter((_, j) => j !== i))}
            >
              {L.remove}
            </Button>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 self-start"
        disabled={columns.length >= 20}
        onClick={() => setColumns([...columns, { heading: "", fact: null }])}
      >
        {L.addColumn}
      </Button>
    </FormDialog>
  );
}
