"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { REVIEW } from "@/content/pharmacy-review";
import { Refusal } from "../../_components/review-dialogs";
import { notifyOwedInStock } from "../actions";

/**
 * 5.7, MS-4: "Tell the patient it is here" sends the "in stock today" message (B-69) and records who sent
 * it. What happened is said in words at once, sent or not (Law 11).
 */
export function TellPatientButton({ lineId }: { lineId: string }) {
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        className="min-h-11"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await notifyOwedInStock({ clientKey: crypto.randomUUID(), lineId });
            setError(r.ok ? null : r.error);
            setSaid(r.ok ? (r.message ?? null) : null);
          })
        }
      >
        {REVIEW.open.tellPatient}
      </Button>
      {said ? (
        <span role="status" className="text-caption text-muted-foreground max-w-64 text-right">
          {said}
        </span>
      ) : null}
      <Refusal error={error} />
    </span>
  );
}
