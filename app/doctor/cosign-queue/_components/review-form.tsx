"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { reviewCosignRequestAction } from "../../patients/[patientId]/actions";

export function ReviewForm({ cosignRequestId }: { cosignRequestId: string }) {
  const [state, formAction] = useActionState<{ ok?: boolean; error?: string }, FormData>(
    reviewCosignRequestAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="cosign_request_id" value={cosignRequestId} />
      <textarea
        name="note"
        rows={2}
        maxLength={500}
        placeholder="Optional for approve · required for return (≥ 8 chars)."
        className="border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 focus-visible:border-ring resize-none rounded-md border px-3 py-2 text-[12.5px] leading-relaxed outline-none focus-visible:ring-[3px]"
      />
      {state.error ? (
        <p className="text-destructive scale-in text-[11.5px]">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="scale-in text-brand-700 dark:text-brand-300 text-[11.5px] font-medium">
          Decision saved.
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button type="submit" name="decision" value="returned" variant="secondary" size="sm">
          Return with feedback
        </Button>
        <Button type="submit" name="decision" value="approved" size="sm">
          Approve
        </Button>
      </div>
    </form>
  );
}
