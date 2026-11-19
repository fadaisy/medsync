import { CARE_V2_COPY } from "@content/patient-app/care";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(app)/(tabs)/index";
import { ThemeProvider } from "@/theme/theme";

/**
 * The Home route as it will be once Care mode is unlocked (Gate CG), on mocked loaders. `flag` is mocked on
 * here and only here: nothing in the app can switch it. It holds that Home's top card reads the same rows as
 * Today (`loadCare`, the readings log) and makes no other call, and that the visit stays in sight.
 */
const mockPush = jest.fn();
const mockLoadWeek = jest.fn();
const mockLoadCare = jest.fn();
const mockTickDose = jest.fn();
const mockReadings = jest.fn();
jest.mock("@/lib/flags", () => ({ flag: (name: string) => name === "careMode" }));
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useRouter: () => ({ push: mockPush }),
    // Focus is "mounted" here.
    useFocusEffect: (fn: () => void) => useEffect(fn, [fn]),
  };
});
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));
jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/lib/analytics", () => ({ track: jest.fn(), sinceBoot: () => 0 }));
jest.mock("@/offline/outbox", () => ({ startOutbox: jest.fn(), newId: () => "k1" }));
jest.mock("@/data/signup", () => ({ takeFreshSignup: () => false }));
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { user: { id: "u1", user_metadata: { full_name: "Esther Nakato" } } },
  }),
}));
jest.mock("@/data/notifications", () => ({ useNotifications: () => ({ unread: 0 }) }));
jest.mock("@/data/me", () => ({
  ...jest.requireActual("@/data/me"),
  useCardIdentity: () => ({ code: "TTH00422290" }),
}));
jest.mock("@/data/labs", () => ({
  useLabsSummary: () => ({ status: "off", latest: null, testCount: 0 }),
}));
jest.mock("@/data/membership-v2", () => ({
  loadMembership: async () => ({ row: null, prices: [] }),
}));
jest.mock("@/lib/booking", () => ({
  fetchHousehold: async () => [],
  fetchMyAvatarUrl: async () => null,
}));
jest.mock("@/features/location-share/active-banner", () => ({
  useShareBannerShown: () => false,
  ActiveShareBanner: () => null,
}));
jest.mock("@/features/home/doctors", () => ({ Doctors: () => null }));
jest.mock("@/data/visits", () => ({ loadWeek: (now: Date) => mockLoadWeek(now) }));
jest.mock("@/data/visit-v2", () => ({
  loadPayStatus: async () => new Map(),
  ticketFor: (_v: unknown, _pay: unknown, patient: string) => ({
    hospitalName: "Kampala General Hospital",
    hospitalInitials: "KG",
    day: "20",
    dayLine: "Friday · November",
    window: "08:00 to 10:00",
    doctorTime: false,
    clinic: "General OPD",
    room: null,
    patient,
    block: null,
    pay: { kind: "free" },
    code: "K7M 42Q",
  }),
}));
jest.mock("@/data/care-v2", () => ({
  loadCare: () => mockLoadCare(),
  tickDose: (input: unknown) => mockTickDose(input),
}));
jest.mock("@/data/readings", () => ({
  ...jest.requireActual("@/data/readings"),
  useReadings: () => ({ readings: mockReadings() }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <HomeScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const care = (over: Record<string, unknown> = {}) => ({
  enrolmentId: "e1",
  programme: "hypertension",
  planVersionId: "v1",
  items: [],
  ticks: [],
  alerts: [],
  asks: [],
  ...over,
});
const FAR = { id: "a1", status: "booked", startsAtIso: "2099-01-02T05:00:00.000Z" };
/** Tomorrow at noon in Kampala, whatever the hour this runs at. */
const tomorrowIso = () =>
  `${new Date(Date.now() + 3 * 3600_000 + DAY).toISOString().slice(0, 10)}T09:00:00.000Z`;
const row = () => screen.queryByTestId("home-visit-row");

jest.setTimeout(30_000);

describe("the Home route in Care mode", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLoadWeek.mockReset();
    mockLoadCare.mockReset();
    mockTickDose.mockReset();
    mockReadings.mockReset();
    mockReadings.mockReturnValue([]);
    mockLoadWeek.mockResolvedValue({ upcoming: [FAR], past: [] });
  });

  it("someone with no care programme sees the visit card, as before", async () => {
    mockLoadCare.mockResolvedValue(null);
    await mount();
    await waitFor(() => expect(screen.getByText("Open your visit")).toBeTruthy());
    expect(screen.getByText("Friday 20 November")).toBeTruthy();
    expect(row()).toBeNull();
    expect(screen.queryByText("Health trends")).toBeNull();
  });

  it("a reading that needs action takes the card, opens Help, and the visit is in the row", async () => {
    mockLoadCare.mockResolvedValue(
      care({ alerts: [{ kind: "very_high_bp", atIso: ago(3600_000), acknowledged: false }] }),
    );
    await mount();
    await waitFor(() => expect(screen.getByText(CARE_V2_COPY.hero.danger)).toBeTruthy());
    await waitFor(() => expect(row()).not.toBeNull());
    expect(screen.getByText("Friday 20 November · General OPD")).toBeTruthy();
    await fireEvent.press(screen.getByText(CARE_V2_COPY.hero.dangerAction));
    expect(mockPush).toHaveBeenCalledWith("/help");
    await fireEvent.press(row()!);
    expect(mockPush).toHaveBeenCalledWith("/visits/a1");
  });

  it("the care team's question takes the card, by the team's name only, and Reply opens Messages", async () => {
    mockLoadCare.mockResolvedValue(
      care({ asks: [{ id: "m1", from: "team", atIso: ago(7200_000) }] }),
    );
    await mount();
    await waitFor(() => expect(screen.getByText(CARE_V2_COPY.hero.team)).toBeTruthy());
    expect(screen.getByText(CARE_V2_COPY.hero.teamFrom)).toBeTruthy();
    await fireEvent.press(screen.getByText(CARE_V2_COPY.hero.teamAction));
    expect(mockPush).toHaveBeenCalledWith("/care/messages");
  });

  it("a dose due now takes the card, and marking it taken sends the same tick Today sends", async () => {
    const hhmm = new Date(Date.now() + 3 * 3600_000).toISOString().slice(11, 16);
    mockTickDose.mockResolvedValue("sent");
    mockLoadCare.mockResolvedValue(
      care({ items: [{ key: "amlo", name: "Amlodipine", kind: "dose", times: [hhmm] }] }),
    );
    await mount();
    await waitFor(() => expect(screen.getByText(`Amlodipine · ${hhmm}`)).toBeTruthy());
    await fireEvent.press(screen.getByText(CARE_V2_COPY.hero.dueAction));
    await waitFor(() =>
      expect(mockTickDose).toHaveBeenCalledWith(
        expect.objectContaining({ planVersionId: "v1", medicineKey: "amlo", status: "taken" }),
      ),
    );
  });

  it("with nothing pressing and a far visit, the week's readings are the card, from the patient's own log", async () => {
    mockLoadCare.mockResolvedValue(care());
    mockReadings.mockReturnValue([
      { at: ago(600_000), input: { kind: "bp", top: 128, bottom: 80 } },
      { at: ago(2 * DAY), input: { kind: "bp", top: 134, bottom: 84 } },
    ]);
    await mount();
    await waitFor(() => expect(screen.getByText("Health trends")).toBeTruthy());
    expect(screen.getByText("Blood pressure")).toBeTruthy();
    expect(screen.getByText("128/80")).toBeTruthy();
    expect(row()).not.toBeNull();
    await fireEvent.press(screen.getByText("Log a reading"));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/care/reading", params: { kind: "bp" } });
    await fireEvent.press(screen.getByText("See all"));
    expect(mockPush).toHaveBeenCalledWith("/care/trends");
  });

  it("a visit tomorrow takes the card back from the week's readings", async () => {
    mockLoadWeek.mockResolvedValue({
      upcoming: [{ id: "a2", status: "booked", startsAtIso: tomorrowIso() }],
      past: [],
    });
    mockLoadCare.mockResolvedValue(care());
    mockReadings.mockReturnValue([
      { at: ago(600_000), input: { kind: "bp", top: 128, bottom: 80 } },
    ]);
    await mount();
    await waitFor(() => expect(screen.getByText("Open your visit")).toBeTruthy());
    expect(screen.queryByText("Health trends")).toBeNull();
    expect(row()).toBeNull();
  });
});
