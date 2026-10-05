"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { needsConfirmation } from "@/lib/ncdreg/standard/validation";
import { useOutbox } from "../../../_components/outbox-provider";
import { ConfirmValues } from "../../../visit/[visitId]/_components/controls";

/** B7: a late HbA1c on a closed visit, versioned, without reopening the clinical entries. */
export function LateLab({ visitId, personId, visitDate, today }: { visitId: string; personId: string; visitDate: string; today: string }) {
  const router = useRouter();
  const { submit } = useOutbox();
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState("");
  const [date, setDate] = useState(visitDate);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (confirmations: string[] = []) =>
    start(async () => {
      const flags = needsConfirmation({ hba1c_percent: Number(pct) }).filter((f) => !confirmations.includes(f));
      if (flags.length) return setConfirm(flags);
      const r = await submit("visit.add_lab", { visitId, personId, hba1c: { percent: Number(pct), resultDate: date }, confirmations });
      if (!r.ok) return setMsg("message" in r ? r.message : "Not saved");
      setOpen(false);
      router.refresh();
    });
  if (!open)
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Add late HbA1c
      </Button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`hb-${visitId}`}>
        HbA1c %
      </label>
      <input id={`hb-${visitId}`} className="border-input h-8 w-20 rounded-md border bg-transparent px-2 font-mono text-[13px]" inputMode="decimal" placeholder="%" value={pct} onChange={(e) => setPct(e.target.value.replace(",", "."))} />
      <label className="sr-only" htmlFor={`hbd-${visitId}`}>
        Result date
      </label>
      <input id={`hbd-${visitId}`} type="date" min={visitDate} max={today} className="border-input h-8 rounded-md border bg-transparent px-2 font-mono text-[13px]" value={date} onChange={(e) => setDate(e.target.value)} />
      <Button size="sm" disabled={!pct || pending} onClick={() => save()}>
        Add
      </Button>
      {msg ? <span className="text-caption text-ink-800">{msg}</span> : null}
      <ConfirmValues fields={confirm} onCancel={() => setConfirm(null)} onConfirm={(f) => (setConfirm(null), save(f))} />
    </span>
  );
}
