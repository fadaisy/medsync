import type { SignupNotice } from "@/data/signup";
import type { SignupDraft, Step } from "@/features/auth/rules";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Alert } from "react-native";

import { Button, Note, Screen, TextLink } from "@/components/tide";
import { addPlace, OFF_WORDS } from "@/data/places";
import {
  fetchSignupNotice,
  signInWithPassword,
  signupFromAppOn,
  submitSignup,
} from "@/data/signup";
import {
  buildSubmission,
  initialDraft,
  signupKey,
  stepOfField,
  stepValid,
  typeDob,
} from "@/features/auth/rules";
import {
  AboutStep,
  ConsentStep,
  DoneStep,
  PlaceStep,
  SignInStep,
  StepProgress,
} from "@/features/auth/steps";
import { track } from "@/lib/analytics";
import { useNow } from "@/lib/use-now";

/**
 * Create an account (Tide v1 F-03, prompt §8.1): four steps and a done
 * screen, on the web's one patient onboarding path.
 *
 * The draft lives in memory only, never on disk. The account is made by the
 * web action; on success the done screen shows, and "Go to my home" signs in
 * with the same email and password, after which the root gate moves the
 * patient into the app (signing in earlier would drop this screen before
 * "Welcome" could show). Signed in, the pin is saved as the home place if
 * the patient agreed to PLACE_CONSENT (`addPlace`, migration 0171).
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

  if (step === "done")
    return (
      <Screen
        helpSource="sign-up"
        footer={<Button label="Go to my home" onPress={goHome} busy={busy} />}
      >
        <DoneStep firstName={draft.firstName.trim() || "[First name]"} />
        {problem ? (
          <Note key="problem" tone="plain" icon="alert">
            {problem}
          </Note>
        ) : null}
        {problem ? (
          <TextLink
            key="signin"
            label="Sign in instead"
            onPress={() => router.replace("/sign-in")}
          />
        ) : null}
      </Screen>
    );

  // With the web origin unset nothing can be sent. The steps still open so the
  // patient is told in plain words at the end, not by a dead button.
  const valid = stepValid(step, draft, now) || (!signupFromAppOn && (step === 2 || step === 4));
  const next = () => {
    setProblem(null);
    if (step === 4) void submit();
    else setStep((step + 1) as Step);
  };

  return (
    <Screen
      back={
        step === 1
          ? {
              label: "Cancel",
              icon: "close",
              onPress: () => (router.canGoBack() ? router.back() : router.replace("/")),
            }
          : {
              label: "Back",
              onPress: () => {
                setProblem(null);
                setStep((step - 1) as Step);
              },
            }
      }
      helpSource="sign-up"
      footer={
        <Button
          label={step === 4 ? "Create my account" : "Continue"}
          onPress={next}
          disabled={!valid}
          busy={busy}
        />
      }
    >
      <StepProgress key="progress" step={step} />
      {step === 1 ? (
        <AboutStep key="s1" draft={draft} patch={patch} today={now} onDob={onDob} />
      ) : null}
      {step === 2 ? <PlaceStep key="s2" draft={draft} patch={patch} /> : null}
      {step === 3 ? <SignInStep key="s3" draft={draft} patch={patch} /> : null}
      {step === 4 ? (
        <ConsentStep
          key="s4"
          draft={draft}
          patch={patch}
          notice={notice}
          loading={noticeLoading}
          onRetry={() => {
            setNoticeLoading(true);
            setNoticeTry((n) => n + 1);
          }}
        />
      ) : null}
      {problem ? (
        <Note key="problem" tone="plain" icon="alert">
          {problem}
        </Note>
      ) : null}
    </Screen>
  );
}
