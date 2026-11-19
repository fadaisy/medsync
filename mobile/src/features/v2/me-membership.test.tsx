import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { plansFrom } from "@patient-core/membership";

import { MeMembershipV2 } from "@/features/v2/me-membership";
import { ThemeProvider } from "@/theme/theme";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/lib/edge", () => ({ requestId: () => "00000000-0000-4000-8000-000000000001", callEdge: jest.fn() }));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const plans = plansFrom(
  [
    { tier: "plus_care", period: "monthly", amountUgx: 10_000, effectiveFrom: "2026-11-16" },
    { tier: "plus_care", period: "yearly", amountUgx: 100_000, effectiveFrom: "2026-11-16" },
  ],
  "2026-11-16",
);
const base = {
  tier: "basic" as const,
  trial: false,
  endsLabel: "2026-12-16",
  name: "Sample Member",
  memberNo: "K7M 42Q",
  id: { emergencyContact: "—", bloodGroup: null, allergies: [], conditions: [], hospitalLine: "Demo Hospital" },
  plans,
  msisdn: "0772000123",
  qrToken: async () => ({ ok: true as const, modules: ["101", "010", "101"], expiresAt: "2099-01-01T00:00:00Z" }),
};
const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

jest.setTimeout(30_000);

describe("Me v2 (Step 10)", () => {
  it("the free month: one press, then the reveal; nothing to pay", async () => {
    const startTrial = jest.fn(async () => ({ ok: true as const }));
    const pay = jest.fn();
    await wrap(<MeMembershipV2 {...base} trialUsed={false} startTrial={startTrial} pay={pay} />);
    expect(screen.getByText(/Always free, on every plan/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Try it free for 30 days"));
    await waitFor(() => expect(screen.getByText("Welcome to Plus Care")).toBeTruthy());
    expect(startTrial).toHaveBeenCalledWith("plus_care");
    expect(pay).not.toHaveBeenCalled();
  });

  it("after the trial, choosing a plan pays the server's price with the chosen network and one key", async () => {
    const pay = jest.fn(async () => ({ ok: true as const, view: "paid" as const }));
    await wrap(<MeMembershipV2 {...base} trialUsed startTrial={jest.fn()} pay={pay} />);
    await fireEvent.press(screen.getByText("Choose Plus Care"));
    await fireEvent.press(screen.getByText("Airtel Money"));
    await fireEvent.press(screen.getByText("Pay UGX 10,000 with Mobile Money"));
    await waitFor(() => expect(screen.getByText("Paid")).toBeTruthy());
    expect(pay).toHaveBeenCalledWith({
      tier: "plus_care",
      period: "monthly",
      network: "airtel",
      msisdn: "0772000123",
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("on Me only the card and one line to the plans show; the plans page shows the plans and no card", async () => {
    const onSeePlans = jest.fn();
    const quiet = { trialUsed: true, startTrial: jest.fn(), pay: jest.fn() };
    const view = await wrap(
      <MeMembershipV2 {...base} {...quiet} tier="plus_care" trial part="card" onSeePlans={onSeePlans} />,
    );
    // The card, and the plan held with its date; no plan to choose and nothing to pay here.
    expect(screen.getByText("K7M 42Q")).toBeTruthy();
    expect(screen.getByText("Plus Care · Free until 2026-12-16")).toBeTruthy();
    expect(screen.queryByText(/Always free, on every plan/)).toBeNull();
    await fireEvent.press(screen.getByText("Your plan"));
    expect(onSeePlans).toHaveBeenCalledTimes(1);

    await view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <MeMembershipV2 {...base} {...quiet} tier="plus_care" trial part="plans" />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.queryByText("K7M 42Q")).toBeNull();
    expect(screen.getByText(/Always free, on every plan/)).toBeTruthy();
    expect(screen.getByText("Free until 2026-12-16")).toBeTruthy();
  });
});
