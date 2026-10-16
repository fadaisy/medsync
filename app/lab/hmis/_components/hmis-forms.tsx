"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LAB3_HMIS } from "@/content/lab-phase-3";
import {
  checkHmis105Action,
  exportHmis105Action,
  generateHmis105Action,
  prepareRevisionAction,
  saveManualCellsAction,
} from "@/lib/lab/hmis-actions";
import { Pop } from "../../_components/pop";
import { Said, useAct } from "../../setup/criticals/_components/setup-forms";

const H = LAB3_HMIS;
const RUN = {
  generate: (month: string) => generateHmis105Action({ month }),
  check: (month: string, revision: number) => checkHmis105Action({ month, revision }),
  revision: (month: string) => prepareRevisionAction({ month }),
};

/** One lifecycle step, its words when done, and the refusal in amber (the setup forms' pattern). */
export function ActButton({
  label,
  okText,
  kind,
  month,
  revision = 1,
  variant = "secondary",
}: {
  label: string;
  okText: string;
  kind: keyof typeof RUN;
  month: string;
  revision?: number;
  variant?: "primary" | "secondary";
}) {
  const { pending, message, act } = useAct();
  const run = () => RUN[kind](month, revision);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() => act(run, okText)}
        className="min-h-11 w-fit sm:min-h-8"
      >
        {label}
      </Button>
      <Said message={message} />
    </div>
  );
}

/** HM-12: the CSV as a file; a signed report is recorded as exported by the same action. */
export function CsvButton({
  month,
  revision,
  from,
}: {
  month: string;
  revision: number;
  from: "lab" | "desk";
}) {
  const { pending, message, act } = useAct();
  const download = () =>
    act(async () => {
      const r = await exportHmis105Action({ month, revision, from });
      if (!r.ok) return r;
      const url = URL.createObjectURL(new Blob([r.csv ?? ""], { type: "text/csv" }));
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `hmis105-lab-${month}-r${revision}.csv`,
      });
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    }, H.csv);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={download}
        className="min-h-11 w-fit sm:min-h-8"
      >
        {H.csv}
      </Button>
      <Said message={message} />
    </div>
  );
}

/** HM-5, HM-6, HM-8: the hand-counted cells of the draft, one number each (empty clears it). */
export function ManualCellsDialog({
  month,
  cells,
}: {
  month: string;
  cells: { key: string; label: string; value: number | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() =>
    Object.fromEntries(cells.map((c) => [c.key, c.value === null ? "" : String(c.value)])),
  );
  const { pending, message, act } = useAct();
  const save = () =>
    act(async () => {
      const changed = Object.fromEntries(
        cells
          .filter((c) => (c.value === null ? "" : String(c.value)) !== values[c.key])
          .map((c) => [c.key, values[c.key]!.trim() === "" ? null : Number(values[c.key])]),
      );
      const r = await saveManualCellsAction({ month, cells: changed });
      if (r.ok) setOpen(false);
      return r;
    }, H.handSaved);
  return (
    <>
      <Pop
        label={H.enterHand}
        title={H.enterHand}
        lede={H.hand.join(" ")}
        width="wide"
        open={open}
        setOpen={setOpen}
        action={
          <Button type="button" onClick={save} disabled={pending}>
            Save
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cells.map((c) => (
            <label key={c.key} className="text-body-s flex flex-col gap-1">
              <span className="text-muted-foreground">{c.label}</span>
              <Input
                inputMode="numeric"
                value={values[c.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [c.key]: e.target.value.replace(/[^0-9]/g, "") }))
                }
                className="min-h-11 w-32 font-mono tabular-nums sm:min-h-9"
              />
            </label>
          ))}
        </div>
        <Said message={message} />
      </Pop>
    </>
  );
}
