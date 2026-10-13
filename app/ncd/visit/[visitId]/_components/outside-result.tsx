"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { addOutsideResultAction } from "@/lib/ncd/lab-feed-actions";

const input = "border-input h-10 rounded-lg border bg-transparent px-3 text-[14px]";

/**
 * NF-7: a result printed by another laboratory, typed as printed. The unit is one the concept can convert
 * by a plain factor (the server passes them); the laboratory is required.
 */
export function OutsideResultButton({
  visitId,
  field,
  label,
  units,
  today,
}: {
  visitId: string;
  field: string;
  label: string;
  units: string[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState(units[0] ?? "");
  const [date, setDate] = useState("");
  const [laboratory, setLaboratory] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready =
    value.trim() !== "" &&
    Number.isFinite(Number(value)) &&
    unit &&
    date &&
    laboratory.trim().length >= 2;

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await addOutsideResultAction({
        visitId,
        field,
        value: Number(value),
        unit,
        date,
        laboratory: laboratory.trim(),
      });
      if (!r.ok) return setMsg(r.error);
      setOpen(false);
      setValue("");
      setDate("");
      setLaboratory("");
      router.refresh();
    });

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Outside result
      </Button>
      <EditorDialog open={open} onOpenChange={setOpen} width="medium">
        <SheetHeader>
          <SheetTitle>Outside result</SheetTitle>
          <SheetDescription>
            {label}, as printed by another laboratory. It is kept as typed, converted to this
            field&apos;s unit, and never counts in lab reports.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-label">Value</span>
              <input
                className={`${input} w-32 font-mono`}
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(",", "."))}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label">Unit as printed</span>
              <select className={input} value={unit} onChange={(e) => setUnit(e.target.value)}>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-label">Date of the test</span>
              <input
                type="date"
                max={today}
                className={`${input} font-mono`}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-label">Laboratory</span>
            <input
              className={input}
              required
              maxLength={120}
              value={laboratory}
              onChange={(e) => setLaboratory(e.target.value)}
            />
          </label>
          {msg ? (
            <p role="status" className="text-body-s text-ink-800">
              {msg}
            </p>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!ready || pending}>
            Save outside result
          </Button>
        </SheetFooter>
      </EditorDialog>
    </>
  );
}
