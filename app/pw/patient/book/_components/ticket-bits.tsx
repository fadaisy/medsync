"use client";

import { feeText, payLook } from "@patient-core/fees";

import { Band, Button } from "@/components/tide/kit";
import { PAY_COPY as P } from "@/content/patient/book";

/**
 * The sent states' ticket, flat (the phone's components/tide/ticket.tsx front face): the navy band with the
 * kind, the details, the code, and the payment strip. The Visits page owns the ticket that turns over.
 */
export function SentTicket({
  kind,
  title,
  status,
  details,
  code,
  codeLabel,
  pay,
}: {
  kind: "queue" | "day";
  title: string;
  status: string;
  details: { label: string; value: string }[];
  code: string | null;
  codeLabel: string;
  pay?: {
    fee: number | null;
    feeLabel: string | null;
    paid: boolean;
    demo: boolean;
    paying: boolean;
    onPayNow: () => void;
  };
}) {
  return (
    <Band className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-pw-on-band-2 text-xs font-semibold tracking-[0.06em] uppercase">
          {kind === "queue" ? P.queueTicket : P.visitTicket} · {title}
        </p>
        <p className="text-pw-on-band-accent text-[15px] font-semibold">{status}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 max-[420px]:grid-cols-1">
        {details.map((d) => (
          <div key={d.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-pw-on-band-2 text-[13px] font-medium">{d.label}</dt>
            <dd className="text-[17px] leading-[22px] font-semibold break-words">{d.value}</dd>
          </div>
        ))}
      </dl>
      {code ? (
        <div className="bg-pw-band-glass rounded-pw-row flex flex-col gap-0.5 p-3">
          <p className="text-pw-on-band-2 text-[13px] font-medium">{codeLabel}</p>
          <p
            className="font-pw-mono text-[28px] leading-8 font-semibold tracking-[0.12em]"
            aria-label={`${codeLabel} ${code.split("").join(" ")}`}
          >
            {code}
          </p>
        </div>
      ) : null}
      {pay ? <PayStrip kind={kind} {...pay} /> : null}
    </Band>
  );
}

function PayStrip({
  kind,
  fee,
  feeLabel,
  paid,
  demo,
  paying,
  onPayNow,
}: {
  kind: "queue" | "day";
  fee: number | null;
  feeLabel: string | null;
  paid: boolean;
  demo: boolean;
  paying: boolean;
  onPayNow: () => void;
}) {
  const look = payLook(fee, paid);
  const money = feeLabel ?? feeText(fee);
  const [title, line] =
    look === "paid"
      ? [P.paid(money), demo ? P.demoPaid : P.momoPaid]
      : look === "owed"
        ? [P.owed(money), kind === "queue" ? P.owedQueue : P.owedDay]
        : [P.free, P.freeLine];
  return (
    <div className="bg-pw-surface text-pw-ink rounded-pw-row flex flex-wrap items-center gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[15px] font-semibold tabular-nums">{title}</p>
        <p className="text-pw-ink-2 text-[13px] font-medium">{line}</p>
      </div>
      {look === "owed" ? (
        <Button size="s" busy={paying} onClick={onPayNow}>
          {P.payNow}
        </Button>
      ) : null}
    </div>
  );
}
