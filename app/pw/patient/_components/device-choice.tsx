"use client";

import type { DeviceChoice as Choice } from "@/lib/patient-web/getting-in-device";
import { useEffect, useRef, useState, useTransition } from "react";

import { Dialog } from "@/components/tide/controls";
import { Button, Note } from "@/components/tide/kit";
import { GETTING_IN_COPY as G } from "@/content/patient/getting-in";
import { PATIENT_WEB_COPY as W } from "@/content/patient/web";
import { IDLE_SIGNED_OUT_URL, idleExpired } from "@/lib/patient-web/getting-in-device";
import { setDeviceChoiceAction } from "../_lib/device-actions";

const ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * D-PW-05 and D-PW-06, mounted once in the signed-in layout. Asks "Is this your own device?" once per
 * browser session (default No: closing the dialog answers No), and signs out after 15 minutes without use
 * on a shared device, 7 days on your own. The answer is a session cookie set by the server; nothing is
 * written to browser storage in either mode, and a left-over offline shell from the old web is removed.
 * The offline set for "Yes" is not built yet (Step 8 report).
 */
export function DeviceChoice({ choice, ask }: { choice: Choice | null; ask: boolean }) {
  const [answered, setAnswered] = useState(false);
  // Unanswered, idle sign-out runs on the shared clock (15 minutes) until the question can be asked.
  const open = ask && choice === null && !answered;
  const [pending, start] = useTransition();
  useIdleSignOut(choice);

  // The old web's worker caches its /offline page (ADR 0088); a shared device keeps nothing.
  useEffect(() => {
    if (choice === "own") return;
    navigator.serviceWorker
      ?.getRegistrations()
      .then((rs) =>
        rs.forEach((r) => {
          if (r.active?.scriptURL.endsWith("/sw.js")) void r.unregister();
        }),
      )
      .catch(() => {});
    if ("caches" in window) void caches.delete("medsync-shell-v1").catch(() => {});
  }, [choice]);

  const pick = (next: Choice) =>
    start(async () => {
      await setDeviceChoiceAction(next).catch(() => {});
      setAnswered(true);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) pick("shared");
      }}
      title={W.ownDeviceQuestion}
      footer={
        <>
          <Button tone="outline" size="m" busy={pending} onClick={() => pick("own")}>
            {W.ownDeviceYes}
          </Button>
          <Button size="m" busy={pending} onClick={() => pick("shared")} autoFocus>
            {W.ownDeviceNo}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Note>
          <strong className="text-pw-ink font-semibold">{W.ownDeviceNo}. </strong>
          {W.ownDeviceNoNote}
        </Note>
        <Note>
          <strong className="text-pw-ink font-semibold">{W.ownDeviceYes}. </strong>
          {W.ownDeviceYesNote} {G.ownDeviceLater}
        </Note>
      </div>
    </Dialog>
  );
}

/**
 * Idle sign-out (D-PW-06): POST /sign-out (which also clears the device cookie), then the shared sign-in
 * with PATIENT_WEB_COPY.idleSignedOut. Checked every 30 s and when the tab returns, since a hidden tab's
 * timers are throttled.
 */
// ponytail: idleness is per tab; an idle tab signs out a busy one too. A BroadcastChannel ping if it bites.
function useIdleSignOut(choice: Choice | null) {
  const last = useRef(0);
  useEffect(() => {
    last.current = Date.now();
    let gone = false;
    const touch = () => {
      last.current = Date.now();
    };
    const check = () => {
      if (gone || !idleExpired(last.current, Date.now(), choice)) return;
      gone = true;
      void fetch("/sign-out", { method: "POST", redirect: "manual" })
        .catch(() => {})
        .finally(() => window.location.replace(IDLE_SIGNED_OUT_URL));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    for (const e of ACTIVITY) window.addEventListener(e, touch, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(check, 30_000);
    return () => {
      for (const e of ACTIVITY) window.removeEventListener(e, touch);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [choice]);
}
