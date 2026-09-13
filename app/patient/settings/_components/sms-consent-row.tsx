"use client";

import type { SmsConsentActionState } from "../actions";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { SMS_CONSENT_COPY } from "@/lib/notifications/consent-copy";
import { setSmsConsentAction } from "../actions";

/**
 * The SMS consent control (Gate E, ADR 0090; PRD §5.2). State is a word,
 * not a colour: "On" / "Off" in text, and the honest sentence under it
 * whenever SMS is off. The button does the opposite of the current state —
 * one control, no toggle widget to misread.
 */
export function SmsConsentRow({ initialOn }: { initialOn: boolean }) {
  const [state, formAction, pending] = useActionState<SmsConsentActionState, FormData>(
    setSmsConsentAction,
    {},
  );
  const on = state.on ?? initialOn;

  return (
    <li className="bg-card dark:shadow-card flex flex-col gap-3 rounded-xl px-4 py-3 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-body-m font-medium">
            SMS about your bookings ·{" "}
            <span className={on ? "text-brand-700 dark:text-brand-300" : "text-muted-foreground"}>
              {on ? "On" : "Off"}
            </span>
          </p>
          <p className="text-muted-foreground text-body-s">{SMS_CONSENT_COPY.what}</p>
        </div>
        <form action={formAction} className="shrink-0">
          <input type="hidden" name="on" value={on ? "false" : "true"} />
          <Button type="submit" variant="secondary" disabled={pending} className="min-h-11">
            {pending ? "Saving…" : on ? "Turn off" : "Turn on"}
          </Button>
        </form>
      </div>
      {!on ? (
        <p className="text-muted-foreground text-body-s leading-relaxed">
          {SMS_CONSENT_COPY.declined} {SMS_CONSENT_COPY.receiptException}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-status-caution-fg text-body-s">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}
