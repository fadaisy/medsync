"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { recordPaymentAction } from "@/lib/lab/one-menu-actions";

type Way = "paid" | "insured" | "waived";
const WAYS: { value: Way; label: string }[] = [
  { value: "paid", label: "Paid" },
  { value: "insured", label: "Insured" },
  { value: "waived", label: "Waived" },
];
const control = "min-h-11 sm:min-h-9";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-body-s flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Record payment (§5.3): Paid (receipt) · Insured (insurer, authorisation) · Waived (reason, approver). */
export function RecordPayment({
  orderIds,
  patient,
  tests,
  staff,
}: {
  orderIds: string[];
  patient: string;
  tests: string;
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [way, setWay] = useState<Way>("paid");
  const [receiptNo, setReceiptNo] = useState("");
  const [insurer, setInsurer] = useState("");
  const [authorisationNo, setAuthorisationNo] = useState("");
  const [reason, setReason] = useState("");
  const [approverId, setApproverId] = useState("");

  const missing =
    way === "paid"
      ? !receiptNo.trim() && "Type the receipt number."
      : way === "insured"
        ? (insurer.trim().length < 2 || !authorisationNo.trim()) &&
          "Type the insurer and the authorisation number."
        : (reason.trim().length < 3 || !approverId) && "Give a reason and choose who approved it.";
  const save = () =>
    start(async () => {
      if (missing) return setError(missing);
      const r = await recordPaymentAction(
        way === "paid"
          ? { state: way, orderIds, receiptNo }
          : way === "insured"
            ? { state: way, orderIds, insurer, authorisationNo }
            : { state: way, orderIds, reason, approverId },
      );
      if (!r.ok) return setError(r.error);
      setError(null);
      setOpen(false);
      router.refresh();
    });

  return (
    <EditorDialog
      open={open}
      onOpenChange={setOpen}
      width="medium"
      trigger={
        <DialogTrigger render={<Button variant="secondary" />}>Record payment</DialogTrigger>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>Record payment</SheetTitle>
          <SheetDescription>
            {patient} · {tests}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="grid gap-6 sm:grid-cols-[12rem_1fr]">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-body-s text-muted-foreground mb-1">How it was settled</legend>
            {WAYS.map((w) => (
              <label key={w.value} className={`text-body-s flex items-center gap-2 ${control}`}>
                <input
                  type="radio"
                  name="paymentWay"
                  value={w.value}
                  checked={way === w.value}
                  onChange={() => setWay(w.value)}
                  className="size-4 accent-teal-600"
                />
                {w.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-3">
            {way === "paid" ? (
              <Field label="Receipt number">
                <Input
                  value={receiptNo}
                  onChange={(e) => setReceiptNo(e.target.value)}
                  maxLength={60}
                  className={`${control} font-mono`}
                />
              </Field>
            ) : way === "insured" ? (
              <>
                <Field label="Insurer">
                  <Input
                    value={insurer}
                    onChange={(e) => setInsurer(e.target.value)}
                    maxLength={120}
                    className={control}
                  />
                </Field>
                <Field label="Authorisation number">
                  <Input
                    value={authorisationNo}
                    onChange={(e) => setAuthorisationNo(e.target.value)}
                    maxLength={60}
                    className={`${control} font-mono`}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="Reason">
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={200}
                    className={control}
                  />
                </Field>
                <Field label="Approved by">
                  <select
                    value={approverId}
                    onChange={(e) => setApproverId(e.target.value)}
                    className={`border-input bg-card text-body-s focus-visible:shadow-focus rounded-sm border px-2 outline-none ${control}`}
                  >
                    <option value="" disabled>
                      Choose a member of staff
                    </option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <p role="status" aria-live="polite" className="text-body-s min-h-5">
              {error ? <StatusWord tone="caution">{error}</StatusWord> : null}
            </p>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            Record payment
          </Button>
        </SheetFooter>
      </div>
    </EditorDialog>
  );
}
