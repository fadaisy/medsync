"use client";

import type { ResendState, VerifyState } from "../actions";
import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";

import { OtpInput } from "@/components/form/otp-input";
import { FormError } from "@/components/medsync/auth-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resendOtpAction, verifyOtpAction } from "../actions";

const initialVerify: VerifyState = {};
const initialResend: ResendState = { status: "idle" };

export function VerifyForm() {
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyOtpAction, initialVerify);
  const [resendState, resendAction, resendPending] = useActionState(resendOtpAction, initialResend);

  const [token, setToken] = React.useState("");

  // Auto-submit when the user completes 6 digits — saves a tap.
  const formRef = React.useRef<HTMLFormElement>(null);
  function onComplete() {
    formRef.current?.requestSubmit();
  }

  return (
    <div className="flex flex-col gap-6">
      <FormError message={verifyState.error} />

      <form ref={formRef} action={verifyAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <OtpInput
          value={token}
          onValueChange={setToken}
          onComplete={onComplete}
          autoFocus
          aria-invalid={!!verifyState.error}
          aria-label="6-digit verification code"
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={verifyPending || token.length !== 6}
        >
          {verifyPending ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>

      <div className="border-border bg-card flex flex-col gap-2 rounded-md border p-3">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Didn&apos;t get it?
        </span>
        <form action={resendAction} className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="ghost" size="sm" disabled={resendPending}>
            {resendPending ? "Sending…" : "Resend code"}
          </Button>
          <Link
            href="/signup/patient"
            className="text-muted-foreground hover:text-foreground text-[12px] transition-colors"
          >
            Or fix your email
          </Link>
        </form>
        {resendState.message ? (
          <p
            className={cn(
              "text-[11.5px]",
              resendState.status === "sent"
                ? "text-teal-600 dark:text-teal-400"
                : "text-status-critical-fg",
            )}
            role="status"
          >
            {resendState.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
