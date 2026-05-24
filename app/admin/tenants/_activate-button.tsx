"use client";

import type { ActivateState } from "./actions";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activateHospitalAction } from "./actions";

export function ActivateHospitalButton({ hospitalId, name }: { hospitalId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActivateState, FormData>(
    activateHospitalAction,
    {},
  );

  if (state.ok) {
    return <span className="text-[12px] text-teal-700 dark:text-teal-300">Activated</span>;
  }

  if (!open) {
    return (
      <Button type="button" variant="primary" size="sm" onClick={() => setOpen(true)}>
        Activate
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="hospital_id" value={hospitalId} />
      <label className="text-muted-foreground text-[11px]">
        Reason for activating {name} (audit log; ≥ 8 chars)
      </label>
      <Input
        autoFocus
        name="reason"
        placeholder="e.g. registration verified with MoH facility list"
        minLength={8}
        required
      />
      {state.error ? <p className="text-destructive text-[11.5px]">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Activating…" : "Confirm"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
