"use client";

import type { OutbreakModeState } from "../actions";
import { useActionState } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setOutbreakModeAction } from "../actions";

/**
 * Outbreak mode (clerking desk v2, D-CV-06): while it is on, the clerking desk's outbreak screen
 * (fever plus at least three listed symptoms) is active for this hospital. Fever with an exposure
 * is always screened, whatever this says. Every change needs a reason and is audited. Settings, not
 * an emergency: no red here.
 */
export function OutbreakModeForm({ on, reason }: { on: boolean | null; reason: string | null }) {
  const [state, formAction, pending] = useActionState<OutbreakModeState, FormData>(
    setOutbreakModeAction,
    {},
  );
  if (on === null)
    return (
      <p className="text-muted-foreground text-body-s p-5">
        Outbreak mode needs migration 0076. Ask the superadmin to apply it.
      </p>
    );
  return (
    <form action={formAction} className="flex flex-col gap-4 p-5">
      <p className="text-body-s text-foreground">
        Outbreak mode is <span className="font-medium">{on ? "on" : "off"}</span>
        {on && reason ? <span className="text-muted-foreground"> — {reason}</span> : null}.
      </p>
      <p className="text-muted-foreground text-caption max-w-2xl">
        Turn it on when your IPC focal person or the district declares an outbreak. The clerking
        desk then screens every fever against the outbreak case definition. Fever with an exposure
        is screened at all times.
      </p>
      <input type="hidden" name="on" value={on ? "false" : "true"} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="outbreak-reason" className="text-caption tracking-tight">
          Reason
        </Label>
        <Input
          id="outbreak-reason"
          name="reason"
          minLength={8}
          required
          placeholder={
            on ? "Why it is ending — at least 8 characters" : "The outbreak and who declared it"
          }
        />
        <span className="text-muted-foreground text-caption">Goes to the audit log.</span>
      </div>
      {state.error ? (
        <p role="alert" className="dark:text-status-caution-fg text-body-s text-amber-800">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-foreground text-body-s inline-flex items-center gap-2">
          <CheckIcon className="size-4 shrink-0" aria-hidden />
          Saved.
        </p>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {on ? "Turn outbreak mode off" : "Turn outbreak mode on"}
      </Button>
    </form>
  );
}
