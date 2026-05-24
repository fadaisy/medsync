"use client";

import type { BreakGlassState } from "./actions";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { closeBreakGlassAction } from "./actions";

export function CloseBreakGlassButton({ grantId }: { grantId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<BreakGlassState, FormData>(
    closeBreakGlassAction,
    {},
  );

  if (state.ok) {
    return <span className="text-[12px] text-teal-700 dark:text-teal-300">Closed</span>;
  }
  if (!open) {
    return (
      <Button type="button" variant="alert" size="sm" onClick={() => setOpen(true)}>
        Close now
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="grant_id" value={grantId} />
      <label className="text-muted-foreground text-[11px]">Reason (audit log; ≥ 4 chars)</label>
      <Input autoFocus name="reason" placeholder="e.g. work complete" minLength={4} required />
      {state.error ? <p className="text-destructive text-[11.5px]">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="alert" size="sm" disabled={pending}>
          {pending ? "Closing…" : "Confirm close"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
