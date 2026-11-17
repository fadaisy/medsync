"use client";

import type { Network, PromptView } from "@patient-core/payments";
import type { DueBill, VisitMoney } from "@patient-core/visit-money";
import { useState, useTransition } from "react";
import { feeText } from "@patient-core/fees";
import { maskMsisdn, NETWORK_NAME } from "@patient-core/payments";

import { buttonClass } from "@/components/tide/kit";
import { PromptStatus, Receipt, RefundTracker } from "@/components/tide/v2-pay";
import { PAYMENTS_COPY } from "@/content/patient-app/payments";
import { cn } from "@/lib/utils";

const P = PAYMENTS_COPY;

export type PayBill = (input: {
  billId: string;
  kind: DueBill["kind"];
  network: Network;
  msisdn: string;
}) => Promise<{ ok: true; view: PromptView } | { ok: false; error: string }>;

/**
 * The money on one visit, web (patient app v2 §5.4, P2 to P5): a bill due on the day or a specialist top-up,
 * the refund rule before cancelling, "Ask for your refund" after, the tracker, and the receipts. Never red
 * (MR5). The PIN is entered in the phone's own Mobile Money prompt, never here. The network is the patient's
 * choice, never guessed from the number.
 */
export function VisitMoneyWeb({
  money,
  msisdn,
  cutoffLabel,
  payBill,
  askRefund,
}: {
  money: VisitMoney;
  msisdn: string | null;
  /** "Thursday 19 November, 08:00": the cut-off in words, made by the page in Kampala time. */
  cutoffLabel: string | null;
  payBill: PayBill;
  askRefund: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [asking, startAsk] = useTransition();
  const [askError, setAskError] = useState<string | null>(null);
  const nothing =
    money.due.length === 0 &&
    money.receipts.length === 0 &&
    !money.refund &&
    !money.canAskRefund &&
    !money.cancelRule;
  if (nothing) return null;

  return (
    <section className="flex flex-col gap-4" aria-label={P.onTheDay.title}>
      {money.due.map((b) => (
        <BillCard key={b.billId} bill={b} msisdn={msisdn} payBill={payBill} />
      ))}

      {money.cancelRule && cutoffLabel ? (
        <p className="rounded-pw-card bg-pw-surface-2 p-4 text-[14px]">
          {P.refund.rule
            .replace("{amount}", feeText(money.cancelRule.paidUgx).replace("UGX ", ""))
            .replace("{cutoff}", cutoffLabel)}
        </p>
      ) : null}

      {money.canAskRefund ? (
        <div className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-3 p-5">
          <p className="text-[15px] font-semibold">{P.refund.steps[0]}</p>
          <button
            type="button"
            disabled={asking}
            onClick={() =>
              startAsk(async () => {
                const r = await askRefund();
                setAskError(r.ok ? null : r.error);
              })
            }
            className={cn(buttonClass("accent", "m"), "self-start")}
          >
            {P.refund.ask}
          </button>
          {askError ? (
            <p role="alert" className="text-pw-ink-2 text-[13px]">
              {askError}
            </p>
          ) : null}
        </div>
      ) : null}

      {money.refund && money.refund.network !== "counter" ? (
        <div className="rounded-pw-card bg-pw-surface shadow-pw-card p-5">
          <RefundTracker status={money.refund.status} network={money.refund.network} />
        </div>
      ) : null}

      {money.receipts.map((r) => (
        <Receipt
          key={r.id}
          r={{
            number: r.number,
            hospital: r.hospital,
            issuedAt: r.issuedAt,
            items: r.items,
            totalUgx: r.totalUgx,
            method: r.method,
            reference: r.reference,
            // "Paid by … for …" only when one person paid for another (§5.4 Household); never a name.
            ...payerLine(r.payer, r.forSomeoneElse),
          }}
        />
      ))}
    </section>
  );
}

function payerLine(payer: "you" | "household" | "hospital", forSomeoneElse: boolean) {
  const patient = forSomeoneElse
    ? P.payer.member
    : payer === "household"
      ? P.payer.youLower
      : P.payer.you;
  if (payer === "you" && forSomeoneElse) return { payer: P.payer.you, patient };
  if (payer === "household" && !forSomeoneElse) return { payer: P.payer.household, patient };
  return { payer: patient, patient };
}

/** A bill due on the day (P2) or a top-up (P3): Pay with MoMo, or the cash office. */
function BillCard({
  bill,
  msisdn,
  payBill,
}: {
  bill: DueBill;
  msisdn: string | null;
  payBill: PayBill;
}) {
  const [network, setNetwork] = useState<Network>("mtn");
  const [view, setView] = useState<PromptView | null>(null);
  const [cash, setCash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const title = bill.kind === "top_up" ? P.topUp.title : P.onTheDay.title;

  return (
    <section
      aria-label={title}
      className="rounded-pw-card bg-pw-surface shadow-pw-card flex flex-col gap-3 p-5"
    >
      <h3 className="text-[17px] font-semibold">{title}</h3>
      <dl className="flex flex-col gap-1.5 text-[14px]">
        {bill.paidAtBookingUgx !== null ? (
          <div className="flex justify-between gap-3">
            <dt>{P.topUp.paidAtBooking}</dt>
            <dd className="tabular-nums">{feeText(bill.paidAtBookingUgx)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 font-semibold">
          <dt>{bill.kind === "top_up" ? P.topUp.difference : P.receipt.total}</dt>
          <dd className="tabular-nums">{feeText(bill.toPayUgx)}</dd>
        </div>
      </dl>

      {view ? <PromptStatus view={view} /> : null}
      {error ? (
        <p role="alert" className="text-pw-ink-2 text-[13px]">
          {error}
        </p>
      ) : null}

      {view === "paid" ? null : cash ? (
        <p className="text-pw-ink-2 text-[14px]" role="status">
          {P.onTheDay.cashNote}
        </p>
      ) : (
        <>
          {msisdn ? (
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="sr-only">{P.onTheDay.network}</legend>
              {(["mtn", "airtel"] as const).map((n) => (
                <label
                  key={n}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[14px] ring-[1.5px] ring-inset",
                    network === n
                      ? "bg-pw-accent-tint ring-pw-accent font-semibold"
                      : "ring-pw-line",
                  )}
                >
                  <input
                    type="radio"
                    name={`net-${bill.billId}`}
                    className="sr-only"
                    checked={network === n}
                    onChange={() => setNetwork(n)}
                  />
                  {NETWORK_NAME[n]}
                </label>
              ))}
              <span className="text-pw-ink-3 text-[13px]">{maskMsisdn(msisdn)}</span>
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {msisdn ? (
              <button
                type="button"
                disabled={pending || view === "approve_on_phone"}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    setView("approve_on_phone");
                    const r = await payBill({
                      billId: bill.billId,
                      kind: bill.kind,
                      network,
                      msisdn,
                    });
                    if (r.ok) setView(r.view);
                    else {
                      setView(null);
                      setError(r.error);
                    }
                  })
                }
                className={buttonClass("accent", "m")}
              >
                {view === "nothing_taken" ? P.prompt.tryAgain : P.onTheDay.payMomo}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setCash(true)}
              className={buttonClass("outline", "m")}
            >
              {P.onTheDay.cashOffice}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
