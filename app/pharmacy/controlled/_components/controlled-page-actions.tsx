"use client";

import type { CountBatch, CountedLine, Witnessed } from "../../_components/controlled-blocks";
import type { DialogProduct } from "../../stock/_components/stock-dialogs";
import type { WitnessOption } from "@/lib/pharmacy/controlled-read";
import type { ComponentProps, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CONTROLLED_UI } from "@/content/pharmacy-controlled";
import { STOCK } from "@/content/pharmacy-stock";
import { READY_COPY } from "@/lib/pharmacy/controlled";
import { REGISTER_COPY } from "@/lib/pharmacy/print/register";
import { ControlledCount, WitnessBlock } from "../../_components/controlled-blocks";
import { Refusal, TARGET, TEXTAREA } from "../../_components/review-dialogs";
import * as actions from "../../controlled-actions";
import { ReceiveDialog } from "../../stock/_components/stock-dialogs";

/**
 * The Controlled drugs page's actions (5.9, wireframe §9.2): Count now (a witnessed shift count),
 * Receive (witnessed), Close a difference with a note (the in-charge), Confirm a back-entered supply
 * against the register (witnessed, DT-8), and Print entries. Each is a centred dialog (ADR 0161) with
 * the witness block first. A new witness is asked for each dialog.
 */

const P = CONTROLLED_UI.page;

function Shell({
  label,
  title,
  description,
  variant = "secondary",
  open,
  setOpen,
  footer,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  variant?: "primary" | "secondary";
  open: boolean;
  setOpen: (v: boolean) => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <EditorDialog
      width="medium"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <DialogTrigger render={<Button variant={variant} className={TARGET} />}>
          {label}
        </DialogTrigger>
      }
    >
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        {description ? <SheetDescription>{description}</SheetDescription> : null}
      </SheetHeader>
      <SheetBody className="flex flex-col gap-4">{children}</SheetBody>
      <SheetFooter>
        <Button type="button" variant="secondary" className={TARGET} onClick={() => setOpen(false)}>
          {STOCK.actions.cancel}
        </Button>
        {footer}
      </SheetFooter>
    </EditorDialog>
  );
}

/** CD-3: a witnessed count of every batch of the medicine, at shift hand-over. */
export function CountNowDialog({
  medicineId,
  medicine,
  unit,
  batches,
  witnesses,
  timeZone,
}: {
  medicineId: string;
  medicine: string;
  unit: string;
  batches: CountBatch[];
  witnesses: WitnessOption[];
  timeZone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [witness, setWitness] = useState<Witnessed | null>(null);
  const [result, setResult] = useState<CountedLine[] | null>(null);
  const change = (v: boolean) => {
    if (v) {
      setWitness(null);
      setResult(null);
    } else if (result) router.refresh();
    setOpen(v);
  };
  return (
    <Shell
      label={P.countNow}
      title={P.countTitle(medicine)}
      variant="primary"
      open={open}
      setOpen={change}
    >
      <WitnessBlock
        witnesses={witnesses}
        action="controlled_count"
        witnessed={witness}
        onWitnessed={setWitness}
        timeZone={timeZone}
      />
      <ControlledCount
        medicineId={medicineId}
        medicine={medicine}
        unit={unit}
        scope="controlled_shift"
        witness={witness}
        batches={batches}
        result={result}
        onCounted={setResult}
      />
    </Shell>
  );
}

/** CD-5: receive a controlled product, with the witness first. */
export function ReceiveControlledDialog({
  from,
  medicine,
  products,
  witnesses,
  timeZone,
}: {
  /** Where stock may come from (Phase 2 Law 3: the store's two-leg paths close Phase 1's one-leg ones). */
  from?: ComponentProps<typeof ReceiveDialog>["from"];
  medicine: string;
  products: DialogProduct[];
  witnesses: WitnessOption[];
  timeZone: string;
}) {
  const [witness, setWitness] = useState<Witnessed | null>(null);
  return (
    <ReceiveDialog
      products={products}
      from={from}
      title={P.receiveTitle(medicine)}
      before={
        <WitnessBlock
          witnesses={witnesses}
          action="controlled_receipt"
          witnessed={witness}
          onWitnessed={setWitness}
          timeZone={timeZone}
        />
      }
      save={async (input) =>
        witness
          ? actions.receiveControlled({ ...input, witnessAttestationId: witness.attestationId })
          : { ok: false, code: "invalid", error: READY_COPY.witness }
      }
    />
  );
}

/** CD-3: the pharmacy in charge closes an open difference with a note. */
export function CloseDifferenceDialog({ differenceId }: { differenceId: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Shell
      label={P.close}
      title={P.closeTitle}
      open={open}
      setOpen={setOpen}
      footer={
        <Button
          type="button"
          className={TARGET}
          disabled={pending || note.trim().length < 3}
          onClick={() =>
            start(async () => {
              const r = await actions.closeControlledDifference({ differenceId, note });
              if (!r.ok) return setError(r.error);
              setOpen(false);
              router.refresh();
            })
          }
        >
          {P.closeSubmit}
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{P.note}</Label>
        <textarea
          id={id}
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
          className={TEXTAREA}
        />
      </div>
      <Refusal error={error} />
    </Shell>
  );
}

/** DT-8: a back-entered controlled supply confirmed against the register, witnessed. */
export function ConfirmBackEntryDialog({
  entryId,
  witnesses,
  timeZone,
}: {
  entryId: string;
  witnesses: WitnessOption[];
  timeZone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [witness, setWitness] = useState<Witnessed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Shell
      label={P.confirm}
      title={P.confirmTitle}
      open={open}
      setOpen={(v) => {
        if (v) setWitness(null);
        setOpen(v);
      }}
      footer={
        <Button
          type="button"
          className={TARGET}
          disabled={pending || !witness}
          onClick={() =>
            start(async () => {
              const r = await actions.confirmBackEnteredControlledSupply({
                clientKey: crypto.randomUUID(),
                entryId,
                witnessAttestationId: witness!.attestationId,
              });
              if (!r.ok) return setError(r.error);
              setOpen(false);
              router.refresh();
            })
          }
        >
          {P.confirmSubmit}
        </Button>
      }
    >
      <WitnessBlock
        witnesses={witnesses}
        action="back_entry_confirmed"
        witnessed={witness}
        onWitnessed={setWitness}
        timeZone={timeZone}
      />
      <Refusal error={error} />
    </Shell>
  );
}

/** LB-4, LB-7: the entries shown print under the register slip's heading; the print is logged. */
export function PrintEntriesButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        className={TARGET}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await actions.printRegisterEntry({
              clientKey: crypto.randomUUID(),
              entryId: null,
            });
            setError(r.ok ? null : r.error);
            window.print();
          })
        }
        aria-describedby="print-entries-heading"
      >
        {P.printEntries}
      </Button>
      <span id="print-entries-heading" className="sr-only">
        {REGISTER_COPY.heading}
      </span>
      <Refusal error={error} />
    </span>
  );
}
