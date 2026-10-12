"use client";

import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmSecondFactorAction } from "@/lib/auth-fresh-actions";

/** True when an action refused for want of a fresh second factor (lib/auth-fresh.ts). */
export const needsFreshFactor = (r: { ok: boolean; error?: string }) =>
  !r.ok && (r.error ?? "").startsWith("reauth:");

/**
 * The authenticator code again, in place, before a signature (§5.7, §8). On success it calls
 * `onConfirmed`, which retries the signature. Inline, never a pop-up over what is being signed.
 */
export function FreshFactor({
  onConfirmed,
  onCancel,
}: {
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const r = await confirmSecondFactorAction({ code });
      if (!r.ok) return setError(r.error);
      setCode("");
      onConfirmed();
    });
  return (
    <div className="border-border flex flex-col gap-2 rounded-md border p-3">
      <label className="text-body-s flex flex-col gap-1">
        <span>Enter the code from your authenticator to sign.</span>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className="min-h-11 w-36 font-mono tabular-nums sm:min-h-9"
        />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={pending}
          className="min-h-11 sm:min-h-7"
        >
          Confirm and sign
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
          className="min-h-11 sm:min-h-7"
        >
          Cancel
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-body-s min-h-5">
        {error ? <StatusWord tone="caution">{error}</StatusWord> : null}
      </p>
    </div>
  );
}
