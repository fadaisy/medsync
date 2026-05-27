"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { selectPrimaryHospitalAction } from "../actions";

/**
 * Pick / change primary hospital. Two states:
 *   - "Set as primary" → calls the action, optimistic flip to "Primary".
 *   - "Primary"        → static pill (no action).
 */
export function SelectHospitalButton({
  hospitalId,
  isPrimary,
}: {
  hospitalId: string;
  isPrimary: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isPrimary) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-[12px] font-medium text-teal-700 ring-1 ring-teal-200/70 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800/40">
        <CheckIcon className="size-3.5" aria-hidden />
        Your primary
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await selectPrimaryHospitalAction(hospitalId);
            if (!res.ok) {
              setError(res.error ?? "Couldn't save that.");
            } else {
              router.refresh();
            }
          });
        }}
      >
        {pending ? "Saving…" : "Set as primary"}
      </Button>
      {error ? <span className="text-destructive font-mono text-[10px]">{error}</span> : null}
    </div>
  );
}
