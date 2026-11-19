import type { HomeV2Props } from "@/features/v2/home";
import { stageOf } from "@patient-core/visit-stages";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  AvatarCount,
  VISIT_NAV_GLASS,
  VISIT_PLACES,
  VisitNav,
  visitNavBottom,
} from "@/components/tide/v2-shell";
import { HomeV2View } from "@/features/v2/home";
import { ThemeProvider } from "@/theme/theme";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

const TICKET = {
  hospitalName: "Kampala General Hospital",
  hospitalInitials: "KG",
  day: "16",
  dayLine: "Monday · November",
  window: "08:00 to 10:00",
  doctorTime: false,
  clinic: "General OPD",
  room: null,
  patient: "Esther N.",
  block: null,
  pay: { kind: "free" as const },
  code: "K7M 42Q",
};

const handlers = () => ({
  onOpenVisit: jest.fn(),
  onRetryVisit: jest.fn(),
  onBookToday: jest.fn(),
  onBookDay: jest.fn(),
  onResults: jest.fn(),
  onBookFor: jest.fn(),
  onAddSomeone: jest.fn(),
  onCare: jest.fn(),
  onReadings: jest.fn(),
  onMedicines: jest.fn(),
  onWellness: jest.fn(),
});
const base = (over: Partial<HomeV2Props> = {}): HomeV2Props => ({
  visit: { state: "none" },
  results: { state: "off" },
  household: [],
  careLink: true,
  ...handlers(),
  ...over,
});

jest.setTimeout(30_000);

describe("Home v2 on the phone (feature matrix 3.1)", () => {
  it("with no visit booked it says so, and the two ways to book are there", async () => {
    const p = base();
    await wrap(<HomeV2View {...p} />);
    expect(screen.getByText("No visit booked")).toBeTruthy();
    expect(screen.getByText("Book a clinic day, or come today if it cannot wait.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Come today"));
    await fireEvent.press(screen.getByText("Ask for a day"));
    expect(p.onBookToday).toHaveBeenCalledTimes(1);
    expect(p.onBookDay).toHaveBeenCalledTimes(1);
    // Nothing to open, and no stage strip, without a visit.
    expect(screen.queryByText("Open your visit")).toBeNull();
  });

  it("today's visit shows the code for the desk and the stage in words; another day's has no stage", async () => {
    const p = base({
      visit: { state: "ready", ticket: TICKET, stage: stageOf("arrived", "line"), today: true },
    });
    const view = await wrap(<HomeV2View {...p} />);
    expect(screen.getByText("Today's visit")).toBeTruthy();
    expect(screen.getByText("Show this code at the desk")).toBeTruthy();
    expect(screen.getByText("K7M 42Q")).toBeTruthy();
    // Who the visit is for is on the card: the next visit can be a parent's or a child's.
    expect(screen.getByText(/Esther N\./)).toBeTruthy();
    const stage = stageOf("arrived", "line").label;
    expect(screen.getByText(stage)).toBeTruthy();
    // The stage is words and a bar, never a number (MR4).
    expect(screen.queryByText(/step \d|\d of \d/i)).toBeNull();
    await fireEvent.press(screen.getByText("Open your visit"));
    expect(p.onOpenVisit).toHaveBeenCalledTimes(1);

    await view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <HomeV2View
            {...p}
            visit={{ state: "ready", ticket: TICKET, stage: stageOf("booked", null), today: false }}
          />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText("Your next visit")).toBeTruthy();
    expect(screen.getByText("Monday 16 November")).toBeTruthy();
    expect(screen.queryByText(stage)).toBeNull();
  });

  it("a failed load offers a retry; it never shows an empty Home as if nothing were booked", async () => {
    const p = base({ visit: { state: "failed" } });
    await wrap(<HomeV2View {...p} />);
    expect(screen.queryByText("No visit booked")).toBeNull();
    await fireEvent.press(screen.getByText("Try again"));
    expect(p.onRetryVisit).toHaveBeenCalledTimes(1);
  });

  it("results are free and show no values; the household books by name; the care doors are optional", async () => {
    const p = base({
      results: { state: "ordered", tests: 2, note: "Results come after review." },
      household: [{ id: "h1", label: "Mother" }],
    });
    const view = await wrap(<HomeV2View {...p} />);
    expect(screen.getByText("Always free")).toBeTruthy();
    expect(screen.getByText("2 tests ordered at your visits")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Book for Mother"));
    expect(p.onBookFor).toHaveBeenCalledWith("h1");
    await fireEvent.press(screen.getByText("Your care"));
    expect(p.onCare).toHaveBeenCalledTimes(1);
    // The four doors under "Your care": each opens its own current screen.
    await fireEvent.press(screen.getByLabelText("Readings"));
    await fireEvent.press(screen.getByLabelText("Medicines"));
    await fireEvent.press(screen.getByLabelText("Wellness"));
    expect(p.onReadings).toHaveBeenCalledTimes(1);
    expect(p.onMedicines).toHaveBeenCalledTimes(1);
    expect(p.onWellness).toHaveBeenCalledTimes(1);

    await view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <HomeV2View {...p} careLink={false} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.queryByText("Your care")).toBeNull();
    // Results stay, free, with Care mode's own places in front.
    expect(screen.getByText("Always free")).toBeTruthy();
    // The membership card is on Me: Home never shows a tier.
    expect(screen.queryByText("Basic")).toBeNull();
  });
});

describe("the v2 shell (feature matrix 1.1, 1.3)", () => {
  it("Visit mode's places are Home, Book, Visits, Me, and the plus is still there", async () => {
    expect(VISIT_PLACES.map((p) => p.label)).toEqual(["Home", "Book", "Visits", "Me"]);
    const onNavigate = jest.fn();
    const onPlus = jest.fn();
    await wrap(<VisitNav width={358} current="home" onNavigate={onNavigate} onPlus={onPlus} />);
    expect(screen.getByLabelText("Home").props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText("Book").props.accessibilityState).toMatchObject({
      selected: false,
    });
    expect(screen.queryByLabelText("Care")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Book"));
    expect(onNavigate).toHaveBeenCalledWith("book");
    await fireEvent.press(screen.getByLabelText(/^Add:/));
    expect(onPlus).toHaveBeenCalledTimes(1);
  });

  it("the nav sits just above the home indicator, and off the edge where there is none", () => {
    // 4 pt over the indicator's 34 pt; never closer than 12 pt to the edge of the glass.
    expect(visitNavBottom(34)).toBe(38);
    expect(visitNavBottom(0)).toBe(12);
  });

  it("the pill is glass only where the system has it, and solid where the glass module is missing", () => {
    // jest-expo's mock reports the glass as available, so the test above drew the glass pill.
    expect(VISIT_NAV_GLASS).toBe(true);
    const glassWhen = (isLiquidGlassAvailable: () => boolean) => {
      let mod!: typeof import("@/components/tide/v2-shell");
      jest.isolateModules(() => {
        jest.doMock("expo-glass-effect", () => ({
          GlassView: "GlassView",
          isLiquidGlassAvailable,
        }));
        mod = jest.requireActual("@/components/tide/v2-shell");
      });
      jest.dontMock("expo-glass-effect");
      return mod.VISIT_NAV_GLASS;
    };
    expect(glassWhen(() => false)).toBe(false);
    expect(
      glassWhen(() => {
        throw new Error("Cannot find native module 'ExpoGlassEffect'");
      }),
    ).toBe(false);
  });

  it("the avatar carries the unseen count in its name and opens Notifications", async () => {
    await wrap(<AvatarCount initials="EN" count={3} />);
    await fireEvent.press(screen.getByLabelText("Notifications, 3 new"));
    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });

  it("with nothing unseen the avatar shows no count", async () => {
    await wrap(<AvatarCount initials="EN" />);
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
