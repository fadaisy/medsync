/**
 * `/dev/onboarding?screen=…&scheme=light|dark`: the splash, the welcome, sign-up and sign-in on fixtures, for
 * screenshots. Development builds only (the root layout guards it). Nothing here reaches the network or the
 * session, so it opens the same signed in or out. Invented details; no patient data.
 *
 * `screen` is one of:
 * - `splash-checking`, `splash-syncing`, `splash-ready`: the splash at each of its three status lines.
 *   `splash-run` plays them in turn and then brings the welcome in, on a timer that stands in for the wait.
 * - `welcome-1`, `welcome-2`, `welcome-3`: each welcome slide.
 * - `signup-1`, `signup-1-part`, `signup-1-full`, `signup-1-errors`, `signup-1-minor`; `signup-2`,
 *   `signup-2-full`; `signup-3`, `signup-3-part`, `signup-3-full`, `signup-3-errors`; `signup-4` (the review
 *   card, nothing agreed), `signup-4-full`, `signup-4-loading`, `signup-4-failed` (the notice did not load),
 *   `signup-4-problem` (the server said no); `signup-creating`; `signup-done`.
 * - `signin`, `signin-filled`, `signin-busy`, `signin-error`, `signin-forgot`, `signin-ways` (both other
 *   ways in switched on); `signin-otp`, `signin-otp-bad`; `signin-code`, `signin-code-ready`,
 *   `signin-code-busy`, `signin-code-error`.
 *
 * The fields can be typed in, so the marks and the "Still needed" line can be watched changing. The camera
 * step of "Scan my health card" is unchanged and is not drawn here.
 */
import type { Method } from "@/app/sign-in";
import type { SignupNotice } from "@/data/signup";
import type { SignupDraft, Step } from "@/features/auth/rules";
import type { SlideIndex } from "@/features/auth/welcome";
import { useEffect, useState } from "react";
import { HOME_V2_COPY } from "@content/patient-app/home";
import { useLocalSearchParams } from "expo-router";

import { PasswordFormView, PhoneCodeView, SignInView } from "@/app/sign-in";
import { SignUpView } from "@/app/sign-up";
import { HelpButton } from "@/components/tide";
import { initialDraft, typeDob } from "@/features/auth/rules";
import { SPLASH_STATUS, SplashView } from "@/features/auth/welcome";
import { useTheme } from "@/theme/theme";

/** A fixed day, so the date-of-birth states read the same whenever the screenshot is taken. */
const TODAY = new Date("2026-11-18T09:00:00.000Z");
const nothing = () => undefined;

/* ─── Sign-up fixtures ───────────────────────────────────────────────── */

const ABOUT: Partial<SignupDraft> = {
  firstName: "Sarah",
  surname: "Nakato",
  sex: "female",
  dobDay: "04",
  dobMonth: "07",
  dobYear: "1988",
  phone: "772 000 000",
};
const PLACE: Partial<SignupDraft> = {
  place: { code: "fx-kawempe", label: "Kawempe Division, Kampala" },
  village: "Bwaise II, near the market",
};
const SIGN_IN: Partial<SignupDraft> = {
  email: "sarah@example.com",
  password: "a short sentence 42",
};
const ALL = { ...ABOUT, ...PLACE, ...SIGN_IN };

/** The notice as the web sends it, with stand-in words where the hospital system's own text goes. */
const NOTICE: SignupNotice = {
  open: true,
  notice: {
    version: "[version]",
    sha: "fixture",
    body: "[The full notice, exactly as the hospital system sends it]",
    effective: "[date]",
  },
  summary: [
    "We use what you enter to run your account and to connect you with partner facilities.",
    "We never share details that identify you with anyone for marketing.",
    "You can ask us for a copy of your data, or to delete it, at any time.",
  ],
  agree: "I agree to MedSync's data-processing notice",
  sms: {
    version: "[version]",
    sha: "fixture",
    label: "Send me SMS about my bookings",
    body: "MedSync may send SMS about your bookings: confirmation, reminders and changes. No marketing. Reply STOP to opt out.",
    declined:
      "Without SMS we can only reach you inside the app. People who turn this off miss visits more often.",
    receipt: "You will still get one SMS with the code each time you book.",
  },
};

interface SignUpFixture {
  step: Step | "done";
  draft?: Partial<SignupDraft>;
  busy?: boolean;
  problem?: string;
  notice?: SignupNotice | null;
  noticeLoading?: boolean;
}

const SIGN_UP: Record<string, SignUpFixture> = {
  "signup-1": { step: 1 },
  "signup-1-part": { step: 1, draft: { firstName: "Sarah", sex: "female" } },
  "signup-1-full": { step: 1, draft: ABOUT },
  // 31 February, and nine digits that do not start with 7.
  "signup-1-errors": {
    step: 1,
    draft: { ...ABOUT, dobDay: "31", dobMonth: "02", dobYear: "1990", phone: "412 345 678" },
  },
  "signup-1-minor": {
    step: 1,
    draft: { firstName: "Sarah", surname: "Nakato", refusedMinor: true },
  },
  "signup-2": { step: 2, draft: ABOUT },
  "signup-2-full": { step: 2, draft: { ...ABOUT, ...PLACE } },
  "signup-3": { step: 3, draft: { ...ABOUT, ...PLACE } },
  "signup-3-part": {
    step: 3,
    draft: { ...ABOUT, ...PLACE, email: "sarah@example.com", password: "a short" },
  },
  "signup-3-full": { step: 3, draft: ALL },
  // Not an email, and a password past the server's 72-byte limit.
  "signup-3-errors": {
    step: 3,
    draft: { ...ABOUT, ...PLACE, email: "sarah@example", password: "a sentence ".repeat(8) },
  },
  "signup-4": { step: 4, draft: ALL },
  "signup-4-full": { step: 4, draft: { ...ALL, consent: true, sms: true } },
  "signup-4-loading": { step: 4, draft: ALL, notice: null, noticeLoading: true },
  "signup-4-failed": { step: 4, draft: ALL, notice: null },
  "signup-4-problem": {
    step: 4,
    draft: { ...ALL, consent: true },
    problem: "We couldn't create your account. Try again.",
  },
  "signup-creating": { step: 4, draft: { ...ALL, consent: true }, busy: true },
  "signup-done": { step: "done", draft: ALL },
};

function SignUpState({ fixture }: { fixture: SignUpFixture }) {
  const [step, setStep] = useState(fixture.step);
  const [draft, setDraft] = useState<SignupDraft>(() => ({ ...initialDraft(), ...fixture.draft }));
  return (
    <SignUpView
      step={step}
      draft={draft}
      today={TODAY}
      patch={(next) => setDraft((d) => ({ ...d, ...next }))}
      onDob={(part, raw) => setDraft(typeDob(draft, part, raw, TODAY).draft)}
      notice={fixture.notice === undefined ? NOTICE : fixture.notice}
      noticeLoading={fixture.noticeLoading ?? false}
      onRetryNotice={nothing}
      busy={fixture.busy ?? false}
      problem={fixture.problem ?? null}
      signupOn
      onCancel={nothing}
      onGo={setStep}
      // Moves on a step so the stepper can be seen; the gallery never sends anything.
      onNext={() => setStep((s) => (s === "done" || s === 4 ? s : ((s + 1) as Step)))}
      onContinue={nothing}
      onSignInInstead={nothing}
    />
  );
}

/* ─── Sign-in fixtures ───────────────────────────────────────────────── */

const WRONG = "That email and password don't match. Check them and try again.";
const BAD_CODE = "That code didn't work. Check it, or send a new one.";

interface SignInFixture {
  method: Method;
  ways?: boolean;
  email?: string;
  pw?: string;
  busy?: boolean;
  error?: string;
  forgot?: boolean;
  phone?: string;
  code?: string;
  sent?: boolean;
  resendIn?: number;
}

const SIGN_IN_STATES: Record<string, SignInFixture> = {
  signin: { method: "pass" },
  "signin-filled": { method: "pass", email: "sarah@example.com", pw: "a short sentence 42" },
  "signin-busy": {
    method: "pass",
    email: "sarah@example.com",
    pw: "a short sentence 42",
    busy: true,
  },
  "signin-error": { method: "pass", email: "sarah@example.com", pw: "not this one", error: WRONG },
  "signin-forgot": { method: "pass", email: "sarah@example.com", forgot: true },
  "signin-ways": { method: "pass", ways: true },
  "signin-otp": { method: "otp" },
  "signin-otp-bad": { method: "otp", phone: "412 345 678" },
  "signin-code": { method: "otp", phone: "772 000 000", sent: true, code: "418", resendIn: 42 },
  "signin-code-ready": { method: "otp", phone: "772 000 000", sent: true, code: "418205" },
  "signin-code-busy": {
    method: "otp",
    phone: "772 000 000",
    sent: true,
    code: "418205",
    busy: true,
  },
  "signin-code-error": {
    method: "otp",
    phone: "772 000 000",
    sent: true,
    code: "000000",
    error: BAD_CODE,
  },
};

function SignInState({ fixture }: { fixture: SignInFixture }) {
  const [method, setMethod] = useState<Method>(fixture.method);
  const [email, setEmail] = useState(fixture.email ?? "");
  const [pw, setPw] = useState(fixture.pw ?? "");
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(fixture.forgot ?? false);
  const [phone, setPhone] = useState(fixture.phone ?? "");
  const [code, setCode] = useState(fixture.code ?? "");
  const [sent, setSent] = useState(fixture.sent ?? false);
  const ways = fixture.ways ?? false;
  return (
    <SignInView
      method={method}
      otpOn={ways}
      qrOn={ways}
      // The camera step is not drawn here, so "Scan my health card" stays on the password form.
      onMethod={(next) => setMethod(next === "scan" ? "pass" : next)}
      onBack={nothing}
      onSignUp={nothing}
    >
      {method === "otp" ? (
        <PhoneCodeView
          phone={phone}
          code={code}
          sent={sent}
          resendIn={fixture.resendIn ?? 0}
          sending={false}
          verifying={fixture.busy ?? false}
          error={fixture.error ?? null}
          onPhone={setPhone}
          onCode={setCode}
          onSend={() => setSent(true)}
          onVerify={nothing}
          onChangeNumber={() => setSent(false)}
        />
      ) : (
        <PasswordFormView
          email={email}
          pw={pw}
          show={show}
          busy={fixture.busy ?? false}
          error={fixture.error ?? null}
          forgot={forgot}
          onEmail={setEmail}
          onPw={setPw}
          onToggleShow={() => setShow((s) => !s)}
          onForgot={() => setForgot(true)}
          onSubmit={nothing}
        />
      )}
    </SignInView>
  );
}

/* ─── The splash and the welcome ─────────────────────────────────────── */

const SPLASH: Record<string, { line: 0 | 1 | 2; welcome: boolean; slide?: SlideIndex }> = {
  "splash-checking": { line: 0, welcome: false },
  "splash-syncing": { line: 1, welcome: false },
  "splash-ready": { line: 2, welcome: false },
  "welcome-1": { line: 2, welcome: true, slide: 0 },
  "welcome-2": { line: 2, welcome: true, slide: 1 },
  "welcome-3": { line: 2, welcome: true, slide: 2 },
};

/** The three lines in turn, then the welcome. The pauses stand in for the wait; nothing is loaded. */
function SplashRun() {
  const [at, setAt] = useState<0 | 1 | 2 | 3>(0);
  useEffect(() => {
    const ids = [
      setTimeout(() => setAt(1), 1500),
      setTimeout(() => setAt(2), 3200),
      setTimeout(() => setAt(3), 4200),
    ];
    return () => ids.forEach(clearTimeout);
  }, []);
  const line = at === 3 ? 2 : at;
  return (
    <SplashView
      line={line}
      status={SPLASH_STATUS[line]}
      tagline={HOME_V2_COPY.phone.tagline}
      welcome={at === 3}
      help={<HelpButton variant="pill" source="dev" />}
      onSignIn={nothing}
      onGetStarted={nothing}
    />
  );
}

export default function DevOnboarding() {
  const { screen = "welcome-1", scheme } = useLocalSearchParams<{
    screen?: string;
    scheme?: string;
  }>();
  const { setPreference } = useTheme();
  useEffect(() => {
    if (scheme === "dark" || scheme === "light") setPreference(scheme);
  }, [scheme, setPreference]);

  const signUp = SIGN_UP[screen];
  // Keyed by the state, so opening another one starts from its own fixture.
  if (signUp) return <SignUpState key={screen} fixture={signUp} />;
  const signIn = SIGN_IN_STATES[screen];
  if (signIn) return <SignInState key={screen} fixture={signIn} />;
  if (screen === "splash-run") return <SplashRun />;
  const splash = SPLASH[screen] ?? SPLASH["welcome-1"];
  return (
    <SplashView
      key={screen}
      line={splash.line}
      status={SPLASH_STATUS[splash.line]}
      tagline={HOME_V2_COPY.phone.tagline}
      welcome={splash.welcome}
      initialSlide={splash.slide}
      help={<HelpButton variant="pill" source="dev" />}
      onSignIn={nothing}
      onGetStarted={nothing}
    />
  );
}
