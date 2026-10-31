"use client";

import type { WitnessResult } from "@/app/pharmacy/_components/witness";
import type { AuditMovement } from "@/lib/pharmacy/audit/derive";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { WitnessDialog } from "@/app/pharmacy/_components/witness";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { RC } from "@/content/pharmacy-rework-records";
import { cn } from "@/lib/utils";
import { correctMovementAction, otherBatchesAction } from "../actions";
import { fmt } from "./audit-view";

const C = RC.correct;
type Reason = keyof typeof C.reasons;
const REASONS = Object.keys(C.reasons) as Reason[];
type Batch = { id: string; batchNumber: string; expires: string; n: number };

const chip = (on: boolean) =>
  cn(
    "min-h-11 rounded-full px-4 text-[13.5px]",
    on ? "bg-tide-navy-900 text-tide-on-band font-semibold" : "bg-card shadow-tide-card",
  );

/**
 * Correct an entry (PRD §6.6, prototype audit.js `correctMove`): what was wrong as chips, the right quantity on a
 * stepper, or the right batch as chips. Saving adds a reversal (and the right line) linked to the original. A
 * controlled-drug correction needs a witness on their own phone first.
 */
export function CorrectDialog({ m, onClose }: { m: AuditMovement; onClose: () => void }) {
  const router = useRouter();
  const abs = Math.abs(m.quantity);
  const [key] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState<Reason | null>(null);
  const [qty, setQty] = useState(abs);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [batch, setBatch] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (reason === "wrong_batch" && batches === null) void otherBatchesAction(m.id).then(setBatches);
  }, [reason, batches, m.id]);

  const replace =
    reason === "wrong_quantity" ? `${m.quantity < 0 ? "−" : "+"}${qty} ${m.unit}` : reason === "wrong_batch" && batch
      ? `${m.quantity < 0 ? "−" : "+"}${abs} ${m.unit}, ${C.batchWord(batches?.find((b) => b.id === batch)?.batchNumber ?? "")}`
      : null;
  const blocked = !reason
    ? C.chooseReason
    : reason === "wrong_quantity" && qty === abs
      ? C.sameQty
      : reason === "wrong_batch" && !batch
        ? C.chooseBatch
        : undefined;

  const save = (witnessAttestationId?: string) =>
    start(async () => {
      setError(null);
      const r = await correctMovementAction({
        clientKey: key,
        movementId: m.id,
        reason,
        quantity: reason === "wrong_quantity" ? qty : null,
        batchId: reason === "wrong_batch" ? batch : null,
        witnessAttestationId: witnessAttestationId ?? null,
      });
      if (!r.ok) return setError(r.error);
      router.refresh();
      onClose();
    });

  const onWitness = (w: WitnessResult) => {
    setAsking(false);
    if (w.how === "paper") return setError(C.paperRefused);
    save(w.attestationId);
  };

  return (
    <>
      <EditorDialog open={!asking} onOpenChange={(o) => !o && !pending && onClose()} width="medium">
        <div className="flex flex-col gap-1 px-6 pt-5">
          <DialogTitle>{C.title(m.product)}</DialogTitle>
          <p className="text-body-s text-ink-600">
            {C.sub(RC.kinds[m.kind] ?? m.kind, `${m.quantity > 0 ? "+" : "−"}${abs} ${m.unit}`, fmt(m.effectiveAt), m.who ?? "")}
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-body-s mb-2 font-semibold">{C.what}</legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)} className={chip(reason === r)}>
                  {C.reasons[r]}
                </button>
              ))}
            </div>
          </fieldset>

          {reason === "wrong_quantity" ? (
            <div className="flex flex-col gap-2">
              <span className="text-body-s font-semibold">{C.rightQty}</span>
              <div className="flex items-center gap-3">
                <LabButton variant="secondary" aria-label={C.less} onClick={() => setQty(Math.max(1, qty - 1))}>
                  −
                </LabButton>
                <span className="text-heading-s min-w-16 text-center tabular-nums" aria-live="polite">
                  {qty} {m.unit}
                </span>
                <LabButton variant="secondary" aria-label={C.more} onClick={() => setQty(qty + 1)}>
                  +
                </LabButton>
              </div>
            </div>
          ) : null}

          {reason === "wrong_batch" ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-body-s mb-2 font-semibold">{C.rightBatch}</legend>
              {batches?.length === 0 ? <p className="text-body-s text-ink-600">{C.noOtherBatch}</p> : null}
              <div className="flex flex-wrap gap-2">
                {(batches ?? []).map((b) => (
                  <button key={b.id} type="button" aria-pressed={batch === b.id} onClick={() => setBatch(b.id)} className={chip(batch === b.id)}>
                    {b.batchNumber} · {b.expires} · {b.n}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {reason === "wrong_patient_or_place" ? <p className="text-body-s text-ink-700">{C.wrongPlace}</p> : null}
          {reason ? (
            <p className="text-body-s text-ink-700">{C.plan(`${m.quantity > 0 ? "−" : "+"}${abs} ${m.unit}`, replace)}</p>
          ) : null}
          <p className="text-caption text-ink-600">{m.controlled ? C.controlledNote : C.plainNote}</p>
          {error ? (
            <p role="alert" className="text-body-s text-ink-900 font-semibold">
              {error}
            </p>
          ) : null}
        </div>
        <div className="border-border flex flex-wrap justify-end gap-2 border-t px-6 py-3">
          <LabButton variant="text" onClick={() => !pending && onClose()}>
            {C.cancel}
          </LabButton>
          <LabButton
            busy={pending}
            disabledReason={blocked}
            onClick={() => (m.controlled ? setAsking(true) : save())}
          >
            {m.controlled ? C.saveWitness : C.save}
          </LabButton>
        </div>
      </EditorDialog>
      {m.controlled ? (
        <WitnessDialog
          open={asking}
          onOpenChange={setAsking}
          what={C.witnessWhat(m.product, reason ? C.reasons[reason] : "")}
          purpose={C.witnessPurpose(m.product)}
          locationId={m.placeId}
          onDone={onWitness}
        />
      ) : null}
    </>
  );
}
