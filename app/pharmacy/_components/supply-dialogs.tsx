"use client";

import type { LineStock } from "@/lib/pharmacy/review/read";
import type { BatchRow } from "@/lib/pharmacy/stock/fefo";
import { useId, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { REVIEW } from "@/content/pharmacy-review";
import { expiryText, STOCK } from "@/content/pharmacy-stock";
import {
  BATCH_CHOICE_REASONS,
  CORRECTION_REASONS,
  REVERSAL_REASONS,
  SUPPLY,
} from "@/content/pharmacy-supply";
import { batchChoiceNeedsReason, proposeBatches } from "@/lib/pharmacy/stock/fefo";
import * as reviewActions from "../review-actions";
import * as actions from "../supply-actions";
import { Note, ReviewDialog, SELECT, Select, TARGET } from "./review-dialogs";

/**
 * The supply pop-ups (5.3.1, 5.7, 5.7.1; wireframes §3.4, §7.2 to §7.4): each a centred EditorDialog
 * (ADR 0161). The product-and-batch dialog changes only the decision being drafted: the server checks it
 * again when the decision is saved and again at the hand-over (SU-2, SU-3).
 */

const text = (d: FormData, k: string) => {
  const v = d.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

export interface BatchChoice {
  productId: string;
  batches: BatchRow[];
  reason?: string;
}

/** 5.3.1, SU-3: the product, then the batches, first to expire proposed; any other choice needs a reason. */
export function ChangeDialog({
  medicine,
  quantity,
  stock,
  value,
  today,
  onUse,
}: {
  medicine: string;
  quantity: number | undefined;
  stock: LineStock;
  value: BatchChoice | null;
  today: string;
  onUse: (v: BatchChoice) => void;
}) {
  const C = SUPPLY.change;
  const ids = { reason: useId() };
  const [open, setOpen] = useState(false);
  const usable = stock.batches.filter((b) => !b.expired);
  const held = (productId: string) =>
    usable.filter((b) => b.productId === productId).reduce((s, b) => s + b.balance, 0);
  const withStock = stock.products.filter((p) => held(p.id) > 0);
  const initialProduct =
    value?.productId ?? (withStock.length === 1 ? withStock[0]!.id : stock.products[0]?.id) ?? "";
  const [productId, setProductId] = useState(initialProduct);
  const proposalFor = (pid: string) =>
    quantity
      ? proposeBatches({
          batches: usable
            .filter((b) => b.productId === pid)
            .map((b) => ({ ...b, pointId: "", medicineId: "" })),
          balances: new Map(usable.map((b) => [b.id, b.balance])),
          quantity,
          localDate: today,
        })
      : null;
  const fromRows = (rows: readonly BatchRow[]) =>
    Object.fromEntries(rows.map((r) => [r.batchId, String(r.quantity)]));
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  // Each opening starts from the decision being drafted, or the first-to-expire proposal for its quantity.
  const change = (next: boolean) => {
    if (next) {
      setProductId(initialProduct);
      const p = proposalFor(initialProduct);
      setQty(value?.batches ? fromRows(value.batches) : p?.ok ? fromRows(p.rows) : {});
      setReason(value?.reason ?? "");
    }
    setOpen(next);
  };
  const pick = (pid: string) => {
    setProductId(pid);
    const p = proposalFor(pid);
    setQty(p?.ok ? fromRows(p.rows) : {});
  };
  const proposal = proposalFor(productId);
  const rows: BatchRow[] = usable
    .filter((b) => b.productId === productId)
    .flatMap((b) => {
      const n = Number(qty[b.id] ?? "");
      return Number.isInteger(n) && n > 0 ? [{ batchId: b.id, quantity: n }] : [];
    });
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  const over = rows.some(
    (r) => r.quantity > (usable.find((b) => b.id === r.batchId)?.balance ?? 0),
  );
  const needsReason = !proposal?.ok || batchChoiceNeedsReason(rows, proposal.rows);
  const ready = !!quantity && total === quantity && !over && (!needsReason || !!reason);
  const expired = stock.batches.filter((b) => b.expired && b.productId === productId);

  return (
    <EditorDialog
      width="wide"
      open={open}
      onOpenChange={change}
      trigger={
        <DialogTrigger render={<Button variant="ghost" className={TARGET} />}>
          {C.open}
        </DialogTrigger>
      }
    >
      <SheetHeader>
        <SheetTitle>{C.title(medicine)}</SheetTitle>
        {!quantity ? <SheetDescription>{C.typeFirst}</SheetDescription> : null}
      </SheetHeader>
      <SheetBody className="grid gap-6 md:grid-cols-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label mb-1">{C.product}</legend>
          {stock.products.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="product"
                checked={productId === p.id}
                onChange={() => pick(p.id)}
              />
              <span className="text-body-s">
                {[p.name, p.strength].filter(Boolean).join(" · ")} ·{" "}
                <span className="font-mono tabular-nums">{C.onShelf(held(p.id), p.issueUnit)}</span>
              </span>
            </label>
          ))}
          <p className="text-body-s text-muted-foreground">
            {C.strength}: {C.strengthNot}
          </p>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-label mb-1">{C.batch}</legend>
          {usable
            .filter((b) => b.productId === productId)
            .map((b) => (
              <div key={b.id} className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`q-${b.id}`} className="text-caption">
                    {C.batchQty(`${b.batchNumber} · exp ${expiryText(b)}`)} ({b.balance})
                  </Label>
                  <Input
                    id={`q-${b.id}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={qty[b.id] ?? ""}
                    onChange={(e) => setQty((q) => ({ ...q, [b.id]: e.target.value }))}
                    className="min-h-11 w-32 font-mono tabular-nums"
                  />
                </div>
              </div>
            ))}
          {needsReason && rows.length ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={ids.reason}>{C.reason}</Label>
              <select
                id={ids.reason}
                className={SELECT}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              >
                <option value="" disabled>
                  {REVIEW.query.choose}
                </option>
                {Object.entries(BATCH_CHOICE_REASONS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {expired.map((b) => (
            <p key={b.id} className="text-body-s">
              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                {b.batchNumber}: {STOCK.expiredRemove(expiryText(b))}
              </StatusWord>
            </p>
          ))}
          {quantity && total !== quantity && rows.length ? (
            <p role="status" className="text-body-s">
              <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                {C.mustAdd(quantity)}
              </StatusWord>
            </p>
          ) : null}
        </fieldset>
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="secondary" className={TARGET} onClick={() => setOpen(false)}>
          {C.cancel}
        </Button>
        <Button
          type="button"
          className={TARGET}
          disabled={!ready}
          onClick={() => {
            onUse({ productId, batches: rows, reason: needsReason ? reason : undefined });
            setOpen(false);
          }}
        >
          {C.use}
        </Button>
      </SheetFooter>
    </EditorDialog>
  );
}

/** 5.7.1, wireframe §7.3: reverse one line of a hand-over, the same day. */
export function ReverseDialog({
  handoverId,
  lineId,
  lede,
  quantity,
  unit,
  batches,
}: {
  handoverId: string;
  lineId: string;
  lede: string;
  quantity: number;
  unit: string;
  batches: string;
}) {
  const R = SUPPLY.reverse;
  const [fit, setFit] = useState(true);
  return (
    <ReviewDialog
      label={SUPPLY.supplied.reverse}
      title={R.title}
      description={lede}
      submit={R.submit}
      onSave={(clientKey, d) =>
        actions.reverseSupply({
          clientKey,
          handoverId,
          lineId,
          reasonCode: text(d, "reasonCode"),
          packFit: fit,
          note: text(d, "note"),
        })
      }
    >
      <Select label={R.reason} name="reasonCode" options={REVERSAL_REASONS} />
      <fieldset className="flex flex-col gap-1">
        <legend className="text-label mb-1">{R.fit}</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" checked={fit} onChange={() => setFit(true)} />
          {R.fitYes(quantity, unit, batches)}
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="radio" checked={!fit} onChange={() => setFit(false)} />
          {R.fitNo(quantity, unit, batches)}
        </label>
      </fieldset>
      <Note label={SUPPLY.correct.note} />
      <p className="text-body-s text-muted-foreground">{R.after}</p>
    </ReviewDialog>
  );
}

/** 5.7.1, wireframe §7.4: "Recorded in error", any day, by the pharmacy in charge. No stock moves. */
export function CorrectDialog({
  handoverId,
  lineId,
  lede,
}: {
  handoverId: string;
  lineId: string;
  lede: string;
}) {
  const C = SUPPLY.correct;
  return (
    <ReviewDialog
      label={SUPPLY.supplied.correct}
      title={C.title}
      description={lede}
      submit={C.submit}
      onSave={(clientKey, d) =>
        actions.correctSupplyRecord({
          clientKey,
          handoverId,
          lineId,
          reasonCode: text(d, "reasonCode"),
          note: text(d, "note"),
        })
      }
    >
      <Select label={C.reason} name="reasonCode" options={CORRECTION_REASONS} />
      <Note label={C.note} />
      <p className="text-body-s text-muted-foreground">{C.noStock}</p>
      <p className="text-body-s text-muted-foreground">{C.after}</p>
    </ReviewDialog>
  );
}

/** 5.7: the look-back tab's "Looked at", with a note (`recordLookBack`, pharmacy.review). */
export function LookBackDialog({ supplyId, lede }: { supplyId: string; lede: string }) {
  const L = SUPPLY.look;
  return (
    <ReviewDialog
      label={L.looked}
      title={L.title}
      description={lede}
      submit={L.submit}
      onSave={(clientKey, d) =>
        reviewActions.recordLookBack({ clientKey, supplyId, note: text(d, "note") })
      }
    >
      <Note label={L.note} />
    </ReviewDialog>
  );
}
