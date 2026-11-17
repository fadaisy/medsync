"use client";

import type { Network, PromptView, RefundStatus } from "@patient-core/payments";
import { feeText } from "@patient-core/fees";
import { NETWORK_NAME, refundStep } from "@patient-core/payments";
import { CheckIcon, SmartphoneIcon } from "lucide-react";

import { ICON } from "@/components/tide/kit";
import { PAYMENTS_COPY } from "@/content/patient-app/payments";
import { cn } from "@/lib/utils";

const P = PAYMENTS_COPY;

/**
 * Paying the booking fee (patient app v2 §5.4, P1–P5): the pay choice at booking, the "Approve on your phone"
 * wait, the receipt and the refund tracker. Never red (MR5). The PIN is never typed here: the phone's own Mobile
 * Money prompt takes it. States are announced politely (§11).
 */
export function PayChoice({
  value,
  onChange,
  network,
  maskedNumber,
  onChangeNumber,
}: {
  value: "momo" | "hospital";
  onChange: (v: "momo" | "hospital") => void;
  network: Network;
  maskedNumber: string;
  onChangeNumber?: () => void;
}) {
  const option = (v: "momo" | "hospital", title: string, note: string, extra?: React.ReactNode) => (
    <label
      className={cn(
        "rounded-pw-row flex min-h-14 cursor-pointer items-start gap-3 p-4 ring-[1.5px] ring-inset",
        value === v ? "bg-pw-accent-tint ring-pw-accent" : "bg-pw-surface ring-pw-line",
      )}
    >
      <input
        type="radio"
        name="pay-choice"
        className="accent-pw-focus mt-1 size-5"
        checked={value === v}
        onChange={() => onChange(v)}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-pw-ink-3 text-[13px]">{note}</span>
        {extra}
      </span>
    </label>
  );
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2 text-[15px] font-semibold">{P.choice.title}</legend>
      {option(
        "momo",
        P.choice.momo,
        P.choice.momoNote,
        <span className="text-pw-ink-2 mt-1 flex items-center gap-2 text-[13px]">
          <SmartphoneIcon className="size-4" {...ICON} />
          {NETWORK_NAME[network]} · {maskedNumber}
          {onChangeNumber ? (
            <button
              type="button"
              onClick={onChangeNumber}
              className="text-pw-accent-text min-h-11 font-semibold"
            >
              {P.choice.change}
            </button>
          ) : null}
        </span>,
      )}
      {option("hospital", P.choice.hospital, P.choice.hospitalNote)}
      <p className="text-pw-ink-3 text-[13px]">{P.choice.feeNote}</p>
    </fieldset>
  );
}

/** The wait after Confirm, and its two endings. Announced politely. */
export function PromptStatus({ view }: { view: PromptView }) {
  const words =
    view === "paid"
      ? { title: P.announce.paid, note: P.line.paidNote }
      : view === "approve_on_phone"
        ? { title: P.prompt.waiting, note: P.prompt.waitingNote }
        : { title: P.prompt.nothingTaken, note: P.prompt.nothingTakenNote };
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-pw-card flex items-start gap-3 p-4",
        view === "paid" ? "bg-pw-accent-tint text-pw-accent-text" : "bg-pw-surface-2 text-pw-ink",
      )}
    >
      {view === "approve_on_phone" ? (
        <SmartphoneIcon className="mt-0.5 size-5 motion-safe:animate-pulse" {...ICON} />
      ) : (
        <CheckIcon className="mt-0.5 size-5" {...ICON} />
      )}
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{words.title}</span>
        <span className="text-[13px]">{words.note}</span>
      </span>
    </div>
  );
}

export interface ReceiptView {
  number: number;
  hospital: string;
  issuedAt: string;
  items: { label: string; amountUgx: number }[];
  totalUgx: number;
  method: Network | "counter";
  reference: string | null;
  payer: string;
  patient: string;
}

/** A receipt (§5.4). A confidential clinic's item already reads "Clinic visit" from the engine (MR7). */
export function Receipt({ r }: { r: ReceiptView }) {
  return (
    <section
      className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-3 p-5"
      aria-label={P.receipt.title}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-semibold">{P.receipt.title}</h3>
        <span className="font-pw-mono text-pw-ink-2 text-[13px]">
          R {String(r.number).padStart(4, "0")}
        </span>
      </header>
      <p className="text-pw-ink-3 text-[13px]">
        {r.hospital} · {r.issuedAt}
      </p>
      <dl className="flex flex-col gap-1.5 text-[14px]">
        {r.items.map((i) => (
          <div key={i.label} className="flex justify-between gap-3">
            <dt>{i.label}</dt>
            <dd className="tabular-nums">{feeText(i.amountUgx)}</dd>
          </div>
        ))}
        <div className="border-pw-line flex justify-between gap-3 border-t pt-1.5 font-semibold">
          <dt>{P.receipt.total}</dt>
          <dd className="tabular-nums">{feeText(r.totalUgx)}</dd>
        </div>
      </dl>
      <p className="text-pw-ink-3 text-[12px]">
        {P.receipt.method}: {r.method === "counter" ? P.chip.paidCounter : NETWORK_NAME[r.method]}
        {r.reference ? ` · ${P.receipt.reference} ${r.reference}` : ""}
        {r.payer !== r.patient
          ? ` · ${P.receipt.paidBy.replace("{payer}", r.payer).replace("{patient}", r.patient)}`
          : ""}
      </p>
    </section>
  );
}

/** Booking cancelled → Refund approved → Back on your MoMo (§5.4 P5). */
export function RefundTracker({ status, network }: { status: RefundStatus; network: Network }) {
  const done = refundStep(status);
  return (
    <ol className="flex flex-col gap-3" aria-label="Refund">
      {P.refund.steps.map((s, i) => {
        const reached = i < done;
        return (
          <li key={s} className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full",
                reached ? "bg-pw-accent text-pw-on-accent" : "bg-pw-surface-3 text-pw-ink-3",
              )}
            >
              {reached ? (
                <CheckIcon className="size-4" {...ICON} />
              ) : (
                <span className="text-[12px] font-semibold">{i + 1}</span>
              )}
            </span>
            <span className={cn("text-[15px]", reached ? "font-semibold" : "text-pw-ink-3")}>
              {s.replace("{network}", NETWORK_NAME[network])}
            </span>
          </li>
        );
      })}
      {done < 3 ? <li className="text-pw-ink-3 text-[13px]">{P.refund.smsNote}</li> : null}
    </ol>
  );
}
