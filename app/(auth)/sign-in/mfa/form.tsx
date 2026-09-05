"use client";

import type { MfaChallengeState } from "./actions";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { AuthCard, FieldError } from "@/components/medsync/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthNotice, ButtonSpinner } from "../../_components/auth-notice";
import { challengeMfaAction } from "./actions";

const initial: MfaChallengeState = {};

export function MfaChallengeForm() {
  const [state, formAction, pending] = useActionState(challengeMfaAction, initial);
  const params = useSearchParams();
  const redirectTo = params.get("redirect") ?? "";

  return (
    <AuthCard
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app."
    >
      <form action={formAction} className="stagger-children flex flex-col gap-4">
        <AuthNotice message={state.errors?._form} />
        <input type="hidden" name="redirect" value={redirectTo} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Authenticator code</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            required
            className="text-heading-s py-2.5 text-center font-mono tracking-[0.4em] tabular-nums"
            aria-invalid={!!state.errors?.code}
          />
          <FieldError message={state.errors?.code} />
        </div>

        <Button type="submit" disabled={pending} variant="primary" size="md" className="tap">
          {pending ? (
            <>
              <ButtonSpinner />
              Verifying…
            </>
          ) : (
            "Verify"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
