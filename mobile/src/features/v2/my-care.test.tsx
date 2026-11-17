import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { nextStep, startFlow } from "@patient-core/danger-flow";
import { teamCards } from "@patient-core/my-care";

import { saveCareReading } from "@/data/care-v2";
import { DangerFlowV2, MessagesV2, MyCareV2 } from "@/features/v2/my-care";
import { flushOutbox } from "@/offline/outbox";
import { ThemeProvider } from "@/theme/theme";

const mockCalls: { fn: string; body: Record<string, unknown> }[] = [];
const mockNet = { offline: false };
jest.mock("@/lib/edge", () => ({
  callEdge: async (fn: string, body: Record<string, unknown>) => {
    if (mockNet.offline) return { ok: false, error: "offline", code: "offline" };
    mockCalls.push({ fn, body });
    return { ok: true, data: { danger: "low_sugar", teamTold: true } };
  },
}));
jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({
      insert: async () => (mockNet.offline ? { error: { code: "", message: "offline" } } : { error: null }),
    }),
  },
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

beforeEach(async () => {
  await AsyncStorage.clear();
  mockCalls.length = 0;
  mockNet.offline = false;
});

describe("Step 8 on the phone", () => {
  it("S19: a danger reading taken offline reaches pt-care-reading (which tells the team) once online", async () => {
    mockNet.offline = true;
    const r = await saveCareReading({ kind: "sugar", value: 3.2, context: "random" }, { kind: "glucose", v1: 3.2, unit: "mmol/L" });
    expect(r).toBe("queued");
    expect(mockCalls).toHaveLength(0);
    mockNet.offline = false;
    await flushOutbox();
    expect(mockCalls.map((c) => c.fn)).toEqual(["pt-care-reading"]);
    expect(mockCalls[0]!.body).toMatchObject({ kind: "sugar", value: 3.2 });
  });

  it("S20: a member without consent shows only the role", async () => {
    await wrap(
      <MyCareV2
        team={teamCards(
          [
            { id: "a", role: "nurse", firstContact: true, nextStep: null, memberUserId: null },
            { id: "b", role: "nutritionist", firstContact: false, nextStep: null, memberUserId: "x" },
          ],
          new Map([["x", "Example Name"]]),
        )}
        checks={[]}
        unread={0}
        onBook={jest.fn()}
        onMessages={jest.fn()}
      />,
    );
    expect(screen.getByText("Nurse")).toBeTruthy();
    expect(screen.getByText("First contact")).toBeTruthy();
    expect(screen.getByText("Example Name")).toBeTruthy();
    expect(screen.getByText("Nutritionist")).toBeTruthy();
  });

  it("low sugar: the recheck stays off until 15 minutes have passed; a warning sign is Help", async () => {
    const now = new Date("2026-11-16T09:00:00Z");
    const wait = nextStep(nextStep(startFlow("low_sugar"), { type: "next", now }), { type: "next", now });
    const onNext = jest.fn();
    const onWarning = jest.fn();
    await wrap(
      <DangerFlowV2 step={wait} now={now} onNext={onNext} onReading={jest.fn()} onWarningSign={onWarning} onHelp={jest.fn()} onDone={jest.fn()} teamNote={null} />,
    );
    expect(screen.getByText("Check again in 15:00")).toBeTruthy();
    await fireEvent.press(screen.getByText("Check your sugar again"));
    expect(onNext).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText("I have one of these"));
    expect(onWarning).toHaveBeenCalled();
  });

  it("messages: not for emergencies with Help; a check-in shows until answered; quick prompts send", async () => {
    const onSend = jest.fn();
    const onHelp = jest.fn();
    await wrap(
      <MessagesV2
        messages={[{ id: "m1", fromPatient: false, kind: "request", body: "How are your feet this week?", atIso: "2026-11-16T06:00:00Z" }]}
        onSend={onSend}
        onHelp={onHelp}
      />,
    );
    expect(screen.getByText("Your care team asked")).toBeTruthy();
    await fireEvent.press(screen.getByText("I need a refill"));
    expect(onSend).toHaveBeenCalledWith("I need a refill");
    await fireEvent.press(screen.getByText("Help"));
    expect(onHelp).toHaveBeenCalled();
  });
});
