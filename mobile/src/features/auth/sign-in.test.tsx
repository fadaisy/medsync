import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PasswordFormView, PhoneCodeView, SignInView } from "@/app/sign-in";
import { ThemeProvider } from "@/theme/theme";

/**
 * Sign-in as drawn from the owner's approved onboarding prototype (18 Nov 2026), on fixtures. The forms take
 * everything by props, so nothing here signs anyone in. The other ways in show under the same conditions
 * as before.
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
jest.mock("@/data/signup", () => ({
  signupFromAppOn: true,
  searchPlaces: jest.fn(async () => []),
  fetchSignupNotice: jest.fn(async () => null),
  markFreshSignup: jest.fn(),
  signInWithPassword: jest.fn(),
  sendPhoneCode: jest.fn(),
  verifyPhoneCode: jest.fn(),
  submitSignup: jest.fn(),
}));
jest.mock("@/data/places", () => ({
  PLACE_CONSENT: jest.requireActual("@patient-core/me-places").PLACE_CONSENT,
  OFF_WORDS: "",
  addPlace: jest.fn(),
}));
jest.mock("@/features/auth/scan-view", () => ({ ScanView: () => null }));

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

const PASSWORD = "a short sentence 42";

jest.setTimeout(30_000);

describe("sign-in", () => {
  const password = (over: Partial<React.ComponentProps<typeof PasswordFormView>>) => (
    <PasswordFormView
      email="sarah@example.com"
      pw={PASSWORD}
      show={false}
      busy={false}
      error={null}
      forgot={false}
      onEmail={jest.fn()}
      onPw={jest.fn()}
      onToggleShow={jest.fn()}
      onForgot={jest.fn()}
      onSubmit={jest.fn()}
      {...over}
    />
  );

  it("the button says Signing in while it works, and cannot be pressed again", async () => {
    const onSubmit = jest.fn();
    await wrap(password({ busy: true, onSubmit }));
    const button = screen.getByLabelText("Signing in");
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(button);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByText("Sign in")).toBeNull();
  });

  it("waits for an email and a password, then sends them", async () => {
    const onSubmit = jest.fn();
    const view = await wrap(password({ email: "sarah", onSubmit }));
    expect(screen.getByLabelText("Sign in").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>{password({ onSubmit })}</ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByLabelText("Good")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Sign in"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("puts the real wrong-details words under the password, with the triangle", async () => {
    await wrap(
      password({ error: "That email and password don't match. Check them and try again." }),
    );
    expect(screen.getByLabelText("Needs fixing")).toBeTruthy();
    expect(
      screen.getByText("That email and password don't match. Check them and try again."),
    ).toBeTruthy();
  });

  it("shows the other ways in only where they are switched on, as today", async () => {
    const onMethod = jest.fn();
    const frame = (otpOn: boolean, qrOn: boolean) => (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <SignInView
            method="pass"
            otpOn={otpOn}
            qrOn={qrOn}
            onMethod={onMethod}
            onBack={jest.fn()}
            onSignUp={jest.fn()}
          >
            {password({})}
          </SignInView>
        </ThemeProvider>
      </SafeAreaProvider>
    );
    const view = await render(frame(false, false));
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(screen.getByLabelText("Help, emergency")).toBeTruthy();
    expect(screen.queryByText("Text me a code")).toBeNull();
    expect(screen.queryByText("Scan my health card")).toBeNull();

    await view.rerender(frame(true, false));
    expect(screen.getByText("Text me a code")).toBeTruthy();
    expect(screen.queryByText("Scan my health card")).toBeNull();

    await view.rerender(frame(true, true));
    await fireEvent.press(screen.getByText("Text me a code"));
    await fireEvent.press(screen.getByText("Scan my health card"));
    expect(onMethod.mock.calls).toEqual([["otp"], ["scan"]]);
  });

  it("the foot of the page leads to sign-up", async () => {
    const onSignUp = jest.fn();
    await wrap(
      <SignInView
        method="otp"
        otpOn
        qrOn
        onMethod={jest.fn()}
        onBack={jest.fn()}
        onSignUp={onSignUp}
      >
        <Text>form</Text>
      </SignInView>,
    );
    // Another way in is open, so the other ways are not offered again; the way back to the password is.
    expect(screen.queryByText("Text me a code")).toBeNull();
    expect(screen.getByText("Use my password instead")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("New to Tether? Create an account"));
    expect(onSignUp).toHaveBeenCalledTimes(1);
  });

  it("asks for the texted code in six boxes, and signs in only with all six", async () => {
    const onVerify = jest.fn();
    const code = (value: string, over = {}) => (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <PhoneCodeView
            phone="772 000 000"
            code={value}
            sent
            resendIn={42}
            sending={false}
            verifying={false}
            error={null}
            onPhone={jest.fn()}
            onCode={jest.fn()}
            onSend={jest.fn()}
            onVerify={onVerify}
            onChangeNumber={jest.fn()}
            {...over}
          />
        </ThemeProvider>
      </SafeAreaProvider>
    );
    const view = await render(code("418"));
    expect(screen.getByLabelText("6-digit code")).toBeTruthy();
    expect(screen.getByText("Send again in 0:42")).toBeTruthy();
    expect(screen.getByLabelText("Sign in").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await view.rerender(code("418205", { resendIn: 0 }));
    expect(screen.getByText("Send again")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Sign in"));
    expect(onVerify).toHaveBeenCalledTimes(1);

    await view.rerender(
      code("000000", { error: "That code didn't work. Check it, or send a new one." }),
    );
    expect(screen.getByText("That code didn't work. Check it, or send a new one.")).toBeTruthy();
    await view.rerender(code("418205", { verifying: true }));
    expect(screen.getByLabelText("Signing in")).toBeTruthy();
  });
});
