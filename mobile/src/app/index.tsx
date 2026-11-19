import { useEffect, useState } from "react";
import { HOME_V2_COPY } from "@content/patient-app/home";
import { useRouter } from "expo-router";

import { HelpButton } from "@/components/tide";
import { SPLASH_STATUS, SplashView } from "@/features/auth/welcome";
import { useSplashSequence } from "@/hooks/use-splash-sequence";
import { track } from "@/lib/analytics";
import { useSession } from "@/lib/session";

/** Under the wordmark while the app opens (feature matrix 1.11, M15). */
const TAGLINE = HOME_V2_COPY.phone.tagline;

/** `app_open` is once per cold start, not once per visit to this screen. */
let appOpenSent = false;

/**
 * Splash, then the welcome (Tide v1 F-01; redrawn from the owner's approved onboarding prototype,
 * 18 Nov 2026). `SplashView` draws both; this route decides which.
 *
 * The line under the wordmark moves on with the three status lines while the stored session resolves.
 * The session is what the wait is for: a signed-in patient leaves for the app as soon as it resolves (the
 * root gate drops this screen), so the welcome, with Sign in and Get started, arrives only once
 * `useSplashSequence` says the wait is over and nobody is signed in.
 */
export default function SplashScreen() {
  const router = useRouter();
  const { status } = useSession();
  const { stage } = useSplashSequence(status !== "loading");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!appOpenSent) {
      appOpenSent = true;
      track("app_open");
    }
    const id = setTimeout(() => setSyncing(true), 1500);
    return () => clearTimeout(id);
  }, []);

  const ready = stage === "ready";
  const line = ready ? 2 : syncing ? 1 : 0;

  return (
    <SplashView
      line={line}
      status={SPLASH_STATUS[line]}
      tagline={TAGLINE}
      welcome={ready && status !== "signedIn"}
      // Law L6: the red Help is on the splash and on every welcome slide.
      help={<HelpButton variant="pill" source="splash" />}
      onSignIn={() => router.push("/sign-in")}
      onGetStarted={() => router.push("/sign-up")}
    />
  );
}
