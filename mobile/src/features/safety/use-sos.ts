import type { SosPhase } from "@patient-core/help-sos";
import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";

import { SOS_COUNTDOWN_S, SOS_DIAL } from "@/features/safety/config";
import { track } from "@/lib/analytics";
import { emergencyEvent } from "@/lib/emergency";

export type { SosPhase } from "@patient-core/help-sos";

/**
 * SOS: idle → a 3-second countdown → the call. Cancel inside the countdown
 * stops the timer before anything is dialled. The timer is started from the
 * press, not from an effect, and cleared on unmount, so leaving Help mid
 * countdown dials nothing.
 *
 * `dialled` is what really happened: true once the phone accepted the
 * `tel:` link, false if it refused, null before. The "We have told" list
 * ticks only on true.
 */
export function useSos() {
  const [phase, setPhase] = useState<SosPhase>("idle");
  const [secs, setSecs] = useState(SOS_COUNTDOWN_S);
  const [calledAt, setCalledAt] = useState<number | null>(null);
  const [dialled, setDialled] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const dial = () => {
    Linking.openURL("tel:" + SOS_DIAL).then(
      () => setDialled(true),
      () => setDialled(false),
    );
    track("sos_called", { line: "general" });
    // Audit through the existing emergency path (contact id only, no PHI),
    // after the call is handed to the phone: it never waits on the network.
    emergencyEvent("call_tapped", { contact_id: "config:general" });
  };

  const start = () => {
    if (timer.current) return;
    track("sos_started");
    setPhase("counting");
    setSecs(SOS_COUNTDOWN_S);
    let left = SOS_COUNTDOWN_S;
    timer.current = setInterval(() => {
      left -= 1;
      if (left > 0) {
        setSecs(left);
        return;
      }
      stop();
      setPhase("calling");
      setCalledAt(Date.now());
      dial();
    }, 1000);
  };

  const cancel = () => {
    stop();
    track("sos_cancelled");
    setPhase("idle");
    setSecs(SOS_COUNTDOWN_S);
  };

  const end = () => {
    setPhase("idle");
    setSecs(SOS_COUNTDOWN_S);
    setCalledAt(null);
    setDialled(null);
  };

  return { phase, secs, calledAt, dialled, start, cancel, end, callAgain: dial };
}
