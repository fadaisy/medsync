import type { SignupNotice } from "@/data/signup";
import type { SignupDraft, Step } from "@/features/auth/rules";
import type { Patch } from "@/features/auth/steps";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Alert, View } from "react-native";

import { Button, Note, Screen } from "@/components/tide";
import { addPlace, OFF_WORDS } from "@/data/places";
import {
  fetchSignupNotice,
  markFreshSignup,
  signInWithPassword,
  signupFromAppOn,
  submitSignup,
} from "@/data/signup";
import { BarBack, FieldProblem, QuietLink, StepRail, StillNeeded } from "@/features/auth/marks";
import {
  buildSubmission,
  initialDraft,
  reviewRows,
  signupKey,
  stepOfField,
  stepValid,
  stillNeeded,
  typeDob,
} from "@/features/auth/rules";
import {
  AboutStep,
  ConsentStep,
  CreatingStep,
  DoneStep,
  PlaceStep,
  SignInStep,
} from "@/features/auth/steps";
import { track } from "@/lib/analytics";
import { useNow } from "@/lib/use-now";

/**
 * Create an account (Tide v1 F-03, prompt §8.1): four steps and a done
 * screen, on the web's one patient onboarding path.
 *
 * The draft lives in memory only, never on disk. The account is made by the
 * web action; on success the done screen shows, and "Continue" signs in
 * with the same email and password, after which the root gate moves the
 * patient into the app (signing in earlier would drop this screen before
 * "Welcome" could show). Signed in, the pin is saved as the home place if
 * the patient agreed to PLACE_CONSENT (`addPlace`, migration 0185). Home then
 * opens "A few more details" once (`markFreshSignup`).
 *
 * This route holds the draft and talks to the server; `SignUpView` below draws it.
 */
export default function SignUpScreen() {
  const router = useRouter();
  const now = useNow();
  const [step, setStep] = useState<Step | "done">(1);
  const [draft, setDraft] = useState<SignupDraft>(initialDraft);
  // One key per draft, so a retried submit after a lost reply lands once.
  const [key] = useState(() => signupKey());
  const [notice, setNotice] = useState<SignupNotice | null>(null);
  const [noticeTry, setNoticeTry] = useState(0);
  const [noticeLoading, setNoticeLoading] = useState(signupFromAppOn);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Stable, so a step can list it in an effect without re-running it every render.
  const patch = useCallback(
    (next: Partial<SignupDraft>) => setDraft((d) => ({ ...d, ...next })),
    [],
  );

  // Read up front so step 4 shows the live text at once; its version and
  // hash are the ones the answer is bound to.
  useEffect(() => {
    if (!signupFromAppOn) return;
    let live = true;
    void fetchSignupNotice().then((n) => {
      if (!live) return;
      setNotice(n);
      setNoticeLoading(false);
    });
    return () => {
      live = false;
    };
  }, [noticeTry]);

  useEffect(() => {
    if (step !== "done") track("signup_step_viewed", { step });
  }, [step]);

  const onDob = (part: "dobDay" | "dobMonth" | "dobYear", raw: string) => {
    const { draft: next, refused } = typeDob(draft, part, raw, now);
    if (refused) track("signup_refused_age");
    setDraft(next);
  };

  const submit = async () => {
    if (!signupFromAppOn) {
      setProblem("Sign-up from the app is not switched on yet.");
      return;
    }
    const live = notice?.notice;
    if (!notice || !live) return;
    setBusy(true);
    const result = await submitSignup(buildSubmission(draft, live, notice.sms), key);
    setBusy(false);
    if (result.ok) {
      setStep("done");
      return;
    }
    const first = Object.entries(result.fieldErrors ?? {})[0];
    if (first) {
      setStep(stepOfField(first[0]));
      setProblem(
        first[1] === "under_18" ? "You must be 18 or older to create an account." : first[1],
      );
      return;
    }
    setProblem(result.formError ?? "We couldn't create your account. Try again.");
  };

  const goHome = async () => {
    setBusy(true);
    setProblem(null);
    // Before signing in: the gate may swap screens the moment the session lands.
    markFreshSignup();
    const out = await signInWithPassword(draft.email, draft.password);
    setBusy(false);
    // On success the root gate replaces this screen with the app.
    if (!out.ok) {
      setProblem(out.message);
      return;
    }
    // The home place, only with its yes. The screen may already be gone, so a
    // failure is said in a system alert; it never undoes the account.
    const pin = draft.pin;
    if (!draft.pinConsent || !pin) return;
    const saved = await addPlace(
      { kind: "home", customLabel: null, lat: pin.lat, lng: pin.lng, address: pin.address },
      true,
      new Date(),
    );
    if (saved !== "saved")
      Alert.alert(
        "Your home place was not saved",
        saved === "off"
          ? `Your account is ready. ${OFF_WORDS} You can add it later in Me, under My places.`
          : "Your account is ready. We couldn't save the pin, so nothing about your home is kept. You can add it later in Me, under My places.",
      );
  };

  return (
    <SignUpView
      step={step}
      draft={draft}
      today={now}
      patch={patch}
      onDob={onDob}
      notice={notice}
      noticeLoading={noticeLoading}
      onRetryNotice={() => {
        setNoticeLoading(true);
        setNoticeTry((n) => n + 1);
      }}
      busy={busy}
      problem={problem}
      signupOn={signupFromAppOn}
      onCancel={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onGo={(to) => {
        setProblem(null);
        setStep(to);
      }}
      onNext={() => {
        setProblem(null);
        if (step === 4) void submit();
        else if (step !== "done") setStep((step + 1) as Step);
      }}
      onContinue={goHome}
      onSignInInstead={() => router.replace("/sign-in")}
    />
  );
}

export interface SignUpViewProps {
  step: Step | "done";
  draft: SignupDraft;
  today: Date;
  patch: Patch;
  onDob: (part: "dobDay" | "dobMonth" | "dobYear", raw: string) => void;
  notice: SignupNotice | null;
  noticeLoading: boolean;
  onRetryNotice: () => void;
  /** A request is out: the account being made on step 4, or the sign-in after "Continue". */
  busy: boolean;
  /** The server's or the app's own words for what went wrong, or null. */
  problem: string | null;
  /** Whether sign-up from the app is switched on (the build names the web origin). */
  signupOn: boolean;
  /** Leave sign-up from step 1. */
  onCancel: () => void;
  /** Go to a step: Back, a ticked mark of the stepper, or "Change" on the review card. */
  onGo: (step: Step) => void;
  /** The main button of a step: on to the next one, or create the account on step 4. */
  onNext: () => void;
  /** "Continue" on the done screen. */
  onContinue: () => void;
  onSignInInstead: () => void;
}

/**
 * Sign-up as drawn (owner's approved onboarding prototype, 18 Nov 2026): a small title between Back and
 * Help, the stepper, one step, and above the lagoon button the one line that names what is still needed.
 * Everything it shows comes in by props, so `/dev/onboarding` can draw each state with no network.
 */
export function SignUpView({
  step,
  draft,
  today,
  patch,
  onDob,
  notice,
  noticeLoading,
  onRetryNotice,
  busy,
  problem,
  signupOn,
  onCancel,
  onGo,
  onNext,
  onContinue,
  onSignInInstead,
}: SignUpViewProps) {
  if (step === "done")
    return (
      <Screen
        help="pill"
        helpSource="sign-up"
        barTitle="Create an account"
        footer={<Button label="Continue" variant="accent" onPress={onContinue} busy={busy} />}
      >
        <DoneStep firstName={draft.firstName.trim() || "[First name]"} />
        {problem ? (
          <Note key="problem" tone="plain" icon="alert">
            {problem}
          </Note>
        ) : null}
        {problem ? (
          <View key="signin" style={{ alignItems: "flex-start" }}>
            <QuietLink label="Sign in instead" onPress={onSignInInstead} />
          </View>
        ) : null}
      </Screen>
    );

  // The account is being made: the step gives way to the waiting line until the server answers.
  if (step === 4 && busy)
    return (
      <Screen help="pill" helpSource="sign-up" barTitle="Create an account">
        <CreatingStep />
      </Screen>
    );

  // With the web origin unset nothing can be sent. The steps still open so the
  // patient is told in plain words at the end, not by a dead button.
  const valid = stepValid(step, draft, today) || (!signupOn && (step === 2 || step === 4));
  return (
    <Screen
      header={
        step === 1 ? (
          <BarBack label="Cancel" icon="close" onPress={onCancel} />
        ) : (
          <BarBack label="Back" onPress={() => onGo((step - 1) as Step)} />
        )
      }
      help="pill"
      helpSource="sign-up"
      barTitle={`Step ${step} of 4`}
      footer={
        <>
          {valid ? null : <StillNeeded names={stillNeeded(step, draft, today)} />}
          {problem ? <FieldProblem center>{problem}</FieldProblem> : null}
          <Button
            label={step === 4 ? "Create my account" : "Continue"}
            variant="accent"
            onPress={onNext}
            disabled={!valid}
            busy={busy}
          />
        </>
      }
    >
      <StepRail key="progress" step={step} onGo={onGo} />
      {step === 1 ? (
        <AboutStep key="s1" draft={draft} patch={patch} today={today} onDob={onDob} />
      ) : null}
      {step === 2 ? <PlaceStep key="s2" draft={draft} patch={patch} on={signupOn} /> : null}
      {step === 3 ? <SignInStep key="s3" draft={draft} patch={patch} /> : null}
      {step === 4 ? (
        <ConsentStep
          key="s4"
          draft={draft}
          patch={patch}
          notice={notice}
          loading={noticeLoading}
          onRetry={onRetryNotice}
          review={reviewRows(draft)}
          onChange={onGo}
          on={signupOn}
        />
      ) : null}
    </Screen>
  );
}
