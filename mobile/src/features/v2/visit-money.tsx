/**
 * The money on one visit, phone (patient app v2 §5.4, P2 to P5; Step 6): a bill due on the day or a specialist
 * top-up with Pay with MoMo or the cash office, the refund rule before cancelling, "Ask for your refund" after,
 * the tracker, and the receipts. Never red (MR5). The PIN goes in the phone's own Mobile Money prompt, never
 * here. The network is the patient's choice, never guessed from the number. The same model as the web
 * (`@patient-core/visit-money`).
 */
import type { Network, PromptView } from "@patient-core/payments";
import type { DueBill, VisitMoney } from "@patient-core/visit-money";
import { useState } from "react";
import { Text, View } from "react-native";
import { PAYMENTS_COPY } from "@content/patient-app/payments";
import { feeText } from "@patient-core/fees";
import { maskMsisdn, NETWORK_NAME } from "@patient-core/payments";

import { Button, Chip } from "@/components/tide";
import { PromptStatus, Receipt, RefundTracker } from "@/components/tide/v2";
import { useTide } from "@/theme/theme";
import { tRadius, tSpace, tType } from "@/theme/tide";

const P = PAYMENTS_COPY;

export type PayBill = (input: {
  billId: string;
  kind: DueBill["kind"];
  network: Network;
  msisdn: string;
}) => Promise<{ ok: true; view: PromptView } | { ok: false; error: string }>;

export function VisitMoneySection({
  money,
  msisdn,
  cutoffLabel,
  payBill,
  askRefund,
}: {
  money: VisitMoney;
  msisdn: string | null;
  cutoffLabel: string | null;
  payBill: PayBill;
  askRefund: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const t = useTide();
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const card = { backgroundColor: t.surface, boxShadow: t.shadow.card, borderRadius: tRadius.cardLg, padding: tSpace[4], gap: tSpace[3] };
  const nothing =
    money.due.length === 0 && money.receipts.length === 0 && !money.refund && !money.canAskRefund && !money.cancelRule;
  if (nothing) return null;

  return (
    <View style={{ gap: tSpace[4] }}>
      {money.due.map((b) => (
        <BillCard key={b.billId} bill={b} msisdn={msisdn} payBill={payBill} />
      ))}

      {money.cancelRule && cutoffLabel ? (
        <View style={{ backgroundColor: t.surface2, borderRadius: tRadius.cardLg, padding: tSpace[4] }}>
          <Text style={[tType.bodyS, { color: t.ink }]}>
            {P.refund.rule
              .replace("{amount}", feeText(money.cancelRule.paidUgx).replace("UGX ", ""))
              .replace("{cutoff}", cutoffLabel)}
          </Text>
        </View>
      ) : null}

      {money.canAskRefund ? (
        <View style={card}>
          <Text style={[tType.label, { color: t.ink }]}>{P.refund.steps[0]}</Text>
          <Button
            label={P.refund.ask}
            variant="accent"
            size="md"
            busy={asking}
            onPress={async () => {
              setAsking(true);
              const r = await askRefund();
              setAsking(false);
              setAskError(r.ok ? null : r.error);
            }}
          />
          {askError ? (
            <Text accessibilityRole="alert" style={[tType.caption, { color: t.ink2 }]}>
              {askError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {money.refund && money.refund.network !== "counter" ? (
        <View style={card}>
          <RefundTracker status={money.refund.status} network={money.refund.network} />
        </View>
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
            ...payerLine(r.payer, r.forSomeoneElse),
          }}
        />
      ))}
    </View>
  );
}

/** "Paid by … for …" only when one person paid for another (§5.4 Household); never a name. */
export function payerLine(payer: "you" | "household" | "hospital", forSomeoneElse: boolean) {
  const patient = forSomeoneElse ? P.payer.member : payer === "household" ? P.payer.youLower : P.payer.you;
  if (payer === "you" && forSomeoneElse) return { payer: P.payer.you, patient };
  if (payer === "household" && !forSomeoneElse) return { payer: P.payer.household, patient };
  return { payer: patient, patient };
}

function BillCard({ bill, msisdn, payBill }: { bill: DueBill; msisdn: string | null; payBill: PayBill }) {
  const t = useTide();
  const [network, setNetwork] = useState<Network>("mtn");
  const [view, setView] = useState<PromptView | null>(null);
  const [cash, setCash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = bill.kind === "top_up" ? P.topUp.title : P.onTheDay.title;
  const row = (a: string, b: string, bold = false) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={[bold ? tType.label : tType.bodyS, { color: t.ink }]}>{a}</Text>
      <Text style={[bold ? tType.label : tType.bodyS, { color: t.ink, fontVariant: ["tabular-nums"] }]}>{b}</Text>
    </View>
  );
  return (
    <View
      accessibilityLabel={title}
      style={{ backgroundColor: t.surface, boxShadow: t.shadow.card, borderRadius: tRadius.cardLg, padding: tSpace[4], gap: tSpace[3] }}
    >
      <Text accessibilityRole="header" style={[tType.heading, { color: t.ink }]}>
        {title}
      </Text>
      {bill.paidAtBookingUgx !== null ? row(P.topUp.paidAtBooking, feeText(bill.paidAtBookingUgx)) : null}
      {row(bill.kind === "top_up" ? P.topUp.difference : P.receipt.total, feeText(bill.toPayUgx), true)}
      {view ? <PromptStatus view={view} /> : null}
      {error ? (
        <Text accessibilityRole="alert" style={[tType.caption, { color: t.ink2 }]}>
          {error}
        </Text>
      ) : null}
      {view === "paid" ? null : cash ? (
        <Text accessibilityLiveRegion="polite" style={[tType.bodyS, { color: t.ink2 }]}>
          {P.onTheDay.cashNote}
        </Text>
      ) : (
        <View style={{ gap: tSpace[3] }}>
          {msisdn ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: tSpace[2] }} accessibilityLabel={P.onTheDay.network}>
              {(["mtn", "airtel"] as const).map((n) => (
                <Chip key={n} label={NETWORK_NAME[n]} selected={network === n} onPress={() => setNetwork(n)} />
              ))}
              <Text style={[tType.caption, { color: t.ink3 }]}>{maskMsisdn(msisdn)}</Text>
            </View>
          ) : null}
          {msisdn ? (
            <Button
              label={view === "nothing_taken" ? P.prompt.tryAgain : P.onTheDay.payMomo}
              variant="accent"
              size="md"
              busy={view === "approve_on_phone"}
              onPress={async () => {
                setError(null);
                setView("approve_on_phone");
                const r = await payBill({ billId: bill.billId, kind: bill.kind, network, msisdn });
                if (r.ok) setView(r.view);
                else {
                  setView(null);
                  setError(r.error);
                }
              }}
            />
          ) : null}
          <Button label={P.onTheDay.cashOffice} variant="outline" size="md" onPress={() => setCash(true)} />
        </View>
      )}
    </View>
  );
}
