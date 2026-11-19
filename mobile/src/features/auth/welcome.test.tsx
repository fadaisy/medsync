import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SLIDES, SPLASH_STATUS, SplashView } from "@/features/auth/welcome";
import { HONEST } from "@/features/visits/parts";
import { ThemeProvider } from "@/theme/theme";

/**
 * The splash and the welcome as drawn from the owner's approved onboarding prototype (18 Nov 2026). The
 * view is told which status line the wait has reached and whether the welcome has arrived; the route
 * (`app/index.tsx`) decides both exactly as before.
 */
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));
jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("@/lib/analytics", () => ({ track: jest.fn(), sinceBoot: () => 0 }));
jest.mock("@/offline/outbox", () => ({ startOutbox: jest.fn(), enqueue: jest.fn() }));

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

jest.setTimeout(30_000);

describe("the splash and the welcome", () => {
  const splash = (over: Partial<React.ComponentProps<typeof SplashView>>) => (
    <SplashView
      line={0}
      status={SPLASH_STATUS[0]}
      tagline="Book your clinic visit from home."
      welcome={false}
      help={<Text>Help</Text>}
      onSignIn={jest.fn()}
      onGetStarted={jest.fn()}
      {...over}
    />
  );

  it("keeps the app's three status lines", () => {
    expect(SPLASH_STATUS).toEqual([
      "Checking your records",
      "Syncing your readings and medicines",
      "Ready · works offline too",
    ]);
  });

  it("keeps the signed wording of the three slides", () => {
    expect(SLIDES.map((s) => `${s.lead} ${s.rest}`)).toEqual([
      "Book from anywhere. Pick a clinic and a day that suits you.",
      "Your ticket, on your phone. Show it at the desk, then see where you are in your visit.",
      "Book for your family. A parent or a child, in the same app.",
    ]);
  });

  it("while the app opens: the name, its line's words and Help, and no way in yet", async () => {
    await wrap(splash({ line: 1, status: SPLASH_STATUS[1] }));
    expect(screen.getByLabelText("Tether. Book your clinic visit from home.")).toBeTruthy();
    expect(screen.getByText("Syncing your readings and medicines")).toBeTruthy();
    expect(screen.getByText("Help")).toBeTruthy();
    expect(screen.queryByText("Get started")).toBeNull();
    expect(screen.queryByText("Sign in")).toBeNull();
  });

  it("the welcome: three slides, one way in, the honesty line and Sign in", async () => {
    const onSignIn = jest.fn();
    const onGetStarted = jest.fn();
    await wrap(
      splash({ line: 2, status: SPLASH_STATUS[2], welcome: true, onSignIn, onGetStarted }),
    );
    expect(screen.getByText("Help")).toBeTruthy();
    expect(screen.getByText(HONEST)).toBeTruthy();
    expect(screen.getByText(/^Book from anywhere\./)).toBeTruthy();
    // The other two headlines wait their turn, hidden from screen readers.
    expect(screen.queryByText(/^Your ticket, on your phone\./)).toBeNull();
    expect(
      screen.getByLabelText("Slide 1 of 3: Book from anywhere").props.accessibilityState,
    ).toMatchObject({ selected: true });

    await fireEvent.press(screen.getByLabelText("Slide 3 of 3: Book for your family"));
    expect(screen.getByText(/^Book for your family\./)).toBeTruthy();
    expect(screen.queryByText(/^Book from anywhere\./)).toBeNull();
    // Tapping the picture moves on, and comes round to the first slide again.
    await fireEvent.press(screen.getByLabelText("Next: Book from anywhere"));
    expect(screen.getByText(/^Book from anywhere\./)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Next: Your ticket, on your phone"));
    expect(screen.getByText(/^Your ticket, on your phone\./)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Sign in"));
    await fireEvent.press(screen.getByLabelText("Get started"));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onGetStarted).toHaveBeenCalledTimes(1);
  });

  it("the pictures are decoration: drawn, and hidden from screen readers", async () => {
    await wrap(splash({ line: 2, status: SPLASH_STATUS[2], welcome: true }));
    expect(screen.queryByText("See a doctor")).toBeNull();
    expect(screen.queryByText("K7M-42Q")).toBeNull();
    expect(screen.getByText("See a doctor", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("People you book for", { includeHiddenElements: true })).toBeTruthy();
  });
});
