"use client";

import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLOSE_REASONS,
  DECLINE_REASONS,
  FILLED_SAID_BY,
  KEEP_REASONS,
  PAYMENT_WORDS,
  PHONE_SAID,
  REVIEW,
  WITHDRAW_REASONS,
  WITHOUT_PHARMACIST_REASONS,
} from "@/content/pharmacy-review";
import * as actions from "../review-actions";
import { PharmacyDialog, Refusal, type PharmacyDialogProps } from "./pharmacy-dialog";

/**
 * The review's pop-ups (5.3, 5.4, 5.7; wireframes §4.1, §7.4): each a centred EditorDialog (ADR 0161,
 * never a side sheet) opened by its own button, which takes focus back on close. A new client key is
 * drawn each time a dialog opens, so a retried save finds its own row. The server's refusal is shown
 * in words, amber with an icon.
 */

export const TARGET = "min-h-11";
export const SELECT =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-11 w-full rounded-md border px-2.5 outline-none";
export const TEXTAREA =
  "border-input bg-card text-body-s focus-visible:shadow-focus min-h-20 w-full rounded-md border px-2.5 py-2 outline-none";
const newKey = () => crypto.randomUUID();
const text = (d: FormData, k: string) => {
  const v = d.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

export { Refusal };

/** The review's dialog: the pharmacy's one dialog (D-PW-10) with the review's words. */
export function ReviewDialog(props: Omit<PharmacyDialogProps, "width" | "onSave"> & {
  onSave: (key: string, data: FormData) => Promise<ActionResult<unknown>>;
}) {
  return <PharmacyDialog {...props} cancelLabel={REVIEW.close.cancel} />;
}

/** A one-tap action (accept, change the outcome): the refusal in words beside it. */
export function ActionButton({
  label,
  run,
  variant = "secondary",
  describedBy,
}: {
  label: string;
  run: (key: string) => Promise<ActionResult<unknown>>;
  variant?: "primary" | "secondary" | "ghost";
  describedBy?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={variant}
        className={TARGET}
        disabled={pending}
        aria-describedby={describedBy}
        onClick={() =>
          start(async () => {
            const r = await run(newKey());
            if (r.ok) {
              setError(null);
              router.refresh();
            } else setError(r.error);
          })
        }
      >
        {label}
      </Button>
      <Refusal error={error} />
    </span>
  );
}

export function Select({
  label,
  name,
  options,
  required = true,
}: {
  label: string;
  name: string;
  options: Readonly<Record<string, string>>;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} required={required} className={SELECT} defaultValue="">
        <option value="" disabled>
          {REVIEW.query.choose}
        </option>
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Note({ label, name = "note" }: { label: string; name?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} name={name} maxLength={1000} className={TEXTAREA} />
    </div>
  );
}

/* ─── Review ─────────────────────────────────────────────────────────── */

export function CloseNotCollectedDialog({ lineId, lede }: { lineId: string; lede: string }) {
  const C = REVIEW.close;
  return (
    <ReviewDialog
      label={REVIEW.queue.closeNotCollected}
      title={C.title}
      description={lede}
      submit={C.submit}
      onSave={(clientKey, d) =>
        actions.closePrescriptionNotCollected({
          clientKey,
          lineId,
          reasonCode: text(d, "reasonCode"),
          note: text(d, "note"),
        })
      }
    >
      <Select label={C.reason} name="reasonCode" options={CLOSE_REASONS} />
      <Note label={C.note} />
      <p className="text-body-s text-muted-foreground">{C.prescriberSees}</p>
    </ReviewDialog>
  );
}

const SETTABLE = ["paid", "insured", "emergency", "not_recorded"] as const;

export function PaymentDialog({ lineId }: { lineId: string }) {
  const R = REVIEW.review;
  const [status, setStatus] = useState<(typeof SETTABLE)[number]>("paid");
  const id = useId();
  return (
    <ReviewDialog
      label={R.set}
      title={R.paymentTitle}
      description={R.paymentNote}
      submit={R.save}
      variant="ghost"
      onSave={(clientKey, d) =>
        actions.setPaymentStatus({ clientKey, lineId, status, detail: text(d, "detail") })
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label mb-1">{R.payment}</legend>
        {SETTABLE.map((s) => (
          <label key={s} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="status"
              value={s}
              checked={status === s}
              onChange={() => setStatus(s)}
            />
            {PAYMENT_WORDS[s]}
          </label>
        ))}
        <p className="text-caption text-muted-foreground">
          {PAYMENT_WORDS.exempt}: {R.exemptUnsigned}
        </p>
      </fieldset>
      {status === "paid" || status === "insured" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{R.paymentDetail[status]}</Label>
          <Input id={id} name="detail" maxLength={200} required={status === "insured"} />
        </div>
      ) : null}
    </ReviewDialog>
  );
}

export function DeclineDialog({ lineId, medicine }: { lineId: string; medicine: string }) {
  const D = REVIEW.decline;
  return (
    <ReviewDialog
      label={REVIEW.review.decline}
      title={`${D.title}: ${medicine}`}
      submit={D.submit}
      onSave={(clientKey, d) =>
        actions.declineLine({
          clientKey,
          lineId,
          reasonCode: text(d, "reasonCode"),
          note: text(d, "note"),
        })
      }
    >
      <Select label={D.reason} name="reasonCode" options={DECLINE_REASONS} />
      <Note label={D.note} />
      <p className="text-body-s">
        {D.patientReads} <q>{REVIEW.patientDeclined}</q>
      </p>
    </ReviewDialog>
  );
}

export function WithoutPharmacistDialog({ lineId }: { lineId: string }) {
  const W = REVIEW.without;
  return (
    <ReviewDialog
      label={REVIEW.review.withoutPharmacist}
      title={W.title}
      description={W.lookBack}
      submit={W.submit}
      onSave={(clientKey, d) =>
        actions.recordSupplyWithoutReview({
          clientKey,
          lineId,
          reasonCode: text(d, "reasonCode"),
          note: text(d, "note"),
        })
      }
    >
      <Select label={W.reason} name="reasonCode" options={WITHOUT_PHARMACIST_REASONS} />
      <Note label={W.note} />
    </ReviewDialog>
  );
}

/* ─── Queries ────────────────────────────────────────────────────────── */

export function PhoneDialog({
  queryId,
  prescribers,
  timeZone,
}: {
  queryId: string;
  prescribers: { userId: string; label: string }[];
  timeZone: string;
}) {
  const Q = REVIEW.query;
  const [said, setSaid] = useState<keyof typeof PHONE_SAID>("keep");
  const who = useId();
  const when = useId();
  const nowLocal = () =>
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(
      new Date(),
    );
  return (
    <ReviewDialog
      label={Q.logPhone}
      title={Q.phoneTitle}
      submit={REVIEW.review.save}
      onSave={(clientKey, d) => {
        const hhmm = text(d, "time");
        // The call's time today, hospital-local (UTC+3, no daylight saving); the server clamps it.
        const at = hhmm
          ? new Date(
              `${new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date())}T${hhmm}:00+03:00`,
            ).toISOString()
          : undefined;
        return actions.logPhoneAnswer({
          clientKey,
          queryId,
          clinicianUserId: text(d, "clinician"),
          said,
          reasonCode: said === "keep" ? text(d, "reasonCode") : undefined,
          note: text(d, "note"),
          at,
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={who}>{Q.spokeTo}</Label>
        <select id={who} name="clinician" required className={SELECT} defaultValue="">
          <option value="" disabled>
            {Q.choose}
          </option>
          {prescribers.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-label mb-1">{Q.said}</legend>
        {Object.entries(PHONE_SAID).map(([v, l]) => (
          <label key={v} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="said"
              value={v}
              checked={said === v}
              onChange={() => setSaid(v as keyof typeof PHONE_SAID)}
            />
            {l}
          </label>
        ))}
      </fieldset>
      {said === "keep" ? (
        <Select label={Q.keepReason} name="reasonCode" options={KEEP_REASONS} />
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={when}>{Q.callTime}</Label>
        <Input id={when} name="time" type="time" defaultValue={nowLocal()} className="w-36" />
      </div>
      <Note label={Q.note} />
    </ReviewDialog>
  );
}

export function WithdrawDialog({ queryId }: { queryId: string }) {
  const Q = REVIEW.query;
  return (
    <ReviewDialog
      label={Q.withdraw}
      title={Q.withdrawTitle}
      submit={Q.withdraw}
      onSave={(clientKey, d) =>
        actions.withdrawQuery({
          clientKey,
          queryId,
          reasonCode: text(d, "reasonCode"),
          note: text(d, "note"),
        })
      }
    >
      <Select label={Q.withdrawReason} name="reasonCode" options={WITHDRAW_REASONS} />
      <Note label={Q.note} />
    </ReviewDialog>
  );
}

/* ─── Open lines ─────────────────────────────────────────────────────── */

export function CloseLineDialog({ lineId, medicine }: { lineId: string; medicine: string }) {
  const O = REVIEW.open;
  return (
    <ReviewDialog
      label={O.close}
      title={`${O.closeTitle}: ${medicine}`}
      submit={O.close}
      onSave={(clientKey, d) =>
        actions.closeLine({
          clientKey,
          lineId,
          reasonCode: text(d, "reasonCode"),
          note: text(d, "note"),
        })
      }
    >
      <Select label={REVIEW.close.reason} name="reasonCode" options={CLOSE_REASONS} />
      <Note label={REVIEW.query.note} />
    </ReviewDialog>
  );
}

export function FilledDialog({ lineId, medicine }: { lineId: string; medicine: string }) {
  const O = REVIEW.open;
  const id = useId();
  return (
    <ReviewDialog
      label={O.confirmFilled}
      title={`${O.filledTitle}: ${medicine}`}
      submit={O.confirmFilled}
      onSave={(clientKey, d) =>
        actions.confirmFilledElsewhere({
          clientKey,
          lineId,
          saidBy: text(d, "saidBy"),
          name: text(d, "name"),
        })
      }
    >
      <Select label={O.saidBy} name="saidBy" options={FILLED_SAID_BY} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{O.name}</Label>
        <Input id={id} name="name" maxLength={200} />
      </div>
    </ReviewDialog>
  );
}

/** B-11, LO-6: an earlier prescription, brought into the queue by a person (S32). */
export function BringInButton({ lineId }: { lineId: string }) {
  return (
    <ActionButton
      variant="primary"
      label={REVIEW.review.bringIn}
      run={(clientKey) => actions.bringIntoQueue({ clientKey, lineId })}
    />
  );
}

/** 5.7: owed to buying outside (the slip prints next), or back. */
export function ChangeOutcomeButton({ lineId, toOutside }: { lineId: string; toOutside: boolean }) {
  const router = useRouter();
  return (
    <ActionButton
      label={toOutside ? REVIEW.open.toOutside : REVIEW.open.toOwed}
      run={async (clientKey) => {
        const r = await actions.changeOpenOutcome({ clientKey, lineId });
        if (!r.ok || !toOutside) return r;
        const slip = await actions.printSlip({ clientKey: crypto.randomUUID(), lineId });
        if (slip.ok) router.push(`/pharmacy/slip/${slip.id}`);
        return slip;
      }}
    />
  );
}

/** LB-4: the slip for a line already bought outside, printed again from Open lines. */
export function PrintSlipButton({ lineId }: { lineId: string }) {
  const router = useRouter();
  return (
    <ActionButton
      label={REVIEW.open.printSlip}
      run={async (clientKey) => {
        const slip = await actions.printSlip({ clientKey, lineId });
        if (slip.ok) router.push(`/pharmacy/slip/${slip.id}`);
        return slip;
      }}
    />
  );
}
