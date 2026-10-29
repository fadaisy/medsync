"use client";

import type { CataloguePick } from "@/app/pharmacy/_components/catalogue-picker";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ScanLineIcon } from "lucide-react";

import { CataloguePicker, pickTitle } from "@/app/pharmacy/_components/catalogue-picker";
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
 * 4.1 The scan field at the top of a delivery (catalogue slice Step 7; board 1's navy scan band): always listening
 * for a keyboard-wedge scanner, which may type anywhere on the page outside a field or dialog; Ctrl K opens the
 * catalogue picker (the delivery takes it from Find). A known pack fills or adds to its line (D-CAT-09); a new
 * barcode opens 4.3, which never chooses. Nothing moves until the delivery is received.
 */
export function DeliveryScan({ deliveryId }: { deliveryId: string }) {
  const id = useId();
  const router = useRouter();
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [said, setSaid] = useState<{ ok: boolean; text: string }[]>([]);
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
    // A wedge types its characters wherever focus is: outside a field or dialog, send them to the scan field.
    // Space is left alone so it still presses a focused button.
    const onType = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === " ") return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      field.current?.focus();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keydown", onType);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keydown", onType);
    };
  }, []);

  const after = (r: Awaited<ReturnType<typeof scanIntoDelivery>>, raw?: string) => {
    if (!r.ok) return setSaid([{ ok: false, text: r.error }]);
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
    setSaid([{ ok: data.kind === "added" || data.kind === "rescan", text: data.note }]);
    if (data.kind === "added" || data.kind === "rescan") router.refresh();
  };
  // Ctrl K: one pick or several (owner item 9), each through the same one-line action, in the order ticked; each
  // result is said on its own line, named when there are several.
  const pickAll = (picks: CataloguePick[]) =>
    start(async () => {
      const out: { ok: boolean; text: string }[] = [];
      for (const p of picks) {
        const named = (text: string) => (picks.length > 1 ? `${pickTitle(p)}: ${text}` : text);
        const r = await pickIntoDelivery(
          p.kind === "product"
            ? { deliveryId, productId: p.productId }
            : p.pack.packId
              ? { deliveryId, packId: p.pack.packId }
              : { deliveryId, medicineId: p.medicine.id },
        );
        out.push(
          r.ok
            ? {
                ok: r.data!.kind === "added" || r.data!.kind === "rescan",
                text: named(r.data!.note),
              }
            : { ok: false, text: named(r.error) },
        );
      }
      setSaid(out);
      if (out.some((o) => o.ok)) router.refresh();
    });
  const scan = (raw: string) =>
    start(async () => {
      setValue("");
      after(await scanIntoDelivery({ deliveryId, raw }), raw);
      field.current?.focus();
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-tide-navy-900 text-tide-on-band rounded-tide-tile grid items-center gap-3 p-3.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]">
        <span
          aria-hidden
          className="bg-tide-navy-700 hidden size-11 place-items-center rounded-xl sm:grid"
        >
          <ScanLineIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={id} className="text-heading-s text-tide-on-band">
            {C.scanField}
          </Label>
          <p id={`${id}-help`} className="text-caption text-tide-on-band-2">
            {C.scanHelp}
          </p>
          <Input
            id={id}
            ref={field}
            autoFocus
            autoComplete="off"
            aria-describedby={`${id}-help`}
            value={value}
            disabled={pending}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) {
                e.preventDefault();
                scan(value);
              }
            }}
            className="bg-card text-foreground min-h-11 font-mono"
          />
        </div>
        <Button
          variant="secondary"
          className="min-h-11 sm:self-end"
          onClick={() => setPicker(true)}
        >
          {C.receive.pickTitle}
        </Button>
      </div>
      <div role="status" aria-live="polite" className="text-body-s flex flex-col gap-0.5">
        {said.map((x, i) => (
          <span key={i}>{x.ok ? x.text : <StatusWord tone="caution">{x.text}</StatusWord>}</span>
        ))}
      </div>
      <CataloguePicker
        open={picker}
        onOpenChange={setPicker}
        onPick={(p) => pickAll([p])}
        onPickMany={pickAll}
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
