"use client";

import type { ClaimState } from "./actions";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { claimInvitationAction } from "./actions";

export function ClaimInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ClaimState, FormData>(claimInvitationAction, {});

  if (state.ok) {
    return (
      <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-5">
        <p className="text-foreground text-[14px]">
          ✓ You&apos;re now the <span className="font-medium">{state.designation}</span> admin for
          your hospital. The setup wizard is the next step.
        </p>
        <Button render={<a href="/admin/setup" />} nativeButton={false} variant="primary" size="md">
          Open setup wizard
        </Button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-5"
    >
      <input type="hidden" name="token" value={token} />
      <p className="text-muted-foreground text-[12.5px]">Before claiming, confirm:</p>
      <ul className="text-muted-foreground flex flex-col gap-1 pl-4 text-[12.5px]">
        <li>· You&apos;re signed in with the email address the invitation was sent to.</li>
        <li>· Your account has MFA (TOTP) enrolled and verified this session.</li>
      </ul>
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Claiming…" : "Claim hospital admin role"}
      </Button>
    </form>
  );
}
