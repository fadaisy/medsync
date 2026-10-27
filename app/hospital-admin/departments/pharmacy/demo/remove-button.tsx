"use client";

import { useState, useTransition } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { removePharmacyDemoAction } from "./actions";

const LINES: [key: string, text: string][] = [
  ["patients", "{n} demo patients, with their visits, prescriptions, hand-overs, queries and clinical records"],
  ["staff", "{n} demo staff accounts, with their affiliations and roles"],
  ["products", "{n} products, with {batches} batches, their counts, movements, orders, deliveries and issues"],
  ["places", "{n} departments, wards and carts the demo made, each kept if anything real uses it"],
  ["records", "{n} records in all"],
];

/** "Remove the pharmacy demo": a centred dialog that says what goes, with counts from a dry run, before anything is deleted. */
export function RemovePharmacyDemo({ footprint }: { footprint: Record<string, number> | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const lines = LINES.filter(([k]) => (footprint?.[k] ?? 0) > 0);
  if (!footprint)
    return <p className="text-muted-foreground">Removing the demo needs migration 0260, which the owner applies.</p>;
  if (!lines.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" className="w-fit" onClick={() => setOpen(true)}>
        Remove the demo data
      </Button>
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {said ? (
          said.ok ? (
            said.text
          ) : (
            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
              {said.text}
            </StatusWord>
          )
        ) : null}
      </p>
      <EditorDialog open={open} onOpenChange={(o) => !pending && setOpen(o)} width="medium">
        <SheetHeader>
          <SheetTitle>Remove the pharmacy demo data</SheetTitle>
          <SheetDescription>
            This deletes everything the demo load put into this demo hospital. It cannot be undone. Real records are
            never touched: if one points at demo data, nothing is removed.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="text-body-s flex flex-col gap-3">
          <h3 className="text-heading-s">What will be removed</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {lines.map(([k, text]) => (
              <li key={k}>
                {text.replace("{n}", String(footprint[k])).replace("{batches}", String(footprint.batches ?? 0))}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Kept: the audit log and the demo accounts it names (they can never sign in), the pharmacy settings the demo
            set, and the list of loads below, marked Removed. The demo can be loaded again afterwards.
          </p>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await removePharmacyDemoAction();
                setOpen(false);
                setSaid(
                  r.ok
                    ? { ok: true, text: "Removed. This hospital no longer holds pharmacy demo data." }
                    : { ok: false, text: r.error ?? "Nothing was removed." },
                );
              })
            }
          >
            {pending ? "Removing the demo… (up to a minute)" : "Remove the demo data"}
          </Button>
        </SheetFooter>
      </EditorDialog>
    </div>
  );
}
