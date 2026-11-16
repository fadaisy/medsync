import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { visitMoney } from "@patient-core/visit-money";

import { payerLine, VisitMoneySection } from "@/features/v2/visit-money";
import { ThemeProvider } from "@/theme/theme";

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const base = {
  startsAtIso: "2026-11-20T05:00:00Z",
  meUserId: "me",
  patientUserId: "me",
  hospitalName: "Demo Hospital",
  cutoffHours: 24,
  now: new Date("2026-11-20T07:30:00Z"),
  receipts: [],
  refunds: [],
};
const open = {
  id: "b1",
  kind: "visit" as const,
  status: "open" as const,
  totalUgx: 30_000,
  paidUgx: 0,
  refundedUgx: 0,
  items: [],
};
const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

describe("VisitMoneySection (Step 6)", () => {
  it("P2: pays the bill on the day with the chosen network, then reads Paid", async () => {
    const pay = jest.fn(async () => ({ ok: true as const, view: "paid" as const }));
    await wrap(
      <VisitMoneySection
        money={visitMoney({ ...base, appointmentStatus: "arrived", bills: [open] })}
        msisdn="0772000123"
        cutoffLabel={null}
        payBill={pay}
        askRefund={async () => ({ ok: true })}
      />,
    );
    await fireEvent.press(screen.getByText("Airtel Money"));
    await fireEvent.press(screen.getByText("Pay with MoMo"));
    await waitFor(() => expect(screen.getByText("Paid")).toBeTruthy());
    expect(pay).toHaveBeenCalledWith({ billId: "b1", kind: "visit", network: "airtel", msisdn: "0772000123" });
  });

  it("S13: nothing taken leaves the cash office open and offers Try again", async () => {
    await wrap(
      <VisitMoneySection
        money={visitMoney({ ...base, appointmentStatus: "arrived", bills: [open] })}
        msisdn="0772000123"
        cutoffLabel={null}
        payBill={async () => ({ ok: true, view: "nothing_taken" })}
        askRefund={async () => ({ ok: true })}
      />,
    );
    await fireEvent.press(screen.getByText("Pay with MoMo"));
    await waitFor(() => expect(screen.getByText("Nothing was taken")).toBeTruthy());
    expect(screen.getByText("Try again")).toBeTruthy();
    await fireEvent.press(screen.getByText("I'll pay at the cash office"));
    expect(screen.getByText(/Pay at the cash office before you leave/)).toBeTruthy();
  });

  it("nothing owed, paid or refunded renders nothing", async () => {
    await wrap(
      <VisitMoneySection
        money={visitMoney({ ...base, appointmentStatus: "confirmed", bills: [open] })}
        msisdn={null}
        cutoffLabel={null}
        payBill={jest.fn()}
        askRefund={jest.fn()}
      />,
    );
    expect(screen.queryByText(/./)).toBeNull();
  });

  it("names nobody: you, a household member, your household member", () => {
    expect(payerLine("you", false)).toEqual({ payer: "You", patient: "You" });
    expect(payerLine("you", true)).toEqual({ payer: "You", patient: "your household member" });
    expect(payerLine("household", false)).toEqual({ payer: "A household member", patient: "you" });
    expect(payerLine("hospital", true).payer).toBe(payerLine("hospital", true).patient);
  });
});
