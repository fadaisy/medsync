"use client";

import type { AffiliationDecisionState } from "./actions";
import * as React from "react";
import { useActionState } from "react";

import { FormError } from "@/components/medsync/auth-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  approveAffiliationAction,
  initialAffiliationState,
  rejectAffiliationAction,
} from "./actions";

export function AffiliationDecisionForms({ affiliationId }: { affiliationId: string }) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveAffiliationAction,
    initialAffiliationState as AffiliationDecisionState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectAffiliationAction,
    initialAffiliationState as AffiliationDecisionState,
  );

  const [reason, setReason] = React.useState("");

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <form
        action={approveAction}
        className="border-border bg-card flex flex-col gap-3 rounded-lg border border-teal-500/40 p-5"
      >
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Approve
        </span>
        <input type="hidden" name="affiliation_id" value={affiliationId} />
        <p className="text-foreground text-[13px] leading-relaxed">
          Transitions the affiliation to <code className="font-mono text-[12px]">active</code>. If
          the clinician&apos;s user lifecycle is still pending, also lifts them to{" "}
          <code className="font-mono text-[12px]">active</code> so they can sign in.
        </p>
        <FormError message={approveState.error} />
        {approveState.ok ? (
          <p className="text-[12.5px] text-teal-700 dark:text-teal-300" role="status">
            Approved. Refresh to see the updated state.
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="md" disabled={approvePending}>
          {approvePending ? "Approving…" : "Approve affiliation"}
        </Button>
      </form>

      <form
        action={rejectAction}
        className="border-border bg-card flex flex-col gap-3 rounded-lg border border-red-500/30 p-5"
      >
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Reject
        </span>
        <input type="hidden" name="affiliation_id" value={affiliationId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Reason (visible to clinician)</Label>
          <textarea
            id="reason"
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={5}
            maxLength={800}
            rows={4}
            className={cn(
              "border-border bg-background text-foreground w-full rounded-sm border px-2.5 py-2 text-[13px] outline-none",
              "focus-visible:shadow-focus focus-visible:border-teal-500",
              "placeholder:text-gray-400 dark:placeholder:text-gray-400",
            )}
            placeholder="e.g. Council registration number could not be verified — please re-upload your current practising certificate."
          />
        </div>
        <FormError message={rejectState.error} />
        {rejectState.ok ? (
          <p className="text-[12.5px] text-teal-700 dark:text-teal-300" role="status">
            Rejected. Refresh to see the updated state.
          </p>
        ) : null}
        <Button
          type="submit"
          variant="alert"
          size="md"
          disabled={rejectPending || reason.trim().length < 5}
        >
          {rejectPending ? "Rejecting…" : "Reject affiliation"}
        </Button>
      </form>
    </section>
  );
}
