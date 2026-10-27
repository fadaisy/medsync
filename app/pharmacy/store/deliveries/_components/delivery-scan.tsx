"use client";

import type { CataloguePick } from "@/app/pharmacy/_components/catalogue-picker";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ScanLineIcon } from "lucide-react";

import { CataloguePicker } from "@/app/pharmacy/_components/catalogue-picker";
import { NewBarcodeDialog } from "@/app/pharmacy/_components/new-barcode-dialog";
import { orderCandidatesAction } from "@/app/pharmacy/catalogue-actions";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOGUE as C } from "@/content/pharmacy-catalogue";
import { parseGs1 } from "@/lib/pharmacy/stores/scan";
import { pickIntoDelivery, scanIntoDelivery } from "../actions";

type Parsed = Extract<ReturnType<typeof parseGs1>, { ok: true }> & { gtin: string };
type PackPick = Extract<CataloguePick, { kind: "pack" }>;

/**
 * 4.1 The scan field at the top of a delivery (catalogue slice Step 7): always listening for a keyboard-wedge
 * scanner; Ctrl K opens the catalogue picker (the delivery takes it from Find). A known pack fills or adds to its
 * line (D-CAT-09); a new barcode opens 4.3, which never chooses. Nothing moves until the delivery is received.
 */
export function DeliveryScan({ deliveryId, typed }: { deliveryId: string; typed: string | null }) {
  const id = useId();
  const router = useRouter();
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [unknown, setUnknown] = useState<{ scan: Parsed; raw: string } | null>(null);
  const [candidates, setCandidates] = useState<PackPick[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPicker(true);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const after = (r: Awaited<ReturnType<typeof scanIntoDelivery>>, raw?: string) => {
    if (!r.ok) return setSaid({ ok: false, text: r.error });
    const data = r.data!;
    if (data.kind === "unknown" && raw) {
      const s = parseGs1(raw);
      if (s.ok && s.gtin) {
        setUnknown({ scan: { ...s, gtin: s.gtin }, raw });
        orderCandidatesAction({ deliveryId }).then((c) =>
          setCandidates(c.ok ? c.picks.map((p) => ({ kind: "pack" as const, ...p })) : []),
        );
      }
    }
    setSaid({ ok: data.kind === "added" || data.kind === "rescan", text: data.note });
    if (data.kind === "added" || data.kind === "rescan") router.refresh();
  };
  const scan = (raw: string) =>
    start(async () => {
      setValue("");
      after(await scanIntoDelivery({ deliveryId, raw }), raw);
      field.current?.focus();
    });

  return (
    <div className="bg-card border-border flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
          <Label htmlFor={id} className="inline-flex items-center gap-1.5">
            <ScanLineIcon aria-hidden className="size-4" />
            {C.scanField}
          </Label>
          <Input
            id={id}
            ref={field}
            autoFocus
            autoComplete="off"
            value={value}
            disabled={pending}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                e.preventDefault();
                scan(value);
              }
            }}
            className="min-h-11 font-mono"
          />
        </div>
        <Button variant="secondary" className="min-h-11" onClick={() => setPicker(true)}>
          {C.receive.pickTitle}
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">{C.scanHelp}</p>
      <p role="status" aria-live="polite" className="text-body-s">
        {said ? said.ok ? said.text : <StatusWord tone="caution">{said.text}</StatusWord> : null}
        {typed ? <span className="text-muted-foreground"> {typed}</span> : null}
      </p>
      <CataloguePicker
        open={picker}
        onOpenChange={setPicker}
        onPick={(p) => {
          if (p.kind === "pack" && !p.pack.packId)
            return setSaid({ ok: false, text: C.receive.noProduct });
          start(async () =>
            after(
              await pickIntoDelivery(
                p.kind === "product"
                  ? { deliveryId, productId: p.productId }
                  : { deliveryId, packId: p.pack.packId },
              ),
            ),
          );
        }}
      />
      {unknown ? (
        <NewBarcodeDialog
          open={!!unknown}
          onOpenChange={(o) => !o && setUnknown(null)}
          scan={unknown.scan}
          candidates={candidates}
          onLinked={() => scan(unknown.raw)}
        />
      ) : null}
    </div>
  );
}
