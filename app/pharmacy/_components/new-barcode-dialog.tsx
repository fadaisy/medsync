"use client";

import type { CataloguePick } from "./catalogue-picker";
import type { Scan } from "@/lib/pharmacy/stores/scan";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { CATALOGUE as C } from "@/content/pharmacy-catalogue";
import { cn } from "@/lib/utils";
import { linkBarcodeAction } from "../catalogue-actions";
import { CataloguePicker } from "./catalogue-picker";

type Parsed = Extract<Scan, { ok: true }> & { gtin: string };
type PackPick = Extract<CataloguePick, { kind: "pack" }>;

/**
 * A new barcode (4.3, board 3). Shows what the scan read, proposes the delivery order's uncounted lines and then
 * search, and never chooses (D-CAT-07). "Link and fill the line" writes this hospital's link, used here at once,
 * and a proposal the catalogue team checks before any other hospital uses it. The pack photo arrives with Step 7.
 */
export function NewBarcodeDialog({
  open,
  onOpenChange,
  scan,
  candidates = [],
  onLinked,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scan: Parsed;
  /** From the delivery's order: lines not counted yet whose product has a catalogue pack (Step 7). */
  candidates?: readonly PackPick[];
  onLinked: (pick: PackPick) => void;
}) {
  const [chosen, setChosen] = useState<PackPick | null>(null);
  const [picking, setPicking] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const N = C.newBarcode;
  const label = (p: PackPick) =>
    `${p.medicine.displayName} · ${p.pack.packId ? `${p.pack.brand ?? C.loose} · ${p.pack.description}` : C.loose}`;
  const facts: [string, string | null][] = [
    [N.batch, scan.batch],
    [N.expiry, scan.expiry ? (scan.expiryMonthOnly ? scan.expiry.slice(0, 7) : scan.expiry) : null],
    [N.serial, scan.serial],
  ];
  const link = () =>
    start(async () => {
      if (!chosen?.pack.packId) return;
      const r = await linkBarcodeAction({ packId: chosen.pack.packId, gtin: scan.gtin });
      if (!r.ok) return setSaid(r.error);
      if (r.data?.state === "conflict") return setSaid(C.codeConflict);
      onLinked(chosen);
      onOpenChange(false);
    });

  return (
    <EditorDialog width="medium" open={open} onOpenChange={onOpenChange}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <DialogTitle className="text-heading-s">{C.newBarcodeTitle}</DialogTitle>
        <p className="text-body-s text-muted-foreground">{C.newBarcodeHelp}</p>
        <div className="border-border rounded-md border px-3 py-2">
          <p className="text-body-s text-foreground font-mono tabular-nums">{N.gtin(scan.gtin)}</p>
          <dl className="text-caption text-muted-foreground mt-1 flex flex-wrap gap-x-4">
            {facts
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <dt>{k}</dt>
                  <dd className="text-foreground font-mono">{v}</dd>
                </div>
              ))}
          </dl>
          {scan.skipped.length > 0 && (
            <p className="text-caption text-muted-foreground mt-1">
              {C.unknownElement(scan.skipped.join(", "))}
            </p>
          )}
        </div>
        <div role="radiogroup" aria-label={N.chosen} className="flex flex-col gap-1.5">
          {candidates.length > 0 && (
            <p className="text-caption text-muted-foreground">{N.fromOrder}</p>
          )}
          {[...candidates, ...(chosen && !candidates.includes(chosen) ? [chosen] : [])].map((p) => (
            <button
              key={`${p.medicine.id}${p.pack.packId}`}
              type="button"
              role="radio"
              aria-checked={chosen === p}
              onClick={() => setChosen(p)}
              className={cn(
                "text-body-s focus-visible:shadow-focus rounded-md border px-3 py-2 text-left outline-none",
                chosen === p ? "border-primary bg-muted" : "border-input hover:bg-muted",
              )}
            >
              {label(p)}
            </button>
          ))}
          <Button variant="secondary" className="self-start" onClick={() => setPicking(true)}>
            {N.find}
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">{C.noGuessing}</p>
        <span role="status" aria-live="polite" className="text-body-s">
          {said ? <StatusWord tone="caution">{said}</StatusWord> : null}
        </span>
      </div>
      <div className="border-border flex justify-end gap-2 border-t px-5 py-3">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {C.cancel}
        </Button>
        <Button disabled={!chosen?.pack.packId || pending} onClick={link}>
          {N.link}
        </Button>
      </div>
      <CataloguePicker
        open={picking}
        onOpenChange={setPicking}
        onPick={(p) => {
          if (p.kind === "pack" && p.pack.packId) setChosen(p);
        }}
      />
    </EditorDialog>
  );
}
