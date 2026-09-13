import { useEffect, useRef, useState } from "react";

import { CYCLE_MS } from "@/components/brand/ecg-loader";

/** Inclusive bounds on how many ECG beats a single launch shows. */
export const MIN_PULSES = 3;
export const MAX_PULSES = 6;

/**
 * Grace period before we stop waiting on `ready` and show the screen anyway.
 *
 * If fonts or the stored session hang — a real possibility on an intermittent
 * connection, which is the network this app is built for — a patient must not
 * be left staring at a logo. The screen becomes usable and the work continues
 * behind it.
 *
 * Sized to just outrun the longest brand hold, so the bailout can only ever
 * fire because real work hung, never because the animation was still playing.
 * Pinning it to MAX_PULSES rather than a literal means changing the pulse
 * range cannot silently start truncating the trace.
 */
const MAX_WAIT_MS = MAX_PULSES * CYCLE_MS + 500;

export type SplashStage = "loading" | "ready";

/**
 * Drives the splash from "loading" to "ready", holding for a whole number of
 * ECG beats.
 *
 * The hold is a count of PULSES rather than a duration, because the thing on
 * screen is a heartbeat and cutting one off mid-trace is what makes a loader
 * look broken. A random 3-6 means no two launches are quite alike — the app
 * has a pulse rather than a progress bar.
 *
 * The cost, stated plainly because it is real: 3-6 beats at a 1000ms cycle is
 * a 3000-6000ms hold, and every platform's published guidance points the other
 * way. Android recommends launch animations stay under 1000ms and caps a
 * deliberate delayed start at 166ms; vitals calls a cold start of 5000ms+
 * excessive; Apple asks apps to "launch instantly"; Expo says hide the splash
 * "as soon as possible". NOT ONE of them prescribes a minimum.
 *
 * What softens it: this is an in-app WELCOME screen, which Apple explicitly
 * sanctions at the start of an onboarding flow, and the hold gates only the
 * CTA — the mark, wordmark, tagline and photograph are on screen from the
 * first frame, so nothing about the brand moment waits on it.
 *
 * If it needs to come down, lower MAX_PULSES or CYCLE_MS. Nothing else reads
 * these numbers.
 */
export function useSplashSequence(ready: boolean): {
  stage: SplashStage;
  /** Beats this launch will play. Fixed for the life of the mount. */
  pulses: number;
} {
  const [stage, setStage] = useState<SplashStage>("loading");
  // Lazy initialiser: React runs it once, on the first render only, so the
  // count is stable for the life of the mount. Choosing it in an effect
  // instead would setState synchronously in the effect body and cascade an
  // extra render — and would leave `pulses` null for a frame.
  const [pulses] = useState(
    () => MIN_PULSES + Math.floor(Math.random() * (MAX_PULSES - MIN_PULSES + 1)),
  );
  // Stamped inside an effect, never during render. `Date.now()` and
  // `Math.random()` are both impure: read in the render body they produce
  // values that change on any re-render, and with the React Compiler enabled
  // that is an error rather than a style note.
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (stage === "ready") return;
    startedAt.current ??= Date.now();

    const elapsed = Date.now() - startedAt.current;

    // Bailout: the work is taking too long to wait on. Show the screen.
    if (!ready) {
      const bail = setTimeout(() => setStage("ready"), Math.max(0, MAX_WAIT_MS - elapsed));
      return () => clearTimeout(bail);
    }

    // Work is done. Serve out the remaining beats.
    const remaining = Math.max(0, pulses * CYCLE_MS - elapsed);
    if (remaining === 0) {
      setStage("ready");
      return;
    }
    const hold = setTimeout(() => setStage("ready"), remaining);
    return () => clearTimeout(hold);
  }, [ready, stage, pulses]);

  return { stage, pulses };
}
