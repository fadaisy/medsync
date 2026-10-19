"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { repeatDoneAction } from "@/lib/lab/qc-actions";
import { LabButton } from "./v2/button";

/** LB-3: the repeat is done (the result stands, or was amended on its page); the task leaves the worklist. */
export function RepeatDone({ itemId, label }: { itemId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <LabButton
        type="button"
        variant="secondary"
        size="sm"
        className="min-h-11 w-fit sm:min-h-8"
        onClick={() =>
          start(async () => {
            const r = await repeatDoneAction({ itemId });
            if (!r.ok) setError(r.error);
            else router.refresh();
          })
        }
        busy={pending}
      >
        Repeat done<span className="sr-only">: {label}</span>
      </LabButton>
      <span role="status" aria-live="polite" className="text-body-s">
        {error ? <StatusWord tone="caution">{error}</StatusWord> : null}
      </span>
    </span>
  );
}
