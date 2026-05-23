"use client";

import type { DecisionState } from "./actions";
import * as React from "react";
import { useActionState } from "react";

import { FormError } from "@/components/medsync/auth-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { approveApplicationAction, initialDecisionState, rejectApplicationAction } from "./actions";

/**
 * Side-by-side decision forms — approve (one click) on the left,
 * reject (with a reason) on the right. Both bind the application id
 * as a hidden input so the action signature stays flat.
 */
export function ApplicationDecisionForms({ applicationId }: { applicationId: string }) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveApplicationAction,
    initialDecisionState as DecisionState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectApplicationAction,
    initialDecisionState as DecisionState,
  );

  const [reason, setReason] = React.useState("");

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Approve */}
      <form
        action={approveAction}
        className={cn(
          "border-border bg-card flex flex-col gap-3 rounded-lg border p-5",
          "border-teal-500/40",
        )}
      >
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Approve
        </span>
        <input type="hidden" name="application_id" value={applicationId} />
        <p className="text-foreground text-[13px] leading-relaxed">
          Creates a row in <code className="font-mono text-[12px]">public.hospitals</code>, assigns
          the applicant the <code className="font-mono text-[12px]">hospital_admin</code> role
          scoped to it, and lifts their user lifecycle to{" "}
          <code className="font-mono text-[12px]">active</code>.
        </p>
        <FormError message={approveState.error} />
        {approveState.ok ? (
          <p className="text-[12.5px] text-teal-700 dark:text-teal-300" role="status">
            Approved. Refresh to see the updated state.
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="md" disabled={approvePending}>
          {approvePending ? "Approving…" : "Approve application"}
        </Button>
      </form>

      {/* Reject */}
      <form
        action={rejectAction}
        className="border-border bg-card flex flex-col gap-3 rounded-lg border border-red-500/30 p-5"
      >
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase">
          Reject
        </span>
        <input type="hidden" name="application_id" value={applicationId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reason">Reason (visible to applicant)</Label>
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
            placeholder="e.g. Could not verify registration with MoH facility list — please attach a recent licence renewal."
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
          {rejectPending ? "Rejecting…" : "Reject application"}
        </Button>
      </form>
    </section>
  );
}
