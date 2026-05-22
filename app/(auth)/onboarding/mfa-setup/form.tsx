"use client";

import type { MfaSetupState } from "./actions";
import { useActionState } from "react";

import { AuthCard, FieldError, FormError } from "@/components/medsync/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyEnrollmentAction } from "./actions";

interface MfaSetupFormProps {
  factorId: string;
  secret: string;
  qrSvg: string;
}

const initial: MfaSetupState = {};

export function MfaSetupForm({ factorId, secret, qrSvg }: MfaSetupFormProps) {
  const [state, formAction, pending] = useActionState(verifyEnrollmentAction, initial);

  return (
    <AuthCard
      title="Set up two-factor"
      subtitle="Required for clinical and administrative roles. Scan the code with an authenticator app (1Password, Authy, Google Authenticator) and enter the 6-digit code."
    >
      <div className="flex flex-col gap-4">
        <div className="bg-muted border-gray-150 flex items-center justify-center rounded-md border p-4">
          <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
        </div>

        <details className="text-body-s text-muted-foreground">
          <summary className="cursor-pointer">Can&apos;t scan the QR code?</summary>
          <p className="text-body-s mt-2">Enter this secret manually:</p>
          <code className="bg-muted text-foreground mt-2 block rounded-sm border border-gray-200 p-2 font-mono text-[11px] break-all">
            {secret}
          </code>
        </details>

        <form action={formAction} className="flex flex-col gap-3">
          <FormError message={state.errors?._form} />
          <input type="hidden" name="factor_id" value={factorId} />

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
              className="text-center font-mono tracking-[0.4em]"
              aria-invalid={!!state.errors?.code}
            />
            <FieldError message={state.errors?.code} />
          </div>

          <Button type="submit" disabled={pending} variant="primary" size="md">
            {pending ? "Verifying…" : "Activate two-factor"}
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}
