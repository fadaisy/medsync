import { render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(app)/(tabs)/index";
import { greetingFor } from "@/features/v2/home-route";
import { ThemeProvider } from "@/theme/theme";

/**
 * The signed-in Home route on mocked loaders: it mounts, reads the patient's own rows through the existing
 * loaders, and shows the ticket, the empty state or the failure. No device was available to see it on
 * (18 Nov 2026), so this stands in for opening the screen.
 */
const mockPush = jest.fn();
const mockLoadWeek = jest.fn();
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
jest.mock("@/offline/outbox", () => ({ startOutbox: jest.fn() }));
jest.mock("@/data/signup", () => ({ takeFreshSignup: () => false }));
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { user: { id: "u1", user_metadata: { full_name: "Esther Nakato" } } },
  }),
}));
jest.mock("@/data/notifications", () => ({ useNotifications: () => ({ unread: 2 }) }));
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
  fetchHousehold: async () => [
    { id: "h1", provisionalPatientId: "p1", label: "Mother", relationship: "parent" },
  ],
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

jest.setTimeout(30_000);

describe("the Home route, v2", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLoadWeek.mockReset();
  });

  it("greets by first name, carries the count on the avatar, and shows the next visit as the ticket", async () => {
    mockLoadWeek.mockResolvedValue({
      upcoming: [
        { id: "a2", status: "cancelled", startsAtIso: "2099-01-01T05:00:00.000Z" },
        { id: "a1", status: "booked", startsAtIso: "2099-01-02T05:00:00.000Z" },
      ],
      past: [],
    });
    await mount();
    expect(screen.getByText("Esther")).toBeTruthy();
    expect(screen.getByLabelText("Notifications, 2 new")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("K7M 42Q")).toBeTruthy());
    // The greeting is the page's one large title.
    expect(screen.getByText(/^Good (morning|afternoon|evening)$/)).toBeTruthy();
    // Another day's visit: "Your next visit", the day, the patient's own name on the card, no stage.
    expect(screen.getByText("Your next visit")).toBeTruthy();
    expect(screen.getByText("Friday 20 November")).toBeTruthy();
    expect(screen.getByText(/Esther Nakato/)).toBeTruthy();
    expect(screen.getByLabelText("Book for Mother")).toBeTruthy();
    // The membership card is on Me, not on Home.
    expect(screen.queryByText("Basic")).toBeNull();
    // Care mode is locked, so the ways to the current care screens are there.
    expect(screen.getByText("Your care")).toBeTruthy();
    expect(screen.getByText("Wellness")).toBeTruthy();
  });

  it("with nothing upcoming it shows the empty state", async () => {
    mockLoadWeek.mockResolvedValue({ upcoming: [], past: [] });
    await mount();
    await waitFor(() => expect(screen.getByText("No visit booked")).toBeTruthy());
  });

  it("when the visits cannot be read it says so, not that nothing is booked", async () => {
    mockLoadWeek.mockRejectedValue(new Error("offline"));
    await mount();
    await waitFor(() =>
      expect(screen.getByText("Couldn't load your visits. Check your connection.")).toBeTruthy(),
    );
    expect(screen.queryByText("No visit booked")).toBeNull();
  });

  it("the greeting follows the clock", () => {
    expect(greetingFor(new Date(2026, 10, 18, 8))).toBe("Good morning");
    expect(greetingFor(new Date(2026, 10, 18, 13))).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 10, 18, 19))).toBe("Good evening");
  });
});
