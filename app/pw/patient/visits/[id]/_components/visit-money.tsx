"use client";

import type { VisitMoney } from "@patient-core/visit-money";

import { VisitMoneyWeb } from "@/components/tide/v2-money-web";
import { askRefundAction, payVisitAction } from "@/lib/patient-web/visit-v2-actions";

/** Binds the visit's money card to its server actions (Step 6, behind appV2Web). */
export function VisitMoneyCard({
  appointmentId,
  money,
  msisdn,
  cutoffLabel,
}: {
  appointmentId: string;
  money: VisitMoney;
  msisdn: string | null;
  cutoffLabel: string | null;
}) {
  return (
    <VisitMoneyWeb
      money={money}
      msisdn={msisdn}
      cutoffLabel={cutoffLabel}
      payBill={(i) =>
        payVisitAction({
          appointmentId,
          billId: i.kind === "top_up" ? i.billId : undefined,
          network: i.network,
          msisdn: i.msisdn,
          idempotencyKey: crypto.randomUUID(),
        })
      }
      askRefund={() => askRefundAction(appointmentId)}
    />
  );
}
