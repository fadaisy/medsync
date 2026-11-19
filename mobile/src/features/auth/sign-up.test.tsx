import type { SignUpViewProps } from "@/app/sign-up";
import type { SignupNotice } from "@/data/signup";
import type { SignupDraft, Step } from "@/features/auth/rules";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SignUpView } from "@/app/sign-up";
import { StatusField, stepLabel, StepRail, StillNeeded } from "@/features/auth/marks";
import {
  initialDraft,
  MINOR_NOTE,
  reviewRows,
  stepValid,
  stillNeeded,
} from "@/features/auth/rules";
import { AboutStep, ConsentStep } from "@/features/auth/steps";
import { ThemeProvider } from "@/theme/theme";

/**
 * Sign-up as drawn from the owner's approved onboarding prototype (18 Nov 2026), on fixtures: the stepper,
 * the marks on the fields, the "Still needed" line, the review card and the creating state. The view takes
 * everything by props, so nothing here reaches a server. What sign-up asks for and the legal wording are
 * unchanged, and the last tests hold that.
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

const TODAY = new Date("2026-11-18T09:00:00.000Z");
const PASSWORD = "a short sentence 42";
const FULL: SignupDraft = {
  ...initialDraft(),
  firstName: "Sarah",
  surname: "Nakato",
  sex: "female",
  dobDay: "04",
  dobMonth: "07",
  dobYear: "1988",
  phone: "772 000 000",
  place: { code: "fx-1", label: "Kawempe Division, Kampala" },
  village: "Bwaise II",
  email: "sarah@example.com",
  password: PASSWORD,
};

/** The legal words as the web sends them. The phone must show them exactly, "MedSync" included. */
const NOTICE: SignupNotice = {
  open: true,
  notice: {
    version: "v3",
    sha: "abc",
    body: "The full notice. MedSync keeps your records for your care.",
    effective: "1 Nov 2026",
  },
  summary: [
    "We use what you enter to run your account and to connect you with partner facilities.",
    "We never share details that identify you with anyone for marketing.",
  ],
  agree: "I agree to MedSync's data-processing notice",
  sms: {
    version: "s2",
    sha: "def",
    label: "Send me SMS about my bookings",
    body: "MedSync may send SMS about your bookings: confirmation, reminders and changes. No marketing. Reply STOP to opt out.",
    declined:
      "Without SMS we can only reach you inside the app. People who turn this off miss visits more often.",
    receipt: "You will still get one SMS with the code each time you book.",
  },
};

const signUp = (over: Partial<SignUpViewProps>) => (
  <SignUpView
    step={1}
    draft={initialDraft()}
    today={TODAY}
    patch={jest.fn()}
    onDob={jest.fn()}
    notice={NOTICE}
    noticeLoading={false}
    onRetryNotice={jest.fn()}
    busy={false}
    problem={null}
    signupOn
    onCancel={jest.fn()}
    onGo={jest.fn()}
    onNext={jest.fn()}
    onContinue={jest.fn()}
    onSignInInstead={jest.fn()}
    {...over}
  />
);

jest.setTimeout(30_000);

describe("the stepper", () => {
  it("says each step's state in words", () => {
    expect(stepLabel(1, 3)).toBe("Step 1 of 4, About you, done. Go back to it.");
    expect(stepLabel(3, 3)).toBe("Step 3 of 4, Your sign-in, this step");
    expect(stepLabel(4, 3)).toBe("Step 4 of 4, Consent, still to come");
  });

  it("names the current step, and goes back only to a finished one", async () => {
    const onGo = jest.fn();
    await wrap(<StepRail step={3} onGo={onGo} />);
    // Only the step you are on carries its name.
    expect(screen.getByText("Your sign-in")).toBeTruthy();
    expect(screen.queryByText("About you")).toBeNull();
    expect(screen.queryByText("Consent")).toBeNull();

    const current = screen.getByLabelText("Step 3 of 4, Your sign-in, this step");
    expect(current.props.accessibilityState).toMatchObject({ selected: true, disabled: true });
    const later = screen.getByLabelText("Step 4 of 4, Consent, still to come");
    expect(later.props.accessibilityState).toMatchObject({ disabled: true });

    await fireEvent.press(current);
    await fireEvent.press(later);
    expect(onGo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Step 1 of 4, About you, done. Go back to it."));
    await fireEvent.press(
      screen.getByLabelText("Step 2 of 4, Where you live, done. Go back to it."),
    );
    expect(onGo.mock.calls).toEqual([[1], [2]]);
  });

  it("the page's title is the count, and a ticked step and Back both go back", async () => {
    const onGo = jest.fn();
    await wrap(signUp({ step: 2, draft: FULL, onGo }));
    expect(screen.getByText("Step 2 of 4")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Step 1 of 4, About you, done. Go back to it."));
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(onGo.mock.calls).toEqual([[1], [1]]);
  });
});

describe("a field shows its state at its right end", () => {
  const field = (state: "idle" | "good" | "bad" | "opt", error?: string) => (
    <StatusField
      label="Email"
      value={state === "idle" || state === "opt" ? "" : "sarah"}
      onChangeText={jest.fn()}
      state={state}
      icon="mail"
      error={error}
    />
  );

  it("untouched: its own icon, read as not filled in yet", async () => {
    await wrap(field("idle", "Enter a valid email, like name@example.com"));
    expect(screen.getByLabelText("Not filled in yet")).toBeTruthy();
    // The words for a mistake wait until there is one.
    expect(screen.queryByText("Enter a valid email, like name@example.com")).toBeNull();
  });

  it("good: the tick, read as good", async () => {
    await wrap(field("good", "Enter a valid email, like name@example.com"));
    expect(screen.getByLabelText("Good")).toBeTruthy();
    expect(screen.queryByText("Enter a valid email, like name@example.com")).toBeNull();
  });

  it("needs fixing: the triangle, with the real words under it", async () => {
    await wrap(field("bad", "Enter a valid email, like name@example.com"));
    expect(screen.getByLabelText("Needs fixing")).toBeTruthy();
    expect(screen.getByText("Enter a valid email, like name@example.com")).toBeTruthy();
  });

  it("may stay empty: the word Optional", async () => {
    await wrap(field("opt"));
    expect(screen.getByLabelText("Optional")).toBeTruthy();
    expect(screen.getByText("Optional")).toBeTruthy();
  });

  it("the steps mark their own fields from the app's rules", async () => {
    await wrap(
      <AboutStep
        draft={{ ...FULL, dobDay: "31", dobMonth: "02", dobYear: "1990", phone: "412 345 678" }}
        patch={jest.fn()}
        today={TODAY}
        onDob={jest.fn()}
      />,
    );
    // Two names good; the date and the number need fixing, each with the app's own words.
    expect(screen.getAllByLabelText("Good")).toHaveLength(2);
    expect(screen.getAllByLabelText("Needs fixing")).toHaveLength(2);
    expect(screen.getByText("That date does not exist. Check the day and month.")).toBeTruthy();
    expect(screen.getByText("Ugandan mobile numbers start with 7, like 772 000 000")).toBeTruthy();
    // Sex at birth: the chosen tile is the checked one.
    expect(screen.getByLabelText("Female").props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByLabelText("Male").props.accessibilityState).toMatchObject({
      checked: false,
    });
  });
});

describe("the Still needed line", () => {
  it("names what each step is waiting for, in the fields' own names", () => {
    const blank = initialDraft();
    expect(stillNeeded(1, blank, TODAY)).toEqual([
      "First name",
      "Surname",
      "Sex at birth",
      "Date of birth",
      "Mobile number",
    ]);
    expect(stillNeeded(2, blank, TODAY)).toEqual(["District or subcounty"]);
    expect(stillNeeded(3, blank, TODAY)).toEqual(["Email", "Password"]);
    expect(stillNeeded(4, blank, TODAY)).toEqual(["Your agreement to the notice"]);
    expect(stillNeeded(1, { ...FULL, phone: "772 000" }, TODAY)).toEqual(["Mobile number"]);
  });

  it("is empty exactly when the step is valid", () => {
    const drafts: SignupDraft[] = [
      initialDraft(),
      FULL,
      { ...FULL, consent: true },
      { ...FULL, surname: " " },
      { ...FULL, dobYear: "2020" },
      { ...FULL, place: null },
      { ...FULL, email: "sarah@example" },
      { ...FULL, password: "short" },
      { ...FULL, password: "a sentence ".repeat(8) },
      { ...FULL, village: "x".repeat(201) },
    ];
    for (const d of drafts)
      for (const step of [1, 2, 3, 4] as Step[])
        expect(stillNeeded(step, d, TODAY).length === 0).toBe(stepValid(step, d, TODAY));
  });

  it("shows above a button that cannot be pressed yet, and goes when the step is complete", async () => {
    const onNext = jest.fn();
    const view = await wrap(signUp({ step: 1, onNext }));
    expect(
      screen.getByText(
        "Still needed: First name, Surname, Sex at birth, Date of birth, Mobile number",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Continue").props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByLabelText("Continue"));
    expect(onNext).not.toHaveBeenCalled();

    await view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>{signUp({ step: 1, draft: FULL, onNext })}</ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.queryByText(/^Still needed/)).toBeNull();
    await fireEvent.press(screen.getByLabelText("Continue"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("says nothing when nothing is needed", async () => {
    await wrap(
      <>
        <StillNeeded names={[]} />
        <Text>end</Text>
      </>,
    );
    expect(screen.queryByText(/Still needed/)).toBeNull();
  });
});

describe("Your details, on the consent step", () => {
  it("is built from the three finished steps and never reads the password", () => {
    const rows = reviewRows(FULL);
    expect(rows).toEqual([
      { step: 1, name: "About you", value: "Sarah Nakato" },
      { step: 2, name: "Where you live", value: "Kawempe Division, Kampala" },
      { step: 3, name: "Your sign-in", value: "sarah@example.com" },
    ]);
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
  });

  it("shows what was entered with a way back to each step, and the password nowhere", async () => {
    const onGo = jest.fn();
    const view = await wrap(signUp({ step: 4, draft: FULL, onGo }));
    expect(screen.getByText("Your details")).toBeTruthy();
    expect(screen.getByText("Sarah Nakato")).toBeTruthy();
    expect(screen.getByText("Kawempe Division, Kampala")).toBeTruthy();
    expect(screen.getByText("sarah@example.com")).toBeTruthy();
    expect(screen.getAllByText("Change")).toHaveLength(3);

    expect(screen.queryByText(PASSWORD)).toBeNull();
    expect(JSON.stringify(view.toJSON())).not.toContain(PASSWORD);

    await fireEvent.press(screen.getByLabelText("Change About you"));
    await fireEvent.press(screen.getByLabelText("Change Where you live"));
    await fireEvent.press(screen.getByLabelText("Change Your sign-in"));
    expect(onGo.mock.calls).toEqual([[1], [2], [3]]);
  });
});

describe("the consent and SMS wording is unchanged", () => {
  it("shows the notice, the agreement and the SMS words exactly as they are sent", async () => {
    const patch = jest.fn();
    await wrap(
      <ConsentStep
        draft={FULL}
        patch={patch}
        notice={NOTICE}
        loading={false}
        onRetry={jest.fn()}
        review={reviewRows(FULL)}
        onChange={jest.fn()}
        on
      />,
    );
    expect(screen.getByText("Your consent")).toBeTruthy();
    expect(screen.getByText("Please read this before we create your account.")).toBeTruthy();
    expect(screen.getByText("How we use your data")).toBeTruthy();
    expect(screen.getByText("Notice v3")).toBeTruthy();
    for (const line of NOTICE.summary) expect(screen.getByText(line)).toBeTruthy();

    expect(screen.getByText("I agree to MedSync's data-processing notice")).toBeTruthy();
    expect(screen.getByText("Required to create your account")).toBeTruthy();
    expect(screen.getByText("Send me SMS about my bookings")).toBeTruthy();
    expect(
      screen.getByText(
        "MedSync may send SMS about your bookings: confirmation, reminders and changes. No marketing. Reply STOP to opt out. Without SMS we can only reach you inside the app. People who turn this off miss visits more often. You will still get one SMS with the code each time you book.",
      ),
    ).toBeTruthy();

    // The full text opens in place, word for word.
    expect(screen.queryByText(NOTICE.notice!.body)).toBeNull();
    await fireEvent.press(screen.getByText("Read the full notice (v3, effective 1 Nov 2026)"));
    expect(
      screen.getByText("The full notice. MedSync keeps your records for your care."),
    ).toBeTruthy();
    expect(screen.getByText("Hide the full notice")).toBeTruthy();

    // Both boxes start unticked, and each is its own answer (law L9).
    const agree = screen.getByLabelText(
      "I agree to MedSync's data-processing notice. Required to create your account",
    );
    expect(agree.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(agree);
    expect(patch).toHaveBeenLastCalledWith({ consent: true });
    await fireEvent.press(screen.getByText("Send me SMS about my bookings"));
    expect(patch).toHaveBeenLastCalledWith({ sms: true });
  });

  it("keeps the 18-or-older words, with the name they carry", async () => {
    expect(MINOR_NOTE).toBe(
      'Tether accounts are for adults. A parent or guardian can add a child from their own account, under "People I care for".',
    );
    await wrap(
      <AboutStep
        draft={{ ...initialDraft(), refusedMinor: true }}
        patch={jest.fn()}
        today={TODAY}
        onDob={jest.fn()}
      />,
    );
    expect(
      screen.getByText(
        'You must be 18 or older to create an account. Tether accounts are for adults. A parent or guardian can add a child from their own account, under "People I care for".',
      ),
    ).toBeTruthy();
  });

  it("says so in the app's words when the notice cannot be shown", async () => {
    const view = await wrap(signUp({ step: 4, draft: FULL, notice: null }));
    expect(
      screen.getByText("We couldn't load the data notice. Check your connection and try again."),
    ).toBeTruthy();
    await view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          {signUp({ step: 4, draft: FULL, notice: null, noticeLoading: true })}
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText("Loading the data notice…")).toBeTruthy();
  });
});

describe("creating the account, and the finish", () => {
  it("shows Creating your account while the answer is awaited, with no button to press twice", async () => {
    await wrap(signUp({ step: 4, draft: { ...FULL, consent: true }, busy: true }));
    expect(screen.getByText("Creating your account")).toBeTruthy();
    expect(screen.queryByText("Create my account")).toBeNull();
    expect(screen.queryByText("Your details")).toBeNull();
    // Help stays (law L6).
    expect(screen.getByLabelText("Help, emergency")).toBeTruthy();
  });

  it("says what went wrong on the step, in the app's words, above the button", async () => {
    const onNext = jest.fn();
    await wrap(
      signUp({
        step: 4,
        draft: { ...FULL, consent: true },
        problem: "We couldn't create your account. Try again.",
        onNext,
      }),
    );
    expect(screen.getByText("We couldn't create your account. Try again.")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Create my account"));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("ends on the finish the app already has", async () => {
    const onContinue = jest.fn();
    await wrap(signUp({ step: "done", draft: FULL, onContinue }));
    expect(screen.getByText("Welcome, Sarah")).toBeTruthy();
    expect(
      screen.getByText("Your account is ready. Your Tether number is given at your first visit."),
    ).toBeTruthy();
    expect(screen.getByText("Next, a few details")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
